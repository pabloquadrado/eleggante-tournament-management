import db from '@adonisjs/lucid/services/db'
import encryption from '@adonisjs/core/services/encryption'
import { IdentityError } from '../domain/identity-error.js'
import { PlayerProfileInput } from '../domain/player-profile-input.js'
import { protectedKey } from './otp-cryptography.js'
import { lockIdentityWrites } from './identity-write-lock.js'
import { PostgresOtpRequests } from './postgres-otp-requests.js'
import { EmailAddress } from '../domain/email-address.js'
import { isIdentifier } from '../domain/identifier.js'
import { appendIdentityAudit } from './postgres-identity-audit.js'

interface ProfileRecord {
  id: string
  arena_id: string
  email: string | null
  name: string | null
  username: string | null
  phone: string | null
  version: number
  status: 'active' | 'anonymized'
  created_at: Date
  updated_at: Date
}

export function profileProjection(user: ProfileRecord) {
  return {
    id: user.id,
    arenaId: user.arena_id,
    email: user.email,
    name: user.name,
    username: user.username,
    phone: user.phone,
    version: user.version,
    state: user.status,
    createdAt: new Date(user.created_at).toISOString(),
    updatedAt: new Date(user.updated_at).toISOString(),
  }
}

type ProfileUpdateResult =
  | { data: ReturnType<typeof profileProjection> }
  | (Awaited<ReturnType<PostgresOtpRequests['request']>> & { phoneVerificationRequired: true })

export class PostgresPlayerProfile {
  async read(id: string) {
    const user = await db.from('users').where('id', id).firstOrFail()
    return profileProjection(user)
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
    const commandId = protectedKey('profile-command', `${id}:${key}`)
    const fingerprint = protectedKey(
      'profile-input',
      JSON.stringify({ ...profile, version: input.version })
    )
    try {
      return await db.transaction(async (transaction) => {
        await lockIdentityWrites(transaction)
        const user = await transaction.from('users').where('id', id).forUpdate().firstOrFail()
        if (user.status !== 'active') throw new IdentityError('Entre para continuar.', 401)
        const replay = await transaction.from('profile_commands').where('id', commandId).first()
        if (replay) {
          if (replay.fingerprint !== fingerprint)
            throw new IdentityError('Esta solicitação já foi usada para outros dados.', 409)
          return encryption.decrypt<ProfileUpdateResult>(replay.response_encrypted)!
        }
        if (user.version !== input.version)
          throw new IdentityError(
            'Seu perfil foi alterado. Atualize a página antes de salvar.',
            409
          )
        const now = new Date()
        if (user.phone && user.phone !== profile.phone) {
          const challenge = await new PostgresOtpRequests().request(
            EmailAddress.parse(user.email),
            context.browserId,
            context.ip,
            key,
            context.requestId,
            { ...profile, userId: id, version: user.version },
            transaction
          )
          const pending = { ...challenge, phoneVerificationRequired: true as const }
          await transaction.table('profile_commands').insert({
            id: commandId,
            user_id: id,
            fingerprint,
            response_encrypted: encryption.encrypt(pending),
            created_at: now,
            updated_at: now,
          })
          return pending
        }
        await transaction
          .from('users')
          .where('id', id)
          .update({ ...profile, version: user.version + 1, updated_at: now })
        const saved = {
          data: profileProjection(await transaction.from('users').where('id', id).firstOrFail()),
        }
        await appendIdentityAudit(transaction, {
          actorUserId: id,
          entityId: id,
          operation: 'updated',
          entityVersion: user.version + 1,
          requestId: context.requestId,
          references: {},
        })
        await transaction.table('profile_commands').insert({
          id: commandId,
          user_id: id,
          fingerprint,
          response_encrypted: encryption.encrypt(saved),
          created_at: now,
          updated_at: now,
        })
        return saved
      })
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      ) {
        throw new IdentityError('Este nome de usuário já está em uso.', 422, 'username')
      }
      throw error
    }
  }
}
