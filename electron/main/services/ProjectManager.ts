import { dialog, shell } from 'electron'
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { basename, join } from 'path'
import { randomUUID } from 'crypto'
import { store } from './storage'
import type { AddProjectResult, LaravelProject } from '@shared/types'

interface ProjectMeta {
  name: string
  path: string
  laravelVersion: string | null
  phpConstraint: string | null
}

type InspectionResult =
  { ok: true; meta: ProjectMeta } | { ok: false; reason: 'not-laravel'; message: string }

/**
 * Checks that a folder is the root of a Laravel app (an `artisan` file and
 * `laravel/framework` in composer.json) and reads its metadata.
 */
export async function inspectLaravelProject(dir: string): Promise<InspectionResult> {
  if (!existsSync(join(dir, 'artisan'))) {
    return {
      ok: false,
      reason: 'not-laravel',
      message: 'No artisan file found — pick the root folder of a Laravel app.'
    }
  }

  let composer: { require?: Record<string, string> }
  try {
    composer = JSON.parse(await readFile(join(dir, 'composer.json'), 'utf8'))
  } catch {
    return {
      ok: false,
      reason: 'not-laravel',
      message: "Couldn't read composer.json in that folder."
    }
  }

  const requires = composer.require ?? {}
  if (!requires['laravel/framework']) {
    return {
      ok: false,
      reason: 'not-laravel',
      message: "composer.json doesn't require laravel/framework."
    }
  }

  return {
    ok: true,
    meta: {
      name: basename(dir),
      path: dir,
      laravelVersion: await readInstalledLaravelVersion(dir),
      phpConstraint: requires['php'] ?? null
    }
  }
}

async function readInstalledLaravelVersion(dir: string): Promise<string | null> {
  try {
    const lock: { packages?: { name: string; version: string }[] } = JSON.parse(
      await readFile(join(dir, 'composer.lock'), 'utf8')
    )
    const framework = lock.packages?.find((p) => p.name === 'laravel/framework')
    return framework ? framework.version.replace(/^v/, '') : null
  } catch {
    return null
  }
}

export class ProjectManager {
  list(): LaravelProject[] {
    return store.get('projects')
  }

  get(id: string): LaravelProject | undefined {
    return this.list().find((p) => p.id === id)
  }

  async addViaDialog(): Promise<AddProjectResult> {
    const picked = await dialog.showOpenDialog({
      title: 'Add Laravel project',
      buttonLabel: 'Add project',
      properties: ['openDirectory']
    })
    const dir = picked.filePaths[0]
    if (picked.canceled || !dir) {
      return { ok: false, reason: 'canceled', message: 'No folder selected.' }
    }

    if (this.list().some((p) => p.path === dir)) {
      return {
        ok: false,
        reason: 'already-added',
        message: `${basename(dir)} is already in your list.`
      }
    }

    const inspection = await inspectLaravelProject(dir)
    if (!inspection.ok) return inspection

    const project: LaravelProject = {
      id: randomUUID(),
      ...inspection.meta,
      addedAt: Date.now()
    }
    store.set('projects', [...this.list(), project])
    return { ok: true, project }
  }

  remove(id: string): LaravelProject[] {
    const next = this.list().filter((p) => p.id !== id)
    store.set('projects', next)
    return next
  }

  reveal(id: string): boolean {
    const project = this.get(id)
    if (!project || !existsSync(project.path)) return false
    shell.showItemInFolder(project.path)
    return true
  }
}
