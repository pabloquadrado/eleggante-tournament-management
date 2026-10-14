export const googleAttemptLifetimeMs = 10 * 60 * 1000

export interface GoogleAttemptMaterial {
  state: string
  verifier: string
}

export interface GoogleAuthAttempt {
  id: string
  stateKey: string
  browserKey: string
  material: GoogleAttemptMaterial | null
  expiresAt: Date
  consumedAt: Date | null
  invalidatedAt: Date | null
  createdAt: Date
}

export function isPendingGoogleAttempt(attempt: GoogleAuthAttempt, now: Date): boolean {
  return (
    attempt.material !== null &&
    attempt.consumedAt === null &&
    attempt.invalidatedAt === null &&
    attempt.expiresAt > now
  )
}

export function isGoogleState(input: unknown): input is string {
  return typeof input === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(input)
}
