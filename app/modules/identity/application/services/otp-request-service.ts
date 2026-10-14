import type { EmailAddress } from '../../domain/email-address.ts'
import { IdentityError } from '../../domain/identity-error.ts'
import { isIdentifier } from '../../domain/identifier.ts'
import {
  otpPolicy,
  otpRequestMessage,
  assertOtpCooldown,
  assertOtpRequestCounts,
} from '../../domain/otp-policy.ts'
import {
  isGoogleSignInIntent,
  type OtpChallenge,
  type OtpIntent,
} from '../../domain/identity-records.ts'
import { isActiveOtpChallenge, deniedOtp } from '../../domain/otp-challenge-policy.ts'
import { googleEmailProofMatches } from '../../domain/google-auth-attempt.ts'
import type { IdentitySecrets } from '../ports/identity-adapters.ts'
import type { IdentityRepositories } from '../ports/identity-repositories.ts'

export class OtpRequestService {
  constructor(private secrets: IdentitySecrets) {}

  async request(
    email: EmailAddress,
    browserId: string,
    ip: string,
    requestKey: unknown,
    requestId: string,
    repositories: IdentityRepositories,
    intent?: OtpIntent
  ) {
    if (!isIdentifier(requestKey))
      throw new IdentityError('Envie uma chave válida para esta solicitação.', 422)

    const now = new Date()
    const emailKey = this.secrets.key('email', email.value)
    const replayKey = this.secrets.key('request', `${browserId}:${requestKey}`)
    const intentKey = this.secrets.key('otp-intent', JSON.stringify(intent ?? 'sign_in'))
    const phoneIntent = intent && !isGoogleSignInIntent(intent) ? intent : undefined
    const deadline = isGoogleSignInIntent(intent) ? new Date(intent.expiresAt).getTime() : Infinity
    const create = async () => {
      const { challenges, limits, outbox, audit } = repositories
      const existing = await challenges.replay(replayKey)

      if (existing) {
        if (existing.emailKey !== emailKey || existing.intentKey !== intentKey)
          throw new IdentityError('Esta solicitação já foi usada para outros dados.', 409)

        return existing
      }

      assertOtpCooldown(
        await limits.hasRecent(emailKey, new Date(now.getTime() - otpPolicy.resendSeconds * 1000))
      )

      const ipKey = this.secrets.key('ip', ip)
      const counts = await limits.counts(
        emailKey,
        ipKey,
        new Date(now.getTime() - otpPolicy.windowSeconds * 1000)
      )

      assertOtpRequestCounts(counts)

      const id = this.secrets.id()
      const code = this.secrets.code()
      const challenge: OtpChallenge = {
        id,
        requestKey: replayKey,
        purpose: phoneIntent ? 'phone_change' : 'sign_in',
        userId: phoneIntent?.userId ?? null,
        intentKey,
        intent: intent ?? null,
        emailKey,
        email: email.value,
        browserKey: this.secrets.key('browser', browserId),
        codeHash: this.secrets.key(`code:${id}`, code),
        expiresAt: new Date(Math.min(now.getTime() + otpPolicy.lifetimeSeconds * 1000, deadline)),
        createdAt: now,
        invalidatedAt: null,
        consumedAt: null,
        attempts: 0,
      }

      await challenges.invalidatePrevious(emailKey, now)
      await challenges.append(challenge)
      const outboxId = this.secrets.id()

      await outbox.append(outboxId, id, { email: email.value, code }, now)
      await limits.record(this.secrets.id(), emailKey, ipKey, now)
      await audit.append({
        actorUserId: phoneIntent?.userId ?? null,
        entityId: phoneIntent?.userId ?? null,
        operation: 'notification_queued',
        entityVersion: phoneIntent?.version ?? null,
        requestId,
        references: { challengeId: id, outboxId },
      })

      return challenge
    }
    const challenge = await create()

    return {
      challengeId: challenge.id,
      message: otpRequestMessage,
      expiresAt: challenge.expiresAt.toISOString(),
      resendAt: new Date(
        challenge.createdAt.getTime() + otpPolicy.resendSeconds * 1000
      ).toISOString(),
    }
  }

  async resendGoogle(
    challengeId: unknown,
    email: EmailAddress,
    browserId: string,
    ip: string,
    requestKey: unknown,
    requestId: string,
    repositories: IdentityRepositories
  ) {
    if (!isIdentifier(challengeId)) throw deniedOtp()

    const challenge = await repositories.challenges.forBrowser(
      challengeId,
      this.secrets.key('browser', browserId),
      'sign_in'
    )

    if (
      !isActiveOtpChallenge(challenge, new Date()) ||
      !isGoogleSignInIntent(challenge.intent) ||
      challenge.email !== email.value ||
      challenge.intent.email !== email.value ||
      !(new Date(challenge.intent.expiresAt) > new Date()) ||
      challenge.intentKey !== this.secrets.key('otp-intent', JSON.stringify(challenge.intent))
    )
      throw deniedOtp()

    const attempt = await repositories.googleAttempts.forEmailVerification(
      challenge.intent.attemptId,
      this.secrets.key('google-browser', browserId)
    )

    if (!googleEmailProofMatches(attempt, challenge.intent, new Date())) throw deniedOtp()

    return this.request(email, browserId, ip, requestKey, requestId, repositories, challenge.intent)
  }
}
