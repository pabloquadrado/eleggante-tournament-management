import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from '@japa/runner'
import {
  LocalWorkflowRuntime,
  safeReportPath,
  validateCoverage,
} from '../../scripts/agent-workflow/runtime.ts'
import { fixture } from './support.ts'
import { WorkflowController } from '../../scripts/agent-workflow/controller.ts'
import type { CommandPort } from '../../scripts/agent-workflow/runtime.ts'

function covered(path: string, missedBranch = false) {
  return {
    path,
    statementMap: { '0': { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } } },
    fnMap: {},
    branchMap: {
      '0': {
        type: 'if',
        line: 1,
        locations: [
          { start: { line: 1, column: 0 }, end: { line: 1, column: 5 } },
          { start: { line: 1, column: 5 }, end: { line: 1, column: 10 } },
        ],
      },
    },
    s: { '0': 1 },
    f: {},
    b: { '0': [1, missedBranch ? 0 : 1] },
  }
}

async function coverageFixture(directory: string, missed = false) {
  for (const path of ['app', 'inertia', 'start', 'coverage/browser/raw'])
    await mkdir(join(directory, path), { recursive: true })

  await writeFile(
    join(directory, '.c8rc.json'),
    JSON.stringify({ include: ['app/**/*.ts'], exclude: [] })
  )
  await writeFile(join(directory, 'app/source.ts'), 'export const value = 1\n')
  await writeFile(join(directory, 'inertia/source.tsx'), 'export const value = 1\n')
  await writeFile(join(directory, 'start/routes.ts'), 'export const route = true\n')
  const nodePath = join(directory, 'app/source.ts')
  const browserPath = join(directory, 'inertia/source.tsx')
  const routesPath = join(directory, 'start/routes.ts')

  await writeFile(
    join(directory, 'coverage/coverage-final.json'),
    JSON.stringify({ [nodePath]: covered(nodePath, missed), [routesPath]: covered(routesPath) })
  )
  await writeFile(
    join(directory, 'coverage/browser/raw/browser.json'),
    JSON.stringify({ [browserPath]: covered(browserPath) })
  )
  await writeFile(
    join(directory, 'coverage/coverage-summary.json'),
    JSON.stringify({
      total: {
        statements: { pct: 100 },
        branches: { pct: 100 },
        functions: { pct: 100 },
        lines: { pct: 100 },
      },
    })
  )
}

