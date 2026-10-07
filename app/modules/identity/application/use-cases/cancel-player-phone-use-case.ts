import { requirePlayerActor } from '../../domain/identity-actor.ts'

import type { PhoneCancellationInput } from '../identity-input.ts'
import type { IdentityUnitOfWork } from '../ports/identity-repositories.ts'
import type { PhoneChangeService } from '../services/phone-change-service.ts'

export class CancelPlayerPhoneUseCase {
  constructor(
    private work: IdentityUnitOfWork,
    private phones: PhoneChangeService
  ) {}

  async execute(input: PhoneCancellationInput): Promise<void> {
    const actor = requirePlayerActor(input.actor)

    await this.work.write((repositories) =>
      this.phones.cancel(input.challengeId, input.browserId, actor.userId, repositories)
    )
  }
}
