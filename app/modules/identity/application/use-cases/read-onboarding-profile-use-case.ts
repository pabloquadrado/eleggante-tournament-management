import { requireOnboardingActor } from '../../domain/identity-actor.ts'

import type { OwnProfileInput } from '../identity-input.ts'
import type { ProfileReader } from '../services/profile-reader.ts'

export class ReadOnboardingProfileUseCase {
  constructor(private profiles: ProfileReader) {}

  async execute(input: OwnProfileInput) {
    const actor = requireOnboardingActor(input.actor)

    return { data: await this.profiles.read(actor.userId), access: actor.access }
  }
}
