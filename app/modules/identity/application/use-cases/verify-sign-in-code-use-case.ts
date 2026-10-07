import { identityAccessFor } from '../../domain/identity-access.ts'
import { isActiveIdentity } from '../../domain/identity-actor.ts'
import { requireOtpOutcome } from '../../domain/otp-challenge-policy.ts'
import type { ConsentPolicy } from '../../domain/consent-policy.ts'
import type { IdentitySecrets, IdentitySession } from '../ports/identity-adapters.ts'
import type { IdentityUnitOfWork } from '../ports/identity-repositories.ts'
import type { OtpConsumptionService } from '../services/otp-consumption-service.ts'

export class VerifySignInCodeUseCase {
  constructor(
    private work: IdentityUnitOfWork,
    private secrets: IdentitySecrets,
    private consent: ConsentPolicy,
    private session: IdentitySession,
    private consumption: OtpConsumptionService
  ) {}

  async execute(input: {
    challengeId: unknown
    code: unknown
    browserId: string
    requestId: string
  }) {
    const { challengeId: id, code, browserId, requestId } = input
    const result = await this.work.write((repositories) =>
      this.consumption.consume(
        id,
        code,
        browserId,
        'sign_in',
        repositories,
        async (challenge, { players, sessions, audit }) => {
          if (!challenge.email) return null

          const { player, created } = await players.resolveEmail(challenge.email, this.secrets.id())

          if (!isActiveIdentity(player)) return null

          if (created)
            await audit.append({
              actorUserId: player.id,
              entityId: player.id,
              operation: 'created',
              entityVersion: player.version,
              requestId,
              references: { challengeId: challenge.id },
            })

          const access = identityAccessFor(
            player,
            await this.consent.hasCurrentAcceptance(player.id)
          )

          await this.session.establish(player.id, access, sessions)

          return { access }
        }
      )
    )
    const verified = requireOtpOutcome(result)

    this.session.activate()

    return verified
  }
}
