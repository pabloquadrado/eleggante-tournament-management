import type { Effort, Profile, Role } from './models.ts'

export const stages = [
  'refinement',
  'plan',
  'implementation',
  'qa',
  'review-standards',
  'review-spec',
  'retrospective',
  'ready',
] as const
export type Stage = (typeof stages)[number]
export const stageRoles: Record<Stage, Role> = {
  'refinement': 'tech-lead',
  'plan': 'tech-lead',
  'implementation': 'engineer',
  'qa': 'qa',
  'review-standards': 'reviewer',
  'review-spec': 'reviewer',
  'retrospective': 'delivery-lead',
  'ready': 'coordinator',
}
export type WorkflowConfig = {
  repo?: string
  specIssue?: number
  profile: Profile
  engineerOverride?: 'kimi-k3'
  requiredChecks?: string[]
  prd?: { locator: string; path: string; approved: boolean }
}
export type SourceSnapshot = {
  fingerprint: string
  references: { locator: string; digest: string }[]
  blockers: string[]
  issue: {
    number: number
    title: string
    url: string
    body: string
    comments: { id: string; body: string }[]
  }
  spec?: {
    number: number
    title: string
    url: string
    body: string
    comments: { id: string; body: string }[]
  }
  baseSha: string
}
export type ModelReceipt = {
  harness: string
  requestedModel: string
  effectiveModel: string
  requestedEffort: Effort
  effectiveEffort: Effort
  available: boolean
  sessionId: string
  evidence: string
}
export type Finding = {
  id: string
  origin: Stage
  summary: string
  status: 'open' | 'closed' | 'deferred'
  ownerQuestionId?: string
}
export type RoleReport = {
  schemaVersion: 1
  runId: string
  stage: Stage
  role: Role
  sourceFingerprint: string
  commit: string
  model: ModelReceipt
  summary: string
  publicSummary: string
  evidence: string[]
  findings: Finding[]
  questions: { text: string; stage?: Stage; findingId?: string }[]
  passed: boolean
  qaCheckout?: { path: string; baseCommit: string; commit: string }
}
export type Question = {
  id: string
  text: string
  stage: Stage
  answer?: string
  purpose?: 'clarification' | 'deferral' | 'repair' | 'capability'
  findingId?: string
  approved?: boolean
  userReference?: string
}
export type GateEvidence = {
  kind: 'engineering' | 'qa'
  commit: string
  executionCommit?: string
  sourceFingerprint: string
  passed: boolean
  startedAt: string
  finishedAt: string
  commands: { argv: string[]; exitCode: number; log: string; digest: string }[]
  coverage: { node: string[]; browser: string[]; errors: string[] }
  setup?: {
    project: string
    checkout: string
    database: 'arena_test'
    composeFile: string
    envFile: string
    recovery: string[]
  }
}
export type Publication = {
  planComment?: string
  progressSet?: boolean
  reviewComment?: string
  retrospectiveComment?: string
  pushedCommit?: string
  prUrl?: string
  ready?: boolean
  prBodyCommit?: string
}
export type RunState = {
  schemaVersion: 1
  id: string
  issueInput: string
  config: WorkflowConfig
  source: SourceSnapshot
  status: 'active' | 'blocked' | 'ready' | 'published'
  blockers: string[]
  worktree?: string
  branch?: string
  commit: string
  qaCheckout?: { path: string; baseCommit: string }
  qaIntegration?: { path: string; commit: string; changedFiles: string[] }
  reports: Partial<Record<Stage, RoleReport>>
  gates: Partial<Record<'engineering' | 'qa', GateEvidence>>
  questions: Question[]
  findings: Finding[]
  repairs: Record<string, number>
  escalations: Partial<
    Record<
      'coordinator' | 'delivery-lead',
      { reason: string; model: string; effort: Effort; at: string }
    >
  >
  repair?: { gate: Stage | 'engineering'; round: number }
  publication: Publication
  events: { at: string; action: string }[]
}
export type WorkflowPorts = {
  sources: {
    snapshot(
      issue: string,
      config: WorkflowConfig,
      directory?: string,
      runId?: string
    ): Promise<SourceSnapshot>
  }
  git: {
    isolate(
      run: RunState,
      directory: string
    ): Promise<{ worktree: string; branch: string; commit: string }>
    inspect(directory: string): Promise<{ commit: string; clean: boolean }>
    prepareQa(run: RunState, directory: string): Promise<{ path: string; baseCommit: string }>
    qaScope(
      directory: string,
      baseCommit: string
    ): Promise<{ commit: string; clean: boolean; changedFiles: string[] }>
    reviewDiff(
      run: RunState,
      directory: string
    ): Promise<{
      path: string
      baseCommit: string
      candidateCommit: string
      changedFiles: string[]
    }>
  }
  verification: {
    run(run: RunState, kind: 'engineering' | 'qa', evidenceDirectory: string): Promise<GateEvidence>
  }
  publication: {
    plan?(run: RunState, persist: () => Promise<void>, directory: string): Promise<void>
    draft?(run: RunState, persist: () => Promise<void>, directory: string): Promise<void>
    publish(run: RunState, persist: () => Promise<void>, directory: string): Promise<void>
  }
}

