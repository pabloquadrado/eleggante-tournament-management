import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { WorkflowController } from '../../scripts/agent-workflow/controller.ts'
import { FileRunStore } from '../../scripts/agent-workflow/store.ts'
import { fixture } from './support.ts'

test('a dry run reports the missing approved PRD without saving or creating a worktree', async ({
  assert,
}) => {
  const directory = await mkdtemp(join(tmpdir(), 'workflow-'))
  const store = new FileRunStore(directory)
  let isolated = false
  const controller = new WorkflowController(store, {
    sources: {
      snapshot: async () => ({
        fingerprint: 'source-a',
        references: [],
        blockers: ['Approved PRD is unavailable'],
        issue: {
          number: 4,
          title: 'Profile',
          url: 'https://github.com/example/repo/issues/4',
          body: 'Story',
          comments: [],
        },
        baseSha: 'base',
      }),
    },
    git: {
      isolate: async () => {
        isolated = true

        return { worktree: directory, branch: 'feat/issue-4', commit: 'base' }
      },
      inspect: async () => ({ commit: 'base', clean: true }),
      prepareQa: async () => {
        throw new Error('Unexpected QA checkout')
      },
      qaScope: async () => {
        throw new Error('Unexpected QA scope')
      },
      reviewDiff: async () => {
        throw new Error('Unexpected review diff')
      },
    },
    verification: {
      run: async () => {
        throw new Error('Unexpected verification')
      },
    },
    publication: {
      publish: async () => {
        throw new Error('Unexpected publication')
      },
    },
  })

  try {
    const result = await controller.start('4', { dryRun: true, config: { profile: 'openai' } })

    assert.equal(result.status, 'blocked')
    assert.deepEqual(result.blockers, ['Approved PRD is unavailable'])
    assert.equal(isolated, false)
    assert.deepEqual(await store.list(), [])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('QA works in a separate checkout and production changes are rejected even when committed', async ({
  assert,
}) => {
  const context = await fixture()

  try {
    await context.prepare()
    await context.controller.verify(context.run.id, 'engineering')
    const report = await context.report('qa')
    const checkout = report.qaCheckout!

    assert.notEqual(checkout.path, context.directory)
    assert.equal(checkout.baseCommit, context.run.commit)
    await writeFile(join(checkout.path, 'source.ts'), 'export const value = 2\n')
    await context.gitIn(checkout.path, 'add', 'source.ts')
    await context.gitIn(checkout.path, 'commit', '-m', 'Unauthorized production change')
    checkout.commit = await context.gitIn(checkout.path, 'rev-parse', 'HEAD')
    await assert.rejects(
      () => context.controller.record(context.run.id, report),
      /QA changed production files/
    )
  } finally {
    await context.cleanup()
  }
})

test('new QA tests must be integrated into the delivery branch before fresh independent approval', async ({
  assert,
}) => {
  const context = await fixture()

  try {
    await context.prepare()
    await context.controller.verify(context.run.id, 'engineering')
    const report = await context.report('qa')
    const checkout = report.qaCheckout!

    await mkdir(join(checkout.path, 'tests'))
    await writeFile(
      join(checkout.path, 'tests/acceptance.spec.ts'),
      '// Independent acceptance example\n'
    )
    await context.gitIn(checkout.path, 'add', 'tests/acceptance.spec.ts')
    await context.gitIn(checkout.path, 'commit', '-m', 'Independent QA test')
    checkout.commit = await context.gitIn(checkout.path, 'rev-parse', 'HEAD')
    await context.controller.record(context.run.id, report)
    await context.controller.verify(context.run.id, 'qa')
    const pending = await context.controller.next(context.run.id)
    const state = await context.controller.status(context.run.id)

    assert.equal(pending.packets?.[0].stage, 'implementation')
    assert.equal(pending.packets?.[0].qaIntegration?.commit, checkout.commit)
    assert.isUndefined(state.repairs.qa)
    await context.git('cherry-pick', checkout.commit)
    await context.record('implementation')
    await context.controller.verify(context.run.id, 'engineering')
    const fresh = await context.report('qa')

    assert.notEqual(fresh.qaCheckout?.path, checkout.path)
    assert.equal(fresh.qaCheckout?.commit, fresh.commit)
    await context.controller.record(context.run.id, fresh)
    await context.controller.verify(context.run.id, 'qa')
    const approved = await context.controller.next(context.run.id)

    assert.deepEqual(
      approved.packets?.map((packet) => packet.stage),
      ['review-standards', 'review-spec']
    )
  } finally {
    await context.cleanup()
  }
})

test('an untouched task template cannot pass without a native session receipt', async ({
  assert,
}) => {
  const context = await fixture()

  try {
    const next = await context.controller.next(context.run.id)
    const template = next.packets![0].reportTemplate

    assert.isFalse(template.passed)
    assert.isFalse(template.model.available)
    await assert.rejects(
      () =>
        context.controller.record(context.run.id, {
          ...template,
          passed: true,
          model: { ...template.model, available: true },
        }),
      /Native model session/
    )
  } finally {
    await context.cleanup()
  }
})

test('implementation follows approved planning and two reviews become parallel only after independent QA', async ({
  assert,
}) => {
  const context = await fixture()

  try {
    const awaited1 = await context.controller.next(context.run.id)

    assert.equal(awaited1.packets?.[0].stage, 'refinement')
    await context.record('refinement')
    await context.record('plan')
    const awaited2 = await context.controller.next(context.run.id)

    assert.include(awaited2.command!, 'publish')
    await context.controller.publish(context.run.id)
    await context.record('implementation')
    await assert.rejects(() => context.controller.verify(context.run.id, 'qa'), /Cannot verify qa/)
    await context.controller.verify(context.run.id, 'engineering')
    const awaited3 = await context.controller.next(context.run.id)

    assert.equal(awaited3.packets?.[0].stage, 'qa')
    await context.record('qa')
    const awaited4 = await context.controller.next(context.run.id)

    assert.include(awaited4.command!, 'verify')
    await context.controller.verify(context.run.id, 'qa')
    const awaited5 = await context.controller.next(context.run.id)

    assert.deepEqual(
      awaited5.packets?.map((packet) => packet.stage),
      ['review-standards', 'review-spec']
    )
    await context.record('review-spec')
    await context.record('review-standards')
    await context.record('retrospective')
    await context.controller.publish(context.run.id)
    await context.controller.publish(context.run.id)
    const awaited6 = await context.controller.status(context.run.id)

    assert.equal(awaited6.status, 'published')
    assert.equal(context.publications(), 1)
  } finally {
    await context.cleanup()
  }
})

test('an unanswered Owner question survives resume and blocks dependent work', async ({
  assert,
}) => {
  const context = await fixture()

  try {
    const question = await context.controller.question(
      context.run.id,
      'Which acceptance example is approved?',
      'plan'
    )
    const resumed = new WorkflowController(context.store, context.ports)

    await resumed.resume(context.run.id)
    const awaited7 = await resumed.next(context.run.id)

    assert.equal(awaited7.status, 'blocked')
    await assert.rejects(
      () => resumed.answer(context.run.id, question.id, 'Inferred answer'),
      /actual user reference/
    )
    await resumed.answer(context.run.id, question.id, 'Use the approved example in the spec', {
      userReference: 'owner-message-1',
    })
    const awaited8 = await resumed.next(context.run.id)

    assert.equal(awaited8.packets?.[0].stage, 'refinement')
  } finally {
    await context.cleanup()
  }
})

test('changed sources restart refinement and stale reports cannot skip it', async ({ assert }) => {
  const context = await fixture()

  try {
    await context.prepare()
    const awaited9 = await context.controller.status(context.run.id)

    const stale = awaited9.reports.implementation!

    context.setSource({ fingerprint: 'source-b' })
    await assert.rejects(() => context.controller.record(context.run.id, stale), /stale/)
    const awaited10 = await context.controller.status(context.run.id)

    assert.equal(awaited10.source.fingerprint, 'source-b')
    const awaited11 = await context.controller.next(context.run.id)

    assert.equal(awaited11.packets?.[0].stage, 'refinement')
    const awaited12 = await context.controller.status(context.run.id)

    assert.isUndefined(awaited12.publication.planComment)
  } finally {
    await context.cleanup()
  }
})

test('a new clean commit invalidates downstream verification and requires a new engineer report', async ({
  assert,
}) => {
  const context = await fixture()

  try {
    await context.throughQa()
    await context.git('commit', '--allow-empty', '-m', 'Change fixture')
    await context.controller.resume(context.run.id)
    const run = await context.controller.status(context.run.id)

    assert.isUndefined(run.gates.qa)
    assert.isUndefined(run.gates.engineering)
    const awaited13 = await context.controller.next(context.run.id)

    assert.equal(awaited13.packets?.[0].stage, 'implementation')
  } finally {
    await context.cleanup()
  }
})

test('QA gets two persisted automatic repairs and the third failure requires an Owner decision', async ({
  assert,
}) => {
  const context = await fixture()

  try {
    await context.prepare()

    for (let round = 1; round <= 3; round++) {
      context.setGatePasses(true)
      await context.controller.verify(context.run.id, 'engineering')
      await context.record('qa')
      context.setGatePasses(false)
      await context.controller.verify(context.run.id, 'qa')
      const resumed = new WorkflowController(context.store, context.ports)

      await resumed.resume(context.run.id)

      if (round < 3) {
        const awaited14 = await resumed.status(context.run.id)

        assert.equal(awaited14.repairs.qa, round)
        const awaited15 = await resumed.next(context.run.id)

        assert.equal(awaited15.packets?.[0].stage, 'implementation')
        await context.record('implementation')
      } else {
        const awaited16 = await resumed.next(context.run.id)

        assert.equal(awaited16.status, 'blocked')
        const awaited17 = await resumed.status(context.run.id)

        assert.equal(awaited17.repairs.qa, 2)
      }
    }
  } finally {
    await context.cleanup()
  }
})

test('review findings remain until the originating reviewer closes them after repair', async ({
  assert,
}) => {
  const context = await fixture()

  try {
    await context.throughQa()
    const review = await context.report('review-spec')

    review.findings = [
      {
        id: 'spec-1',
        origin: 'review-spec',
        status: 'open',
        summary: 'Acceptance example missing',
      },
    ]
    await context.controller.record(context.run.id, review)
    await context.record('implementation')
    await context.controller.verify(context.run.id, 'engineering')
    await context.record('qa')
    await context.controller.verify(context.run.id, 'qa')
    const rerun = await context.report('review-spec')

    await assert.rejects(() => context.controller.record(context.run.id, rerun), /cannot disappear/)
    rerun.findings = [
      {
        id: 'spec-1',
        origin: 'review-spec',
        status: 'closed',
        summary: 'Acceptance example now implemented and verified',
      },
    ]
    await context.controller.record(context.run.id, rerun)
    const awaited18 = await context.controller.status(context.run.id)

    assert.equal(awaited18.findings[0].status, 'closed')
  } finally {
    await context.cleanup()
  }
})

test('wrong role reports and unavailable model substitutions fail closed', async ({ assert }) => {
  const context = await fixture()

  try {
    const report = await context.report('refinement')

    await assert.rejects(
      () => context.controller.record(context.run.id, { ...report, role: 'engineer' }),
      /Invalid versioned/
    )
    report.model.effectiveModel = 'replacement-model'
    await context.controller.record(context.run.id, report)
    const awaited19 = await context.controller.next(context.run.id)

    assert.equal(awaited19.status, 'blocked')
    const awaited20 = await context.controller.status(context.run.id)

    assert.include(awaited20.questions[0].text, 'Requested capability unavailable')
  } finally {
    await context.cleanup()
  }
})

test('finding deferral requires the specific finding and explicit Owner approval evidence', async ({
  assert,
}) => {
  const context = await fixture()

  try {
    await context.throughQa()
    const review = await context.report('review-spec')

    review.findings = [
      {
        id: 'spec-defer',
        origin: 'review-spec',
        status: 'open',
        summary: 'Optional scenario needs a scope decision',
      },
    ]
    await context.controller.record(context.run.id, review)
    const unrelated = await context.controller.question(
      context.run.id,
      'Confirm schedule',
      'implementation'
    )

    await context.controller.answer(context.run.id, unrelated.id, 'Confirmed', {
      userReference: 'owner-message-2',
    })
    await context.record('implementation')
    await context.controller.verify(context.run.id, 'engineering')
    await context.record('qa')
    await context.controller.verify(context.run.id, 'qa')
    const deferred = await context.report('review-spec')

    deferred.findings = [
      {
        id: 'spec-defer',
        origin: 'review-spec',
        status: 'deferred',
        summary: 'Owner explicitly deferred the scenario',
        ownerQuestionId: unrelated.id,
      },
    ]
    await assert.rejects(
      () => context.controller.record(context.run.id, deferred),
      /Finding deferral requires/
    )
    const decision = await context.controller.question(
      context.run.id,
      'Move to a later story',
      'review-spec',
      'spec-defer'
    )

    await assert.rejects(
      () =>
        context.controller.answer(context.run.id, decision.id, 'Approved', {
          userReference: 'owner-message-3',
        }),
      /explicit approval decision/
    )
    await context.controller.answer(context.run.id, decision.id, 'Approved for a separate story', {
      approveDeferral: true,
      userReference: 'owner-message-42',
    })
    deferred.findings[0].ownerQuestionId = decision.id
    await context.controller.record(context.run.id, deferred)
    const state = await context.controller.status(context.run.id)

    assert.equal(state.findings[0].status, 'deferred')
    assert.equal(
      state.questions.find((question) => question.id === decision.id)?.userReference,
      'owner-message-42'
    )
  } finally {
    await context.cleanup()
  }
})

test('Coordinator and Delivery Lead can each escalate once with exact receipts and persisted counters', async ({
  assert,
}) => {
  const context = await fixture()

  try {
    const escalation = await context.controller.escalate(
      context.run.id,
      'coordinator',
      'Resolve workflow orchestration complexity'
    )

    assert.deepEqual(escalation.requested, { model: 'gpt-6.1-sol', effort: 'xhigh' })
    await assert.rejects(
      () => context.controller.escalate(context.run.id, 'coordinator', 'Try again'),
      /already used/
    )
    await context.throughQa()
    await context.record('review-standards')
    await context.record('review-spec')
    const previous = await context.report('retrospective')

    await context.controller.escalate(
      context.run.id,
      'delivery-lead',
      'Resolve a cross-stage retrospective concern'
    )
    const blocked = await context.controller.record(context.run.id, previous)

    assert.equal(blocked.status, 'blocked')
    assert.isUndefined(blocked.reports.retrospective)
    const capability = blocked.questions.find((question) => question.purpose === 'capability')!

    await context.controller.answer(
      context.run.id,
      capability.id,
      'Use the explicitly escalated native model',
      { userReference: 'owner-message-4' }
    )
    const report = await context.report('retrospective')

    assert.equal(report.model.requestedModel, 'gpt-6.1-sol')
    assert.equal(report.model.requestedEffort, 'xhigh')
    await context.controller.record(context.run.id, report)
    const resumed = new WorkflowController(context.store, context.ports)

    await assert.rejects(
      () => resumed.escalate(context.run.id, 'delivery-lead', 'Try again'),
      /already used/
    )
    const state = await resumed.status(context.run.id)

    assert.deepEqual(state.repairs, {})
    assert.equal(state.escalations['delivery-lead']?.model, 'gpt-6.1-sol')
  } finally {
    await context.cleanup()
  }
})
