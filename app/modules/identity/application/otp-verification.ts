import { IdentityError } from '../domain/identity-error.ts'
import { isIdentifier } from '../domain/identifier.ts'
import { identityAccessFor } from '../domain/identity-access.ts'
import { otpPolicy } from '../domain/otp-policy.ts'
import { playerProfile, type OtpChallenge, type OtpPurpose } from '../domain/identity-records.ts'
import { type ConsentPolicy } from './consent-policy.ts'
import { type IdentitySecrets, type IdentitySession } from './ports/identity-adapters.ts'
import {
  type IdentityUnitOfWork,
  type IdentityRepositories,
} from './ports/identity-repositories.ts'

const denied = () =>
  new IdentityError('Código inválido ou expirado. Solicite um novo código.', 422, 'code')

export class OtpVerification {
  constructor(
    private work: IdentityUnitOfWork,
    private secrets: IdentitySecrets,
    private consent: ConsentPolicy
  ) {}

  async verify(
    id: unknown,
    code: unknown,
    browserId: string,
    session: IdentitySession,
    requestId: string
  ) {
    const result = await this.consume(
      id,
      code,
      browserId,
      'sign_in',
      async (challenge, { players, sessions, audit }) => {
        if (!challenge.email) return null
        const { player, created } = await players.resolveEmail(challenge.email, this.secrets.id())
        if (player.status !== 'active') return null
        if (created)
          await audit.append({
            actorUserId: player.id,
            entityId: player.id,
            operation: 'created',
            entityVersion: player.version,
            requestId,
            references: { challengeId: challenge.id },
          })
        const access = identityAccessFor(player, await this.consent.hasCurrentAcceptance(player.id))
        await session.establish(player.id, access, sessions)
        return { access }
      }
    )
    session.activate()
    return result
  }

  async confirmPhone(
    id: unknown,
    code: unknown,
    browserId: string,
    userId: string,
    requestId: string
  ) {
    return this.consume(
      id,
      code,
      browserId,
      'phone_change',
      async (challenge, { players, audit }) => {
        if (challenge.userId !== userId) return null
        const intent = challenge.intent
        if (!intent || intent.userId !== userId) return null
        const player = await players.lock(userId)
        if (player.status !== 'active') return null
        if (player.version !== intent.version)
          throw new IdentityError(
            'Seu perfil foi alterado. Atualize a página antes de salvar.',
            409
          )
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

  private async consume<Result>(
    id: unknown,
    code: unknown,
    browserId: string,
    purpose: OtpPurpose,
    action: (challenge: OtpChallenge, repositories: IdentityRepositories) => Promise<Result | null>
  ) {
    if (!isIdentifier(id) || typeof code !== 'string') throw denied()
    const result = await this.work.write(async (repositories) => {
      const { challenges } = repositories
      const challenge = await challenges.forBrowser(
        id,
        this.secrets.key('browser', browserId),
        purpose
      )
      const now = new Date()
      if (
        !challenge ||
        challenge.invalidatedAt ||
        challenge.consumedAt ||
        challenge.expiresAt <= now ||
        challenge.attempts >= otpPolicy.maxAttempts
      )
        return null
      const matches =
        /^\d{6}$/.test(code) && this.secrets.matchesCode(id, code, challenge.codeHash!)
      if (!matches) {
        await challenges.recordFailure(id, challenge.attempts + 1, now)
        return null
      }
      const outcome = await action(challenge, repositories)
      if (!outcome) return null
      await challenges.consume(id, now)
      return outcome
    })
    if (!result) throw denied()
    return result
  }
}
