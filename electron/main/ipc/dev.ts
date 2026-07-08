import { handle } from './registry'
import type { DevProcessManager } from '../services/DevProcessManager'
import type { ProjectManager } from '../services/ProjectManager'
import type { LaravelProject } from '@shared/types'

export function registerDevIpc(projects: ProjectManager, dev: DevProcessManager): void {
  const projectOf = (projectId: string): LaravelProject => {
    const project = projects.get(projectId)
    if (!project) throw new Error('Project is no longer in your list.')
    return project
  }

  handle('dev:list', (_event, projectId) => dev.list(projectOf(projectId)))
  handle('dev:start', (_event, projectId, role) => dev.start(projectOf(projectId), role))
  handle('dev:stop', (_event, projectId, role) => dev.stop(projectId, role))
  handle('dev:startAll', (_event, projectId) => dev.startAll(projectOf(projectId)))
  handle('dev:stopAll', (_event, projectId) => dev.stopAll(projectId))
  handle('dev:runningProjects', () => dev.runningProjects())
}
