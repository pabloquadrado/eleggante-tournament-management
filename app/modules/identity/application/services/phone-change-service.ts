import { IdentityError } from '../../domain/identity-error.ts'
import { isIdentifier } from '../../domain/identifier.ts'
import { playerProfile } from '../../domain/identity-records.ts'
import { isActiveIdentity } from '../../domain/identity-actor.ts'
import { requireProfileVersion } from '../../domain/profile-version-policy.ts'
import type { IdentityRepositories } from '../ports/identity-repositories.ts'
import type { IdentitySecrets } from '../ports/identity-adapters.ts'
import type { OtpConsumptionService } from './otp-consumption-service.ts'

export class PhoneChangeService {
  constructor(
    private consumption: OtpConsumptionService,
    private secrets: IdentitySecrets
  ) {}

  async confirm(
    id: unknown,
    code: unknown,
    browserId: string,
    userId: string,
    requestId: string,
    repositories: IdentityRepositories
  ) {
    return this.consumption.consume(
      id,
      code,
      browserId,
      'phone_change',
      repositories,
      async (challenge, { players, audit }) => {
        if (challenge.userId !== userId) return null

        const intent = challenge.intent

        if (!intent || intent.userId !== userId) return null

        const player = await players.lock(userId)

        if (!isActiveIdentity(player)) return null

        requireProfileVersion(player.version, intent.version)

        await players.save(
          userId,
          { name: intent.name, username: intent.username, phone: intent.phone },
          player.version + 1,
          new Date()
        )
        await audit.append({
          actorUserId: userId,
          entityId: userId,
          operation: 'updated',
          entityVersion: player.version + 1,
          requestId,
          references: { challengeId: challenge.id },
        })

        return { data: playerProfile(await players.find(userId)) }
      }
    )
  }

  async cancel(id: unknown, browserId: string, userId: string, repositories: IdentityRepositories) {
    if (!isIdentifier(id)) throw new IdentityError('Solicitação não encontrada.', 404)

    const { challenges, outbox } = repositories
    const challenge = await challenges.forBrowser(
      id,
      this.secrets.key('browser', browserId),
      'phone_change',
      userId
    )

    if (!challenge) throw new IdentityError('Solicitação não encontrada.', 404)

    if (challenge.consumedAt)
      throw new IdentityError('Esta alteração já foi confirmada. Atualize a página.', 409)

    const now = new Date()

    await challenges.cancel(id, now)
    await outbox.cancelPending(id, now)
  }
}
