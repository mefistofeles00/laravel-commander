import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join, isAbsolute } from 'path'
import type { PhpInfo, PhpSource } from '@shared/types'

const execFileAsync = promisify(execFile)

interface Candidate {
  path: string
  source: PhpSource
}

/**
 * Finds a usable PHP binary. User setups vary wildly (Herd, Valet, XAMPP,
 * brew, apt, Windows PATH), so detection walks a platform-specific fallback
 * chain and a manual override always wins.
 */
export class PhpEnvironment {
  private cached: PhpInfo | null | undefined

  constructor(private readonly getOverride: () => string | undefined) {}

  async detect(force = false): Promise<PhpInfo | null> {
    if (!force && this.cached !== undefined) return this.cached
    this.cached = await this.probeCandidates()
    return this.cached
  }

  private async probeCandidates(): Promise<PhpInfo | null> {
    for (const candidate of this.candidates()) {
      if (isAbsolute(candidate.path) && !existsSync(candidate.path)) continue
      const version = await this.probe(candidate.path)
      if (version) {
        return {
          binaryPath: isAbsolute(candidate.path)
            ? candidate.path
            : await this.resolveOnPath(candidate.path),
          version,
          source: candidate.source
        }
      }
    }
    return null
  }

  private candidates(): Candidate[] {
    const home = homedir()
    const override = this.getOverride()
    const manual: Candidate[] = override ? [{ path: override, source: 'manual' }] : []

    switch (process.platform) {
      case 'darwin':
        return [
          ...manual,
          { path: join(home, 'Library/Application Support/Herd/bin/php'), source: 'herd' },
          { path: '/opt/homebrew/bin/php', source: 'homebrew' },
          { path: '/usr/local/bin/php', source: 'homebrew' },
          { path: 'php', source: 'system' }
        ]
      case 'win32':
        return [
          ...manual,
          { path: join(home, '.config', 'herd', 'bin', 'php.exe'), source: 'herd' },
          { path: 'C:\\xampp\\php\\php.exe', source: 'xampp' },
          { path: 'php', source: 'system' }
        ]
      default:
        return [
          ...manual,
          { path: '/usr/bin/php', source: 'system' },
          { path: '/usr/local/bin/php', source: 'system' },
          { path: 'php', source: 'system' }
        ]
    }
  }

  private async probe(binary: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync(binary, ['-v'], { timeout: 5000 })
      return /PHP (\d+\.\d+\.\d+)/.exec(stdout)?.[1] ?? null
    } catch {
      return null
    }
  }

  private async resolveOnPath(binary: string): Promise<string> {
    try {
      const finder = process.platform === 'win32' ? 'where' : 'which'
      const { stdout } = await execFileAsync(finder, [binary], { timeout: 5000 })
      return stdout.split('\n')[0].trim() || binary
    } catch {
      return binary
    }
  }
}