export type NextResult = {
  runId: string
  status?: 'active' | 'blocked' | 'ready'
  command?: string
  purpose?: string
  blockers?: string[]
  questions?: Question[]
  advisory?: string
  packets?: {
    stage: Stage
    role: Role
    requested: { model: string; effort: Effort }
    worktree?: string
    privateSources?: { locator: string; path: string; digest?: string }[]
    qaCheckout?: { path: string; baseCommit: string }
    qaIntegration?: RunState['qaIntegration']
    diff?: { path: string; baseCommit: string; candidateCommit: string; changedFiles: string[] }
    branch?: string
    commit: string
    sourceFingerprint: string
    sourceArtifacts: { issue: string; spec?: string; sources: string }
    repair?: RunState['repair']
    reportArtifacts: Partial<Record<Stage, string>>
    findings: Finding[]
    questions: Question[]
    instructions: string
    reportTemplate: RoleReport
  }[]
}

export function validateReport(value: unknown): RoleReport {
  if (!value || typeof value !== 'object') throw new Error('Report must be an object')

  const report = value as RoleReport
  const strings = [
    report.runId,
    report.sourceFingerprint,
    report.commit,
    report.summary,
    report.publicSummary,
  ]

  if (
    report.schemaVersion !== 1 ||
    !stages.includes(report.stage) ||
    stageRoles[report.stage] !== report.role ||
    strings.some((item) => typeof item !== 'string' || !item.trim()) ||
    typeof report.passed !== 'boolean'
  )
    throw new Error('Invalid versioned role report')

  if (
    !Array.isArray(report.evidence) ||
    !report.evidence.length ||
    report.evidence.some((item) => typeof item !== 'string' || !item.trim()) ||
    !Array.isArray(report.findings) ||
    !Array.isArray(report.questions)
  )
    throw new Error('Report requires evidence, findings, and questions arrays')

  for (const finding of report.findings) {
    if (
      !finding ||
      typeof finding.id !== 'string' ||
      !finding.id ||
      typeof finding.summary !== 'string' ||
      !finding.summary ||
      !stages.includes(finding.origin) ||
      !['open', 'closed', 'deferred'].includes(finding.status)
    )
      throw new Error('Invalid finding')
  }

  if (new Set(report.findings.map((finding) => finding.id)).size !== report.findings.length)
    throw new Error('Finding IDs must be unique')

  for (const question of report.questions) {
    if (
      !question ||
      typeof question.text !== 'string' ||
      !question.text.trim() ||
      (question.stage && !stages.includes(question.stage))
    )
      throw new Error('Invalid report question')
  }

  const receipt = report.model

  if (
    !receipt ||
    typeof receipt.harness !== 'string' ||
    !receipt.harness ||
    typeof receipt.available !== 'boolean' ||
    ['requestedModel', 'effectiveModel', 'requestedEffort', 'effectiveEffort'].some(
      (key) => typeof receipt[key as keyof ModelReceipt] !== 'string'
    )
  )
    throw new Error('Invalid model receipt')

  if (
    receipt.available &&
    [receipt.sessionId, receipt.evidence].some(
      (item) => typeof item !== 'string' || !item.trim() || item.includes('REPLACE_')
    )
  )
    throw new Error('Native model session and receipt evidence are required')

  if (
    report.passed &&
    [...strings, ...report.evidence, receipt.harness].some((item) => item.includes('REPLACE_'))
  )
    throw new Error('Complete the report template before passing a stage')

  return report
}
