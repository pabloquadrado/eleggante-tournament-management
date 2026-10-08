import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { modelFor, roles } from '../agent-workflow/models.ts'
import { codexAgentsDisabled, planAdapters } from './files.ts'
import { type AdapterOptions, type Harness } from './render.ts'

const execute = promisify(execFile)
const minimumVersions: Record<Harness, number[]> = {
  codex: [0, 160, 1],
  claude: [2, 1, 286],
  opencode: [2, 0, 24],
}

export type HarnessProbe = (harness: Harness, root: string) => Promise<string>

export async function probeHarness(harness: Harness, root: string): Promise<string> {
  const result = await execute('rtk', ['proxy', harness, '--version'], {
    cwd: root,
    timeout: 10000,
    maxBuffer: 1024 * 1024,
  })

  return result.stdout.trim()
}

export function supportedVersion(harness: Harness, text: string): boolean {
  const match = text.match(/(?:^|[^\d])(\d+)\.(\d+)\.(\d+)\b/)

  if (!match) return false

  const actual = match.slice(1).map(Number)
  const minimum = minimumVersions[harness]

  for (const [index, element] of minimum.entries()) {
    if (actual[index] > element) return harness !== 'opencode' || actual[0] === 2

    if (actual[index] < element) return false
  }

  return true
}

export async function doctorAdapters(
  root: string,
  options: AdapterOptions,
  probe: HarnessProbe = probeHarness,
  environment: NodeJS.ProcessEnv = process.env
) {
  const checks: { name: string; ok: boolean; detail: string }[] = []
  const depthVariable = environment.CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH
  const numericDepth =
    depthVariable && /^\d+$/.test(depthVariable.trim()) ? Number(depthVariable) : null
  const observedDepth =
    numericDepth !== null && Number.isSafeInteger(numericDepth) ? numericDepth : null
  const nestedDelegation =
    options.harness === 'claude'
      ? {
          minimumDepth: 2,
          documentedDefaultDepth: 3,
          observedDepth,
          preflightRequired: true,
          requirement:
            'Confirm the effective native session allows at least two subagent layers and exposes Agent to the Coordinator before dispatch. CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH may be set through settings env or the launch environment.',
        }
      : null

  try {
    const files = await planAdapters(root, options)

    checks.push({
      name: 'registrations',
      ok: files.every((file) => file.action === 'unchanged' || file.action === 'preserve'),
      detail:
        files
          .filter((file) => file.action === 'create' || file.action === 'update')
          .map((file) => `${file.path}: ${file.action}`)
          .join(', ') || 'Shared pointers and configured model/effort match.',
    })
  } catch (error) {
    checks.push({ name: 'registrations', ok: false, detail: (error as Error).message })
  }

  for (const path of [
    'AGENTS.md',
    'docs/agents/implementation-workflow.md',
    '.agents/skills/implement/SKILL.md',
    ...roles.map((role) => `docs/agents/roles/${role}.md`),
  ]) {
    try {
      await access(join(root, path))
      checks.push({ name: `pointer:${path}`, ok: true, detail: 'Present.' })
    } catch {
      checks.push({ name: `pointer:${path}`, ok: false, detail: 'Missing canonical source.' })
    }
  }

  let version: string | null = null

  try {
    version = await probe(options.harness, root)
    checks.push({
      name: 'harness',
      ok: supportedVersion(options.harness, version),
      detail: version,
    })
  } catch (error) {
    checks.push({ name: 'harness', ok: false, detail: (error as Error).message })
  }

  if (options.harness === 'codex') {
    checks.push({
      name: 'subagents',
      ok: !(await codexAgentsDisabled(root)),
      detail: 'Codex subagents default to enabled; explicit local disabling blocks this workflow.',
    })
  }

  if (nestedDelegation) {
    checks.push({
      name: 'nested-delegation',
      ok: depthVariable === undefined || (observedDepth !== null && observedDepth >= 2),
      detail:
        observedDepth === null
          ? depthVariable === undefined
            ? 'Session nesting settings are unobserved; native capability preflight is required. The documented default is three layers.'
            : 'CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH must be an integer of at least two.'
          : `Observed launch environment allows ${observedDepth} layers; confirm effective session settings and Agent availability during native preflight.`,
    })
  }

  if (options.harness === 'claude' && environment.CLAUDE_CODE_EFFORT_LEVEL) {
    checks.push({
      name: 'effort-override',
      ok: false,
      detail:
        'CLAUDE_CODE_EFFORT_LEVEL overrides native role effort; supply matching effective receipts after resolving it.',
    })
  }

  return {
    ok: checks.every((check) => check.ok),
    harness: options.harness,
    profile: options.profile,
    version,
    checks,
    models: roles.map((role) => {
      const preset = modelFor(options.profile, role, options.engineer)

      return {
        role,
        requestedModel: preset.model,
        configuredModel: preset.model,
        requestedEffort: preset.effort,
        configuredEffort: preset.effort,
        available: null,
      }
    }),
    capabilities: {
      nativeRegistrations: true,
      nestedDelegation,
      reviewerReadOnly:
        'Native tools/sandbox default; verify live inherited permissions in the role receipt.',
      qaIsolation:
        options.harness === 'claude'
          ? 'Native worktree; controller must verify the assigned candidate commit.'
          : 'Controller must create and assign a separate worktree.',
      qaFileScope:
        'Controller rejects production writes; native metadata alone cannot confine Bash.',
      accountModelAvailability:
        'Unverified. Obtain a catalog/access receipt and effective runtime model/effort before dispatch. No inference was requested.',
    },
  }
}
