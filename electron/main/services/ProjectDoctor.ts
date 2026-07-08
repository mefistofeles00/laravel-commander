import { execFile } from 'child_process'
import { promisify } from 'util'
import { constants, existsSync } from 'fs'
import { access, lstat, readFile, stat, writeFile } from 'fs/promises'
import { isAbsolute, join } from 'path'
import type { DoctorFinding, DoctorFixResult, DoctorReport, LaravelProject } from '@shared/types'
import type { EnvFileService } from './EnvFileService'
import type { PhpEnvironment } from './PhpEnvironment'

const execFileAsync = promisify(execFile)

/** Minimum PHP per Laravel major — used only when composer.json has no usable php constraint. */
const LARAVEL_MIN_PHP: Record<number, string> = {
  8: '7.3.0',
  9: '8.0.0',
  10: '8.1.0',
  11: '8.2.0',
  12: '8.2.0'
}

type CheckResult = DoctorFinding | 'pass' | 'skip'

interface DoctorContext {
  project: LaravelProject
  composer: { require?: Record<string, string> } | null
  lockPackageNames: Set<string> | null
  env: Map<string, string> | null
  envMissingKeys: string[]
  envExtraKeys: string[]
  phpVersion: string | null
}

function parseVersion(version: string): [number, number, number] {
  const match = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(version)
  if (!match) return [0, 0, 0]
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)]
}

function versionLessThan(a: string, b: string): boolean {
  const [a1, a2, a3] = parseVersion(a)
  const [b1, b2, b3] = parseVersion(b)
  if (a1 !== b1) return a1 < b1
  if (a2 !== b2) return a2 < b2
  return a3 < b3
}

/** Lowest version mentioned in a composer constraint — conservative lower bound. */
function constraintMinimum(constraint: string): string | null {
  const versions = [...constraint.matchAll(/(\d+)\.(\d+)(?:\.(\d+))?/g)].map(
    (m) => `${m[1]}.${m[2]}.${m[3] ?? 0}`
  )
  if (versions.length === 0) return null
  return versions.reduce((min, v) => (versionLessThan(v, min) ? v : min))
}

const SEVERITY_ORDER: Record<DoctorFinding['severity'], number> = { error: 0, warning: 1, info: 2 }

/**
 * Finds inconsistencies in a Laravel project. Every check is conservative:
 * when in doubt it stays silent (skip) rather than crying wolf. Scanning is
 * strictly read-only; fixes run only via fix(), on explicit user action,
 * and are re-derived from the finding id in the main process — the renderer
 * never supplies paths or commands.
 */
export class ProjectDoctor {
  constructor(
    private readonly php: PhpEnvironment,
    private readonly envFiles: EnvFileService
  ) {}

