import { randomUUID } from 'node:crypto'
import type { RunStore } from './store.ts'
import { modelFor } from './models.ts'
import type { Role } from './models.ts'
import { stages, stageRoles, validateReport } from './contracts.ts'
import type {
  NextResult,
  RoleReport,
  RunState,
  Stage,
  WorkflowConfig,
  WorkflowPorts,
} from './contracts.ts'

export class WorkflowController {
  constructor(
    private store: RunStore,
    private ports: WorkflowPorts
  ) {}

  async start(issueInput: string, input: { dryRun?: boolean; config: WorkflowConfig }) {
    if (
      !/^\d+$/.test(issueInput) &&
      !/^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+$/.test(issueInput)
    )
      throw new Error('Use an issue number or GitHub issue URL')

    modelFor(input.config.profile, 'coordinator', input.config.engineerOverride)
    const id = `issue-${issueInput.split('/').at(-1)}-${randomUUID().slice(0, 8)}`
    const source = await this.ports.sources.snapshot(issueInput, input.config, undefined, id)
    const run: RunState = {
      schemaVersion: 1,
      id,
      issueInput,
      config: input.config,
      source,
      status: source.blockers.length ? 'blocked' : 'active',
      blockers: source.blockers,
      commit: source.baseSha,
      reports: {},
      gates: {},
      questions: [],
      findings: [],
      repairs: {},
      escalations: {},
      publication: {},
      events: [{ at: new Date().toISOString(), action: 'Started' }],
    }

    if (input.dryRun) return { ...run, dryRun: true }

    await this.store.locked(run.id, async () => {
      if (!run.blockers.length)
        Object.assign(run, await this.ports.git.isolate(run, this.store.directory(run.id)))

      await this.store.save(run)
    })

    return run
  }

  private async mutate<T>(id: string, action: (run: RunState) => Promise<T>): Promise<T> {
    return this.store.locked(id, async () => {
      const run = await this.store.read(id)

      try {
        return await action(run)
      } finally {
        await this.store.save(run)
      }
    })
  }

  private invalidate(run: RunState, from: Stage) {
    for (const stage of stages.slice(stages.indexOf(from))) delete run.reports[stage]

    if (stages.indexOf(from) <= stages.indexOf('implementation')) delete run.gates.engineering

    if (stages.indexOf(from) <= stages.indexOf('qa')) {
      delete run.gates.qa
      delete run.qaCheckout
    }

    if (stages.indexOf(from) <= stages.indexOf('review-spec')) delete run.publication.reviewComment

    delete run.publication.retrospectiveComment
    delete run.publication.ready

    if (from === 'refinement' || from === 'plan') delete run.publication.planComment

    run.status = 'active'
  }

  private requested(run: RunState, role: Role) {
    const escalation =
      role === 'coordinator' || role === 'delivery-lead' ? run.escalations[role] : undefined

    return escalation
      ? { model: escalation.model, effort: escalation.effort }
      : modelFor(run.config.profile, role, run.config.engineerOverride)
  }

  private async refresh(run: RunState) {
    const source = await this.ports.sources.snapshot(
      run.issueInput,
      run.config,
      run.worktree,
      run.id
    )

    if (source.fingerprint !== run.source.fingerprint) {
      run.source = source
      this.invalidate(run, 'refinement')
      run.events.push({
        at: new Date().toISOString(),
        action: 'Source changed; refinement and downstream evidence invalidated',
      })
    }

    run.blockers = [...source.blockers]

    if (run.worktree) {
      const checkout = await this.ports.git.inspect(run.worktree)

      if (checkout.commit !== run.commit) {
        run.commit = checkout.commit
        this.invalidate(run, 'implementation')
        run.events.push({
          at: new Date().toISOString(),
          action: 'Commit changed; implementation and downstream evidence invalidated',
        })
      }
    }

    if (run.questions.some((question) => !question.answer))
      run.blockers.push('Owner answers are required')

    if (run.blockers.length) run.status = 'blocked'
    else if (run.status === 'blocked') run.status = 'active'
  }

  private stage(run: RunState): Stage | 'engineering' | 'qa-verification' {
    if (run.repair) return 'implementation'

    for (const stage of ['refinement', 'plan', 'implementation'] as const) {
      if (!run.reports[stage]?.passed) return stage
    }

    if (!run.gates.engineering?.passed) return 'engineering'

    if (!run.reports.qa?.passed) return 'qa'

    if (!run.gates.qa?.passed) return 'qa-verification'

    for (const stage of ['review-standards', 'review-spec', 'retrospective'] as const) {
      if (!run.reports[stage]?.passed) return stage
    }

    return 'ready'
  }

