import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from '@japa/runner'
import type { RoleReport } from '../../scripts/agent-workflow/contracts.ts'
import { fixture } from './support.ts'

async function qaReport(context: Awaited<ReturnType<typeof fixture>>): Promise<RoleReport> {
  const next = await context.controller.next(context.run.id)
  const packet = next.packets?.find((item) => item.stage === 'qa')

  if (!packet?.qaCheckout) throw new Error('Expected an isolated QA packet')

  const verificationPath = packet.qaVerification?.path

  return {
    ...packet.reportTemplate,
    summary: 'Independent QA inspected the current candidate and gate output',
    publicSummary: 'Independent QA validated the approved acceptance examples',
    evidence: verificationPath ? [verificationPath] : ['independent-scenario-observations'],
    passed: true,
    model: {
      ...packet.reportTemplate.model,
      harness: 'test-native-harness',
      available: true,
      sessionId: 'native-independent-qa-session',
      evidence: 'https://example.test/native-qa-receipt',
    },
    qaCheckout: {
      ...packet.qaCheckout,
      commit: await context.gitIn(packet.qaCheckout.path, 'rev-parse', 'HEAD'),
    },
    qaVerification: verificationPath,
  }
}

async function pendingTwoCommitPatch(context: Awaited<ReturnType<typeof fixture>>) {
  await context.throughReviews()
  const report = await qaReport(context)
  const checkout = report.qaCheckout!.path
  const baseCommit = context.run.commit

  await mkdir(join(checkout, 'tests'), { recursive: true })
  await writeFile(join(checkout, 'tests/qa-first.spec.ts'), 'export const firstRegression = true\n')
  await context.gitIn(checkout, 'add', 'tests/qa-first.spec.ts')
  await context.gitIn(checkout, 'commit', '-m', 'First independent regression')
  const firstCommit = await context.gitIn(checkout, 'rev-parse', 'HEAD')

  await writeFile(
    join(checkout, 'tests/qa-second.spec.ts'),
    'export const secondRegression = true\n'
  )
  await context.gitIn(checkout, 'add', 'tests/qa-second.spec.ts')
  await context.gitIn(checkout, 'commit', '-m', 'Second independent regression')
  const commit = await context.gitIn(checkout, 'rev-parse', 'HEAD')
  const scope = await context.ports.git.qaScope(checkout, baseCommit)

  await context.controller.verify(context.run.id, 'qa')
  await context.controller.record(context.run.id, await qaReport(context))

  return { firstCommit, commit, changedFiles: scope.changedFiles }
}

test('an unchanged Engineer report cannot discard a pending independent QA test patch', async ({
  assert,
}) => {
  const context = await fixture()

  try {
    const patch = await pendingTwoCommitPatch(context)

    await assert.rejects(() => context.record('implementation'), /QA|test|integration|patch/)
    const run = await context.controller.status(context.run.id)

    assert.equal(run.qaIntegration?.commit, patch.commit)
    assert.deepEqual(run.qaIntegration?.changedFiles.sort(), [
      'tests/qa-first.spec.ts',
      'tests/qa-second.spec.ts',
    ])
    assert.equal(run.repair?.round, 0)
    assert.deepEqual(run.repairs, {})
  } finally {
    await context.cleanup()
  }
})

test('the complete multi-commit QA delta must reach delivery and a later dropped regression blocks approval', async ({
  assert,
}) => {
  const context = await fixture()

  try {
    const patch = await pendingTwoCommitPatch(context)

    await context.git('cherry-pick', patch.firstCommit)
    await context.controller.resume(context.run.id)
    await assert.rejects(() => context.record('implementation'), /QA|test|integration|patch/)
    const partial = await context.controller.status(context.run.id)

    assert.equal(partial.qaIntegration?.commit, patch.commit)
    await context.git('cherry-pick', patch.commit)
    await context.controller.resume(context.run.id)
    await context.record('implementation')
    assert.equal(
      await readFile(join(context.directory, 'tests/qa-first.spec.ts'), 'utf8'),
      'export const firstRegression = true\n'
    )
    assert.equal(
      await readFile(join(context.directory, 'tests/qa-second.spec.ts'), 'utf8'),
      'export const secondRegression = true\n'
    )

    await rm(join(context.directory, 'tests/qa-first.spec.ts'))
    await context.git('add', 'tests/qa-first.spec.ts')
    await context.git('commit', '-m', 'Accidentally drop a supplied QA regression')
    await context.controller.resume(context.run.id)
    await assert.rejects(() => context.record('implementation'), /QA|test|integration|patch/)
    const dropped = await context.controller.status(context.run.id)

    assert.isUndefined(dropped.reports.implementation)
  } finally {
    await context.cleanup()
  }
})

