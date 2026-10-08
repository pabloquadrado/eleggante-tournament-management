import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  access,
  chmod,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import coverageLibrary from 'istanbul-lib-coverage'
import ts from 'typescript'
import type {
  GateEvidence,
  RunState,
  SourceSnapshot,
  WorkflowConfig,
  WorkflowPorts,
  QaIntegration,
} from './contracts.ts'

const { createCoverageMap } = coverageLibrary
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const repositoryMismatch =
  'Issue, specification, configured repository, and local origin must refer to the same GitHub repository'

function githubRepository(value: string, issue = false) {
  let address: URL

  try {
    address = new URL(value.replace(/^git@github\.com:/i, 'ssh://git@github.com/'))
  } catch {
    throw new Error(repositoryMismatch)
  }

  const match = (
    issue ? /^\/([\w.-]+)\/([\w.-]+)\/issues\/\d+$/ : /^\/([\w.-]+)\/([\w.-]+)\/?$/
  ).exec(address.pathname)

  if (
    !match ||
    address.hostname.toLowerCase() !== 'github.com' ||
    address.search ||
    address.hash ||
    (issue
      ? address.protocol !== 'https:' || address.username || address.password
      : !['https:', 'ssh:'].includes(address.protocol))
  )
    throw new Error(repositoryMismatch)

  return `${match[1]}/${issue ? match[2] : match[2].replace(/\.git$/i, '')}`.toLowerCase()
}

function canonicalPublicationText(value: string) {
  let previous = ''

  while (value !== previous) {
    previous = value
    value = value.replace(/(?:%[\da-f]{2})+/gi, (encoded) => {
      const bytes = Uint8Array.from(encoded.slice(1).split('%'), (hex) => Number.parseInt(hex, 16))

      return new TextDecoder('utf-8').decode(bytes)
    })
  }

  return value.normalize('NFC')
}

export type CommandResult = { exitCode: number; stdout: string; stderr: string }
export interface CommandPort {
  execute(argv: string[], cwd: string, timeout?: number): Promise<CommandResult>
}

