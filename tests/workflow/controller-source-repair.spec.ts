import { test } from '@japa/runner'
import { fixture } from './support.ts'

async function reviewRepair(context: Awaited<ReturnType<typeof fixture>>) {
  await context.throughEngineering()
  const review = await context.report('review-standards')

  review.findings = [
    {
      id: 'review-mailbox-proof',
      origin: 'review-standards',
      status: 'open',
      summary: 'Current mailbox proof is required before linking',
    },
  ]
  await context.controller.record(context.run.id, review)

  return context.controller.status(context.run.id)
}

test('source changes during review repair renew refinement, plan and publication before implementation', async ({
  assert,
}) => {
  const context = await fixture()

  try {
    const before = await reviewRepair(context)

    context.setSource({ fingerprint: 'updated-mailbox-plan' })
    await context.controller.resume(context.run.id)
    const refinement = await context.controller.next(context.run.id)

    assert.equal(refinement.packets?.[0].stage, 'refinement')
    await context.record('refinement')
    const plan = await context.controller.next(context.run.id)

    assert.equal(plan.packets?.[0].stage, 'plan')
    await context.record('plan')
    const publication = await context.controller.next(context.run.id)

    assert.include(publication.command!, 'publish')
    assert.isUndefined(publication.packets)
    await context.controller.publish(context.run.id)
    const implementation = await context.controller.next(context.run.id)
    const after = await context.controller.status(context.run.id)

    assert.equal(implementation.packets?.[0].stage, 'implementation')
    assert.equal(implementation.packets?.[0].sourceFingerprint, 'updated-mailbox-plan')
    // Changed sources require a fresh dispatch after refinement and publication.
    // Finding ownership and repair budgets must survive that renewal.
    assert.isUndefined(after.repair)
    assert.deepEqual(after.repairs, before.repairs)
    assert.deepEqual(after.findings, before.findings)
    assert.isUndefined(after.gates.engineering)
    assert.isUndefined(after.reports.implementation)
    assert.equal(after.reports.refinement?.sourceFingerprint, 'updated-mailbox-plan')
    assert.equal(after.reports.plan?.sourceFingerprint, 'updated-mailbox-plan')
  } finally {
    await context.cleanup()
  }
})

test('source invalidation in active repair cannot publish before fresh prerequisite reports', async ({
  assert,
}) => {
  const context = await fixture()

  try {
    const before = await reviewRepair(context)

    context.setSource({ fingerprint: 'updated-mailbox-plan' })
    await assert.rejects(() => context.controller.publish(context.run.id), /Publication requires/)
    const after = await context.controller.status(context.run.id)

    assert.isUndefined(after.publication.planComment)
    assert.isUndefined(after.repair)
    assert.deepEqual(after.repairs, before.repairs)
    assert.deepEqual(after.findings, before.findings)
    assert.isUndefined(after.reports.refinement)
    assert.isUndefined(after.reports.plan)
  } finally {
    await context.cleanup()
  }
})
