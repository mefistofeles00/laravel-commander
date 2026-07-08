import { shell } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { join, normalize, sep } from 'path'
import { handle } from './registry'
import { editorUrl } from '../services/editor'
import type { LogService } from '../services/LogService'
import type { PhpEnvironment } from '../services/PhpEnvironment'
import type { ProjectManager } from '../services/ProjectManager'
import type { ExecResult, FailedJob, LaravelProject } from '@shared/types'

const execFileAsync = promisify(execFile)

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const JOB_UUID_ARG_RE = /^[0-9a-f-]+$/i

/** Very defensive: extract one job per line that carries a UUID. */
function parseFailedJobs(output: string): FailedJob[] {
  const jobs: FailedJob[] = []
  for (const line of output.split('\n')) {
    const match = UUID_RE.exec(line)
    if (!match) continue
    const description = line
      .replace(match[0], '')
      .replace(/[|+.]{2,}/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    jobs.push({ uuid: match[0], description })
  }
  return jobs
}

export function registerDebugIpc(
  projects: ProjectManager,
  php: PhpEnvironment,
  logs: LogService
): void {
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
        { cwd: project.path, timeout: 30000, maxBuffer: 8 * 1024 * 1024 }
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

  handle('log:files', (_event, projectId) => logs.listFiles(projectOf(projectId).path))
  handle('log:read', (_event, projectId, file) => {
    const project = projectOf(projectId)
    return logs.read(project.id, project.path, file)
  })
  handle('log:clear', (_event, projectId, file) => {
    const project = projectOf(projectId)
    return logs.clear(project.id, project.path, file)
  })

  handle('jobs:failed', async (_event, projectId) => {
    const result = await artisan(projectOf(projectId), ['queue:failed'])
    if (!result.ok) return { ok: false as const, message: result.output }
    if (/no failed jobs/i.test(result.output)) return { ok: true as const, jobs: [] }
    const jobs = parseFailedJobs(result.output)
    if (jobs.length === 0) {
      return {
        ok: false as const,
        message: "Couldn't read the failed-jobs list from this Laravel version.",
        raw: result.output
      }
    }
    return { ok: true as const, jobs }
  })

  handle('jobs:retry', (_event, projectId, uuid) => {
    if (!JOB_UUID_ARG_RE.test(uuid)) throw new Error('Invalid job id.')
    return artisan(projectOf(projectId), ['queue:retry', uuid])
  })
  handle('jobs:forget', (_event, projectId, uuid) => {
    if (!JOB_UUID_ARG_RE.test(uuid)) throw new Error('Invalid job id.')
    return artisan(projectOf(projectId), ['queue:forget', uuid])
  })
  handle('jobs:flush', (_event, projectId) => artisan(projectOf(projectId), ['queue:flush']))

  handle('projects:openFile', (_event, projectId, relativeFile, line) => {
    const project = projectOf(projectId)
    const absolute = normalize(join(project.path, relativeFile))
    // The file must stay inside the project root and exist.
    if (!absolute.startsWith(project.path + sep) || !existsSync(absolute)) return false
    shell.openExternal(editorUrl(absolute, line))
    return true
  })
}
