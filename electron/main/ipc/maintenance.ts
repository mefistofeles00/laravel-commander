import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { handle } from './registry'
import { store } from '../services/storage'
import type { PhpEnvironment } from '../services/PhpEnvironment'
import type { ProjectManager } from '../services/ProjectManager'
import type {
  ExecResult,
  LaravelProject,
  MigrationInfo,
  OutdatedPackage,
  ScheduledTask
} from '@shared/types'

const execFileAsync = promisify(execFile)

const MIGRATION_LINE_RE = /^\s*(\S+?)\s+\.*\s*(?:\[(\d+)\]\s+)?(Ran|Pending)\s*$/
const CRON_FIELD_RE = /^[*\d,/-]+$/

/** Composer fallback chain — override wins, then Herd, brew, PATH. */
function composerCandidates(): string[] {
  const override = store.get('composerPathOverride')
  const home = homedir()
  const candidates = override ? [override] : []
  if (process.platform === 'darwin') {
    candidates.push(
      join(home, 'Library/Application Support/Herd/bin/composer'),
      '/opt/homebrew/bin/composer',
      '/usr/local/bin/composer'
    )
  }
  candidates.push('composer')
  return candidates
}

function parseMigrations(output: string): MigrationInfo[] {
  const migrations: MigrationInfo[] = []
  for (const line of output.split('\n')) {
    const match = MIGRATION_LINE_RE.exec(line)
    if (!match) continue
    migrations.push({
      name: match[1],
      batch: match[2] ? Number(match[2]) : null,
      status: match[3] === 'Ran' ? 'ran' : 'pending'
    })
  }
  return migrations
}

function parseSchedule(output: string): ScheduledTask[] {
  const tasks: ScheduledTask[] = []
  for (const line of output.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const tokens = trimmed.split(/\s+/)
    if (tokens.length < 6 || !tokens.slice(0, 5).every((t) => CRON_FIELD_RE.test(t))) continue
    const rest = tokens.slice(5).join(' ')
    const dueSplit = rest.split(/\s*\.{2,}\s*Next Due:\s*/)
    tasks.push({
      expression: tokens.slice(0, 5).join(' '),
      command: (dueSplit[0] ?? rest).replace(/\s*\.{2,}.*$/, '').trim(),
      nextDue: dueSplit[1]?.trim() ?? null
    })
  }
  return tasks
}

export function registerMaintenanceIpc(projects: ProjectManager, php: PhpEnvironment): void {
  const projectOf = (projectId: string): LaravelProject => {
    const project = projects.get(projectId)
    if (!project) throw new Error('Project is no longer in your list.')
    return project
  }

  const artisan = async (project: LaravelProject, args: string[]): Promise<ExecResult> => {
    const phpInfo = await php.detect()
    if (!phpInfo) return { ok: false, output: 'No PHP binary found on this machine.' }
    try {
      const { stdout, stderr } = await execFileAsync(
        phpInfo.binaryPath,
        ['artisan', ...args, '--no-interaction', '--no-ansi'],
        { cwd: project.path, timeout: 180000, maxBuffer: 16 * 1024 * 1024 }
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

  handle('maint:migrations', async (_event, projectId) => {
    const result = await artisan(projectOf(projectId), ['migrate:status'])
    if (!result.ok) return { ok: false as const, message: result.output }
    const migrations = parseMigrations(result.output)
    if (migrations.length === 0 && result.output.trim() !== '') {
      return {
        ok: false as const,
        message: "Couldn't read the migration list from this Laravel version.",
        raw: result.output
      }
    }
    return { ok: true as const, migrations }
  })

  // Without --force both commands refuse to run in production — intended.
  handle('maint:migrate', (_event, projectId) => artisan(projectOf(projectId), ['migrate']))
  handle('maint:rollback', (_event, projectId) =>
    artisan(projectOf(projectId), ['migrate:rollback'])
  )

  handle('maint:outdated', async (_event, projectId) => {
    const project = projectOf(projectId)
    const binary = composerCandidates().find(
      (candidate) => !candidate.includes('/') || existsSync(candidate)
    )
    if (!binary) return { ok: false as const, message: 'No composer binary found.' }
    try {
      const { stdout } = await execFileAsync(
        binary,
        ['outdated', '--direct', '--format=json', '--no-interaction'],
        { cwd: project.path, timeout: 60000, maxBuffer: 16 * 1024 * 1024 }
      )
      const parsed: {
        installed?: Array<{
          name?: string
          version?: string
          latest?: string
          'latest-status'?: string
          description?: string
        }>
      } = JSON.parse(stdout)
      const packages: OutdatedPackage[] = (parsed.installed ?? [])
        .filter((p) => p['latest-status'] !== 'up-to-date')
        .map((p) => ({
          name: p.name ?? '',
          current: p.version ?? '',
          latest: p.latest ?? '',
          severity:
            p['latest-status'] === 'semver-safe-update'
              ? ('minor' as const)
              : p['latest-status'] === 'update-possible'
                ? ('major' as const)
                : ('unknown' as const),
          description: p.description
        }))
      return { ok: true as const, packages }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      return { ok: false as const, message: `composer outdated failed. ${detail}` }
    }
  })

  handle('maint:schedule', async (_event, projectId) => {
    const result = await artisan(projectOf(projectId), ['schedule:list'])
    if (!result.ok) return { ok: false as const, message: result.output }
    if (/no scheduled (tasks|commands)/i.test(result.output)) {
      return { ok: true as const, tasks: [] }
    }
    const tasks = parseSchedule(result.output)
    if (tasks.length === 0 && result.output.trim() !== '') {
      return {
        ok: false as const,
        message: "Couldn't parse the schedule — showing the raw output.",
        raw: result.output
      }
    }
    return { ok: true as const, tasks }
  })
}
