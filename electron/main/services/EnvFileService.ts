import { existsSync } from 'fs'
import { copyFile, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { EnvEntry, EnvFileState } from '@shared/types'

const PAIR_RE = /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/

interface ParsedValue {
  value: string
  quote: '"' | "'" | null
  /** Anything after the value (inline comment, trailing spaces) — preserved verbatim. */
  suffix: string
}

interface ParsedLine {
  raw: string
  key: string | null
  prefix: string
  equals: string
  parsed: ParsedValue | null
}

function parseValue(rest: string): ParsedValue {
  const first = rest[0]
  if (first === '"' || first === "'") {
    for (let i = 1; i < rest.length; i++) {
      if (rest[i] === '\\' && first === '"') {
        i++
        continue
      }
      if (rest[i] === first) {
        const inner = rest.slice(1, i)
        const value = first === '"' ? inner.replace(/\\(["\\])/g, '$1') : inner
        return { value, quote: first, suffix: rest.slice(i + 1) }
      }
    }
    // Unterminated quote — treat the whole rest as a raw value.
    return { value: rest, quote: null, suffix: '' }
  }
  const commentAt = rest.search(/\s#/)
  if (commentAt === -1) {
    return { value: rest.trimEnd(), quote: null, suffix: rest.slice(rest.trimEnd().length) }
  }
  const head = rest.slice(0, commentAt)
  return { value: head.trimEnd(), quote: null, suffix: rest.slice(head.trimEnd().length) }
}

function parseLine(raw: string): ParsedLine {
  const match = PAIR_RE.exec(raw)
  if (!match) return { raw, key: null, prefix: '', equals: '', parsed: null }
  const [, prefix, key, equals, rest] = match
  return { raw, key, prefix, equals, parsed: parseValue(rest) }
}

function serializeValue(value: string, previous: ParsedValue): string {
  const needsQuotes = /[\s#"']/.test(value)
  const quote = previous.quote ?? (needsQuotes ? '"' : null)
  if (quote === '"') return `"${value.replace(/(["\\])/g, '\\$1')}"`
  if (quote === "'") {
    // Single quotes can't escape; fall back to double quotes if the value contains one.
    return value.includes("'") ? `"${value.replace(/(["\\])/g, '\\$1')}"` : `'${value}'`
  }
  return value
}

function parseDocument(content: string): ParsedLine[] {
  return content.split('\n').map(parseLine)
}

function entriesOf(lines: ParsedLine[]): EnvEntry[] {
  // Last occurrence wins, matching how dotenv resolves duplicate keys.
  const byKey = new Map<string, string>()
  for (const line of lines) {
    if (line.key && line.parsed) byKey.set(line.key, line.parsed.value)
  }
  return [...byKey.entries()].map(([key, value]) => ({ key, value }))
}

/**
 * Reads and writes .env files without touching anything the user didn't
 * change: comments, blank lines, key order and quote style all survive a
 * round-trip. New keys are appended at the end.
 */
export class EnvFileService {
  async read(projectPath: string): Promise<EnvFileState> {
    const envPath = join(projectPath, '.env')
    const examplePath = join(projectPath, '.env.example')
    const exists = existsSync(envPath)
    const exampleExists = existsSync(examplePath)

    const entries = exists ? entriesOf(parseDocument(await readFile(envPath, 'utf8'))) : []
    const exampleKeys = exampleExists
      ? entriesOf(parseDocument(await readFile(examplePath, 'utf8'))).map((e) => e.key)
      : []

    const keys = new Set(entries.map((e) => e.key))
    const exampleKeySet = new Set(exampleKeys)
    return {
      exists,
      exampleExists,
      entries,
      missingKeys: exists ? exampleKeys.filter((k) => !keys.has(k)) : [],
      extraKeys: exampleExists ? [...keys].filter((k) => !exampleKeySet.has(k)) : []
    }
  }

  async write(projectPath: string, changes: Record<string, string>): Promise<EnvFileState> {
    const envPath = join(projectPath, '.env')
    if (!existsSync(envPath)) {
      throw new Error('No .env file to write to. Create one first.')
    }

    const content = await readFile(envPath, 'utf8')
    const lines = parseDocument(content)
    const pending = new Map(Object.entries(changes))

    const updated = lines.map((line) => {
      if (!line.key || !line.parsed || !pending.has(line.key)) return line.raw
      const value = pending.get(line.key) as string
      // Duplicate keys: every occurrence is updated so the effective value
      // (last one) matches what the user saw and saved.
      return `${line.prefix}${line.key}${line.equals}${serializeValue(value, line.parsed)}${line.parsed.suffix}`
    })

    const existingKeys = new Set(lines.map((l) => l.key).filter(Boolean))
    const appended = [...pending.entries()]
      .filter(([key]) => !existingKeys.has(key))
      .map(([key, value]) => `${key}=${serializeValue(value, { value, quote: null, suffix: '' })}`)

    let next = updated.join('\n')
    if (appended.length > 0) {
      if (next.length > 0 && !next.endsWith('\n')) next += '\n'
      next += appended.join('\n') + '\n'
    }
    await writeFile(envPath, next, 'utf8')
    return this.read(projectPath)
  }

  /** Creates .env by copying .env.example. Refuses to overwrite an existing .env. */
  async initFromExample(projectPath: string): Promise<EnvFileState> {
    const envPath = join(projectPath, '.env')
    const examplePath = join(projectPath, '.env.example')
    if (existsSync(envPath)) throw new Error('.env already exists.')
    if (!existsSync(examplePath)) throw new Error('No .env.example to copy from.')
    await copyFile(examplePath, envPath)
    return this.read(projectPath)
  }
}
