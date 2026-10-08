import { test } from '@japa/runner'
import { fixture } from './support.ts'

test('an explicit Owner denial cannot defer an open finding or erase its repair history', async ({
  assert,
}) => {
  const context = await fixture()

  try {
    await context.throughEngineering()
    const review = await context.report('review-spec')

    review.findings = [
      {
        id: 'denied-spec-deferral',
        origin: 'review-spec',
        summary: 'Approved acceptance behavior must be corrected',
        status: 'open',
      },
    ]
    await context.controller.record(context.run.id, review)
    const question = await context.controller.question(
      context.run.id,
      'Propose a later story',
      'review-spec',
      'denied-spec-deferral'
    )

    await context.controller.answer(context.run.id, question.id, 'Denied; correct this behavior', {
      approveDeferral: false,
      userReference: 'owner-denial-message-7',
    })
    await context.record('implementation')
    await context.controller.verify(context.run.id, 'engineering')
    const deferred = await context.report('review-spec')

    deferred.findings = [
      {
        ...review.findings[0],
        status: 'deferred',
        ownerQuestionId: question.id,
      },
    ]
    await assert.rejects(
      () => context.controller.record(context.run.id, deferred),
      /Finding deferral requires/
    )
    const state = await context.controller.status(context.run.id)

    assert.equal(
      state.findings.find((finding) => finding.id === 'denied-spec-deferral')?.status,
      'open'
    )
    assert.equal(state.repairs['review-spec'], 1)
    assert.equal(state.questions.find((item) => item.id === question.id)?.approved, false)
    assert.isUndefined(state.reports['review-spec'])
  } finally {
    await context.cleanup()
  }
})
