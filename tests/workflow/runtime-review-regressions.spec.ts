import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { LocalWorkflowRuntime } from '../../scripts/agent-workflow/runtime.ts'
import type { CommandPort } from '../../scripts/agent-workflow/runtime.ts'
import type { RunState } from '../../scripts/agent-workflow/contracts.ts'
import { fixture } from './support.ts'

async function readyRun(context: Awaited<ReturnType<typeof fixture>>) {
  await context.throughQa()
  await context.record('retrospective')
  const run = await context.controller.status(context.run.id)

  run.config.repo = 'example/repo'
  run.reports.retrospective!.publicSummary = '**Door:** two-way\n**Blast Radius:** Tooling only.'
  run.publication.reviewComment = 'https://github.com/example/repo/issues/4#issuecomment-2'
  run.publication.retrospectiveComment = 'https://github.com/example/repo/issues/4#issuecomment-3'

  return run
}

function currentPrBoundary(run: RunState, operations: string[], initialDraft: boolean) {
  let isDraft = initialDraft
  const boundary: CommandPort = {
    execute: async (argv) => {
      let stdout = ''

      if (argv[0] === 'git' && argv[1] === 'remote') stdout = 'https://github.com/example/repo.git'
      else if (argv[0] === 'git' && argv[1] === 'push') operations.push('push')
      else if (argv[0] === 'gh' && argv[1] === 'pr' && argv[2] === 'list')
        stdout = JSON.stringify([
          { url: 'https://github.com/example/repo/pull/5', isDraft, headRefOid: run.commit },
        ])
      else if (argv[0] === 'gh' && argv[1] === 'pr' && argv[2] === 'view')
        stdout = JSON.stringify({
          headRefOid: run.commit,
          statusCheckRollup: [{ name: 'test', conclusion: 'SUCCESS', status: 'COMPLETED' }],
        })
      else if (argv[0] === 'gh' && argv[1] === 'pr' && argv[2] === 'ready') {
        isDraft = argv.includes('--undo')
        operations.push(isDraft ? 'draft' : 'ready')
      } else if (argv[0] === 'gh' && argv[1] === 'pr' && argv[2] === 'edit') operations.push('edit')
      else throw new Error(`Unexpected command: ${argv.join(' ')}`)

      return { exitCode: 0, stdout, stderr: '' }
    },
  }

  return { boundary, isDraft: () => isDraft }
}

test('same-commit approval invalidation restores a ready PR to draft before review resumes', async ({
  assert,
}) => {
  const context = await fixture()
  const operations: string[] = []

  try {
    const run = await readyRun(context)
    const priorReview = run.reports['review-spec']!

    run.publication.ready = true
    run.publication.prUrl = 'https://github.com/example/repo/pull/5'
    run.publication.pushedCommit = run.commit
    run.publication.draftCommit = run.commit
    await context.store.save(run)
    const pr = currentPrBoundary(run, operations, false)
    const runtime = new LocalWorkflowRuntime(context.directory, pr.boundary)

    context.ports.publication.draft = runtime.publication.draft
    const question = await context.controller.question(
      run.id,
      'Reconfirm the specification approval',
      'review-spec'
    )

    await context.controller.answer(
      run.id,
      question.id,
      'Review the existing acceptance examples',
      {
        userReference: 'owner-review-renewal-message',
      }
    )
    const dispatch = await context.controller.next(run.id)

    assert.include(dispatch.command!, 'publish')
    assert.isUndefined(dispatch.packets)
    await assert.rejects(
      () => context.controller.record(run.id, priorReview),
      /as a draft before renewing approval/
    )
    await context.controller.publish(run.id)
    const drafted = await context.controller.status(run.id)
    const review = await context.controller.next(run.id)

    assert.isTrue(pr.isDraft())
    assert.deepEqual(operations, ['draft', 'edit'])
    assert.equal(drafted.commit, run.commit)
    assert.equal(drafted.publication.draftCommit, run.commit)
    assert.isUndefined(drafted.publication.ready)
    assert.isTrue(drafted.reports['review-standards']?.passed)
    assert.isUndefined(drafted.reports.qa)
    assert.isUndefined(drafted.gates.qa)
    assert.equal(review.packets?.[0].stage, 'review-spec')
    assert.isUndefined(review.packets?.[0].qaCheckout)
    assert.deepEqual(drafted.repairs, {})
  } finally {
    await context.cleanup()
  }
})

