import { shell } from 'electron'
import { execFile } from 'child_process'
import { handle } from './registry'
import { editorUrl } from '../services/editor'
import type { DevProcessManager } from '../services/DevProcessManager'
import type { PhpEnvironment } from '../services/PhpEnvironment'
import type { ProjectManager } from '../services/ProjectManager'
import type { DevActionResult, LaravelProject } from '@shared/types'

function openTerminal(projectPath: string): DevActionResult {
  switch (process.platform) {
    case 'darwin':
      execFile('open', ['-a', 'Terminal', projectPath])
      return { ok: true }
    case 'win32':
      execFile('cmd', ['/c', 'start', '', 'cmd', '/K', `cd /d "${projectPath}"`])
      return { ok: true }
    default:
      return { ok: false, message: 'Opening a terminal is not supported on this platform yet.' }
  }
}

export function registerProjectsIpc(
  projects: ProjectManager,
  php: PhpEnvironment,
  dev: DevProcessManager
): void {
  const projectOf = (projectId: string): LaravelProject => {
    const project = projects.get(projectId)
    if (!project) throw new Error('Project is no longer in your list.')
    return project
  }

  handle('projects:list', () => projects.list())
  handle('projects:add', () => projects.addViaDialog())
  handle('projects:remove', (_event, projectId) => projects.remove(projectId))
  handle('projects:reveal', (_event, projectId) => projects.reveal(projectId))

  handle('projects:open', async (_event, projectId, target) => {
    const project = projectOf(projectId)
    switch (target) {
      case 'editor':
        shell.openExternal(editorUrl(project.path))
        return { ok: true }
      case 'terminal':
        return openTerminal(project.path)
      case 'browser': {
        // Running serve process wins; otherwise Herd's convention domain.
        const serveUrl = dev.processUrl(projectId, 'serve')
        if (serveUrl) {
          shell.openExternal(serveUrl)
          return { ok: true }
        }
        const phpInfo = await php.detect()
        if (phpInfo?.source === 'herd') {
          shell.openExternal(`http://${project.name}.test`)
          return { ok: true }
        }
        return {
          ok: false,
          message: 'No running serve process and no Herd domain — start serve from the Dev tab.'
        }
      }
    }
  })
}
