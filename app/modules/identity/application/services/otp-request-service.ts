import type { EmailAddress } from '../../domain/email-address.ts'
import { IdentityError } from '../../domain/identity-error.ts'
import { isIdentifier } from '../../domain/identifier.ts'
import {
  otpPolicy,
  otpRequestMessage,
  assertOtpCooldown,
  assertOtpRequestCounts,
} from '../../domain/otp-policy.ts'
import type { OtpChallenge, PhoneChangeIntent } from '../../domain/identity-records.ts'
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
    intent?: PhoneChangeIntent
  ) {
    if (!isIdentifier(requestKey))
      throw new IdentityError('Envie uma chave válida para esta solicitação.', 422)

    const now = new Date()
    const emailKey = this.secrets.key('email', email.value)
    const replayKey = this.secrets.key('request', `${browserId}:${requestKey}`)
    const intentKey = this.secrets.key('otp-intent', JSON.stringify(intent ?? 'sign_in'))
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
        purpose: intent ? 'phone_change' : 'sign_in',
        userId: intent?.userId ?? null,
        intentKey,
        intent: intent ?? null,
        emailKey,
        email: email.value,
        browserKey: this.secrets.key('browser', browserId),
        codeHash: this.secrets.key(`code:${id}`, code),
        expiresAt: new Date(now.getTime() + otpPolicy.lifetimeSeconds * 1000),
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
        actorUserId: intent?.userId ?? null,
        entityId: intent?.userId ?? null,
        operation: 'notification_queued',
        entityVersion: intent?.version ?? null,
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
}