test('unchanged valid ready retries preserve readiness without publication writes', async ({
  assert,
}) => {
  const context = await fixture()
  const operations: string[] = []

  try {
    const run = await readyRun(context)

    run.publication.pushedCommit = run.commit
    const pr = currentPrBoundary(run, operations, true)
    const runtime = new LocalWorkflowRuntime(context.directory, pr.boundary)

    await runtime.publication.publish(run, async () => {}, context.store.directory(run.id))
    assert.deepEqual(operations, ['edit', 'ready'])
    operations.length = 0
    await runtime.publication.publish(run, async () => {}, context.store.directory(run.id))
    await runtime.publication.publish(run, async () => {}, context.store.directory(run.id))
    assert.deepEqual(operations, [])
    assert.isTrue(run.publication.ready)
    assert.isFalse(pr.isDraft())
  } finally {
    await context.cleanup()
  }
})

test('additional configured CI checks cannot replace the mandatory application test check', async ({
  assert,
}) => {
  const context = await fixture()
  let ready = 0
  let checks: { name: string; conclusion?: string; status: string }[] = []

  try {
    const run = await readyRun(context)

    run.config.requiredChecks = ['security', 'security']
    run.publication.pushedCommit = run.commit
    const runtime = new LocalWorkflowRuntime(context.directory, {
      execute: async (argv) => {
        let stdout = ''

        if (argv[0] === 'git' && argv[1] === 'remote')
          stdout = 'https://github.com/example/repo.git'
        else if (argv[0] === 'gh' && argv[1] === 'pr' && argv[2] === 'list')
          stdout = JSON.stringify([
            {
              url: 'https://github.com/example/repo/pull/5',
              isDraft: true,
              headRefOid: run.commit,
            },
          ])
        else if (argv[0] === 'gh' && argv[1] === 'pr' && argv[2] === 'view')
          stdout = JSON.stringify({ headRefOid: run.commit, statusCheckRollup: checks })
        else if (argv[0] === 'gh' && argv[1] === 'pr' && argv[2] === 'ready') ready++
        else if (!(argv[0] === 'gh' && argv[1] === 'pr' && argv[2] === 'edit'))
          throw new Error(`Unexpected command: ${argv.join(' ')}`)

        return { exitCode: 0, stdout, stderr: '' }
      },
    })

    for (const testCheck of [
      undefined,
      { name: 'test', conclusion: 'FAILURE', status: 'COMPLETED' },
      { name: 'test', conclusion: 'SKIPPED', status: 'COMPLETED' },
      { name: 'test', status: 'IN_PROGRESS' },
    ]) {
      checks = [
        { name: 'security', conclusion: 'SUCCESS', status: 'COMPLETED' },
        ...(testCheck ? [testCheck] : []),
      ]
      await assert.rejects(
        () => runtime.publication.publish(run, async () => {}, context.store.directory(run.id)),
        /PR checks must complete successfully/
      )
      assert.equal(ready, 0)
      assert.isUndefined(run.publication.ready)
    }

    checks = [
      { name: 'security', conclusion: 'SUCCESS', status: 'COMPLETED' },
      { name: 'test', conclusion: 'SUCCESS', status: 'COMPLETED' },
    ]
    await runtime.publication.publish(run, async () => {}, context.store.directory(run.id))
    assert.equal(ready, 1)
    assert.isTrue(run.publication.ready)
  } finally {
    await context.cleanup()
  }
})

