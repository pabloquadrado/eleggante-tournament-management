import { requirePlayerActor } from '../../domain/identity-actor.ts'

import { requireOtpOutcome } from '../../domain/otp-challenge-policy.ts'
import type { PhoneConfirmationInput } from '../identity-input.ts'
import type { IdentityUnitOfWork } from '../ports/identity-repositories.ts'
import type { PhoneChangeService } from '../services/phone-change-service.ts'

export class ConfirmPlayerPhoneUseCase {
  constructor(
    private work: IdentityUnitOfWork,
    private phones: PhoneChangeService
  ) {}

  async execute(input: PhoneConfirmationInput) {
    const actor = requirePlayerActor(input.actor)
    const result = await this.work.write((repositories) =>
      this.phones.confirm(
        input.challengeId,
        input.code,
        input.browserId,
        actor.userId,
        input.requestId,
        repositories
      )
    )

    return requireOtpOutcome(result)
  }
}
