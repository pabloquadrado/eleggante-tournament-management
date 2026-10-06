import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import encryption from '@adonisjs/core/services/encryption'
import { type EmailAddress } from '../domain/email-address.js'
import { otpPolicy, otpRequestMessage } from '../domain/otp-policy.js'
import { generateCode, protectedKey } from './otp-cryptography.js'
import { IdentityError } from '../domain/identity-error.js'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { lockIdentityWrites } from './identity-write-lock.js'
import { isIdentifier } from '../domain/identifier.js'
import { appendIdentityAudit } from './postgres-identity-audit.js'

export interface PhoneChangeIntent {
  userId: string
  version: number
  name: string
  username: string
  phone: string
}

export class PostgresOtpRequests {
  async cancelPhone(id: unknown, browserId: string, userId: string) {
    if (!isIdentifier(id)) throw new IdentityError('Solicitação não encontrada.', 404)
    await db.transaction(async (transaction) => {
      await lockIdentityWrites(transaction)
      const challenge = await transaction
        .from('otp_challenges')
        .where('id', id)
        .where('browser_key', protectedKey('browser', browserId))
        .where('user_id', userId)
        .where('purpose', 'phone_change')
        .forUpdate()
        .first()
      if (!challenge) throw new IdentityError('Solicitação não encontrada.', 404)
      if (challenge.consumed_at)
        throw new IdentityError('Esta alteração já foi confirmada. Atualize a página.', 409)
      const now = new Date()
      await transaction.from('otp_challenges').where('id', id).update({
        invalidated_at: now,
        email_encrypted: null,
        intent_encrypted: null,
        code_hash: null,
        updated_at: now,
      })
      await transaction
        .from('notification_outbox')
        .where('challenge_id', id)
        .where('delivery_state', 'pending')
        .update({ delivery_state: 'failed', payload_encrypted: null, updated_at: now })
    })
  }

  async status(id: string, browserId: string) {
    if (!isIdentifier(id)) throw new IdentityError('Solicitação não encontrada.', 404)
    const challenge = await db
      .from('otp_challenges')
      .where('id', id)
      .where('browser_key', protectedKey('browser', browserId))
      .first()
    if (!challenge) throw new IdentityError('Solicitação não encontrada.', 404)
    const delivery = await db.from('notification_outbox').where('challenge_id', id).firstOrFail()
    if (delivery.delivery_state === 'failed') {
      return {
        state: 'failed',
        message:
          'Não foi possível entregar o código. Confira o e-mail informado e tente novamente.',
      }
    }
    return {
      state: 'pending',
      message:
        'Confira sua caixa de entrada e a pasta de spam. Se o código não chegar, confira o e-mail informado.',
    }
  }

  async request(
    email: EmailAddress,
    browserId: string,
    ip: string,
    requestKey: unknown,
    requestId: string,
    intent?: PhoneChangeIntent,
    parent?: TransactionClientContract
  ) {
    if (!isIdentifier(requestKey)) {
      throw new IdentityError('Envie uma chave válida para esta solicitação.', 422)
    }
    const now = new Date()
    const expiresAt = new Date(now.getTime() + otpPolicy.lifetimeSeconds * 1000)
    const id = randomUUID()
    const code = generateCode()
    const emailKey = protectedKey('email', email.value)
    const ipKey = protectedKey('ip', ip)
    const replayKey = protectedKey('request', `${browserId}:${requestKey}`)
    const intentKey = protectedKey('otp-intent', JSON.stringify(intent ?? 'sign_in'))
    const execute = async (transaction: TransactionClientContract) => {
      await lockIdentityWrites(transaction)
      const existing = await transaction
        .from('otp_challenges')
        .where('request_key', replayKey)
        .first()
      if (existing) {
        if (existing.email_key !== emailKey || existing.intent_key !== intentKey) {
          throw new IdentityError('Esta solicitação já foi usada para outros dados.', 409)
        }
        return existing
      }
      const recent = await transaction
        .from('otp_request_events')
        .where('email_key', emailKey)
        .where('created_at', '>', new Date(now.getTime() - otpPolicy.resendSeconds * 1000))
        .first()
      if (recent) {
        throw new IdentityError('Aguarde um pouco antes de solicitar outro código.', 429)
      }
      const windowStart = new Date(now.getTime() - otpPolicy.windowSeconds * 1000)
      const emailCount = await transaction
        .from('otp_request_events')
        .where('email_key', emailKey)
        .where('created_at', '>', windowStart)
        .count('* as count')
      const ipCount = await transaction
        .from('otp_request_events')
        .where('ip_key', ipKey)
        .where('created_at', '>', windowStart)
        .count('* as count')
      if (
        Number(emailCount[0].count) >= otpPolicy.emailRequestLimit ||
        Number(ipCount[0].count) >= otpPolicy.ipRequestLimit
      ) {
        throw new IdentityError('Aguarde um pouco antes de solicitar outro código.', 429)
      }
      await transaction
        .from('otp_challenges')
        .where('email_key', emailKey)
        .whereNull('consumed_at')
        .whereNull('invalidated_at')
        .update({ invalidated_at: now, updated_at: now })
      await transaction.table('otp_challenges').insert({
        id,
        request_key: replayKey,
        purpose: intent ? 'phone_change' : 'sign_in',
        user_id: intent?.userId,
        intent_key: intentKey,
        intent_encrypted: intent ? encryption.encrypt(intent) : null,
        email_key: emailKey,
        email_encrypted: encryption.encrypt(email.value),
        browser_key: protectedKey('browser', browserId),
        code_hash: protectedKey(`code:${id}`, code),
        expires_at: expiresAt,
        created_at: now,
        updated_at: now,
      })
      const outboxId = randomUUID()
      await transaction.table('notification_outbox').insert({
        id: outboxId,
        challenge_id: id,
        payload_encrypted: encryption.encrypt({ email: email.value, code }),
        next_attempt_at: now,
        created_at: now,
        updated_at: now,
      })
      await transaction.table('otp_request_events').insert({
        id: randomUUID(),
        email_key: emailKey,
        ip_key: ipKey,
        created_at: now,
        updated_at: now,
      })
      await appendIdentityAudit(transaction, {
        actorUserId: intent?.userId ?? null,
        entityId: intent?.userId ?? null,
        operation: 'notification_queued',
        entityVersion: intent?.version ?? null,
        requestId,
        references: { challengeId: id, outboxId },
      })
      return { id, created_at: now, expires_at: expiresAt }
    }
    const challenge = parent ? await execute(parent) : await db.transaction(execute)
    return {
      challengeId: challenge.id,
      message: otpRequestMessage,
      expiresAt: new Date(challenge.expires_at).toISOString(),
      resendAt: new Date(
        new Date(challenge.created_at).getTime() + otpPolicy.resendSeconds * 1000
      ).toISOString(),
    }
  }
}
