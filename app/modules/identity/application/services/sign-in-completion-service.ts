import { identityAccessFor } from '../../domain/identity-access.ts'
import { isActiveIdentity } from '../../domain/identity-actor.ts'
import type { ConsentPolicy } from '../../domain/consent-policy.ts'
import type { PlayerRecord } from '../../domain/identity-records.ts'
import type { IdentitySession } from '../ports/identity-adapters.ts'
import type { IdentityRepositories } from '../ports/identity-repositories.ts'

/** Participates in the caller's transaction; session activation follows its commit. */
export class SignInCompletionService {
  constructor(private consent: ConsentPolicy) {}

  async complete(
    input: {
      player: PlayerRecord
      created: boolean
      requestId: string
      references: Record<string, string>
    },
    { sessions, audit }: Pick<IdentityRepositories, 'sessions' | 'audit'>,
    session: IdentitySession
  ) {
    const { player, created, requestId, references } = input

    if (!isActiveIdentity(player)) return null

    if (created)
      await audit.append({
        actorUserId: player.id,
        entityId: player.id,
        operation: 'created',
        entityVersion: player.version,
        requestId,
        references,
      })

    const access = identityAccessFor(player, await this.consent.hasCurrentAcceptance(player.id))

    await session.establish(player.id, access, sessions)

    return { access }
  }
}