export class RtkCommandPort implements CommandPort {
  async execute(argv: string[], cwd: string, timeout = 120000): Promise<CommandResult> {
    return new Promise((resolveCommand, reject) => {
      const child = spawn('rtk', ['proxy', ...argv], {
        cwd,
        shell: false,
        env: { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH}` },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      let failure: Error | undefined
      const timer = setTimeout(() => {
        failure = new Error(`Command timed out: ${argv[0]}`)
        child.kill('SIGTERM')
        setTimeout(() => child.kill('SIGKILL'), 3000).unref()
      }, timeout)
      const append = (chunk: Buffer, stream: 'stdout' | 'stderr') => {
        if (stream === 'stdout') stdout += chunk.toString()
        else stderr += chunk.toString()

        if (stdout.length + stderr.length > 20_000_000) {
          failure = new Error('Command output exceeded 20 MB')
          child.kill('SIGTERM')
        }
      }

      child.stdout.on('data', (chunk: Buffer) => append(chunk, 'stdout'))
      child.stderr.on('data', (chunk: Buffer) => append(chunk, 'stderr'))
      child.on('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.on('close', (code) => {
        clearTimeout(timer)

        if (failure) reject(failure)
        else resolveCommand({ exitCode: code ?? 1, stdout, stderr })
      })
    })
  }
}

async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name)

      if (entry.isDirectory()) return filesUnder(path)

      return [path]
    })
  )

  return nested.flat()
}

export async function validateCoverage(directory: string, executionRoot?: string) {
  const errors: string[] = []
  const node: string[] = []
  const browser: string[] = []
  const exclusions = JSON.parse(await readFile(join(directory, '.c8rc.json'), 'utf8')) as {
    include: string[]
    exclude: string[]
  }
  const excluded = new Set<string>()
  let documentation = ''

  try {
    const documents = await filesUnder(join(directory, 'docs'))

    const contents = await Promise.all(
      documents.filter((file) => file.endsWith('.md')).map((file) => readFile(file, 'utf8'))
    )

    documentation = contents.join('\n')
  } catch {
    /* Missing documentation cannot authorize an exclusion. */
  }

  for (const path of exclusions.exclude) {
    if (!/^app\/.+\.ts$/.test(path) || path.includes('..') || /[*?{}]/.test(path)) {
      errors.push(`Invalid application coverage exclusion: ${path}`)
      continue
    }

    try {
      const source = await readFile(resolve(directory, path), 'utf8')
      const compiled = ts
        .transpileModule(source, {
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ESNext,
            removeComments: true,
            verbatimModuleSyntax: false,
          },
        })
        .outputText.trim()
      const typeOnly = !compiled || /^export\s*\{\s*\};?$/.test(compiled)

      if (!typeOnly || !documentation.includes(path))
        errors.push(`Coverage exclusion must be documented and genuinely type-only: ${path}`)
      else excluded.add(resolve(directory, path))
    } catch {
      errors.push(`Excluded source is unavailable: ${path}`)
    }
  }

  const awaited1 = await filesUnder(join(directory, 'app'))

  const expectedNode = awaited1.filter((file) => file.endsWith('.ts') && !excluded.has(file))

  expectedNode.push(join(directory, 'start/routes.ts'))

  const awaited2 = await filesUnder(join(directory, 'inertia'))

  const expectedBrowser = awaited2.filter(
    (file) =>
      /\.(ts|tsx)$/.test(file) &&
      !relative(directory, file).startsWith('inertia/tests/') &&
      !['inertia/ssr.tsx', 'inertia/types.ts'].includes(relative(directory, file))
  )
  const check = (
    coverage: ReturnType<typeof createCoverageMap>,
    expected: string[],
    output: string[],
    kind: string
  ) => {
    const sourcePath = (file: string) => {
      const absolute = resolve(directory, file)

      return executionRoot && absolute.startsWith(`${resolve(executionRoot)}/`)
        ? resolve(directory, relative(resolve(executionRoot), absolute))
        : absolute
    }
    const paths = new Map(coverage.files().map((file) => [sourcePath(file), file]))

    for (const file of expected) {
      const covered = paths.get(file)

      if (!covered) {
        errors.push(`Missing ${kind} coverage: ${relative(directory, file)}`)
        continue
      }

      const summary = coverage.fileCoverageFor(covered).toSummary().data

      for (const metric of ['statements', 'branches', 'functions', 'lines'] as const) {
        if (summary[metric].covered !== summary[metric].total)
          errors.push(
            `${relative(directory, file)}: ${metric} ${summary[metric].covered}/${summary[metric].total}`
          )
      }

      output.push(relative(directory, file))
    }
  }

  try {
    check(
      createCoverageMap(
        JSON.parse(await readFile(join(directory, 'coverage/coverage-final.json'), 'utf8'))
      ),
      expectedNode,
      node,
      'Node'
    )
  } catch (error) {
    errors.push(`Node coverage unavailable: ${(error as Error).message}`)
  }

  try {
    const rawDirectory = join(directory, 'coverage/browser/raw')
    const awaited3 = await readdir(rawDirectory)

    const raw = awaited3.filter((name) => name.endsWith('.json'))
    const coverage = createCoverageMap({})

    if (!raw.length) errors.push('No browser coverage was collected')

    for (const file of raw)
      coverage.merge(JSON.parse(await readFile(join(rawDirectory, file), 'utf8')))

    check(coverage, expectedBrowser, browser, 'browser')
  } catch (error) {
    errors.push(`Browser coverage unavailable: ${(error as Error).message}`)
  }

  return { node, browser, errors }
}

export class LocalWorkflowRuntime implements WorkflowPorts {
  constructor(
    private root: string,
    private commands: CommandPort = new RtkCommandPort()
  ) {
    this.root = resolve(root)
  }

  private async command(argv: string[], cwd = this.root) {
    const result = await this.commands.execute(argv, cwd)

    if (result.exitCode !== 0)
      throw new Error(
        `${argv[0]} ${argv[1] ?? ''} failed (${result.exitCode}): ${result.stderr.slice(0, 2000)}`
      )

    return result.stdout.trim()
  }

  private async repository(config: WorkflowConfig, input?: string) {
    const origin = await this.command(['git', 'remote', 'get-url', 'origin'])
    let canonicalOrigin = origin.replace(/^([\w.-]+)@([\w.-]+):/, 'ssh://$1@$2/')

    if (canonicalOrigin.startsWith('ssh://')) {
      let address: URL

      try {
        address = new URL(canonicalOrigin)
      } catch {
        throw new Error(repositoryMismatch)
      }

      if (address.hostname.toLowerCase() !== 'github.com') {
        if (!/^[a-zA-Z0-9][\w.-]*$/.test(address.hostname)) throw new Error(repositoryMismatch)

        const resolved = await this.commands.execute(
          ['ssh', '-G', address.hostname],
          this.root,
          10000
        )
        const hostnames = resolved.stdout
          .split(/\r?\n/)
          .flatMap((line) => /^hostname\s+(\S+)\s*$/i.exec(line)?.slice(1) ?? [])

        if (
          resolved.exitCode !== 0 ||
          hostnames.length !== 1 ||
          hostnames[0].toLowerCase() !== 'github.com'
        )
          throw new Error(repositoryMismatch)

        address.hostname = 'github.com'
        canonicalOrigin = address.toString()
      }
    }

    const repo = githubRepository(canonicalOrigin)

    if (
      (config.repo && config.repo.toLowerCase() !== repo) ||
      (input && !/^\d+$/.test(input) && githubRepository(input, true) !== repo)
    )
      throw new Error(repositoryMismatch)

    return repo
  }

  private async issue(input: string, repo: string, runId?: string) {
    const argv = [
      'gh',
      'issue',
      'view',
      input,
      '--comments',
      '--json',
      'number,title,url,body,comments',
      '--repo',
      repo,
    ]
    const issue = JSON.parse(await this.command(argv)) as SourceSnapshot['issue']

    if (githubRepository(issue.url, true) !== repo) throw new Error(repositoryMismatch)

    issue.comments = issue.comments
      .filter((comment) => !runId || !comment.body.includes(`<!-- agent-workflow:${runId}:`))
      .map((comment) => ({ id: comment.id, body: comment.body }))

    return issue
  }

  sources = {
    snapshot: async (
      input: string,
      config: WorkflowConfig,
      _directory = this.root,
      runId?: string
    ): Promise<SourceSnapshot> => {
      const blockers: string[] = []
      const references: SourceSnapshot['references'] = []
      const repo = await this.repository(config, input)
      const issue = await this.issue(input, repo, runId)
      const spec = await this.issue(String(config.specIssue ?? 1), repo, runId)
      const remote = await this.command(['git', 'ls-remote', 'origin', 'refs/heads/main'])
      const baseSha = remote.split(/\s/)[0]

      if (!/^[a-f0-9]{40,64}$/.test(baseSha)) throw new Error('Remote main is unavailable')

      references.push(
        { locator: issue.url, digest: digest(JSON.stringify(issue)) },
        { locator: spec.url, digest: digest(JSON.stringify(spec)) }
      )
      const tree = await this.commands.execute(
        ['git', 'ls-tree', '-r', baseSha, '--', 'AGENTS.md', 'CONTEXT.md', 'docs'],
        this.root
      )
      let baseline: { path: string; sha: string }[]

      if (tree.exitCode === 0)
        baseline = tree.stdout
          .split('\n')
          .filter(Boolean)
          .map((line) => ({ path: line.split('\t')[1], sha: line.split(/\s/)[2] }))
      else {
        const remoteTree = JSON.parse(
          await this.command(['gh', 'api', `repos/${repo}/git/trees/${baseSha}?recursive=1`])
        ) as { tree: { path: string; sha: string; type: string }[] }

        baseline = remoteTree.tree.filter(
          (entry) =>
            entry.type === 'blob' &&
            (entry.path === 'AGENTS.md' ||
              entry.path === 'CONTEXT.md' ||
              entry.path.startsWith('docs/'))
        )
      }

      for (const file of baseline) {
        if (file.path.endsWith('.md'))
          references.push({ locator: `${baseSha}:${file.path}`, digest: file.sha })
      }

      if (config.prd?.approved !== true || !config.prd.path || !config.prd.locator)
        blockers.push('Approved PRD is unavailable; configure its approved locator and local file')
      else {
        try {
          references.push({
            locator: config.prd.locator,
            digest: digest(await readFile(resolve(this.root, config.prd.path), 'utf8')),
          })
        } catch {
          blockers.push('Approved PRD cannot be read; request Owner access')
        }
      }

      return {
        issue,
        spec,
        references,
        blockers,
        baseSha,
        fingerprint: digest(JSON.stringify({ references, baseSha, blockers })),
      }
    },
  }

  private async copyLocalEnvironment(checkout: string) {
    let primary: string | undefined

    for (const name of ['.env', '.env.test']) {
      const source = join(this.root, name)

      try {
        await access(source)
        const destination = join(checkout, name)

        if (source !== destination) await copyFile(source, destination)

        await chmod(destination, 0o600)

        if (!primary) primary = destination
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
          throw new Error('Unable to prepare private verification environment')
      }
    }

    if (primary && primary.endsWith('.env.test')) {
      await copyFile(primary, join(checkout, '.env'))
      await chmod(join(checkout, '.env'), 0o600)
      primary = join(checkout, '.env')
    }

    return primary
  }

  private async dockerSetup(run: RunState, checkout: string, directory: string) {
    const envFile = await this.copyLocalEnvironment(checkout)

    if (!envFile)
      throw new Error('Docker verification requires a configured local .env or .env.test')

    await access(join(this.root, 'compose.yaml'))
    const project = `agent-workflow-${run.id}`.toLowerCase()
    const composeFile = join(directory, 'compose.override.json')
    const initialization = join(directory, 'test-database.sql')

    await writeFile(
      initialization,
      '-- POSTGRES_DB already creates the isolated arena_test database.\n',
      { mode: 0o600 }
    )
    await writeFile(
      composeFile,
      JSON.stringify(
        {
          services: {
            database: {
              environment: { POSTGRES_DB: 'arena_test' },
              healthcheck: { test: ['CMD', 'pg_isready', '-U', 'arena', '-d', 'arena_test'] },
              volumes: [
                {
                  type: 'bind',
                  source: initialization,
                  target: '/docker-entrypoint-initdb.d/init-test-db.sql',
                  read_only: true,
                },
              ],
            },
            tests: {
              build: { context: checkout, dockerfile: join(checkout, 'Dockerfile.test') },
              environment: {
                NODE_ENV: 'test',
                HOST: '127.0.0.1',
                DB_HOST: 'database',
                DB_PORT: '5432',
                DB_USER: 'arena',
                DB_DATABASE: 'arena_test',
                QUEUE_DRIVER: 'sync',
                SESSION_DRIVER: 'database',
              },
              volumes: [
                { type: 'bind', source: checkout, target: '/app' },
                { type: 'volume', source: 'node_modules', target: '/app/node_modules' },
              ],
            },
          },
        },
        null,
        2
      ),
      { mode: 0o600 }
    )
    const compose = [
      'docker',
      'compose',
      '--project-name',
      project,
      '--project-directory',
      this.root,
      '--env-file',
      envFile,
      '--file',
      join(this.root, 'compose.yaml'),
      '--file',
      composeFile,
      '--profile',
      'test',
    ]
    let content = await readFile(envFile, 'utf8')

    try {
      content += `\n${await readFile(join(checkout, '.env.test'), 'utf8')}`
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error('Unable to read private verification environment for log redaction')
    }

    const secrets = content
      .split('\n')
      .filter((line) => /(?:PASSWORD|SECRET|TOKEN|CREDENTIAL|_KEY)\s*=/.test(line))
      .map((line) =>
        line
          .slice(line.indexOf('=') + 1)
          .trim()
          .replace(/^['"]|['"]$/g, '')
      )
      .filter((value) => value.length >= 4)

    return {
      compose,
      setup: {
        project,
        checkout,
        database: 'arena_test' as const,
        composeFile,
        envFile,
        recovery: ['rtk', 'proxy', ...compose, 'down', '--volumes'],
      },
      redact: (output: string) =>
        secrets.reduce((result, secret) => result.replaceAll(secret, '[REDACTED]'), output),
    }
  }

  git = {
    inspect: async (directory: string) => ({
      commit: await this.command(['git', 'rev-parse', 'HEAD'], directory),
      clean: !(await this.command(['git', 'status', '--porcelain'], directory)),
    }),
    isolate: async (run: RunState, directory: string) => {
      await this.repo(run)
      await this.command(['git', 'fetch', 'origin', 'main'])
      const base = await this.command(['git', 'rev-parse', 'origin/main'])

      if (base !== run.source.baseSha)
        throw new Error('Remote main changed during start; retry start')

      const branch = `feat/issue-${run.source.issue.number}-${run.id.split('-').at(-1)}`
      const worktree = join(directory, 'worktree')

      await this.command(['git', 'worktree', 'add', '-b', branch, worktree, base])

      try {
        await access(join(this.root, 'node_modules'))
        await symlink(join(this.root, 'node_modules'), join(worktree, 'node_modules'), 'dir')
      } catch (error) {
        if (
          (error as NodeJS.ErrnoException).code !== 'ENOENT' &&
          (error as NodeJS.ErrnoException).code !== 'EEXIST'
        )
          throw error
      }

      await this.copyLocalEnvironment(worktree)

      return { branch, worktree, commit: base }
    },
    prepareQa: async (run: RunState, directory: string) => {
      const path = join(directory, `qa-${run.commit.slice(0, 12)}-${randomUUID().slice(0, 6)}`)

      await this.command(['git', 'worktree', 'add', '--detach', path, run.commit])

      try {
        await access(join(this.root, 'node_modules'))
        await symlink(join(this.root, 'node_modules'), join(path, 'node_modules'), 'dir')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }

      await this.copyLocalEnvironment(path)

      return { path, baseCommit: run.commit }
    },
    qaScope: async (directory: string, baseCommit: string) => {
      const checkout = await this.git.inspect(directory)
      const committed = await this.command(
        ['git', 'diff', '--name-only', `${baseCommit}..HEAD`],
        directory
      )
      const dirty = await this.command(['git', 'diff', '--name-only', 'HEAD'], directory)
      const untracked = await this.command(
        ['git', 'ls-files', '--others', '--exclude-standard'],
        directory
      )

      return {
        ...checkout,
        changedFiles: [
          ...new Set(`${committed}\n${dirty}\n${untracked}`.split('\n').filter(Boolean)),
        ],
      }
    },
    qaIntegrated: async (directory: string, integration: QaIntegration, deliveryCommit: string) => {
      if (!integration.baseCommit) return false

      const scope = await this.git.qaScope(integration.path, integration.baseCommit)

      if (
        !scope.clean ||
        scope.commit !== integration.commit ||
        scope.changedFiles.some(
          (path) => !path.startsWith('tests/') && !path.startsWith('inertia/tests/')
        ) ||
        JSON.stringify([...scope.changedFiles].sort()) !==
          JSON.stringify([...integration.changedFiles].sort())
      )
        return false

      const support = await this.commands.execute(['git', 'merge-tree', '-h'], directory, 10000)
      const help = `${support.stdout}\n${support.stderr}`

      if (
        ![0, 129].includes(support.exitCode) ||
        !help.includes('--write-tree') ||
        !/--(?:\[no-\])?merge-base\b/.test(help)
      )
        throw new Error(
          'Install Git 2.43 or newer with merge-tree --write-tree --merge-base support for QA integration verification'
        )

      const merged = await this.commands.execute(
        [
          'git',
          'merge-tree',
          '--write-tree',
          `--merge-base=${integration.baseCommit}`,
          deliveryCommit,
          integration.commit,
        ],
        directory
      )

      if (merged.exitCode !== 0) return false

      const tree = await this.command(['git', 'rev-parse', `${deliveryCommit}^{tree}`], directory)

      return merged.stdout.trim() === tree
    },
    reviewDiff: async (run: RunState, directory: string) => {
      const path = join(directory, `review-${run.commit}.patch`)
      const patch = await this.command(
        ['git', 'diff', '--binary', run.source.baseSha, run.commit],
        run.worktree
      )
      const changed = await this.command(
        ['git', 'diff', '--name-only', run.source.baseSha, run.commit],
        run.worktree
      )

      await writeFile(path, patch, { mode: 0o600 })

      return {
        path,
        baseCommit: run.source.baseSha,
        candidateCommit: run.commit,
        changedFiles: changed.split('\n').filter(Boolean),
      }
    },
  }

  verification = {
    run: async (
      run: RunState,
      kind: 'engineering' | 'qa',
      evidenceDirectory: string
    ): Promise<GateEvidence> => {
      const checkout = kind === 'qa' ? run.qaCheckout?.path : run.worktree

      if (!checkout) throw new Error('Missing isolated verification worktree')

      const execution = await this.git.inspect(checkout)

      const startedAt = new Date().toISOString()
      const directory = join(evidenceDirectory, `verification-${kind}-${Date.now()}`)

      await mkdir(directory, { recursive: true, mode: 0o700 })

      try {
        await rename(join(checkout, 'coverage'), join(directory, 'previous-coverage'))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }

      const commands: GateEvidence['commands'] = []
      const { compose, setup, redact } = await this.dockerSetup(run, checkout, directory)
      const container = (argv: string[]) => [...compose, 'run', '--rm', 'tests', ...argv]
      const scripts =
        kind === 'engineering'
          ? ['check:architecture', 'typecheck', 'lint', 'test:workflow', 'test:coverage']
          : ['test:coverage']
      const commandList = [
        [...compose, 'build', 'tests'],
        container(['npm', 'ci']),
        container(['node', 'ace', 'migration:fresh', '--drop-types', '--force']),
        container(['npm', 'run', 'build']),
        ...scripts.map((script) => container(['npm', 'run', script])),
        container(['node', 'node_modules/c8/bin/c8.js', 'report', '--reporter=json']),
      ]
      const capture = async (argv: string[]) => {
        const log = join(directory, `${commands.length}.log`)
        let result: CommandResult

        try {
          result = await this.commands.execute(argv, this.root, 30 * 60 * 1000)
        } catch (error) {
          result = { exitCode: 1, stdout: '', stderr: (error as Error).message }
        }

        const output = redact(`${result.stdout}\n${result.stderr}`)

        await writeFile(log, output, { mode: 0o600 })
        commands.push({
          argv: ['rtk', 'proxy', ...argv],
          exitCode: result.exitCode,
          log,
          digest: digest(output),
        })

        return result.exitCode
      }

      try {
        for (const [index, argv] of commandList.entries()) {
          const exitCode = await capture(argv)

          if (exitCode && index < 4) break
        }
      } finally {
        await capture([...compose, 'stop', 'database'])
      }

      const coverage = await validateCoverage(checkout, '/app')
      const evidence: GateEvidence = {
        kind,
        commit: run.commit,
        executionCommit: execution.commit,
        sourceFingerprint: run.source.fingerprint,
        passed: commands.every((command) => command.exitCode === 0) && !coverage.errors.length,
        startedAt,
        finishedAt: new Date().toISOString(),
        commands,
        coverage,
        setup,
      }

      await writeFile(join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2), {
        mode: 0o600,
      })

      return evidence
    },
  }

  private async repo(run: RunState) {
    const repo = await this.repository(run.config, run.issueInput)

    if (
      githubRepository(run.source.issue.url, true) !== repo ||
      (run.source.spec && githubRepository(run.source.spec.url, true) !== repo)
    )
      throw new Error(repositoryMismatch)

    return repo
  }

  private async assertPublic(run: RunState, body: string) {
    const decoded = canonicalPublicationText(body)
    const urls = decoded.match(/\bhttps?:\/\/[^\s<>"'`)]+/gi) ?? []
    const localUrl = urls.some((value) => {
      try {
        const hostname = new URL(value).hostname.toLowerCase().replace(/\.$/, '')

        return (
          hostname === 'localhost' ||
          hostname.endsWith('.localhost') ||
          /^127\.\d+\.\d+\.\d+$/.test(hostname) ||
          ['0.0.0.0', '[::]', '[::1]'].includes(hostname)
        )
      } catch {
        return false
      }
    })

    if (
      localUrl ||
      /\b(?:file|vscode(?:-[\w-]+)?)\s*:/i.test(decoded) ||
      /(?:^|[\s("'`])(?:\/(?:Users|private|tmp|home|var|etc)\/|[A-Za-z]:[\\/])/.test(decoded) ||
      /\b(?:sk-[a-zA-Z0-9_-]{12,}|gh[pousr]_[a-zA-Z0-9]{20,}|(?:password|api[_ -]?key|access[_ -]?token)\s*[:=]\s*\S+)/i.test(
        decoded
      )
    )
      throw new Error('Publication body contains a local path or secret-like value')

    const receipts = Object.values(run.reports)
      .flatMap((report) => (report ? [report.model.sessionId, report.model.evidence] : []))
      .filter((value) => value && value.length >= 6)
    const privateRefs = run.config.prd ? [run.config.prd.path, run.config.prd.locator] : []

    if (
      [...receipts, ...privateRefs].some(
        (value) => value && decoded.includes(canonicalPublicationText(value))
      )
    )
      throw new Error('Publication body contains a private source or native receipt')

    if (run.config.prd?.path) {
      const prd = canonicalPublicationText(
        await readFile(resolve(this.root, run.config.prd.path), 'utf8')
      )
      const normalize = (value: string) => value.replace(/\s+/g, ' ').trim()
      const contract = normalize(
        canonicalPublicationText(`${run.source.issue.body} ${run.source.spec?.body ?? ''}`)
      )
      const normalized = normalize(decoded)
      const excerpts = prd
        .split(/[\n.!?]/)
        .map(normalize)
        .filter((text) => text.length >= 40)

      if (excerpts.some((excerpt) => !contract.includes(excerpt) && normalized.includes(excerpt)))
        throw new Error('Publication body contains a nonpublic PRD excerpt')
    }
  }

  private async ensurePr(
    run: RunState,
    persist: () => Promise<void>,
    directory: string,
    body: string
  ) {
    if (!run.worktree || !run.branch) throw new Error('Missing isolated branch')

    await this.assertPublic(run, body)
    const repo = await this.repo(run)

    const lookup = [
      'gh',
      'pr',
      'list',
      '--repo',
      repo,
      '--head',
      run.branch,
      '--state',
      'open',
      '--json',
      'url,isDraft,headRefOid',
    ]
    let existing = JSON.parse(await this.command(lookup)) as {
      url: string
      isDraft: boolean
      headRefOid: string
    }[]

    if (
      existing[0] &&
      !existing[0].isDraft &&
      (existing[0].headRefOid !== run.commit || !run.publication.ready)
    ) {
      await this.command(['gh', 'pr', 'ready', existing[0].url, '--undo', '--repo', repo])
      existing[0].isDraft = true
      delete run.publication.ready
      await persist()
    }

    if (run.publication.pushedCommit !== run.commit) {
      await this.command(['git', 'push', '--set-upstream', 'origin', run.branch], run.worktree)
      run.publication.pushedCommit = run.commit
      await persist()
      existing = JSON.parse(await this.command(lookup))
    }

    const bodyFile = join(directory, 'pr.md')

    await writeFile(bodyFile, body, { mode: 0o600 })

    if (!existing.length) {
      await this.command(
        [
          'gh',
          'pr',
          'create',
          '--repo',
          repo,
          '--head',
          run.branch,
          '--base',
          'main',
          '--title',
          run.source.issue.title,
          '--body-file',
          bodyFile,
          '--draft',
        ],
        run.worktree
      )
      existing = JSON.parse(await this.command(lookup))
    }

    const pr = existing[0]

    if (!pr || pr.headRefOid !== run.commit) throw new Error('PR head differs from verified commit')

    const bodyDigest = digest(body)

    if (run.publication.prBodyDigest !== bodyDigest || run.publication.prUrl !== pr.url) {
      await this.command(['gh', 'pr', 'edit', pr.url, '--repo', repo, '--body-file', bodyFile])
      run.publication.prBodyDigest = bodyDigest
      run.publication.prBodyCommit = run.commit
    }

    run.publication.prUrl = pr.url

    if (pr.isDraft) run.publication.draftCommit = run.commit

    await persist()

    return pr
  }

  private async comment(run: RunState, kind: string, body: string, directory: string) {
    await this.assertPublic(run, body)
    const revision = kind === 'plan' ? run.source.fingerprint : run.commit
    const marker = `<!-- agent-workflow:${run.id}:${kind}:${revision} -->`
    const repo = await this.repo(run)
    const comments = JSON.parse(
      await this.command([
        'gh',
        'api',
        '--paginate',
        '--slurp',
        `repos/${repo}/issues/${run.source.issue.number}/comments`,
      ])
    ) as { id: number; body: string; html_url: string }[][]
    const found = comments.flat().find((comment) => comment.body.includes(marker))

    if (found) return found.html_url

    const path = join(directory, `${kind}.md`)

    await writeFile(path, `${marker}\n${body}`, { mode: 0o600 })
    await this.command([
      'gh',
      'issue',
      'comment',
      String(run.source.issue.number),
      '--repo',
      repo,
      '--body-file',
      path,
    ])
    const updated = JSON.parse(
      await this.command([
        'gh',
        'api',
        '--paginate',
        '--slurp',
        `repos/${repo}/issues/${run.source.issue.number}/comments`,
      ])
    ) as { body: string; html_url: string }[][]
    const created = updated.flat().find((comment) => comment.body.includes(marker))

    if (!created) throw new Error('Published comment could not be confirmed')

    return created.html_url
  }

  private async progress(run: RunState) {
    const repo = await this.repo(run)
    const owner = repo.split('/')[0]
    const project = JSON.parse(
      await this.command(['gh', 'project', 'view', '1', '--owner', owner, '--format', 'json'])
    ) as { id: string }
    const fields = JSON.parse(
      await this.command(['gh', 'project', 'field-list', '1', '--owner', owner, '--format', 'json'])
    ) as { fields: { id: string; name: string; options?: { id: string; name: string }[] }[] }
    const status = fields.fields.find((field) => field.name === 'Status')
    const option = status?.options?.find((item) => item.name === 'In Progress')
    let items = JSON.parse(
      await this.command([
        'gh',
        'project',
        'item-list',
        '1',
        '--owner',
        owner,
        '--limit',
        '1000',
        '--format',
        'json',
      ])
    ) as { items: { id: string; content: { url?: string } }[] }
    let item = items.items.find((entry) => entry.content.url === run.source.issue.url)

    if (!item) {
      await this.command([
        'gh',
        'project',
        'item-add',
        '1',
        '--owner',
        owner,
        '--url',
        run.source.issue.url,
      ])
      items = JSON.parse(
        await this.command([
          'gh',
          'project',
          'item-list',
          '1',
          '--owner',
          owner,
          '--limit',
          '1000',
          '--format',
          'json',
        ])
      )
      item = items.items.find((entry) => entry.content.url === run.source.issue.url)
    }

    if (!item || !status || !option)
      throw new Error('Project item or In Progress option unavailable')

    await this.command([
      'gh',
      'project',
      'item-edit',
      '--id',
      item.id,
      '--project-id',
      project.id,
      '--field-id',
      status.id,
      '--single-select-option-id',
      option.id,
    ])
  }

  publication = {
    plan: async (run: RunState, persist: () => Promise<void>, directory: string) => {
      const plan = run.reports.plan

      if (!plan?.passed || !plan.publicSummary.includes('sequenceDiagram'))
        throw new Error('Public development plan requires a Mermaid sequence diagram')

      await this.assertPublic(run, plan.publicSummary)
      await this.repo(run)

      if (!run.publication.progressSet) {
        await this.progress(run)
        run.publication.progressSet = true
        await persist()
      }

      if (!run.publication.planComment) {
        run.publication.planComment = await this.comment(
          run,
          'plan',
          `## Development plan\n\n${plan.publicSummary}`,
          directory
        )
        await persist()
      }
    },
    draft: async (run: RunState, persist: () => Promise<void>, directory: string) => {
      if (!run.gates.engineering?.passed || run.gates.engineering.commit !== run.commit)
        throw new Error('Draft PR requires fresh engineering verification')

      const body = `## Summary\n\n${run.reports.implementation!.publicSummary}\n\nCloses #${run.source.issue.number}\n\n## Evidence\n\n- **Before:** Acceptance examples in #${run.source.issue.number}.\n  **After:** Engineering checks and per-file Node/browser coverage passed on ${run.commit}. Independent QA is pending.\n\nDevelopment plan: ${run.publication.planComment}\n\n## Merge Danger\n\n**Door:** Pending Delivery Lead assessment.\n\n**Blast Radius:** Pending independent review.`

      await this.ensurePr(run, persist, directory, body)
    },
    publish: async (run: RunState, persist: () => Promise<void>, directory: string) => {
      const repo = await this.repo(run)
      const retrospective = run.reports.retrospective!.publicSummary
      const review = `## Review and verification\n\n${run.reports['review-standards']!.publicSummary}\n\n${run.reports['review-spec']!.publicSummary}\n\n${run.reports.qa!.publicSummary}\n\nEngineering and independent QA gates passed for ${run.commit}.\n\nFindings: ${run.findings.map((finding) => `${finding.id}: ${finding.status}`).join(', ') || 'None'}`

      if (
        !/\*\*Door:\*\*\s*(?:one-way|two-way)/i.test(retrospective) ||
        !retrospective.includes('**Blast Radius:**')
      )
        throw new Error(
          'Delivery Lead public summary must contain **Door:** one-way|two-way and **Blast Radius:** assessment'
        )

      await this.assertPublic(run, review)
      await this.assertPublic(run, retrospective)

      if (!run.publication.planComment) await this.publication.plan(run, persist, directory)

      if (!run.publication.reviewComment) {
        run.publication.reviewComment = await this.comment(run, 'review', review, directory)
        await persist()
      }

      if (!run.publication.retrospectiveComment) {
        run.publication.retrospectiveComment = await this.comment(
          run,
          'retrospective',
          `## Retrospective\n\n${retrospective}`,
          directory
        )
        await persist()
      }

      const body = `## Summary\n\n${run.reports.implementation!.publicSummary}\n\nCloses #${run.source.issue.number}\n\n## Evidence\n\n- **Before:** Acceptance examples in #${run.source.issue.number}.\n  **After:** ${run.reports.qa!.publicSummary}\n\nEngineering and independent QA passed on ${run.commit}; all per-file application coverage metrics are 100%.\n\nDevelopment plan: ${run.publication.planComment}\n\nReview: ${run.publication.reviewComment}\n\nRetrospective: ${run.publication.retrospectiveComment}\n\n## Merge Danger\n\n${retrospective}`
      const pr = await this.ensurePr(run, persist, directory, body)
      const checks = JSON.parse(
        await this.command([
          'gh',
          'pr',
          'view',
          pr.url,
          '--repo',
          repo,
          '--json',
          'headRefOid,statusCheckRollup',
        ])
      ) as {
        headRefOid: string
        statusCheckRollup: {
          name?: string
          context?: string
          conclusion?: string
          state?: string
          status?: string
        }[]
      }
      const required = [...new Set(['test', ...(run.config.requiredChecks ?? [])])]
      const successful = (check: (typeof checks.statusCheckRollup)[number]) =>
        (check.conclusion ?? check.state) === 'SUCCESS' &&
        (!check.status || check.status === 'COMPLETED')

      if (
        !required.length ||
        checks.headRefOid !== run.commit ||
        !checks.statusCheckRollup.length ||
        required.some(
          (name) =>
            !checks.statusCheckRollup.some(
              (check) => (check.name ?? check.context) === name && successful(check)
            )
        ) ||
        checks.statusCheckRollup.some((check) => !successful(check))
      )
        throw new Error(
          `PR checks must complete successfully on ${run.commit}, including ${required.join(', ')}; resume publish later`
        )

      if (pr.isDraft) await this.command(['gh', 'pr', 'ready', pr.url, '--repo', repo])

      run.publication.ready = true
      await persist()
    },
  }
}

export function safeReportPath(path: string, directory: string) {
  const resolved = resolve(directory, path)
  const escaped = relative(resolve(directory), resolved)

  if (escaped.startsWith('..') || isAbsolute(escaped))
    throw new Error('Report path must stay inside the current directory')

  return resolved
}
