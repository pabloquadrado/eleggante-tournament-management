import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { WorkflowController } from '../../scripts/agent-workflow/controller.ts'
import { FileRunStore } from '../../scripts/agent-workflow/store.ts'
import { LocalWorkflowRuntime } from '../../scripts/agent-workflow/runtime.ts'
import type { CommandPort } from '../../scripts/agent-workflow/runtime.ts'
import type {
  GateEvidence,
  RoleReport,
  SourceSnapshot,
  Stage,
  WorkflowPorts,
} from '../../scripts/agent-workflow/contracts.ts'

export async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'workflow-git-'))
  const executeFile = promisify(execFile)
  // Inject real Git at the external boundary; CI does not need the production RTK wrapper.
  const commands: CommandPort = {
    execute: async (argv, cwd, timeout = 120000) => {
      if (argv[0] !== 'git') throw new Error('Test Git boundary accepts only Git commands')

      try {
        const result = await executeFile('git', argv.slice(1), {
          cwd,
          timeout,
          shell: false,
          encoding: 'utf8',
          maxBuffer: 20_000_000,
        })

        return { exitCode: 0, stdout: result.stdout, stderr: result.stderr }
      } catch (error) {
        const failed = error as Error & { code?: number; stdout?: string; stderr?: string }

        return {
          exitCode: typeof failed.code === 'number' ? failed.code : 1,
          stdout: failed.stdout ?? '',
          stderr: failed.stderr ?? failed.message,
        }
      }
    },
  }
  const runtime = new LocalWorkflowRuntime(directory, commands)
  const git = async (...argv: string[]) => {
    const result = await commands.execute(['git', ...argv], directory)

    if (result.exitCode) throw new Error(result.stderr)

    return result.stdout.trim()
  }

  await git('init', '-b', 'main')
  await git('config', 'user.name', 'Workflow Test')
  await git('config', 'user.email', 'workflow@example.test')
  await git('config', 'commit.gpgsign', 'false')
  await writeFile(join(directory, 'source.ts'), 'export const value = 1\n')
  await writeFile(
    join(directory, '.gitignore'),
    '.env\n.env.test\nnode_modules\ncoverage\n.adonisjs\ndatabase/schema.ts\npublic/assets\nbuild\n'
  )
  await writeFile(
    join(directory, '.env'),
    'APP_KEY=local-test-key\nDB_PASSWORD=local-test-password\nDB_DATABASE=arena_dev\nNODE_ENV=development\n'
  )
  await writeFile(join(directory, 'compose.yaml'), 'services: {}\n')
  await git('add', 'source.ts')
  await git('add', '.gitignore', 'compose.yaml')
  await git('commit', '-m', 'Initial fixture')
  let source: SourceSnapshot = {
    fingerprint: 'source-a',
    references: [{ locator: 'approved-prd', digest: 'prd-a' }],
    blockers: [],
    issue: {
      number: 4,
      title: 'Profile',
      url: 'https://github.com/example/repo/issues/4',
      body: 'Story',
      comments: [],
    },
    baseSha: await git('rev-parse', 'HEAD'),
  }
  let gatePasses = true
  let publications = 0
  const store = new FileRunStore(join(directory, '.agent-workflow/runs'))
  const ports: WorkflowPorts = {
    sources: { snapshot: async () => structuredClone(source) },
    git: {
      isolate: async () => ({
        worktree: directory,
        branch: 'feat/issue-4',
        commit: source.baseSha,
      }),
      inspect: async (path) =>
        path === directory
          ? {
              commit: await git('rev-parse', 'HEAD'),
              clean: !(await git('status', '--porcelain', '--untracked-files=no')),
            }
          : runtime.git.inspect(path),
      prepareQa: runtime.git.prepareQa,
      qaScope: runtime.git.qaScope,
      reviewDiff: runtime.git.reviewDiff,
    },
    verification: {
      run: async (run, kind): Promise<GateEvidence> => ({
        kind,
        commit: run.commit,
        sourceFingerprint: run.source.fingerprint,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        passed: gatePasses,
        commands: [
          {
            argv: ['rtk', 'proxy', 'npm', 'run', 'test:coverage'],
            exitCode: gatePasses ? 0 : 1,
            log: 'external-gate.log',
            digest: 'log',
          },
        ],
        coverage: {
          node: ['app/source.ts'],
          browser: ['inertia/source.tsx'],
          errors: gatePasses ? [] : ['Missed branch'],
        },
      }),
    },
    publication: {
      plan: async (run, persist) => {
        run.publication.progressSet = true
        run.publication.planComment = 'https://example.test/plan'
        await persist()
      },
      publish: async (run, persist) => {
        if (!run.publication.ready) publications++

        run.publication.ready = true
        run.publication.prUrl = 'https://example.test/pr/1'
        await persist()
      },
    },
  }
  const controller = new WorkflowController(store, ports)
  const run = await controller.start('4', { config: { profile: 'openai' } })
  const report = async (stage: Stage): Promise<RoleReport> => {
    const next = await controller.next(run.id)
    const packet = next.packets?.find((item) => item.stage === stage)

    if (!packet) throw new Error(`No ${stage} packet: ${JSON.stringify(next)}`)

    const qaCommit = packet.qaCheckout
      ? await commands.execute(['git', 'rev-parse', 'HEAD'], packet.qaCheckout.path)
      : undefined

    return {
      ...packet.reportTemplate,
      summary:
        stage === 'plan'
          ? '```mermaid\nsequenceDiagram\nUser->>System: Save profile\n```'
          : `Completed ${stage}`,
      publicSummary:
        stage === 'plan'
          ? '```mermaid\nsequenceDiagram\nUser->>System: Save profile\n```'
          : `Completed ${stage}`,
      evidence: ['https://example.test/evidence'],
      passed: true,
      model: {
        ...packet.reportTemplate.model,
        harness: 'test-native-harness',
        available: true,
        sessionId: `native-test-${stage}`,
        evidence: 'https://example.test/native-receipt',
      },
      qaCheckout: packet.qaCheckout
        ? {
            ...packet.qaCheckout,
            commit: qaCommit!.stdout.trim(),
          }
        : undefined,
    }
  }
  const record = async (stage: Stage) => controller.record(run.id, await report(stage))
  const prepare = async () => {
    await record('refinement')
    await record('plan')
    await controller.publish(run.id)
    await record('implementation')
  }
  const throughQa = async () => {
    await prepare()
    await controller.verify(run.id, 'engineering')
    await record('qa')
    await controller.verify(run.id, 'qa')
  }

  return {
    directory,
    run,
    store,
    controller,
    ports,
    report,
    record,
    prepare,
    throughQa,
    git,
    gitIn: async (cwd: string, ...argv: string[]) => {
      const result = await commands.execute(['git', ...argv], cwd)

      if (result.exitCode) throw new Error(result.stderr)

      return result.stdout.trim()
    },
    setSource: (value: Partial<SourceSnapshot>) => {
      source = { ...source, ...value }
    },
    setGatePasses: (passes: boolean) => {
      gatePasses = passes
    },
    publications: () => publications,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  }
}