  async next(id: string): Promise<NextResult> {
    return this.mutate(id, async (run) => {
      await this.refresh(run)

      if (run.blockers.length)
        return {
          runId: id,
          status: 'blocked',
          blockers: run.blockers,
          questions: run.questions.filter((question) => !question.answer),
          advisory: 'Independent source reading is allowed; dependent stages remain blocked.',
        }

      const stage = this.stage(run)

      if (stage === 'qa' && !run.publication.prUrl && this.ports.publication.draft)
        return {
          runId: id,
          command: `npm run workflow -- publish ${id}`,
          purpose:
            'Push the first verified implementation and create the draft PR before independent QA',
        }

      if (stage === 'implementation' && !run.publication.planComment)
        return {
          runId: id,
          command: `npm run workflow -- publish ${id}`,
          purpose:
            'Set Project In Progress and publish the approved development plan before implementation',
        }

      if (stage === 'engineering' || stage === 'qa-verification')
        return {
          runId: id,
          command: `npm run workflow -- verify ${id} ${stage === 'engineering' ? 'engineering' : 'qa'}`,
        }

      if (stage === 'ready') {
        run.status = 'ready'

        return { runId: id, status: 'ready', command: `npm run workflow -- publish ${id}` }
      }

      const selected: Stage[] =
        stage === 'review-standards' && !run.reports['review-spec']
          ? ['review-standards', 'review-spec']
          : [stage]
      const qaCheckout =
        stage === 'qa'
          ? (run.qaCheckout ?? (await this.ports.git.prepareQa(run, this.store.directory(id))))
          : undefined
      const diff = selected.some((current) => current.startsWith('review-'))
        ? await this.ports.git.reviewDiff(run, this.store.directory(id))
        : undefined

      if (qaCheckout) run.qaCheckout = qaCheckout

      const artifacts = await this.store.artifacts(run)

      return {
        runId: id,
        status: 'active',
        packets: selected.map((current) => {
          const role = stageRoles[current]
          const requested = this.requested(run, role)
          const template: RoleReport = {
            schemaVersion: 1,
            runId: id,
            stage: current,
            role,
            sourceFingerprint: run.source.fingerprint,
            commit: run.commit,
            model: {
              harness: 'REPLACE_WITH_NATIVE_HARNESS',
              requestedModel: requested.model,
              effectiveModel: requested.model,
              requestedEffort: requested.effort,
              effectiveEffort: requested.effort,
              available: false,
              sessionId: 'REPLACE_WITH_NATIVE_SESSION_ID',
              evidence: 'REPLACE_WITH_NATIVE_RECEIPT_REFERENCE',
            },
            summary: 'REPLACE_WITH_ROLE_RESULT',
            publicSummary: 'REPLACE_WITH_PUBLIC_SAFE_RESULT',
            evidence: ['REPLACE_WITH_EVIDENCE_REFERENCE'],
            findings: [],
            questions: [],
            passed: false,
          }

          return {
            stage: current,
            role,
            requested,
            worktree: current === 'qa' ? qaCheckout?.path : run.worktree,
            qaCheckout,
            qaIntegration: run.qaIntegration,
            diff,
            privateSources: run.config.prd
              ? [
                  {
                    locator: run.config.prd.locator,
                    path: run.config.prd.path,
                    digest: run.source.references.find(
                      (reference) => reference.locator === run.config.prd?.locator
                    )?.digest,
                  },
                ]
              : [],
            branch: run.branch,
            commit: run.commit,
            sourceFingerprint: run.source.fingerprint,
            sourceArtifacts: {
              issue: artifacts.issue,
              spec: artifacts.spec,
              sources: artifacts.sources,
            },
            repair: run.repair,
            reportArtifacts: artifacts.reports,
            findings: run.findings,
            questions: run.questions,
            instructions: `Read docs/agents/roles/${role}.md. Use native harness dispatch; do not substitute unavailable model or effort. Return the versioned report with native session receipt and evidence. Private source pointers are local and must never be copied into public summaries. QA works only in the provided separate checkout and may change tests/** or inertia/tests/**; commit tests there and include qaCheckout receipt. Engineer integrates qaIntegration.commit into the delivery branch before fresh QA approval. Reviewers read the generated full diff artifact. Findings require originating-stage closure or explicit Owner-approved deferral.`,
            reportTemplate: template,
          }
        }),
      }
    })
  }

