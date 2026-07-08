import { handle } from './registry'
import type { ProjectDoctor } from '../services/ProjectDoctor'
import type { ProjectManager } from '../services/ProjectManager'

export function registerDoctorIpc(projects: ProjectManager, doctor: ProjectDoctor): void {
  const projectOf = (projectId: string): ReturnType<ProjectManager['get']> & object => {
    const project = projects.get(projectId)
    if (!project) throw new Error('Project is no longer in your list.')
    return project
  }

  handle('doctor:run', (_event, projectId) => doctor.run(projectOf(projectId)))
  handle('doctor:fix', (_event, projectId, findingId) =>
    doctor.fix(projectOf(projectId), findingId)
  )
}
