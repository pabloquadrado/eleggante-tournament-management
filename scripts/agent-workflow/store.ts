import { mkdir, open, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { RunState, Stage } from './contracts.ts'

export interface RunStore {
  directory(id: string): string
  read(id: string): Promise<RunState>
  save(run: RunState): Promise<void>
  list(): Promise<string[]>
  artifacts(run: RunState): Promise<{
    issue: string
    spec?: string
    sources: string
    reports: Partial<Record<Stage, string>>
    gates: Partial<Record<'engineering' | 'qa', string>>
  }>
  locked<T>(id: string, action: () => Promise<T>): Promise<T>
}

export class FileRunStore implements RunStore {
  readonly root: string

  constructor(root: string) {
    this.root = resolve(root)
  }

  directory(id: string) {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid run ID')

    return join(this.root, id)
  }

  async read(id: string): Promise<RunState> {
    const run = JSON.parse(
      await readFile(join(this.directory(id), 'state.json'), 'utf8')
    ) as RunState

    if (
      run.schemaVersion !== 1 ||
      run.id !== id ||
      !run.source ||
      !run.reports ||
      !run.gates ||
      !Array.isArray(run.questions) ||
      !Array.isArray(run.events)
    )
      throw new Error('Invalid persisted run')

    return run
  }

  async save(run: RunState) {
    const directory = this.directory(run.id)

    await mkdir(directory, { recursive: true, mode: 0o700 })
    const temporary = join(directory, `.state-${randomUUID()}.json`)
    const file = await open(temporary, 'wx', 0o600)

    try {
      await file.writeFile(JSON.stringify(run, null, 2))
      await file.sync()
    } finally {
      await file.close()
    }

    await rename(temporary, join(directory, 'state.json'))
  }

  async artifacts(run: RunState) {
    const directory = join(this.directory(run.id), 'artifacts')

    await mkdir(directory, { recursive: true, mode: 0o700 })
    const persist = async (kind: string, value: unknown) => {
      const content = JSON.stringify(value, null, 2)
      const hash = createHash('sha256').update(content).digest('hex')
      const path = join(directory, `${kind}-${hash}.json`)

      try {
        await writeFile(path, content, { flag: 'wx', mode: 0o400 })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      }

      return path
    }
    const issue = await persist('issue', run.source.issue)
    const spec = run.source.spec ? await persist('spec', run.source.spec) : undefined
    const sources = await persist('source-index', {
      fingerprint: run.source.fingerprint,
      baseSha: run.source.baseSha,
      references: run.source.references,
    })
    const reports: Partial<Record<Stage, string>> = {}

    for (const [stage, report] of Object.entries(run.reports))
      reports[stage as Stage] = await persist(`report-${stage}`, report)

    const gates: Partial<Record<'engineering' | 'qa', string>> = {}

    for (const [kind, gate] of Object.entries(run.gates))
      gates[kind as 'engineering' | 'qa'] = await persist(`verification-${kind}`, gate)

    return { issue, spec, sources, reports, gates }
  }

  async list() {
    try {
      const awaited1 = await readdir(this.root, { withFileTypes: true })

      return awaited1.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []

      throw error
    }
  }

  async locked<T>(id: string, action: () => Promise<T>): Promise<T> {
    const directory = this.directory(id)

    await mkdir(directory, { recursive: true, mode: 0o700 })
    const lockPath = join(directory, 'lock.json')
    let lock

    try {
      lock = await open(lockPath, 'wx', 0o600)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST')
        throw new Error(
          `Run ${id} is locked. Inspect lock.json and its owner before manually removing a stale lock.`
        )

      throw error
    }

    try {
      await lock.writeFile(
        JSON.stringify({
          pid: process.pid,
          hostname: process.env.HOSTNAME,
          startedAt: new Date().toISOString(),
        })
      )

      return await action()
    } finally {
      await lock.close()
      await unlink(lockPath)
    }
  }
}
