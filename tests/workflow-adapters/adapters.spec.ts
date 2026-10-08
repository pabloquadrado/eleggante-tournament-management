import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from '@japa/runner'
import { roles } from '../../scripts/agent-workflow/models.ts'
import { configureAdapters } from '../../scripts/workflow-adapters/files.ts'
import { doctorAdapters, supportedVersion } from '../../scripts/workflow-adapters/doctor.ts'
import { renderAdapters, type AdapterOptions } from '../../scripts/workflow-adapters/render.ts'

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'workflow-adapters-'))

  for (const path of [
    'AGENTS.md',
    '.agents/skills/implement/SKILL.md',
    'docs/agents/implementation-workflow.md',
    ...roles.map((role) => `docs/agents/roles/${role}.md`),
  ]) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), '# Canonical source\n')
  }

  return root
}

const supported: AdapterOptions[] = [
  { harness: 'codex', profile: 'openai' },
  { harness: 'claude', profile: 'anthropic' },
  { harness: 'opencode', profile: 'openai' },
  { harness: 'opencode', profile: 'anthropic', engineer: 'kimi-k3' },
]

test('dry run previews native registrations without creating any files', async ({ assert }) => {
  const root = await mkdtemp(join(tmpdir(), 'workflow-adapters-preview-'))

  try {
    for (const options of supported) {
      const plan = await configureAdapters(root, options, true)

      assert.isTrue(plan.every((file) => file.action === 'create'))
      assert.deepEqual(await readdir(root), [])
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('unsupported provider combinations fail without remapping requested models', async ({
  assert,
}) => {
  assert.throws(() => renderAdapters({ harness: 'claude', profile: 'openai' }), /OpenAI gateway/)
  assert.throws(
    () => renderAdapters({ harness: 'codex', profile: 'anthropic' }),
    /Anthropic gateway/
  )
  assert.throws(
    () => renderAdapters({ harness: 'codex', profile: 'openai', engineer: 'kimi-k3' }),
    /multiprovider/
  )
})

test('native wrappers enforce reviewer defaults and retain canonical pointers and Kimi effort', async ({
  assert,
}) => {
  const codex = renderAdapters(supported[0])
  const claude = renderAdapters(supported[1])
  const opencode = renderAdapters(supported[3])

  assert.include(
    codex.find((file) => file.path.endsWith('reviewer.toml'))!.content,
    'sandbox_mode = "read-only"'
  )
  assert.include(
    claude.find((file) => file.path.endsWith('/qa.md'))!.content,
    'isolation: worktree'
  )
  assert.notInclude(claude.find((file) => file.path.endsWith('/reviewer.md'))!.content, 'Bash')
  assert.include(
    opencode.find((file) => file.path.endsWith('/engineer.md'))!.content,
    'moonshotai/kimi-k3#max'
  )
  assert.include(
    opencode.find((file) => file.path.endsWith('/qa.md'))!.content,
    "resource: '**/tests/**'"
  )
  assert.include(
    opencode.find((file) => file.path.endsWith('/reviewer.md'))!.content,
    "action: '*'\n    resource: '*'\n    effect: deny"
  )

  for (const file of [...codex, ...claude, ...opencode].filter((entry) =>
    entry.path.includes('/agents/')
  )) {
    assert.include(file.content, 'docs/agents/implementation-workflow.md')
    assert.include(file.content, 'docs/agents/roles/')
  }
})

test('configure preserves user configuration and an existing CLAUDE.md import', async ({
  assert,
}) => {
  const root = await fixture()
  const userConfig = '[agents]\nmax_concurrent_threads_per_session = 3\n\n[ui]\ntheme = "custom"\n'
  const claudeInstructions = '@AGENTS.md\n\nExisting project guidance.\n'

  await mkdir(join(root, '.codex'), { recursive: true })
  await writeFile(join(root, '.codex/config.toml'), userConfig)
  await writeFile(join(root, 'CLAUDE.md'), claudeInstructions)

  try {
    await configureAdapters(root, supported[0])
    const claudePlan = await configureAdapters(root, supported[1])

    assert.equal(await readFile(join(root, '.codex/config.toml'), 'utf8'), userConfig)
    assert.equal(await readFile(join(root, 'CLAUDE.md'), 'utf8'), claudeInstructions)
    assert.equal(claudePlan.find((file) => file.path === 'CLAUDE.md')!.action, 'preserve')
    const repeated = await configureAdapters(root, supported[0])

    assert.isTrue(repeated.every((file) => file.action === 'unchanged'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Claude implement launches the named Coordinator in an isolated foreground subagent', ({
  assert,
}) => {
  const files = renderAdapters(supported[1])
  const skill = files.find((file) => file.path === '.claude/skills/implement/SKILL.md')!
  const coordinator = files.find((file) => file.path === '.claude/agents/coordinator.md')!

  assert.include(skill.content, 'context: fork\nagent: coordinator\nbackground: false\n')
  assert.include(coordinator.content, 'model: claude-haiku-5-5\neffort: max\n')
  assert.include(coordinator.content, 'Agent, AskUserQuestion')
})

test('Claude doctor requires effective-session preflight when nesting settings are unobserved', async ({
  assert,
}) => {
  const root = await fixture()

  try {
    await configureAdapters(root, supported[1])
    const report = await doctorAdapters(root, supported[1], async () => '2.1.286 (Claude Code)', {})

    assert.isTrue(report.ok)
    assert.deepEqual(report.capabilities.nestedDelegation, {
      minimumDepth: 2,
      documentedDefaultDepth: 3,
      observedDepth: null,
      preflightRequired: true,
      requirement:
        'Confirm the effective native session allows at least two subagent layers and exposes Agent to the Coordinator before dispatch. CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH may be set through settings env or the launch environment.',
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Claude doctor blocks disabled or malformed nesting and accepts an observed second layer', async ({
  assert,
}) => {
  const root = await fixture()

  try {
    await configureAdapters(root, supported[1])

    for (const depth of ['1', 'invalid', '2']) {
      const report = await doctorAdapters(root, supported[1], async () => '2.1.286 (Claude Code)', {
        CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: depth,
      })

      assert.equal(report.ok, depth === '2')
      assert.equal(
        report.checks.find((check) => check.name === 'nested-delegation')!.ok,
        depth === '2'
      )
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a user-owned registration blocks the whole write before other adapters are created', async ({
  assert,
}) => {
  const root = await fixture()

  await mkdir(join(root, '.codex/agents'), { recursive: true })
  await writeFile(join(root, '.codex/agents/reviewer.toml'), 'name = "personal-reviewer"\n')

  try {
    await assert.rejects(() => configureAdapters(root, supported[0]), /user-owned file/)
    assert.deepEqual(await readdir(join(root, '.codex/agents')), ['reviewer.toml'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('configure rejects paths that escape through a symlink', async ({ assert }) => {
  const root = await fixture()
  const outside = await mkdtemp(join(tmpdir(), 'workflow-adapters-outside-'))

  await symlink(outside, join(root, '.codex'))

  try {
    await assert.rejects(() => configureAdapters(root, supported[0]), /symlink/)
    assert.deepEqual(await readdir(outside), [])
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  }
})

test('doctor separates valid local registrations from unverified account model access', async ({
  assert,
}) => {
  const root = await fixture()

  try {
    for (const options of supported) {
      await configureAdapters(root, options)
      const version =
        options.harness === 'codex'
          ? 'codex-cli 0.160.1'
          : options.harness === 'claude'
            ? '2.1.286 (Claude Code)'
            : 'opencode v2.0.24'
      const report = await doctorAdapters(root, options, async () => version)

      assert.isTrue(report.ok, JSON.stringify(report.checks))
      assert.isTrue(report.models.every((model) => model.available === null))
      assert.include(report.capabilities.accountModelAvailability, 'No inference was requested')
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('doctor detects registration drift, missing pointers, disabling, and an unavailable CLI', async ({
  assert,
}) => {
  const root = await fixture()

  await configureAdapters(root, supported[0])
  const reviewer = join(root, '.codex/agents/reviewer.toml')

  const original = await readFile(reviewer, 'utf8')

  await writeFile(reviewer, original.replace('xhigh', 'high'))
  await writeFile(join(root, '.codex/config.toml'), '[agents]\nenabled = false\n')
  await rm(join(root, 'docs/agents/roles/qa.md'))

  try {
    const report = await doctorAdapters(root, supported[0], async () => {
      throw new Error('CLI unavailable')
    })

    assert.isFalse(report.ok)
    assert.isFalse(report.checks.find((check) => check.name === 'registrations')!.ok)
    assert.isFalse(report.checks.find((check) => check.name === 'subagents')!.ok)
    assert.isFalse(
      report.checks.find((check) => check.name === 'pointer:docs/agents/roles/qa.md')!.ok
    )
    assert.isFalse(report.checks.find((check) => check.name === 'harness')!.ok)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('capability detection rejects unsupported OpenCode generations and old metadata versions', ({
  assert,
}) => {
  assert.isFalse(supportedVersion('opencode', '1.18.3'))
  assert.isFalse(supportedVersion('opencode', '3.0.0'))
  assert.isFalse(supportedVersion('opencode', 'not installed'))
  assert.isFalse(supportedVersion('claude', '2.1.233'))
  assert.isFalse(supportedVersion('codex', '0.159.0'))
  assert.isTrue(supportedVersion('opencode', '2.0.25'))
  assert.isTrue(supportedVersion('claude', '2.2.0'))
})