  async run(project: LaravelProject): Promise<DoctorReport> {
    const ctx = await this.buildContext(project)

    const results: CheckResult[] = [
      this.checkPhpConstraint(ctx),
      this.checkLockSync(ctx),
      this.checkVendor(ctx),
      this.checkAppKey(ctx),
      this.checkEnvMissingKeys(ctx),
      this.checkEnvExtraKeys(ctx),
      this.checkDebugInProduction(ctx),
      await this.checkConfigCacheStale(ctx),
      await this.checkSqliteDatabase(ctx),
      await this.checkStorageLink(ctx),
      await this.checkWritableDirs(ctx),
      await this.checkPendingMigrations(ctx)
    ]

    const findings = results
      .filter((r): r is DoctorFinding => r !== 'pass' && r !== 'skip')
      .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])

    return {
      ranAt: Date.now(),
      checkCount: results.filter((r) => r !== 'skip').length,
      findings
    }
  }

  async fix(project: LaravelProject, findingId: string): Promise<DoctorFixResult> {
    switch (findingId) {
      case 'app-key-empty':
        return this.artisanFix(project, ['key:generate'])
      case 'config-cache-stale':
        return this.artisanFix(project, ['config:clear'])
      case 'storage-link-missing':
        return this.artisanFix(project, ['storage:link'])
      case 'pending-migrations':
        // Without --force this refuses to run when APP_ENV=production — intended.
        return this.artisanFix(project, ['migrate'])
      case 'sqlite-db-missing': {
        const dbPath = await this.sqliteDatabasePath(project)
        if (!dbPath) return { ok: false, output: "Couldn't determine the SQLite database path." }
        try {
          await writeFile(dbPath, '', { flag: 'wx' })
          return { ok: true, output: `Created ${dbPath}` }
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error)
          return { ok: false, output: detail }
        }
      }
      default:
        return { ok: false, output: 'This finding has no automatic fix.' }
    }
  }

  // ---- context ----

  private async buildContext(project: LaravelProject): Promise<DoctorContext> {
    let composer: DoctorContext['composer'] = null
    try {
      composer = JSON.parse(await readFile(join(project.path, 'composer.json'), 'utf8'))
    } catch {
      /* checks depending on composer.json will skip */
    }

    let lockPackageNames: Set<string> | null = null
    try {
      const lock: { packages?: { name: string }[]; 'packages-dev'?: { name: string }[] } =
        JSON.parse(await readFile(join(project.path, 'composer.lock'), 'utf8'))
      lockPackageNames = new Set(
        [...(lock.packages ?? []), ...(lock['packages-dev'] ?? [])].map((p) => p.name)
      )
    } catch {
      /* lock checks skip */
    }

    let env: Map<string, string> | null = null
    let envMissingKeys: string[] = []
    let envExtraKeys: string[] = []
    try {
      const state = await this.envFiles.read(project.path)
      if (state.exists) {
        env = new Map(state.entries.map((e) => [e.key, e.value]))
        envMissingKeys = state.missingKeys
        envExtraKeys = state.extraKeys
      }
    } catch {
      /* env checks skip */
    }

    const phpInfo = await this.php.detect()
    return {
      project,
      composer,
      lockPackageNames,
      env,
      envMissingKeys,
      envExtraKeys,
      phpVersion: phpInfo?.version ?? null
    }
  }

  // ---- checks ----

  private checkPhpConstraint(ctx: DoctorContext): CheckResult {
    const constraint = ctx.composer?.require?.['php']
    if (!constraint || !ctx.phpVersion) return this.checkLaravelPhpMatrix(ctx)
    const minimum = constraintMinimum(constraint)
    if (!minimum) return 'skip'
    if (versionLessThan(ctx.phpVersion, minimum)) {
      return {
        id: 'php-constraint-mismatch',
        title: `PHP ${ctx.phpVersion} is older than the project requires`,
        detail: `composer.json requires php ${constraint}. Point Laravel Commander at a newer PHP or upgrade this machine's PHP.`,
        severity: 'error'
      }
    }
    return 'pass'
  }

  /** Fallback when composer.json has no usable php constraint. */
  private checkLaravelPhpMatrix(ctx: DoctorContext): CheckResult {
    if (!ctx.project.laravelVersion || !ctx.phpVersion) return 'skip'
    const major = parseVersion(ctx.project.laravelVersion)[0]
    const minimum = LARAVEL_MIN_PHP[major]
    if (!minimum) return 'skip'
    if (versionLessThan(ctx.phpVersion, minimum)) {
      return {
        id: 'laravel-php-matrix',
        title: `PHP ${ctx.phpVersion} is below Laravel ${major}'s minimum (${minimum})`,
        detail: 'The framework may not boot at all on this PHP version.',
        severity: 'warning'
      }
    }
    return 'pass'
  }

  private checkLockSync(ctx: DoctorContext): CheckResult {
    if (!ctx.composer?.require || !ctx.lockPackageNames) return 'skip'
    const missing = Object.keys(ctx.composer.require)
      .filter((name) => name.includes('/'))
      .filter((name) => !ctx.lockPackageNames!.has(name))
    if (missing.length === 0) return 'pass'
    return {
      id: 'lock-out-of-sync',
      title: 'composer.lock is out of sync with composer.json',
      detail: `Required but not in the lock file: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}. Run composer update.`,
      severity: 'error'
    }
  }

  private checkVendor(ctx: DoctorContext): CheckResult {
    if (!ctx.composer) return 'skip'
    if (existsSync(join(ctx.project.path, 'vendor', 'autoload.php'))) return 'pass'
    return {
      id: 'vendor-missing',
      title: 'Dependencies are not installed',
      detail: 'vendor/autoload.php is missing. Run composer install in the project folder.',
      severity: 'error'
    }
  }

  private checkAppKey(ctx: DoctorContext): CheckResult {
    if (!ctx.env) return 'skip'
    if ((ctx.env.get('APP_KEY') ?? '') !== '') return 'pass'
    return {
      id: 'app-key-empty',
      title: 'APP_KEY is empty',
      detail: 'Encryption and sessions will not work without an application key.',
      severity: 'error',
      fixLabel: 'Run key:generate'
    }
  }

  private checkEnvMissingKeys(ctx: DoctorContext): CheckResult {
    if (!ctx.env) return 'skip'
    if (ctx.envMissingKeys.length === 0) return 'pass'
    return {
      id: 'env-missing-keys',
      title: `${ctx.envMissingKeys.length} key${ctx.envMissingKeys.length === 1 ? ' is' : 's are'} in .env.example but not in .env`,
      detail: `${ctx.envMissingKeys.slice(0, 6).join(', ')}${ctx.envMissingKeys.length > 6 ? '…' : ''} — add them from the .env tab.`,
      severity: 'warning'
    }
  }

  private checkEnvExtraKeys(ctx: DoctorContext): CheckResult {
    if (!ctx.env) return 'skip'
    if (ctx.envExtraKeys.length === 0) return 'pass'
    return {
      id: 'env-extra-keys',
      title: `${ctx.envExtraKeys.length} key${ctx.envExtraKeys.length === 1 ? '' : 's'} in .env ${ctx.envExtraKeys.length === 1 ? 'is' : 'are'} not in .env.example`,
      detail: `${ctx.envExtraKeys.slice(0, 6).join(', ')}${ctx.envExtraKeys.length > 6 ? '…' : ''} — fine if intentional; teammates cloning the repo won't know about them.`,
      severity: 'info'
    }
  }

  private checkDebugInProduction(ctx: DoctorContext): CheckResult {
    if (!ctx.env) return 'skip'
    const isProduction = ctx.env.get('APP_ENV') === 'production'
    const debugOn = ['true', '1'].includes((ctx.env.get('APP_DEBUG') ?? '').toLowerCase())
    if (!isProduction) return 'skip'
    if (!debugOn) return 'pass'
    return {
      id: 'debug-in-production',
      title: 'APP_DEBUG is on while APP_ENV is production',
      detail: 'Debug pages leak credentials and source code to visitors. Turn APP_DEBUG off.',
      severity: 'error'
    }
  }

  private async checkConfigCacheStale(ctx: DoctorContext): Promise<CheckResult> {
    const cachePath = join(ctx.project.path, 'bootstrap', 'cache', 'config.php')
    const envPath = join(ctx.project.path, '.env')
    if (!existsSync(cachePath) || !existsSync(envPath)) return 'skip'
    try {
      const [cacheStat, envStat] = await Promise.all([stat(cachePath), stat(envPath)])
      if (cacheStat.mtimeMs >= envStat.mtimeMs) return 'pass'
      return {
        id: 'config-cache-stale',
        title: 'Config cache is older than .env',
        detail: 'Changes to .env are ignored while an outdated config cache exists.',
        severity: 'warning',
        fixLabel: 'Run config:clear'
      }
    } catch {
      return 'skip'
    }
  }

  private async sqliteDatabasePath(project: LaravelProject): Promise<string | null> {
    try {
      const state = await this.envFiles.read(project.path)
      if (!state.exists) return null
      const env = new Map(state.entries.map((e) => [e.key, e.value]))
      if (env.get('DB_CONNECTION') !== 'sqlite') return null
      const configured = env.get('DB_DATABASE') ?? ''
      if (configured === '') return join(project.path, 'database', 'database.sqlite')
      if (isAbsolute(configured)) return configured
      return null // relative values resolve against Laravel's cwd — too ambiguous to judge
    } catch {
      return null
    }
  }

  private async checkSqliteDatabase(ctx: DoctorContext): Promise<CheckResult> {
    const dbPath = await this.sqliteDatabasePath(ctx.project)
    if (!dbPath) return 'skip'
    if (existsSync(dbPath)) return 'pass'
    return {
      id: 'sqlite-db-missing',
      title: 'SQLite database file does not exist',
      detail: `DB_CONNECTION is sqlite but ${dbPath} is missing.`,
      severity: 'error',
      fixLabel: 'Create the file'
    }
  }

  private async checkStorageLink(ctx: DoctorContext): Promise<CheckResult> {
    const source = join(ctx.project.path, 'storage', 'app', 'public')
    const publicDir = join(ctx.project.path, 'public')
    if (!existsSync(source) || !existsSync(publicDir)) return 'skip'
    const linkPath = join(publicDir, 'storage')
    try {
      const info = await lstat(linkPath)
      if (info.isSymbolicLink() && !existsSync(linkPath)) {
        return {
          id: 'storage-link-missing',
          title: 'public/storage symlink is broken',
          detail: 'The link exists but points nowhere — uploaded files will 404.',
          severity: 'warning',
          fixLabel: 'Run storage:link'
        }
      }
      return 'pass' // a real directory or working link: leave it alone
    } catch {
      return {
        id: 'storage-link-missing',
        title: 'public/storage symlink is missing',
        detail: 'Files in storage/app/public are not reachable from the web.',
        severity: 'warning',
        fixLabel: 'Run storage:link'
      }
    }
  }

  private async checkWritableDirs(ctx: DoctorContext): Promise<CheckResult> {
    const candidates = [
      'storage',
      join('storage', 'framework'),
      join('storage', 'logs'),
      join('bootstrap', 'cache')
    ]
    const notWritable: string[] = []
    let evaluated = false
    for (const relative of candidates) {
      const dir = join(ctx.project.path, relative)
      if (!existsSync(dir)) continue
      evaluated = true
      try {
        await access(dir, constants.W_OK)
      } catch {
        notWritable.push(relative)
      }
    }
    if (!evaluated) return 'skip'
    if (notWritable.length === 0) return 'pass'
    return {
      id: 'dirs-not-writable',
      title: 'Laravel cannot write to required directories',
      detail: `Not writable: ${notWritable.join(', ')}. Fix the permissions (e.g. chmod -R u+w).`,
      severity: 'warning'
    }
  }

  private async checkPendingMigrations(ctx: DoctorContext): Promise<CheckResult> {
    if (!ctx.phpVersion) return 'skip'
    const phpInfo = await this.php.detect()
    if (!phpInfo) return 'skip'
    try {
      const { stdout } = await execFileAsync(
        phpInfo.binaryPath,
        ['artisan', 'migrate:status', '--pending', '--no-ansi'],
        { cwd: ctx.project.path, timeout: 15000, maxBuffer: 8 * 1024 * 1024 }
      )
      const pending = stdout.split('\n').filter((line) => /\bPending\b/.test(line)).length
      if (pending === 0) return 'pass'
      return {
        id: 'pending-migrations',
        title: `${pending} migration${pending === 1 ? '' : 's'} pending`,
        detail: 'The database schema is behind the migration files.',
        severity: 'warning',
        fixLabel: 'Run migrate'
      }
    } catch {
      // No database, no vendor, old Laravel without --pending… — stay silent
      // rather than guess (false positives kill trust).
      return 'skip'
    }
  }

  // ---- fixes ----

  private async artisanFix(project: LaravelProject, args: string[]): Promise<DoctorFixResult> {
    const phpInfo = await this.php.detect()
    if (!phpInfo) return { ok: false, output: 'No PHP binary found on this machine.' }
    try {
      const { stdout, stderr } = await execFileAsync(
        phpInfo.binaryPath,
        ['artisan', ...args, '--no-interaction', '--no-ansi'],
        { cwd: project.path, timeout: 120000, maxBuffer: 8 * 1024 * 1024 }
      )
      return { ok: true, output: `${stdout}${stderr}`.trim() }
    } catch (error) {
      const detail =
        error && typeof error === 'object' && 'stdout' in error
          ? `${(error as { stdout: string }).stdout}${(error as { stderr?: string }).stderr ?? ''}`.trim()
          : error instanceof Error
            ? error.message
            : String(error)
      return { ok: false, output: detail || 'The command failed.' }
    }
  }
}
