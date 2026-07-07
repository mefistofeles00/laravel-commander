import { handle } from './registry'
import type { EnvFileService } from '../services/EnvFileService'
import type { ProjectManager } from '../services/ProjectManager'

export function registerEnvIpc(projects: ProjectManager, envFiles: EnvFileService): void {
  const projectPath = (projectId: string): string => {
    const project = projects.get(projectId)
    if (!project) throw new Error('Project is no longer in your list.')
    return project.path
  }

  handle('env:read', (_event, projectId) => envFiles.read(projectPath(projectId)))
  handle('env:write', (_event, projectId, changes) =>
    envFiles.write(projectPath(projectId), changes)
  )
  handle('env:init', (_event, projectId) => envFiles.initFromExample(projectPath(projectId)))
}
