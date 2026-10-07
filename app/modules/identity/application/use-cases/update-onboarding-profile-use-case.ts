import { requireOnboardingActor } from '../../domain/identity-actor.ts'

import { requestClientAddress } from '../../domain/request-client-address.ts'
import type { ProfileUpdateInput } from '../identity-input.ts'
import type { IdentityUnitOfWork } from '../ports/identity-repositories.ts'
import type { ProfileUpdateService } from '../services/profile-update-service.ts'

export class UpdateOnboardingProfileUseCase {
  constructor(
    private work: IdentityUnitOfWork,
    private profiles: ProfileUpdateService
  ) {}

  async execute(input: ProfileUpdateInput) {
    const actor = requireOnboardingActor(input.actor)

    return this.work.write((repositories) =>
      this.profiles.update(
        actor.userId,
        input.data,
        input.key,
        {
          browserId: input.browserId,
          ip: requestClientAddress(input.clientAddress),
          requestId: input.requestId,
        },
        repositories
      )
    )
  }
}
