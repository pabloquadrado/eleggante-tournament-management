import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { runCli } from '../../scripts/agent-workflow.ts'
import { LocalWorkflowRuntime } from '../../scripts/agent-workflow/runtime.ts'
import type { WorkflowConfig } from '../../scripts/agent-workflow/contracts.ts'
import { fixture } from './support.ts'

test('only a literal boolean approval assertion can unlock an accessible private source', async ({
  assert,
}) => {
  const context = await fixture()

  try {
    await writeFile(join(context.directory, 'private-source.md'), 'Synthetic private test source')
    const runtime = new LocalWorkflowRuntime(context.directory, {
      execute: async (argv) => {
        let stdout = ''

        if (argv[0] === 'git' && argv[1] === 'remote') stdout = 'git@github.com:example/repo.git'
        else if (argv[0] === 'gh' && argv[1] === 'issue')
          stdout = JSON.stringify({
            number: Number(argv[3]),
            title: 'Approved story',
            url: `https://github.com/example/repo/issues/${argv[3]}`,
            body: 'Approved public contract',
            comments: [],
          })
        else if (argv[0] === 'git' && argv[1] === 'ls-remote')
          stdout = `${context.run.commit}\trefs/heads/main`
        else if (!(argv[0] === 'git' && argv[1] === 'ls-tree'))
          throw new Error(`Unexpected command: ${argv.join(' ')}`)

        return { exitCode: 0, stdout, stderr: '' }
      },
    })
    const configuration = (approved: unknown) =>
      JSON.parse(
        JSON.stringify({
          profile: 'openai',
          repo: 'example/repo',
          prd: { path: 'private-source.md', locator: 'private-test-locator', approved },
        })
      )

    for (const approved of [false, 'false', 'true', 1, null, [true], {}]) {
      const source = await runtime.sources.snapshot('4', configuration(approved))

      assert.isTrue(
        source.blockers.some((blocker) => /approved PRD/i.test(blocker)),
        `Malformed approval ${JSON.stringify(approved)} must not unlock source refinement`
      )
      assert.isFalse(
        source.references.some((reference) => reference.locator === 'private-test-locator')
      )
    }

    const approved = await runtime.sources.snapshot('4', configuration(true))

    assert.deepEqual(approved.blockers, [])
    assert.isTrue(
      approved.references.some((reference) => reference.locator === 'private-test-locator')
    )
  } finally {
    await context.cleanup()
  }
})

test('CLI private-source flag merging preserves only literal approval or an explicit approval flag', async ({
  assert,
}) => {
  const context = await fixture()
  const observed: WorkflowConfig[] = []

  try {
    const ports = {
      ...context.ports,
      sources: {
        snapshot: async (issue: string, config: WorkflowConfig) => {
          observed.push(config)

          return context.ports.sources.snapshot(issue, config)
        },
      },
    }
    const configPath = join(context.directory, '.agent-workflow/config.json')
    const scenarios = [
      { approval: 'false', flags: ['--prd', 'private-source.md'], expected: false },
      { approval: 'false', flags: ['--prd-locator', 'private-test-locator'], expected: false },
      { approval: true, flags: ['--prd', 'private-source.md'], expected: true },
      {
        approval: 'false',
        flags: ['--prd', 'private-source.md', '--approved-prd'],
        expected: true,
      },
    ]

    for (const scenario of scenarios) {
      await writeFile(
        configPath,
        JSON.stringify({
          profile: 'openai',
          prd: {
            path: 'private-source.md',
            locator: 'private-test-locator',
            approved: scenario.approval,
          },
        })
      )
      await runCli(['start', '4', '--dry-run', ...scenario.flags], context.directory, ports)
      assert.strictEqual(observed.at(-1)?.prd?.approved, scenario.expected)
    }

    assert.equal(observed.length, scenarios.length)
    assert.deepEqual(await context.store.list(), [context.run.id])
    assert.equal(context.publications(), 0)
  } finally {
    await context.cleanup()
  }
})
