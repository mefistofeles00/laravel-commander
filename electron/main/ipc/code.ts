import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync, type Dirent } from 'fs'
import { readFile, readdir } from 'fs/promises'
import { join, sep } from 'path'
import { handle } from './registry'
import type { PhpEnvironment } from '../services/PhpEnvironment'
import type { ProjectManager } from '../services/ProjectManager'
import type {
  LaravelProject,
  ModelAttribute,
  ModelInfo,
  ModelRelation,
  RouteInfo
} from '@shared/types'

const execFileAsync = promisify(execFile)

const MODEL_CLASS_RE = /^[A-Za-z_][A-Za-z0-9_]*(\\[A-Za-z_][A-Za-z0-9_]*)*$/

interface RawRoute {
  method?: string
  uri?: string
  name?: string | null
  action?: string
  middleware?: string[] | string
}

/** PSR-4 map from composer.json, e.g. { "App\\": "app/" }. */
async function psr4Map(projectPath: string): Promise<Record<string, string>> {
  try {
    const composer: { autoload?: { 'psr-4'?: Record<string, string> } } = JSON.parse(
      await readFile(join(projectPath, 'composer.json'), 'utf8')
    )
    return composer.autoload?.['psr-4'] ?? { 'App\\': 'app/' }
  } catch {
    return { 'App\\': 'app/' }
  }
}

function resolveClassFile(
  projectPath: string,
  map: Record<string, string>,
  className: string
): string | undefined {
  for (const [prefix, dir] of Object.entries(map)) {
    if (!className.startsWith(prefix)) continue
    const relative = join(dir, className.slice(prefix.length).replaceAll('\\', '/') + '.php')
    if (existsSync(join(projectPath, relative))) return relative
  }
  return undefined
}

async function discoverModels(projectPath: string): Promise<ModelInfo[]> {
  const root = join(projectPath, 'app', 'Models')
  const models: ModelInfo[] = []

  async function walk(dir: string, namespace: string): Promise<void> {
    let entries: Dirent[]
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await walk(join(dir, entry.name), `${namespace}\\${entry.name}`)
      } else if (entry.name.endsWith('.php')) {
        const className = `${namespace}\\${entry.name.slice(0, -4)}`
        models.push({
          class: className,
          file: join(dir, entry.name)
            .slice(projectPath.length + 1)
            .split(sep)
            .join('/')
        })
      }
    }
  }

  await walk(root, 'App\\Models')
  return models.sort((a, b) => a.class.localeCompare(b.class))
}

export function registerCodeIpc(projects: ProjectManager, php: PhpEnvironment): void {
  const projectOf = (projectId: string): LaravelProject => {
    const project = projects.get(projectId)
    if (!project) throw new Error('Project is no longer in your list.')
    return project
  }

  const artisanJson = async (
    project: LaravelProject,
    args: string[]
  ): Promise<{ ok: true; data: unknown } | { ok: false; message: string }> => {
    const phpInfo = await php.detect()
    if (!phpInfo) return { ok: false, message: 'No PHP binary found on this machine.' }
    try {
      const { stdout } = await execFileAsync(phpInfo.binaryPath, ['artisan', ...args], {
        cwd: project.path,
        timeout: 20000,
        maxBuffer: 32 * 1024 * 1024
      })
      return { ok: true, data: JSON.parse(stdout) }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      return { ok: false, message: detail }
    }
  }

  handle('code:routes', async (_event, projectId) => {
    const project = projectOf(projectId)
    const result = await artisanJson(project, ['route:list', '--json'])
    if (!result.ok) {
      return {
        ok: false as const,
        message: `Couldn't load routes — this needs Laravel 8.75+ with a bootable app. ${result.message}`
      }
    }
    const raw = Array.isArray(result.data) ? (result.data as RawRoute[]) : []
    const map = await psr4Map(project.path)
    const routes: RouteInfo[] = raw.map((route) => {
      const action = route.action ?? ''
      const className = action.includes('@') ? action.split('@')[0] : action
      return {
        method: route.method ?? '',
        uri: route.uri ?? '',
        name: route.name ?? null,
        action,
        middleware: Array.isArray(route.middleware)
          ? route.middleware
          : route.middleware
            ? [route.middleware]
            : [],
        file:
          className && className.includes('\\')
            ? resolveClassFile(project.path, map, className)
            : undefined
      }
    })
    return { ok: true as const, routes }
  })

  handle('code:models', (_event, projectId) => discoverModels(projectOf(projectId).path))

  handle('code:modelDetail', async (_event, projectId, modelClass) => {
    if (!MODEL_CLASS_RE.test(modelClass)) {
      return { ok: false as const, message: 'Invalid model class name.' }
    }
    const project = projectOf(projectId)
    const result = await artisanJson(project, ['model:show', modelClass, '--json'])
    if (!result.ok) {
      return {
        ok: false as const,
        message: `Couldn't inspect this model — model:show needs Laravel 9.21+ and a working database connection. ${result.message}`
      }
    }
    const data = result.data as {
      class?: string
      table?: string
      attributes?: Array<{
        name?: string
        type?: string | null
        nullable?: boolean
        fillable?: boolean
      }>
      relations?: Array<{ name?: string; type?: string; related?: string | null }>
      observers?: Array<{ event?: string; observer?: string[] } | string>
    }
    const attributes: ModelAttribute[] = (data.attributes ?? []).map((a) => ({
      name: a.name ?? '',
      type: a.type ?? null,
      nullable: a.nullable ?? false,
      fillable: a.fillable ?? false
    }))
    const relations: ModelRelation[] = (data.relations ?? []).map((r) => ({
      name: r.name ?? '',
      type: r.type ?? '',
      related: r.related ?? null
    }))
    const observers = (data.observers ?? []).map((o) =>
      typeof o === 'string' ? o : (o.observer ?? []).join(', ')
    )
    return {
      ok: true as const,
      detail: {
        class: data.class ?? modelClass,
        table: data.table ?? null,
        attributes,
        relations,
        observers: observers.filter(Boolean)
      }
    }
  })
}