test('compatible extra Engineer tests survive proof of complete independent QA integration', async ({
  assert,
}) => {
  const context = await fixture()

  try {
    const patch = await pendingTwoCommitPatch(context)
    const extraPath = join(context.directory, 'tests/engineer-extra.spec.ts')

    await mkdir(join(context.directory, 'tests'), { recursive: true })
    await writeFile(extraPath, 'export const additionalEngineerScenario = true\n')
    await context.git('add', 'tests/engineer-extra.spec.ts')
    await context.git('commit', '-m', 'Add compatible Engineer scenario')
    await context.git('cherry-pick', patch.firstCommit, patch.commit)
    const index = await context.git('write-tree')

    await context.controller.resume(context.run.id)
    await context.record('implementation')
    const integrated = await context.controller.status(context.run.id)

    assert.isUndefined(integrated.qaIntegration)
    assert.equal(integrated.qaIntegrations?.[0].commit, patch.commit)
    assert.equal(await context.git('write-tree'), index)
    assert.equal(await context.git('status', '--porcelain', '--untracked-files=no'), '')
    assert.equal(
      await readFile(extraPath, 'utf8'),
      'export const additionalEngineerScenario = true\n'
    )
    assert.equal(
      await readFile(join(context.directory, 'tests/qa-first.spec.ts'), 'utf8'),
      'export const firstRegression = true\n'
    )
    assert.equal(
      await readFile(join(context.directory, 'tests/qa-second.spec.ts'), 'utf8'),
      'export const secondRegression = true\n'
    )
    await context.controller.verify(context.run.id, 'engineering')
    await context.reviews()
    await context.record('qa')
    const approved = await context.controller.next(context.run.id)

    assert.equal(approved.packets?.[0].stage, 'retrospective')
    assert.deepEqual(integrated.repairs, {})
  } finally {
    await context.cleanup()
  }
})

test('fresh controller QA evidence precedes and is audited by the final QA approval report', async ({
  assert,
}) => {
  const context = await fixture()

  try {
    await context.throughReviews()
    const premature = await qaReport(context)

    await assert.rejects(
      () => context.controller.record(context.run.id, premature),
      /verification|gate|evidence/i
    )
    const evidence = await context.controller.verify(context.run.id, 'qa')

    assert.isTrue(evidence.passed)
    const final = await qaReport(context)

    assert.isString(final.qaVerification)
    assert.include(final.evidence, final.qaVerification!)
    const persistedEvidence = JSON.parse(await readFile(final.qaVerification!, 'utf8'))

    assert.equal(persistedEvidence.kind, 'qa')
    assert.equal(persistedEvidence.commit, final.commit)
    assert.equal(persistedEvidence.sourceFingerprint, final.sourceFingerprint)
    await assert.rejects(
      () => context.controller.record(context.run.id, { ...final, evidence: ['unrelated-gate'] }),
      /verification|gate|evidence/i
    )
    await context.controller.record(context.run.id, final)
    const next = await context.controller.next(context.run.id)

    assert.equal(next.packets?.[0].stage, 'retrospective')
  } finally {
    await context.cleanup()
  }
})

test('QA may report findings from a failed fresh gate without consuming two repair rounds', async ({
  assert,
}) => {
  const context = await fixture()

  try {
    await context.throughReviews()
    await context.controller.next(context.run.id)
    context.setGatePasses(false)
    const evidence = await context.controller.verify(context.run.id, 'qa')

    assert.isFalse(evidence.passed)
    const report = await qaReport(context)

    report.passed = false
    report.findings = [
      {
        id: 'qa-fresh-gate',
        origin: 'qa',
        status: 'open',
        summary: 'Fresh coverage evidence reports a missed branch',
      },
    ]
    await context.controller.record(context.run.id, report)
    const run = await context.controller.status(context.run.id)

    assert.equal(run.repairs.qa, 1)
    assert.equal(run.repair?.round, 1)
    assert.equal(run.findings.find((finding) => finding.id === 'qa-fresh-gate')?.status, 'open')
    assert.isTrue(Boolean(report.qaVerification))
    assert.include(report.evidence, report.qaVerification!)
    const repair = await context.controller.next(context.run.id)

    assert.equal(repair.packets?.[0].stage, 'implementation')
    await context.record('implementation')
    context.setGatePasses(true)
    await context.controller.verify(context.run.id, 'engineering')
    await context.reviews()
    const corrected = await context.controller.next(context.run.id)

    assert.equal(corrected.packets?.[0].stage, 'qa')
    assert.equal(corrected.packets?.[0].findings[0].status, 'open')
    await context.controller.verify(context.run.id, 'qa')
    const rerun = await qaReport(context)

    await assert.rejects(() => context.controller.record(context.run.id, rerun), /cannot disappear/)
    rerun.findings = [{ ...report.findings[0], status: 'closed' }]
    await context.controller.record(context.run.id, rerun)
    const closed = await context.controller.status(context.run.id)

    assert.equal(closed.findings[0].status, 'closed')
    assert.equal(closed.repairs.qa, 1)
  } finally {
    await context.cleanup()
  }
})
