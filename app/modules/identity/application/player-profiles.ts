import { IdentityError } from '../domain/identity-error.ts'
import { PlayerProfileInput } from '../domain/player-profile-input.ts'
import { EmailAddress } from '../domain/email-address.ts'
import { isIdentifier } from '../domain/identifier.ts'
import { playerProfile, type ProfileUpdateResult } from '../domain/identity-records.ts'
import { type IdentitySecrets } from './ports/identity-adapters.ts'
import { type IdentityQueries, type IdentityUnitOfWork } from './ports/identity-repositories.ts'
import { type OtpRequests } from './otp-requests.ts'

export class PlayerProfiles {
  constructor(
    private work: IdentityUnitOfWork,
    private queries: IdentityQueries,
    private secrets: IdentitySecrets,
    private requests: OtpRequests
  ) {}

  async read(id: string) {
    return playerProfile(await this.queries.player(id))
  }

  async update(
    id: string,
    input: Record<string, unknown>,
    key: unknown,
    context: { browserId: string; ip: string; requestId: string }
  ): Promise<ProfileUpdateResult> {
    const profile = PlayerProfileInput.parse(input)

    if (!isIdentifier(key)) throw new IdentityError('Envie uma chave válida para esta solicitação.')

    if (!Number.isInteger(input.version) || Number(input.version) < 1)
      throw new IdentityError('Informe a versão atual do perfil.', 422, 'version')

    const commandId = this.secrets.key('profile-command', `${id}:${key}`)
    const fingerprint = this.secrets.key(
      'profile-input',
      JSON.stringify({ ...profile, version: input.version })
    )

    return this.work.write(async (repositories) => {
      const { players, commands, audit } = repositories
      const player = await players.lock(id)

      if (player.status !== 'active') throw new IdentityError('Entre para continuar.', 401)

      const replay = await commands.find(commandId)

      if (replay) {
        if (replay.fingerprint !== fingerprint)
          throw new IdentityError('Esta solicitação já foi usada para outros dados.', 409)

        return replay.response
      }

      if (player.version !== input.version)
        throw new IdentityError('Seu perfil foi alterado. Atualize a página antes de salvar.', 409)

      const now = new Date()

      if (player.phone && player.phone !== profile.phone) {
        const receipt = await this.requests.request(
          EmailAddress.parse(player.email),
          context.browserId,
          context.ip,
          key,
          context.requestId,
          { ...profile, userId: id, version: player.version },
          repositories
        )
        const pending = { ...receipt, phoneVerificationRequired: true as const }

        await commands.save(commandId, id, fingerprint, pending, now)

        return pending
      }

      await players.save(id, profile, player.version + 1, now)
      const saved = { data: playerProfile(await players.find(id)) }

      await audit.append({
        actorUserId: id,
        entityId: id,
        operation: 'updated',
        entityVersion: player.version + 1,
        requestId: context.requestId,
        references: {},
      })
      await commands.save(commandId, id, fingerprint, saved, now)

      return saved
    })
  }
}
