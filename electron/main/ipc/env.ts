import { app } from 'electron'
import { existsSync } from 'fs'
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import { handle } from './registry'
import type { EnvFileService } from '../services/EnvFileService'
import type { ProjectManager } from '../services/ProjectManager'
import type { EnvProfile } from '@shared/types'

const PROFILE_NAME_RE = /^[\w.-]{1,40}$/

/** Snapshots live in app data, never inside the project (no repo clutter). */
function profilesDir(projectId: string): string {
  return join(app.getPath('userData'), 'env-profiles', projectId)
}

async function listProfiles(projectId: string): Promise<EnvProfile[]> {
  const dir = profilesDir(projectId)
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return []
  }
  const profiles: EnvProfile[] = []
  for (const file of names.filter((n) => n.endsWith('.env'))) {
    try {
      const info = await stat(join(dir, file))
      profiles.push({ name: file.slice(0, -4), savedAt: info.mtimeMs })
    } catch {
      /* raced deletion */
    }
  }
  return profiles.sort((a, b) => b.savedAt - a.savedAt)
}

function profilePath(projectId: string, name: string): string {
  if (!PROFILE_NAME_RE.test(name)) throw new Error('Profile names: letters, digits, . _ - only.')
  return join(profilesDir(projectId), `${name}.env`)
}

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

  handle('env:profiles', (_event, projectId) => {
    projectPath(projectId) // validates the project exists
    return listProfiles(projectId)
  })

  handle('env:saveProfile', async (_event, projectId, name) => {
    const envPath = join(projectPath(projectId), '.env')
    if (!existsSync(envPath)) throw new Error('No .env file to snapshot.')
    const target = profilePath(projectId, name)
    await mkdir(profilesDir(projectId), { recursive: true })
    await writeFile(target, await readFile(envPath, 'utf8'), 'utf8')
    return listProfiles(projectId)
  })

  handle('env:applyProfile', async (_event, projectId, name) => {
    const path = projectPath(projectId)
    const source = profilePath(projectId, name)
    if (!existsSync(source)) throw new Error(`Profile "${name}" no longer exists.`)
    await writeFile(join(path, '.env'), await readFile(source, 'utf8'), 'utf8')
    return envFiles.read(path)
  })

  handle('env:deleteProfile', async (_event, projectId, name) => {
    projectPath(projectId)
    await rm(profilePath(projectId, name), { force: true })
    return listProfiles(projectId)
  })
}
