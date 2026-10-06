import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import encryption from '@adonisjs/core/services/encryption'
import type { OtpChallengeRepository } from '../../application/ports/identity-repositories.ts'
import type { OtpChallenge, OtpPurpose, PhoneChangeIntent } from '../../domain/identity-records.ts'

interface ChallengeRow {
  id: string
  request_key: string
  purpose: OtpPurpose
  user_id: string | null
  intent_key: string
  intent_encrypted: string | null
  email_key: string
  email_encrypted: string | null
  browser_key: string
  code_hash: string | null
  expires_at: Date
  created_at: Date
  invalidated_at: Date | null
  consumed_at: Date | null
  attempts: number
}

function challengeRecord(row: ChallengeRow): OtpChallenge {
  return {
    id: row.id,
    requestKey: row.request_key,
    purpose: row.purpose,
    userId: row.user_id,
    intentKey: row.intent_key,
    intent: row.intent_encrypted
      ? encryption.decrypt<PhoneChangeIntent>(row.intent_encrypted)
      : null,
    emailKey: row.email_key,
    email: row.email_encrypted ? encryption.decrypt<string>(row.email_encrypted) : null,
    browserKey: row.browser_key,
    codeHash: row.code_hash,
    expiresAt: new Date(row.expires_at),
    createdAt: new Date(row.created_at),
    invalidatedAt: row.invalidated_at,
    consumedAt: row.consumed_at,
    attempts: row.attempts,
  }
}

export class PostgresChallengeRepository implements OtpChallengeRepository {
  constructor(private client: QueryClientContract) {}

  async replay(requestKey: string) {
    const row = await this.client.from('otp_challenges').where('request_key', requestKey).first()
    return row ? challengeRecord(row) : null
  }

  async forBrowser(id: string, browserKey: string, purpose: OtpPurpose, userId?: string) {
    const query = this.client
      .from('otp_challenges')
      .where('id', id)
      .where('browser_key', browserKey)
      .where('purpose', purpose)
    if (userId) query.where('user_id', userId)
    const row = await query.forUpdate().first()
    return row ? challengeRecord(row) : null
  }

  async forDelivery(id: string) {
    return challengeRecord(
      await this.client.from('otp_challenges').where('id', id).forUpdate().firstOrFail()
    )
  }

  async append(challenge: OtpChallenge) {
    await this.client.table('otp_challenges').insert({
      id: challenge.id,
      request_key: challenge.requestKey,
      purpose: challenge.purpose,
      user_id: challenge.userId,
      intent_key: challenge.intentKey,
      intent_encrypted: challenge.intent ? encryption.encrypt(challenge.intent) : null,
      email_key: challenge.emailKey,
      email_encrypted: encryption.encrypt(challenge.email),
      browser_key: challenge.browserKey,
      code_hash: challenge.codeHash,
      expires_at: challenge.expiresAt,
      created_at: challenge.createdAt,
      updated_at: challenge.createdAt,
    })
  }

  async invalidatePrevious(emailKey: string, now: Date) {
    await this.client
      .from('otp_challenges')
      .where('email_key', emailKey)
      .whereNull('consumed_at')
      .whereNull('invalidated_at')
      .update({ invalidated_at: now, updated_at: now })
  }

  async cancel(id: string, now: Date) {
    await this.client.from('otp_challenges').where('id', id).update({
      invalidated_at: now,
      email_encrypted: null,
      intent_encrypted: null,
      code_hash: null,
      updated_at: now,
    })
  }

  async consume(id: string, now: Date) {
    await this.client
      .from('otp_challenges')
      .where('id', id)
      .update({ consumed_at: now, intent_encrypted: null, updated_at: now })
  }

  async recordFailure(id: string, attempts: number, now: Date) {
    await this.client.from('otp_challenges').where('id', id).update({ attempts, updated_at: now })
  }

  async invalidate(id: string, now: Date) {
    await this.client
      .from('otp_challenges')
      .where('id', id)
      .update({ invalidated_at: now, updated_at: now })
  }
}
