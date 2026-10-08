import { lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ownership, renderAdapters, type AdapterOptions } from './render.ts'

export interface FileChange {
  path: string
  action: 'create' | 'update' | 'unchanged' | 'preserve'
  content: string
}

async function contentAt(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined

    throw error
  }
}

async function requireLocalPath(root: string, path: string): Promise<void> {
  let current = resolve(root, path)

  while (current !== resolve(root)) {
    try {
      const entry = await lstat(current)

      if (entry.isSymbolicLink()) {
        throw new Error(`Refusing an adapter path through a symlink: ${relative(root, current)}`)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }

    current = dirname(current)
  }
}

export async function planAdapters(root: string, options: AdapterOptions): Promise<FileChange[]> {
  const changes: FileChange[] = []

  for (const file of renderAdapters(options)) {
    await requireLocalPath(root, file.path)
    const existing = await contentAt(join(root, file.path))

    if (existing === undefined) {
      changes.push({ ...file, action: 'create' })
    } else if (existing === file.content) {
      changes.push({ ...file, action: 'unchanged' })
    } else if (file.path === 'CLAUDE.md' && /(^|\n)@AGENTS\.md\s*(\n|$)/.test(existing)) {
      changes.push({ ...file, content: existing, action: 'preserve' })
    } else if (existing.includes(ownership)) {
      changes.push({ ...file, action: 'update' })
    } else {
      throw new Error(
        `Preserved user-owned file ${file.path}; choose another registration name or move it before configuring.`
      )
    }
  }

  return changes
}

export async function configureAdapters(
  root: string,
  options: AdapterOptions,
  dryRun = false
): Promise<FileChange[]> {
  const changes = await planAdapters(root, options)

  if (dryRun) return changes

  for (const file of changes) {
    if (file.action !== 'create' && file.action !== 'update') continue

    const destination = join(root, file.path)
    const temporary = `${destination}.${randomUUID()}.tmp`

    await mkdir(dirname(destination), { recursive: true })
    await writeFile(temporary, file.content, { flag: 'wx' })
    await rename(temporary, destination)
  }

  return changes
}

export async function codexAgentsDisabled(root: string): Promise<boolean> {
  const content = await contentAt(join(root, '.codex/config.toml'))

  if (!content) return false

  const clean = content.replace(/#.*$/gm, '')
  const section = clean.match(/^\s*\[agents\]\s*\n([\s\S]*?)(?=^\s*\[|(?![\s\S]))/m)?.[1] ?? ''

  return (
    /^\s*agents\.enabled\s*=\s*false\s*$/m.test(clean) ||
    /^\s*enabled\s*=\s*false\s*$/m.test(section) ||
    /^\s*agents\s*=\s*\{[^\n]*enabled\s*=\s*false/m.test(clean)
  )
}
