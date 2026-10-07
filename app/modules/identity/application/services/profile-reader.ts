import { requireActiveIdentity } from '../../domain/identity-actor.ts'
import { playerProfile } from '../../domain/identity-records.ts'
import type { IdentityQueries } from '../ports/identity-repositories.ts'

export class ProfileReader {
  constructor(private queries: IdentityQueries) {}

  async read(userId: string) {
    const player = await this.queries.player(userId)

    requireActiveIdentity(player)

    return playerProfile(player)
  }
}
