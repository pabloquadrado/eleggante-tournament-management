import { IdentityError } from './identity-error.ts'
import type { OtpChallenge } from './identity-records.ts'

export function isActiveOtpChallenge(
  challenge: OtpChallenge | null,
  now: Date
): challenge is OtpChallenge {
  return Boolean(
    challenge && !challenge.invalidatedAt && !challenge.consumedAt && challenge.expiresAt > now
  )
}

export function deniedOtp(): IdentityError {
  return new IdentityError('Código inválido ou expirado. Solicite um novo código.', 422, 'code')
}

export function requireOtpOutcome<Result>(result: Result | null): Result {
  if (!result) throw deniedOtp()

  return result
}