test('a missed per-file branch and an unmeasured source fail despite a fabricated 100 percent aggregate', async ({
  assert,
}) => {
  const directory = await mkdtemp(join(tmpdir(), 'workflow-coverage-'))

  try {
    await coverageFixture(directory, true)
    await writeFile(join(directory, 'app/unmeasured.ts'), 'export const unmeasured = true\n')
    const result = await validateCoverage(directory)

    assert.include(result.errors, 'app/source.ts: branches 1/2')
    assert.include(result.errors, 'Missing Node coverage: app/unmeasured.ts')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('reduced coverage includes or an executable exclusion cannot bypass the independent source inventory', async ({
  assert,
}) => {
  const directory = await mkdtemp(join(tmpdir(), 'workflow-coverage-policy-'))

  try {
    await coverageFixture(directory)
    await mkdir(join(directory, 'docs'))
    await writeFile(join(directory, 'docs/exclusions.md'), 'app/source.ts excluded')
    await writeFile(
      join(directory, '.c8rc.json'),
      JSON.stringify({ include: ['app/something-else.ts'], exclude: ['app/source.ts'] })
    )
    const map = JSON.parse(await readFile(join(directory, 'coverage/coverage-final.json'), 'utf8'))

    delete map[join(directory, 'start/routes.ts')]
    await writeFile(join(directory, 'coverage/coverage-final.json'), JSON.stringify(map))
    const result = await validateCoverage(directory)

    assert.include(
      result.errors,
      'Coverage exclusion must be documented and genuinely type-only: app/source.ts'
    )
    assert.include(result.errors, 'Missing Node coverage: start/routes.ts')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('verification quarantines old coverage, records actual exit codes, and refuses missing fresh data', async ({
  assert,
}) => {
  const context = await fixture()

  try {
    await coverageFixture(context.directory)
    const boundary: CommandPort = {
      execute: async (argv) => ({
        exitCode: argv[0] === 'git' ? 0 : 7,
        stdout: argv[0] === 'git' && argv[1] === 'rev-parse' ? context.run.commit : '',
        stderr: argv[0] === 'git' ? '' : 'Real command boundary failure',
      }),
    }
    const runtime = new LocalWorkflowRuntime(context.directory, boundary)
    const evidence = await runtime.verification.run(
      context.run,
      'engineering',
      context.store.directory(context.run.id)
    )

    assert.isFalse(evidence.passed)
    assert.equal(evidence.commands[0].exitCode, 7)
    assert.include(
      await readFile(evidence.commands[0].log, 'utf8'),
      'Real command boundary failure'
    )
    assert.isTrue(
      evidence.coverage.errors.some((error) => error.startsWith('Node coverage unavailable'))
    )
  } finally {
    await context.cleanup()
  }
})

test('approved baseline documents are stable across candidate edits and generated workflow comments', async ({
  assert,
}) => {
  const context = await fixture()
  let generated = false

  try {
    await writeFile(
      join(context.directory, 'prd.txt'),
      'Private approved requirements that are never copied into state.'
    )
    const boundary: CommandPort = {
      execute: async (argv) => {
        if (argv[0] === 'git' && argv[1] === 'remote')
          return { exitCode: 0, stdout: 'git@github.com:example/repo.git', stderr: '' }

        if (argv[0] === 'git' && argv[1] === 'ls-remote')
          return { exitCode: 0, stdout: `${context.run.commit}\trefs/heads/main`, stderr: '' }

        if (argv[0] === 'git' && argv[1] === 'ls-tree')
          return {
            exitCode: 0,
            stdout: '100644 blob aabbcc\tAGENTS.md\n100644 blob ddeeff\tdocs/code-map.md',
            stderr: '',
          }

        if (argv[0] === 'gh' && argv[1] === 'issue')
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              number: Number(argv[3]),
              title: 'Story',
              url: `https://github.com/example/repo/issues/${argv[3]}`,
              body: 'Approved public contract',
              comments: generated
                ? [{ id: 'generated', body: '<!-- agent-workflow:test:plan --> Generated output' }]
                : [],
            }),
            stderr: '',
          }

        throw new Error(`Unexpected command: ${argv.join(' ')}`)
      },
    }
    const runtime = new LocalWorkflowRuntime(context.directory, boundary)
    const config = {
      profile: 'openai' as const,
      prd: { path: 'prd.txt', locator: 'private-vault-prd', approved: true },
    }
    const first = await runtime.sources.snapshot('4', config, undefined, 'test')

    generated = true
    await mkdir(join(context.directory, 'docs'))
    await writeFile(join(context.directory, 'docs/code-map.md'), 'Candidate output changed')
    const second = await runtime.sources.snapshot('4', config, undefined, 'test')
    const future = await runtime.sources.snapshot('4', config, undefined, 'future')

    assert.equal(first.fingerprint, second.fingerprint)
    assert.notEqual(first.fingerprint, future.fingerprint)
    assert.equal(future.issue.comments[0].id, 'generated')
    assert.notInclude(JSON.stringify(first), 'Private approved requirements')
    assert.deepEqual(first.references[2], {
      locator: `${context.run.commit}:AGENTS.md`,
      digest: 'aabbcc',
    })
  } finally {
    await context.cleanup()
  }
})

test('start rejects foreign issue, configuration, and specification repositories before isolating work', async ({
  assert,
}) => {
  const context = await fixture()
  const commands: string[][] = []
  let foreignSpec = false

  try {
    const runtime = new LocalWorkflowRuntime(context.directory, {
      execute: async (argv) => {
        commands.push(argv)

        if (argv[0] === 'git' && argv[1] === 'remote')
          return { exitCode: 0, stdout: 'git@github.com:example/repo.git', stderr: '' }

        if (argv[0] === 'gh' && argv[1] === 'issue') {
          const number = Number(argv[3])

          return {
            exitCode: 0,
            stdout: JSON.stringify({
              number,
              title: 'Story',
              url: `https://github.com/${foreignSpec && number === 1 ? 'foreign/repo' : 'example/repo'}/issues/${number}`,
              body: 'Approved contract',
              comments: [],
            }),
            stderr: '',
          }
        }

        throw new Error(`Unexpected command: ${argv.join(' ')}`)
      },
    })
    const controller = new WorkflowController(context.store, runtime)

    await assert.rejects(
      () =>
        controller.start('https://github.com/foreign/repo/issues/4', {
          config: { profile: 'openai', repo: 'example/repo' },
        }),
      /same GitHub repository/
    )
    await assert.rejects(
      () => controller.start('4', { config: { profile: 'openai', repo: 'foreign/repo' } }),
      /same GitHub repository/
    )
    assert.isFalse(commands.some((argv) => argv[0] === 'gh'))
    foreignSpec = true
    await assert.rejects(
      () => controller.start('4', { config: { profile: 'openai', repo: 'example/repo' } }),
      /same GitHub repository/
    )
    assert.isFalse(commands.some((argv) => argv[0] === 'git' && argv[1] !== 'remote'))
    assert.deepEqual(await context.store.list(), [context.run.id])
  } finally {
    await context.cleanup()
  }
})

test('publication rejects a persisted foreign source before any GitHub mutation', async ({
  assert,
}) => {
  const context = await fixture()
  let mutations = 0

  try {
    await context.record('refinement')
    await context.record('plan')
    const run = await context.controller.status(context.run.id)

    run.source.issue.url = 'https://github.com/foreign/repo/issues/4'
    const runtime = new LocalWorkflowRuntime(context.directory, {
      execute: async (argv) => {
        if (argv[0] === 'git' && argv[1] === 'remote')
          return { exitCode: 0, stdout: 'https://github.com/example/repo.git', stderr: '' }

        mutations++
        throw new Error('Unexpected mutation')
      },
    })

    await assert.rejects(
      () => runtime.publication.plan(run, async () => {}, context.store.directory(run.id)),
      /same GitHub repository/
    )
    assert.equal(mutations, 0)
  } finally {
    await context.cleanup()
  }
})

test('Docker verification bootstraps the assigned QA checkout with only its isolated test database', async ({
  assert,
}) => {
  const context = await fixture()

  try {
    const checkout = await context.ports.git.prepareQa(
      context.run,
      context.store.directory(context.run.id)
    )

    context.run.qaCheckout = checkout
    await coverageFixture(checkout.path)
    const observed: string[][] = []
    const boundary: CommandPort = {
      execute: async (argv) => {
        if (argv[0] === 'git')
          return {
            exitCode: 0,
            stdout: argv[1] === 'rev-parse' ? context.run.commit : '',
            stderr: '',
          }

        observed.push(argv)

        if (argv.includes('test:coverage')) {
          const configuration = JSON.parse(
            await readFile(argv[argv.lastIndexOf('--file') + 1], 'utf8')
          )

          await coverageFixture(configuration.services.tests.build.context)
        }

        return { exitCode: 0, stdout: 'Test output local-test-password local-test-key', stderr: '' }
      },
    }
    const runtime = new LocalWorkflowRuntime(context.directory, boundary)
    const evidence = await runtime.verification.run(
      context.run,
      'qa',
      context.store.directory(context.run.id)
    )
    const override = JSON.parse(await readFile(evidence.setup!.composeFile, 'utf8'))
    const operations = observed.map((argv) => {
      const service = argv.indexOf('tests')

      return service >= 0
        ? argv.slice(service + 1).join(' ') || 'build tests'
        : argv.slice(-2).join(' ')
    })
    const permissions = await stat(evidence.setup!.envFile)

    assert.isTrue(evidence.passed)
    assert.deepEqual(operations, [
      'build tests',
      'npm ci',
      'node ace migration:fresh --drop-types --force',
      'npm run build',
      'npm run test:coverage',
      'node node_modules/c8/bin/c8.js report --reporter=json',
      'stop database',
    ])
    assert.equal(override.services.tests.build.context, checkout.path)
    assert.equal(override.services.tests.build.dockerfile, join(checkout.path, 'Dockerfile.test'))
    assert.equal(override.services.tests.volumes[0].source, checkout.path)
    assert.equal(override.services.tests.environment.NODE_ENV, 'test')
    assert.equal(override.services.tests.environment.DB_DATABASE, 'arena_test')
    assert.equal(override.services.database.environment.POSTGRES_DB, 'arena_test')
    assert.equal(evidence.setup!.project, `agent-workflow-${context.run.id}`)
    assert.equal(permissions.mode & 0o777, 0o600)
    assert.deepEqual(evidence.setup!.recovery.slice(-2), ['down', '--volumes'])
    const log = await readFile(evidence.commands[0].log, 'utf8')

    assert.notInclude(log, 'local-test-password')
    assert.notInclude(log, 'local-test-key')
    await coverageFixture(context.directory)
    observed.length = 0
    const engineering = await runtime.verification.run(
      context.run,
      'engineering',
      context.store.directory(context.run.id)
    )
    const engineeringSteps = observed.map((argv) => {
      const service = argv.indexOf('tests')

      return service >= 0
        ? argv.slice(service + 1).join(' ') || 'build tests'
        : argv.slice(-2).join(' ')
    })

    assert.isTrue(engineering.passed)
    assert.deepEqual(engineeringSteps, [
      'build tests',
      'npm ci',
      'node ace migration:fresh --drop-types --force',
      'npm run build',
      'npm run check:architecture',
      'npm run typecheck',
      'npm run lint',
      'npm run test:workflow',
      'npm run test:coverage',
      'node node_modules/c8/bin/c8.js report --reporter=json',
      'stop database',
    ])
  } finally {
    await context.cleanup()
  }
})

test('only the trusted Docker execution root maps to both Node and browser checkout coverage', async ({
  assert,
}) => {
  const directory = await mkdtemp(join(tmpdir(), 'workflow-container-coverage-'))

  try {
    await coverageFixture(directory)
    await writeFile(
      join(directory, 'coverage/coverage-final.json'),
      JSON.stringify({
        '/app/app/source.ts': covered('/app/app/source.ts'),
        '/app/start/routes.ts': covered('/app/start/routes.ts'),
      })
    )
    await writeFile(
      join(directory, 'coverage/browser/raw/browser.json'),
      JSON.stringify({ '/app/inertia/source.tsx': covered('/app/inertia/source.tsx') })
    )
    const mapped = await validateCoverage(directory, '/app')
    const unrelated = await validateCoverage(directory, '/other')

    assert.deepEqual(mapped.errors, [])
    assert.deepEqual(mapped.node, ['app/source.ts', 'start/routes.ts'])
    assert.deepEqual(mapped.browser, ['inertia/source.tsx'])
    assert.include(unrelated.errors, 'Missing Node coverage: app/source.ts')
    assert.include(unrelated.errors, 'Missing browser coverage: inertia/source.tsx')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('publication rejects private paths and PRD excerpts before any GitHub mutation', async ({
  assert,
}) => {
  const context = await fixture()
  let mutations = 0

  try {
    const prd =
      'A confidential business rule with more than forty characters kept only in the approved private vault'

    await writeFile(join(context.directory, 'prd.txt'), prd)
    await context.record('refinement')
    await context.record('plan')
    const run = await context.controller.status(context.run.id)

    run.config.prd = { path: 'prd.txt', locator: 'private-vault-prd', approved: true }
    const runtime = new LocalWorkflowRuntime(context.directory, {
      execute: async () => {
        mutations++
        throw new Error('Unexpected public command')
      },
    })

    run.reports.plan!.publicSummary = `sequenceDiagram\n${prd}`
    await assert.rejects(
      () => runtime.publication.plan(run, async () => {}, context.store.directory(run.id)),
      /nonpublic PRD excerpt/
    )
    run.reports.plan!.publicSummary = 'sequenceDiagram\nEvidence /Users/example/private-prd.md'
    await assert.rejects(
      () => runtime.publication.plan(run, async () => {}, context.store.directory(run.id)),
      /local path/
    )
    assert.equal(mutations, 0)
    assert.throws(() => safeReportPath('../outside.json', context.directory), /stay inside/)
  } finally {
    await context.cleanup()
  }
})

test('publication resumes a draft once the exact current-head CI check passes without duplicate comments or pushes', async ({
  assert,
}) => {
  const context = await fixture()
  let passing = false
  let pushes = 0
  let commentsCreated = 0
  let ready = 0
  const comments: { body: string; html_url: string }[] = []

  try {
    await context.throughQa()
    await context.record('retrospective')
    const run = await context.controller.status(context.run.id)

    run.config.repo = 'example/repo'
    run.reports.retrospective!.publicSummary =
      '**Door:** two-way\n\n**Blast Radius:** profile\n\nThe change has reversible behavior.'
    const boundary: CommandPort = {
      execute: async (argv) => {
        let stdout = ''

        if (argv[0] === 'git' && argv[1] === 'remote')
          stdout = 'ssh://git@github.com/example/repo.git'
        else if (argv[0] === 'git' && argv[1] === 'push') pushes++
        else if (argv[0] === 'gh' && argv[1] === 'api') stdout = JSON.stringify([comments])
        else if (argv[0] === 'gh' && argv[1] === 'issue' && argv[2] === 'comment') {
          commentsCreated++
          comments.push({
            body: await readFile(argv[argv.indexOf('--body-file') + 1], 'utf8'),
            html_url: `https://example.test/comment/${commentsCreated}`,
          })
        } else if (argv[0] === 'gh' && argv[1] === 'pr' && argv[2] === 'list')
          stdout = JSON.stringify([
            { url: 'https://example.test/pr/1', isDraft: !ready, headRefOid: run.commit },
          ])
        else if (argv[0] === 'gh' && argv[1] === 'pr' && argv[2] === 'view')
          stdout = JSON.stringify({
            headRefOid: run.commit,
            statusCheckRollup: [
              { name: 'test', conclusion: passing ? 'SUCCESS' : 'SKIPPED', status: 'COMPLETED' },
            ],
          })
        else if (argv[0] === 'gh' && argv[1] === 'pr' && argv[2] === 'ready') ready++
        else if (!(argv[0] === 'gh' && argv[1] === 'pr' && argv[2] === 'edit'))
          throw new Error(`Unexpected command ${argv.join(' ')}`)

        return { exitCode: 0, stdout, stderr: '' }
      },
    }
    const runtime = new LocalWorkflowRuntime(context.directory, boundary)

    await assert.rejects(
      () => runtime.publication.publish(run, async () => {}, context.store.directory(run.id)),
      /PR checks must complete successfully/
    )
    assert.equal(ready, 0)
    passing = true
    await runtime.publication.publish(run, async () => {}, context.store.directory(run.id))
    assert.equal(ready, 1)
    assert.equal(pushes, 1)
    assert.equal(commentsCreated, 2)
    const body = await readFile(join(context.store.directory(run.id), 'pr.md'), 'utf8')

    assert.include(body, '## Summary')
    assert.include(body, '## Evidence')
    assert.include(body, '## Merge Danger')
    assert.include(body, 'Completed qa')
    assert.notInclude(body, 'https://example.test/native-receipt')
  } finally {
    await context.cleanup()
  }
})
