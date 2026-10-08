import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { LocalWorkflowRuntime } from '../../scripts/agent-workflow/runtime.ts'
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
