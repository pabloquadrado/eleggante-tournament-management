import { readFile } from 'node:fs/promises'
import { test } from '@japa/runner'
import { LocalWorkflowRuntime } from '../../scripts/agent-workflow/runtime.ts'
import { fixture } from './support.ts'

test('publication rejects local resource URI variants before any public command', async ({
  assert,
}) => {
  const context = await fixture()
  let publicCommands = 0

  try {
    await context.record('refinement')
    await context.record('plan')
    const run = await context.controller.status(context.run.id)

    run.publication.progressSet = true
    const runtime = new LocalWorkflowRuntime(context.directory, {
      execute: async (argv) => {
        if (argv[0] === 'git' && argv[1] === 'remote')
          return { exitCode: 0, stdout: 'git@github.com:example/repo.git', stderr: '' }

        publicCommands++
        throw new Error('Unexpected public command')
      },
    })

    for (const reference of [
      'file:///Users/example/private-session.jsonl',
      'FiLe:///Users/example/private-session.jsonl',
      'file%3A%2F%2F%2FUsers%2Fexample%2Fprivate-session.jsonl',
      'file:notes/private.json',
      'file:///C:/Users/example/private-session.jsonl',
      'vscode://file/Users/example/private-session.jsonl',
      '[QA logs](file:///Users/example/private-session.jsonl)',
      '[QA logs](file%253A%252F%252F%252FUsers%252Fexample%252Fprivate-session.jsonl)',
      '[Debug](http://localhost:3333/private-session)',
      'http%3A%2F%2F127.0.0.1%3A3333%2Fprivate-session',
      'http://[::1]:3333/private-session',
    ]) {
      run.reports.plan!.publicSummary =
        '```mermaid\nsequenceDiagram\nUser->>System: Save\n```\nEvidence: ' + reference
      await assert.rejects(
        () => runtime.publication.plan(run, async () => {}, context.store.directory(run.id)),
        /local path|private source|local resource/
      )
    }
    assert.equal(publicCommands, 0)
  } finally {
    await context.cleanup()
  }
})

test('publication preserves public HTTPS references and repository-relative source pointers', async ({
  assert,
}) => {
  const context = await fixture()
  const comments: { body: string; html_url: string }[] = []

  try {
    await context.record('refinement')
    await context.record('plan')
    const run = await context.controller.status(context.run.id)

    run.publication.progressSet = true
    run.reports.plan!.publicSummary =
      '```mermaid\nsequenceDiagram\nUser->>System: Save\n```\nSee https://github.com/example/repo/issues/4 and docs/identity-operations.md.'
    const runtime = new LocalWorkflowRuntime(context.directory, {
      execute: async (argv) => {
        let stdout = ''

        if (argv[0] === 'git' && argv[1] === 'remote') stdout = 'git@github.com:example/repo.git'
        else if (argv[0] === 'gh' && argv[1] === 'api') stdout = JSON.stringify([comments])
        else if (argv[0] === 'gh' && argv[1] === 'issue' && argv[2] === 'comment')
          comments.push({
            body: await readFile(argv[argv.indexOf('--body-file') + 1], 'utf8'),
            html_url: 'https://github.com/example/repo/issues/4#issuecomment-1',
          })
        else throw new Error(`Unexpected command: ${argv.join(' ')}`)

        return { exitCode: 0, stdout, stderr: '' }
      },
    })

    await runtime.publication.plan(run, async () => {}, context.store.directory(run.id))
    assert.equal(comments.length, 1)
    assert.include(comments[0].body, 'https://github.com/example/repo/issues/4')
    assert.include(comments[0].body, 'docs/identity-operations.md')
    assert.equal(
      run.publication.planComment,
      'https://github.com/example/repo/issues/4#issuecomment-1'
    )
  } finally {
    await context.cleanup()
  }
})
