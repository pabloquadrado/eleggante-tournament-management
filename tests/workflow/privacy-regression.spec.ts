import { test } from '@japa/runner'
import { LocalWorkflowRuntime } from '../../scripts/agent-workflow/runtime.ts'
import { fixture } from './support.ts'

test('publication rejects a private local file URI before any public command', async ({
  assert,
}) => {
  const context = await fixture()
  let publicCommands = 0

  try {
    await context.record('refinement')
    await context.record('plan')
    const run = await context.controller.status(context.run.id)

    run.publication.progressSet = true
    run.reports.plan!.publicSummary =
      '```mermaid\nsequenceDiagram\nUser->>System: Save\n```\nEvidence: file:///Users/example/private-session.jsonl'
    const runtime = new LocalWorkflowRuntime(context.directory, {
      execute: async (argv) => {
        if (argv[0] === 'git' && argv[1] === 'remote')
          return { exitCode: 0, stdout: 'git@github.com:example/repo.git', stderr: '' }

        publicCommands++
        throw new Error('Unexpected public command')
      },
    })

    await assert.rejects(
      () => runtime.publication.plan(run, async () => {}, context.store.directory(run.id)),
      /local path|private source/
    )
    assert.equal(publicCommands, 0)
  } finally {
    await context.cleanup()
  }
})
