import { otpPolicy } from '../../domain/otp-policy.ts'
import { deliveryPolicy } from '../../domain/otp-delivery-policy.ts'
import type { OtpDeliveryQueue } from '../ports/identity-adapters.ts'
import type {
  IdentityQueries,
  IdentityRetentionRepository,
} from '../ports/identity-repositories.ts'

export class DispatchPendingOtpEmailsUseCase {
  constructor(
    private queries: IdentityQueries,
    private retention: IdentityRetentionRepository,
    private queue: OtpDeliveryQueue
  ) {}

  async execute(_input: Record<string, never>): Promise<void> {
    const now = new Date()

    await this.retention.clean({
      now,
      requestCutoff: new Date(now.getTime() - otpPolicy.windowSeconds * 1000),
      replayCutoff: new Date(now.getTime() - deliveryPolicy.replayRetentionMilliseconds),
    })

    for (const id of await this.queries.pendingDeliveryIds(now)) await this.queue.enqueue(id)
  }
}
