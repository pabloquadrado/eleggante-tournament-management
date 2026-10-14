export const googleAttemptLifetimeMs = 10 * 60 * 1000

export interface GoogleAttemptMaterial {
  state: string
  verifier: string
}

export interface GoogleEmailProof {
  subject: string
  email: string
}

export interface GoogleAuthAttempt {
  id: string
  stateKey: string
  browserKey: string
  material: GoogleAttemptMaterial | null
  emailProof: GoogleEmailProof | null
  expiresAt: Date
  consumedAt: Date | null
  invalidatedAt: Date | null
  createdAt: Date
}

/** The original provider identity remains immutable throughout code resends. */
export function googleEmailProofMatches(
  attempt: GoogleAuthAttempt | null,
  intent: GoogleEmailProof & { attemptId: string; expiresAt: string },
  now: Date
): boolean {
  return (
    attempt !== null &&
    attempt.material === null &&
    attempt.emailProof !== null &&
    attempt.consumedAt === null &&
    attempt.invalidatedAt === null &&
    attempt.expiresAt > now &&
    attempt.id === intent.attemptId &&
    attempt.expiresAt.toISOString() === intent.expiresAt &&
    attempt.emailProof.subject === intent.subject &&
    attempt.emailProof.email === intent.email
  )
}

export function isPendingGoogleAttempt(attempt: GoogleAuthAttempt, now: Date): boolean {
  return (
    attempt.material !== null &&
    attempt.emailProof === null &&
    attempt.consumedAt === null &&
    attempt.invalidatedAt === null &&
    attempt.expiresAt > now
  )
}

export function isGoogleState(input: unknown): input is string {
  return typeof input === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(input)
}
