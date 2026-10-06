import { randomUUID, timingSafeEqual } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import encryption from '@adonisjs/core/services/encryption'
import app from '@adonisjs/core/services/app'
import { IdentityError } from '../domain/identity-error.js'
import { otpPolicy } from '../domain/otp-policy.js'
import { ConsentPolicy } from '../application/consent-policy.js'
import { protectedKey } from './otp-cryptography.js'
import { type PostgresIdentitySession } from './postgres-identity-session.js'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { lockIdentityWrites } from './identity-write-lock.js'
import type { PhoneChangeIntent } from './postgres-otp-requests.js'
import { profileProjection } from './postgres-player-profile.js'
import { isIdentifier } from '../domain/identifier.js'
import { identityAccessFor } from '../domain/identity-access.js'
import { appendIdentityAudit } from './postgres-identity-audit.js'

const denied = () =>
  new IdentityError('Código inválido ou expirado. Solicite um novo código.', 422, 'code')

interface ChallengeRecord {
  id: string
  email_encrypted: string
  intent_encrypted: string
  user_id: string
}

export class PostgresOtpVerification {
  async verify(
    id: unknown,
    code: unknown,
    browserId: string,
    identitySession: PostgresIdentitySession,
    requestId: string
  ) {
    const result = await this.consume(
      id,
      code,
      browserId,
      'sign_in',
      async (challenge, transaction) => {
        const email = encryption.decrypt<string>(challenge.email_encrypted)
        if (!email) return null
        const inserted = await transaction
          .table('users')
          .insert({ id: randomUUID(), email })
          .onConflict('email')
          .ignore()
          .returning('id')
        const user = await transaction.from('users').where('email', email).firstOrFail()
        if (user.status !== 'active') return null
        if (inserted.length > 0) {
          await appendIdentityAudit(transaction, {
            actorUserId: user.id,
            entityId: user.id,
            operation: 'created',
            entityVersion: user.version,
            requestId,
            references: { challengeId: challenge.id },
          })
        }
        const consent = await app.container.make(ConsentPolicy)
        const accepted = await consent.hasCurrentAcceptance(user.id)
        const access = identityAccessFor(user, accepted)
        await identitySession.establish(user.id, access, transaction)
        return { access }
      }
    )
    identitySession.activate()
    return result
  }

  async confirmPhone(
    id: unknown,
    code: unknown,
    browserId: string,
    userId: string,
    requestId: string
  ) {
    try {
      return await this.consume(
        id,
        code,
        browserId,
        'phone_change',
        async (challenge, transaction) => {
          if (challenge.user_id !== userId) return null
          const intent = encryption.decrypt<PhoneChangeIntent>(challenge.intent_encrypted)
          if (!intent || intent.userId !== userId) return null
          const user = await transaction.from('users').where('id', userId).forUpdate().firstOrFail()
          if (user.status !== 'active') return null
          if (user.version !== intent.version)
            throw new IdentityError(
              'Seu perfil foi alterado. Atualize a página antes de salvar.',
              409
            )
          await transaction
            .from('users')
            .where('id', userId)
            .update({
              name: intent.name,
              username: intent.username,
              phone: intent.phone,
              version: user.version + 1,
              updated_at: new Date(),
            })
          await appendIdentityAudit(transaction, {
            actorUserId: userId,
            entityId: userId,
            operation: 'updated',
            entityVersion: user.version + 1,
            requestId,
            references: { challengeId: challenge.id },
          })
          return {
            data: profileProjection(
              await transaction.from('users').where('id', userId).firstOrFail()
            ),
          }
        }
      )
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

  private async consume<Result>(
    id: unknown,
    code: unknown,
    browserId: string,
    purpose: 'sign_in' | 'phone_change',
    action: (
      challenge: ChallengeRecord,
      transaction: TransactionClientContract
    ) => Promise<Result | null>
  ) {
    if (!isIdentifier(id) || typeof code !== 'string') throw denied()
    const result = await db.transaction(async (transaction) => {
      await lockIdentityWrites(transaction)
      const challenge = await transaction
        .from('otp_challenges')
        .where('id', id)
        .where('browser_key', protectedKey('browser', browserId))
        .where('purpose', purpose)
        .forUpdate()
        .first()
      const now = new Date()
      if (
        !challenge ||
        challenge.invalidated_at ||
        challenge.consumed_at ||
        new Date(challenge.expires_at) <= now ||
        challenge.attempts >= otpPolicy.maxAttempts
      )
        return null
      const matches =
        /^\d{6}$/.test(code) &&
        timingSafeEqual(
          Buffer.from(challenge.code_hash, 'hex'),
          Buffer.from(protectedKey(`code:${id}`, code), 'hex')
        )
      if (!matches) {
        await transaction
          .from('otp_challenges')
          .where('id', id)
          .update({ attempts: challenge.attempts + 1, updated_at: now })
        return null
      }
      const outcome = await action(challenge, transaction)
      if (!outcome) return null
      await transaction
        .from('otp_challenges')
        .where('id', id)
        .update({ consumed_at: now, intent_encrypted: null, updated_at: now })
      return outcome
    })
    if (!result) throw denied()
    return result
  }
}
