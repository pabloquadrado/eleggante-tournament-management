import { readFile, realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { WorkflowController } from './agent-workflow/controller.ts'
import { FileRunStore } from './agent-workflow/store.ts'
import { LocalWorkflowRuntime, safeReportPath } from './agent-workflow/runtime.ts'
import { modelFor, profiles, roles } from './agent-workflow/models.ts'
import type {
  WorkflowConfig,
  Stage,
  RunState,
  GateEvidence,
  WorkflowPorts,
} from './agent-workflow/contracts.ts'

export const help = `Portable implementation workflow (native harness dispatch)

npm run workflow -- start <issue-number|issue-url> [--dry-run] [--config path]
  [--profile openai|anthropic] [--engineer kimi-k3]
  [--prd path --prd-locator locator --approved-prd]
npm run workflow -- next <run-id>
npm run workflow -- record <run-id> <report-path>
npm run workflow -- verify <run-id> engineering|qa
npm run workflow -- question <run-id> <text> [--stage stage] [--finding finding-id]
npm run workflow -- answer <run-id> <question-id> <answer> [--approve-deferral|--deny-deferral --user-ref reference]
npm run workflow -- resume <run-id> [--config path]
npm run workflow -- status|publish <run-id>
npm run workflow -- escalate <run-id> coordinator|delivery-lead --reason text
npm run workflow -- profiles|help

State output is compact. Add --full for local diagnostic state.

Local config: .agent-workflow/config.json (ignored). PRD contents stay outside run state.
next emits native harness task packets and a versioned report template.
publish publishes the approved development plan first; final publish pushes the verified
branch, posts review and retrospective, creates a draft PR, then marks it ready once
required checks including coverage pass. The Owner alone merges.`

export async function runCli(
  args: string[],
  root = process.cwd(),
  ports: WorkflowPorts = new LocalWorkflowRuntime(root)
) {
  const command = args[0]
  const positional: string[] = []
  const options = new Map<string, string | boolean>()
  const booleans = [
    '--dry-run',
    '--approved-prd',
    '--approve-deferral',
    '--deny-deferral',
    '--full',
  ]
  const values = [
    '--config',
    '--profile',
    '--engineer',
    '--prd',
    '--prd-locator',
    '--stage',
    '--finding',
    '--user-ref',
    '--reason',
  ]

  for (let index = 1; index < args.length; index++) {
    const value = args[index]

    if (booleans.includes(value)) options.set(value, true)
    else if (values.includes(value)) {
      if (!args[index + 1] || args[index + 1].startsWith('--'))
        throw new Error(`Missing ${value} value`)

      options.set(value, args[++index])
    } else if (value.startsWith('--')) throw new Error(`Unknown option: ${value}`)
    else positional.push(value)
  }

  if (command === 'help' || !command) return help

  if (command === 'profiles')
    return Object.fromEntries(
      profiles.map((profile) => [
        profile,
        Object.fromEntries(roles.map((role) => [role, modelFor(profile, role)])),
      ])
    )

  const store = new FileRunStore(resolve(root, '.agent-workflow/runs'))
  const controller = new WorkflowController(store, ports)
  const requireCount = (count: number) => {
    if (positional.length !== count)
      throw new Error(`Invalid arguments for ${command}; run workflow help`)
  }

  if (command === 'start') {
    requireCount(1)
    const configPath = resolve(
      root,
      String(options.get('--config') ?? '.agent-workflow/config.json')
    )
    let config: WorkflowConfig = { profile: 'openai' }

    try {
      config = { ...config, ...JSON.parse(await readFile(configPath, 'utf8')) }
    } catch (error) {
      if (options.has('--config') || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }

    if (options.has('--profile'))
      config.profile = String(options.get('--profile')) as WorkflowConfig['profile']

    if (options.has('--engineer'))
      config.engineerOverride = String(options.get('--engineer')) as 'kimi-k3'

    if (['--prd', '--prd-locator', '--approved-prd'].some((option) => options.has(option)))
      config.prd = {
        path: String(options.get('--prd') ?? config.prd?.path ?? ''),
        locator: String(options.get('--prd-locator') ?? config.prd?.locator ?? ''),
        approved: options.has('--approved-prd') ? true : config.prd?.approved === true,
      }

    if (config.prd?.path) config.prd.path = resolve(root, config.prd.path)

    return controller.start(positional[0], { config, dryRun: Boolean(options.get('--dry-run')) })
  }

  if (['next', 'resume', 'status', 'publish'].includes(command)) {
    requireCount(1)

    if (command === 'resume' && options.has('--config')) {
      const saved = await controller.status(positional[0])
      const config = {
        ...saved.config,
        ...JSON.parse(await readFile(resolve(root, String(options.get('--config'))), 'utf8')),
      } as WorkflowConfig

      if (config.prd?.path) config.prd.path = resolve(root, config.prd.path)

      return controller.resume(positional[0], config)
    }

    return controller[command as 'next' | 'resume' | 'status' | 'publish'](positional[0])
  }

  if (command === 'record') {
    requireCount(2)
    const reportPath = safeReportPath(await realpath(safeReportPath(positional[1], root)), root)
    const report = JSON.parse(await readFile(reportPath, 'utf8'))

    return controller.record(positional[0], report)
  }

  if (command === 'verify') {
    requireCount(2)

    return controller.verify(positional[0], positional[1] as 'engineering' | 'qa')
  }

  if (command === 'question') {
    requireCount(2)

    return controller.question(
      positional[0],
      positional[1],
      String(options.get('--stage') ?? 'refinement') as Stage,
      options.get('--finding') ? String(options.get('--finding')) : undefined
    )
  }

  if (command === 'answer') {
    requireCount(3)

    if (options.has('--approve-deferral') && options.has('--deny-deferral'))
      throw new Error('Choose approve or deny deferral')

    return controller.answer(positional[0], positional[1], positional[2], {
      approveDeferral: options.has('--approve-deferral')
        ? true
        : options.has('--deny-deferral')
          ? false
          : undefined,
      userReference: options.has('--user-ref') ? String(options.get('--user-ref')) : undefined,
    })
  }

  if (command === 'escalate') {
    requireCount(2)

    return controller.escalate(
      positional[0],
      positional[1] as 'coordinator' | 'delivery-lead',
      String(options.get('--reason') ?? '')
    )
  }

  throw new Error(`Unknown command: ${command}; run workflow help`)
}

export function displayResult(result: unknown, full = false): unknown {
  if (full || !result || typeof result !== 'object') return result

  if ('commands' in result && 'coverage' in result && 'kind' in result) {
    const evidence = result as GateEvidence

    return {
      gate: evidence.kind,
      passed: evidence.passed,
      commit: evidence.commit,
      executionCommit: evidence.executionCommit,
      sourceFingerprint: evidence.sourceFingerprint,
      startedAt: evidence.startedAt,
      finishedAt: evidence.finishedAt,
      commands: evidence.commands.map((command) => {
        const service = command.argv.indexOf('tests')

        return {
          operation:
            service >= 0
              ? command.argv.slice(service + 1).join(' ') || command.argv.slice(-2).join(' ')
              : command.argv.slice(-2).join(' '),
          exitCode: command.exitCode,
          log: command.log,
        }
      }),
      coverage: {
        nodeFiles: evidence.coverage.node.length,
        browserFiles: evidence.coverage.browser.length,
        errors: evidence.coverage.errors,
      },
      setup: evidence.setup,
    }
  }

  if (!('schemaVersion' in result) || !('source' in result)) return result

  const run = result as RunState & { dryRun?: boolean }

  return {
    runId: run.id,
    status: run.status,
    dryRun: run.dryRun,
    issue: {
      number: run.source.issue.number,
      title: run.source.issue.title,
      url: run.source.issue.url,
    },
    blockers: run.blockers,
    worktree: run.worktree,
    branch: run.branch,
    commit: run.commit,
    sourceFingerprint: run.source.fingerprint,
    sourceReferences: run.source.references
      .filter((reference) => !reference.locator.startsWith(`${run.source.baseSha}:`))
      .map((reference) => reference.locator),
    baselineDocumentCount: run.source.references.filter((reference) =>
      reference.locator.startsWith(`${run.source.baseSha}:`)
    ).length,
    profile: run.config.profile,
    engineerOverride: run.config.engineerOverride,
    completedStages: Object.entries(run.reports)
      .filter(([, report]) => report?.passed)
      .map(([stage]) => stage),
    gates: Object.fromEntries(
      Object.entries(run.gates).map(([kind, gate]) => [
        kind,
        { passed: gate?.passed, commit: gate?.commit },
      ])
    ),
    repair: run.repair,
    repairRounds: run.repairs,
    escalations: run.escalations,
    requestedCoordinator: run.escalations.coordinator
      ? { model: run.escalations.coordinator.model, effort: run.escalations.coordinator.effort }
      : modelFor(run.config.profile, 'coordinator'),
    pendingQuestions: run.questions.filter((question) => !question.answer),
    openFindings: run.findings
      .filter((finding) => finding.status === 'open')
      .map((finding) => ({ id: finding.id, origin: finding.origin, summary: finding.summary })),
    publication: run.publication,
    nextCommand: run.dryRun
      ? `npm run workflow -- start ${run.issueInput} --config .agent-workflow/config.json`
      : `npm run workflow -- ${run.status === 'blocked' ? 'resume' : 'next'} ${run.id}`,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = displayResult(
      await runCli(process.argv.slice(2)),
      process.argv.includes('--full')
    )

    console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2))
  } catch (error) {
    console.error((error as Error).message)
    process.exitCode = 1
  }
}
