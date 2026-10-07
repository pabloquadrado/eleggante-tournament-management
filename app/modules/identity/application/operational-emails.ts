import { otpPolicy } from '../domain/otp-policy.ts'
import { type OtpDeliveryQueue, type OtpMailTransport } from './ports/identity-adapters.ts'
import {
  type IdentityQueries,
  type IdentityRetentionRepository,
  type IdentityUnitOfWork,
} from './ports/identity-repositories.ts'

const deliveryPolicy = {
  maxAttempts: 5,
  backoffSeconds: 30,
  replayRetentionMilliseconds: 24 * 60 * 60 * 1000,
} as const

export class OperationalEmails {
  constructor(
    private work: IdentityUnitOfWork,
    private queries: IdentityQueries,
    private retention: IdentityRetentionRepository,
    private transport: OtpMailTransport,
    private queue: OtpDeliveryQueue
  ) {}

  async dispatchPending() {
    const now = new Date()

    await this.retention.clean({
      now,
      requestCutoff: new Date(now.getTime() - otpPolicy.windowSeconds * 1000),
      replayCutoff: new Date(now.getTime() - deliveryPolicy.replayRetentionMilliseconds),
    })

    for (const id of await this.queries.pendingDeliveryIds(now)) await this.queue.enqueue(id)
  }

  async deliver(id: string) {
    await this.work.delivery(async ({ challenges, outbox }) => {
      const reference = await outbox.find(id)

      if (!reference) return

      // All implementations lock the challenge before its outbox row.
      const challenge = await challenges.forDelivery(reference.challengeId)
      const delivery = await outbox.lock(id)
      const now = new Date()

      if (delivery.state !== 'pending' || delivery.nextAttemptAt > now) return

      if (challenge.invalidatedAt || challenge.consumedAt || challenge.expiresAt <= now) {
        await outbox.discard(id, now)

        return
      }

      const result = delivery.payload
        ? await this.transport.send(id, delivery.payload)
        : 'permanent_failure'
      const attempt = delivery.attemptCount + 1

      if (result === 'sent') {
        await outbox.delivered(id, attempt, now)

        return
      }

      const terminal = result === 'permanent_failure' || attempt >= deliveryPolicy.maxAttempts

      await outbox.retry(
        id,
        attempt,
        new Date(now.getTime() + deliveryPolicy.backoffSeconds * 2 ** (attempt - 1) * 1000),
        terminal,
        now
      )

      if (terminal) await challenges.invalidate(challenge.id, now)
    })
  }
}