  private repair(run: RunState, gate: Stage | 'engineering') {
    const round = (run.repairs[gate] ?? 0) + 1

    if (round > 2) {
      run.repair = { gate, round }
      run.questions.push({
        id: randomUUID(),
        text: `${gate} failed after two automatic repair rounds. Decide the next action.`,
        stage: gate === 'engineering' ? 'implementation' : gate,
        purpose: 'repair',
      })
      run.status = 'blocked'
      run.blockers = ['Repair limit reached; Owner decision required']

      return
    }

    run.repairs[gate] = round
    run.repair = { gate, round }
    this.invalidate(run, 'implementation')
  }

  async record(id: string, input: unknown) {
    const report = validateReport(input)

    return this.mutate(id, async (run) => {
      await this.refresh(run)

      if (run.blockers.length) throw new Error(`Blocked: ${run.blockers.join('; ')}`)

      if (
        report.runId !== id ||
        report.sourceFingerprint !== run.source.fingerprint ||
        report.commit !== run.commit
      )
        throw new Error('Report has stale run, source, or commit')

      const expected = this.requested(run, report.role)

      if (
        !report.model.available ||
        report.model.requestedModel !== expected.model ||
        report.model.effectiveModel !== expected.model ||
        report.model.requestedEffort !== expected.effort ||
        report.model.effectiveEffort !== expected.effort
      ) {
        run.questions.push({
          id: randomUUID(),
          text: `Requested capability unavailable for ${report.stage}: ${expected.model}/${expected.effort}`,
          stage: report.stage,
          purpose: 'capability',
        })
        run.status = 'blocked'
        run.blockers = ['Model capability unavailable; explicit Owner decision required']

        return run
      }

      const expectedStage = this.stage(run)
      const parallel =
        expectedStage === 'review-standards' &&
        report.stage === 'review-spec' &&
        !run.reports['review-spec']?.passed

      if (report.stage === 'ready' || (report.stage !== expectedStage && !parallel))
        throw new Error(`Expected ${expectedStage}, received ${report.stage}`)

      if (report.stage === 'implementation' && !run.publication.planComment)
        throw new Error('Publish the approved development plan before implementation')

      if (['implementation', 'review-standards', 'review-spec'].includes(report.stage)) {
        const checkout = run.worktree ? await this.ports.git.inspect(run.worktree) : undefined

        if (!checkout?.clean || checkout.commit !== run.commit)
          throw new Error('Role report requires a clean pinned checkout')
      }

      if (report.stage === 'qa') {
        if (
          !run.qaCheckout ||
          !report.qaCheckout ||
          report.qaCheckout.path !== run.qaCheckout.path ||
          report.qaCheckout.baseCommit !== run.commit
        )
          throw new Error('QA report requires its provisioned checkout receipt')

        const scope = await this.ports.git.qaScope(run.qaCheckout.path, run.commit)

        if (
          scope.changedFiles.some(
            (path) => !path.startsWith('tests/') && !path.startsWith('inertia/tests/')
          )
        )
          throw new Error('QA changed production files; only tests are allowed')

        if (!scope.clean || scope.commit !== report.qaCheckout.commit)
          throw new Error('QA checkout must be clean and pinned to its report commit')

        if (scope.changedFiles.length)
          run.qaIntegration = {
            path: run.qaCheckout.path,
            commit: scope.commit,
            changedFiles: scope.changedFiles,
          }
      }

      for (const finding of report.findings) {
        if (
          run.findings.some(
            (existing) => existing.id === finding.id && existing.origin !== report.stage
          )
        )
          throw new Error('Finding ID belongs to another originating stage')

        if (finding.origin !== report.stage)
          throw new Error('Findings must belong to the reporting stage')

        if (finding.status === 'closed' && finding.origin !== report.stage)
          throw new Error('Only the originating stage can close a finding')

        if (
          finding.status === 'deferred' &&
          !run.questions.some(
            (question) =>
              question.id === finding.ownerQuestionId &&
              question.purpose === 'deferral' &&
              question.findingId === finding.id &&
              question.answer &&
              question.approved === true &&
              question.userReference
          )
        )
          throw new Error('Finding deferral requires an answered Owner question')
      }

      const previous = run.findings.filter((finding) => finding.origin === report.stage)

      if (
        previous.some(
          (finding) =>
            finding.status === 'open' &&
            !report.findings.some((current) => current.id === finding.id)
        )
      )
        throw new Error('Confirmed findings cannot disappear from a report')

      if (
        report.questions.some(
          (question) =>
            question.findingId &&
            !report.findings.some(
              (finding) => finding.id === question.findingId && finding.status === 'open'
            )
        )
      )
        throw new Error('Deferral question must identify a confirmed open finding in the report')

      run.reports[report.stage] = report
      run.findings = [
        ...run.findings.filter((finding) => finding.origin !== report.stage),
        ...report.findings,
      ]
      run.questions.push(
        ...report.questions.map((question) => ({
          id: randomUUID(),
          text: question.text,
          stage: question.stage ?? report.stage,
          purpose: question.findingId ? ('deferral' as const) : ('clarification' as const),
          findingId: question.findingId,
        }))
      )
      run.events.push({
        at: new Date().toISOString(),
        action: `Recorded ${report.stage} report (${report.passed ? 'pass' : 'fail'})`,
      })

      if (report.stage === 'implementation') {
        delete run.repair
        delete run.gates.engineering
        delete run.gates.qa
        delete run.qaIntegration
      }

      if (!report.passed || report.findings.some((finding) => finding.status === 'open')) {
        if (['qa', 'review-standards', 'review-spec'].includes(report.stage))
          this.repair(run, report.stage)
        else report.passed = false
      }

      return run
    })
  }

