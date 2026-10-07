import { deliveryPolicy } from '../../domain/otp-delivery-policy.ts'
import { isActiveOtpChallenge } from '../../domain/otp-challenge-policy.ts'
import type { OtpMailTransport } from '../ports/identity-adapters.ts'
import type { IdentityUnitOfWork } from '../ports/identity-repositories.ts'

export class DeliverOtpEmailUseCase {
  constructor(
    private work: IdentityUnitOfWork,
    private transport: OtpMailTransport
  ) {}

  async execute(input: { outboxId: string }): Promise<void> {
    const id = input.outboxId

    await this.work.delivery(async ({ challenges, outbox }) => {
      const reference = await outbox.find(id)

      if (!reference) return

      // All implementations lock the challenge before its outbox row.
      const challenge = await challenges.forDelivery(reference.challengeId)
      const delivery = await outbox.lock(id)
      const now = new Date()

      if (delivery.state !== 'pending' || delivery.nextAttemptAt > now) return

      if (!isActiveOtpChallenge(challenge, now)) {
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
