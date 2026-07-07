import { handle } from './registry'
import type { ProjectManager } from '../services/ProjectManager'

export function registerProjectsIpc(projects: ProjectManager): void {
  handle('projects:list', () => projects.list())
  handle('projects:add', () => projects.addViaDialog())
  handle('projects:remove', (_event, projectId) => projects.remove(projectId))
  handle('projects:reveal', (_event, projectId) => projects.reveal(projectId))
}