  async verify(id: string, kind: 'engineering' | 'qa') {
    if (!['engineering', 'qa'].includes(kind)) throw new Error('Unknown verification gate')

    return this.mutate(id, async (run) => {
      await this.refresh(run)

      if (run.blockers.length) throw new Error(`Blocked: ${run.blockers.join('; ')}`)

      const stage = this.stage(run)

      if (
        (kind === 'engineering' && stage !== 'engineering') ||
        (kind === 'qa' && stage !== 'qa-verification')
      )
        throw new Error(`Cannot verify ${kind} during ${stage}`)

      const executionDirectory = kind === 'qa' ? run.qaCheckout?.path : run.worktree
      const before = executionDirectory
        ? await this.ports.git.inspect(executionDirectory)
        : undefined

      if (
        !before?.clean ||
        (kind === 'engineering' && before.commit !== run.commit) ||
        (kind === 'qa' && before.commit !== run.reports.qa?.qaCheckout?.commit)
      )
        throw new Error('Verification requires a clean pinned checkout')

      const evidence = await this.ports.verification.run(run, kind, this.store.directory(id))
      const after = await this.ports.git.inspect(executionDirectory!)

      if (
        after.commit !== before.commit ||
        !after.clean ||
        evidence.commit !== run.commit ||
        evidence.sourceFingerprint !== run.source.fingerprint
      )
        throw new Error('Checkout changed during verification')

      run.gates[kind] = evidence
      run.events.push({
        at: new Date().toISOString(),
        action: `${kind} verification ${evidence.passed ? 'passed' : 'failed'}`,
      })

      if (!evidence.passed) this.repair(run, kind === 'engineering' ? 'engineering' : 'qa')
      else if (kind === 'qa' && run.qaIntegration) {
        run.repair = { gate: 'qa', round: 0 }
        this.invalidate(run, 'implementation')
        run.events.push({
          at: new Date().toISOString(),
          action:
            'Integrate committed QA tests into delivery branch, then obtain fresh QA approval',
        })
      }

      return evidence
    })
  }

  async question(id: string, text: string, stage: Stage = 'refinement', findingId?: string) {
    if (!text.trim() || !stages.includes(stage))
      throw new Error('Question needs text and a valid stage')

    return this.mutate(id, async (run) => {
      const finding = findingId
        ? run.findings.find((item) => item.id === findingId && item.status === 'open')
        : undefined

      if (findingId && !finding)
        throw new Error('Deferral question requires a confirmed open finding')

      const question = {
        id: randomUUID(),
        text: finding
          ? `Approve deferral of finding ${finding.id}: ${finding.summary}? ${text}`
          : text,
        stage: finding?.origin ?? stage,
        purpose: finding ? ('deferral' as const) : ('clarification' as const),
        findingId,
      }

      run.questions.push(question)
      run.status = 'blocked'
      run.blockers = ['Owner answers are required']

      return question
    })
  }