test('publication rejects UTF-8 and nested-percent encoded private PRD and native references', async ({
  assert,
}) => {
  const context = await fixture()
  let publicCommands = 0

  try {
    await context.record('refinement')
    await context.record('plan')
    const run = await context.controller.status(context.run.id)
    const privatePhrase =
      'Este trecho confidencial contém decisões disponíveis somente no cofre privado'

    await writeFile(join(context.directory, 'private-source.md'), privatePhrase)
    run.config.prd = {
      path: 'private-source.md',
      locator: 'private-approval-source',
      approved: true,
    }
    run.publication.progressSet = true
    const runtime = new LocalWorkflowRuntime(context.directory, {
      execute: async (argv) => {
        if (argv[0] === 'git' && argv[1] === 'remote')
          return { exitCode: 0, stdout: 'https://github.com/example/repo.git', stderr: '' }

        publicCommands++
        throw new Error('Unexpected public command')
      },
    })
    const fullyEncode = (value: string) =>
      Array.from(
        new TextEncoder().encode(value),
        (byte) => `%${byte.toString(16).padStart(2, '0')}`
      ).join('')
    const payloads = [
      privatePhrase,
      encodeURIComponent(privatePhrase),
      encodeURIComponent(encodeURIComponent(privatePhrase)),
      `100% complete; ${encodeURIComponent(privatePhrase)}`,
      fullyEncode(run.config.prd.locator),
      fullyEncode(run.reports.plan!.model.sessionId),
      encodeURIComponent(fullyEncode(run.reports.plan!.model.evidence)),
    ]

    for (const payload of payloads) {
      run.reports.plan!.publicSummary = `sequenceDiagram\n${payload}`
      await assert.rejects(
        () => runtime.publication.plan(run, async () => {}, context.store.directory(run.id)),
        /nonpublic PRD excerpt|private source|native receipt/
      )
      assert.equal(publicCommands, 0)
    }
  } finally {
    await context.cleanup()
  }
})

test('a ready PR becomes draft before a changed-head push and stays draft while CI is pending', async ({
  assert,
}) => {
  const context = await fixture()
  const operations: string[] = []
  let pending = true
  let isDraft = false
  let head = 'previous-verified-candidate'

  try {
    const run = await readyRun(context)

    run.publication.pushedCommit = head
    run.publication.ready = true
    const boundary: CommandPort = {
      execute: async (argv) => {
        let stdout = ''

        if (argv[0] === 'git' && argv[1] === 'remote')
          stdout = 'https://github.com/example/repo.git'
        else if (argv[0] === 'git' && argv[1] === 'push') {
          operations.push('push')
          head = run.commit
        } else if (argv[0] === 'gh' && argv[1] === 'pr' && argv[2] === 'list')
          stdout = JSON.stringify([
            { url: 'https://github.com/example/repo/pull/5', isDraft, headRefOid: head },
          ])
        else if (argv[0] === 'gh' && argv[1] === 'pr' && argv[2] === 'view')
          stdout = JSON.stringify({
            headRefOid: head,
            statusCheckRollup: [
              {
                name: 'test',
                conclusion: pending ? undefined : 'SUCCESS',
                status: pending ? 'IN_PROGRESS' : 'COMPLETED',
              },
            ],
          })
        else if (argv[0] === 'gh' && argv[1] === 'pr' && argv[2] === 'ready') {
          if (argv.includes('--undo')) {
            operations.push('draft')
            isDraft = true
          } else {
            operations.push('ready')
            isDraft = false
          }
        } else if (argv[0] === 'gh' && argv[1] === 'pr' && argv[2] === 'edit')
          operations.push('edit')
        else throw new Error(`Unexpected command: ${argv.join(' ')}`)

        return { exitCode: 0, stdout, stderr: '' }
      },
    }
    const runtime = new LocalWorkflowRuntime(context.directory, boundary)

    await assert.rejects(
      () => runtime.publication.publish(run, async () => {}, context.store.directory(run.id)),
      /PR checks must complete successfully/
    )
    assert.isTrue(isDraft)
    assert.isTrue(operations.indexOf('draft') >= 0)
    assert.isTrue(operations.indexOf('draft') < operations.indexOf('push'))
    assert.isFalse(Boolean(run.publication.ready))
    pending = false
    await runtime.publication.publish(run, async () => {}, context.store.directory(run.id))
    assert.isFalse(isDraft)
    assert.isTrue(run.publication.ready)
    const completed = [...operations]

    await runtime.publication.publish(run, async () => {}, context.store.directory(run.id))
    assert.deepEqual(operations, completed)
    assert.equal(operations.filter((operation) => operation === 'push').length, 1)
    assert.equal(operations.filter((operation) => operation === 'ready').length, 1)
  } finally {
    await context.cleanup()
  }
})
