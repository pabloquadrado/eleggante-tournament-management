import { deniedOtp, isActiveOtpChallenge } from '../../domain/otp-challenge-policy.ts'
import { isIdentifier } from '../../domain/identifier.ts'
import { otpPolicy } from '../../domain/otp-policy.ts'
import type { OtpChallenge, OtpPurpose } from '../../domain/identity-records.ts'
import type { IdentitySecrets } from '../ports/identity-adapters.ts'
import type { IdentityRepositories } from '../ports/identity-repositories.ts'

export class OtpConsumptionService {
  constructor(private secrets: IdentitySecrets) {}

  async consume<Result>(
    id: unknown,
    code: unknown,
    browserId: string,
    purpose: OtpPurpose,
    repositories: IdentityRepositories,
    action: (challenge: OtpChallenge, repositories: IdentityRepositories) => Promise<Result | null>
  ) {
    if (!isIdentifier(id) || typeof code !== 'string') throw deniedOtp()

    const { challenges } = repositories
    const challenge = await challenges.forBrowser(
      id,
      this.secrets.key('browser', browserId),
      purpose
    )
    const now = new Date()

    if (!isActiveOtpChallenge(challenge, now) || challenge.attempts >= otpPolicy.maxAttempts)
      return null

    const matches = /^\d{6}$/.test(code) && this.secrets.matchesCode(id, code, challenge.codeHash!)

    if (!matches) {
      await challenges.recordFailure(id, challenge.attempts + 1, now)

      return null
    }

    const outcome = await action(challenge, repositories)

    if (!outcome) return null

    await challenges.consume(id, now)

    return outcome
  }
}