  async answer(
    id: string,
    questionId: string,
    answer: string,
    decision: { approveDeferral?: boolean; userReference?: string } = {}
  ) {
    if (!answer.trim()) throw new Error('Answer cannot be empty')

    if (!decision.userReference?.trim() || decision.userReference.includes('REPLACE_'))
      throw new Error('Every Owner answer requires a nonblank actual user reference')

    return this.mutate(id, async (run) => {
      const question = run.questions.find((item) => item.id === questionId)

      if (!question) throw new Error('Unknown question')

      if (
        question.purpose === 'deferral' &&
        (!decision.userReference || typeof decision.approveDeferral !== 'boolean')
      )
        throw new Error(
          'Deferral answer requires explicit approval decision and Owner user reference'
        )

      question.answer = answer
      question.approved = decision.approveDeferral
      question.userReference = decision.userReference

      if (run.reports[question.stage]) this.invalidate(run, question.stage)

      run.events.push({ at: new Date().toISOString(), action: `Owner answered ${questionId}` })
      await this.refresh(run)

      return run
    })
  }

  async resume(id: string, config?: WorkflowConfig) {
    return this.mutate(id, async (run) => {
      if (config) {
        modelFor(config.profile, 'coordinator', config.engineerOverride)

        if (
          config.profile !== run.config.profile ||
          config.engineerOverride !== run.config.engineerOverride
        )
          this.invalidate(run, 'refinement')

        run.config = config
      }

      await this.refresh(run)

      if (!run.blockers.length && !run.worktree)
        Object.assign(run, await this.ports.git.isolate(run, this.store.directory(id)))

      return run
    })
  }

  async status(id: string) {
    return this.store.read(id)
  }

  async escalate(id: string, role: 'coordinator' | 'delivery-lead', reason: string) {
    if (!['coordinator', 'delivery-lead'].includes(role) || !reason.trim())
      throw new Error('Escalation needs coordinator|delivery-lead and a reason')

    return this.mutate(id, async (run) => {
      if (run.escalations[role]) throw new Error(`${role} already used its one escalation`)

      const target = modelFor(run.config.profile, 'tech-lead')

      run.escalations[role] = { ...target, reason, at: new Date().toISOString() }

      if (role === 'delivery-lead' && run.reports.retrospective)
        this.invalidate(run, 'retrospective')

      run.events.push({
        at: new Date().toISOString(),
        action: `Explicit ${role} escalation to ${target.model}/${target.effort}: ${reason}`,
      })

      return {
        runId: id,
        role,
        requested: target,
        reason,
        nativeAction:
          'Switch or spawn this exact native model and effort. If unsupported, record a capability question; all product questions remain blocking.',
      }
    })
  }

  async publish(id: string) {
    return this.mutate(id, async (run) => {
      await this.refresh(run)

      if (
        !run.blockers.length &&
        this.stage(run) === 'implementation' &&
        !run.publication.planComment
      ) {
        if (!this.ports.publication.plan) throw new Error('Plan publication is unavailable')

        await this.ports.publication.plan(run, () => this.store.save(run), this.store.directory(id))

        return run
      }

      if (
        !run.blockers.length &&
        this.stage(run) === 'qa' &&
        !run.publication.prUrl &&
        this.ports.publication.draft
      ) {
        const checkout = run.worktree ? await this.ports.git.inspect(run.worktree) : undefined

        if (!checkout?.clean || checkout.commit !== run.commit)
          throw new Error('Draft publication requires the verified clean candidate')

        await this.ports.publication.draft(
          run,
          () => this.store.save(run),
          this.store.directory(id)
        )

        return run
      }

      if (run.blockers.length || this.stage(run) !== 'ready')
        throw new Error('Publication requires all current gates and answers')

      const checkout = run.worktree ? await this.ports.git.inspect(run.worktree) : undefined

      if (!checkout?.clean || checkout.commit !== run.commit)
        throw new Error('Publication requires a clean pinned checkout')

      await this.ports.publication.publish(
        run,
        () => this.store.save(run),
        this.store.directory(id)
      )
      run.status = 'published'

      return run
    })
  }
}
