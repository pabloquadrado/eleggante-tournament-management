import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import encryption from '@adonisjs/core/services/encryption'
import type { NotificationOutboxRepository } from '../../application/ports/identity-repositories.ts'
import type { OtpDelivery, OtpPayload } from '../../domain/identity-records.ts'

interface DeliveryRow {
  id: string
  challenge_id: string
  delivery_state: OtpDelivery['state']
  next_attempt_at: Date
  attempt_count: number
  payload_encrypted: string | null
}

function deliveryRecord(row: DeliveryRow): OtpDelivery {
  return {
    id: row.id,
    challengeId: row.challenge_id,
    state: row.delivery_state,
    nextAttemptAt: new Date(row.next_attempt_at),
    attemptCount: row.attempt_count,
    payload: row.payload_encrypted ? encryption.decrypt<OtpPayload>(row.payload_encrypted) : null,
  }
}

export class PostgresOutboxRepository implements NotificationOutboxRepository {
  constructor(private client: QueryClientContract) {}

  async find(id: string) {
    const row = await this.client.from('notification_outbox').where('id', id).first()

    return row ? deliveryRecord(row) : null
  }

  async lock(id: string) {
    return deliveryRecord(
      await this.client.from('notification_outbox').where('id', id).forUpdate().firstOrFail()
    )
  }

  async append(id: string, challengeId: string, payload: OtpPayload, now: Date) {
    await this.client.table('notification_outbox').insert({
      id,
      challenge_id: challengeId,
      payload_encrypted: encryption.encrypt(payload),
      next_attempt_at: now,
      created_at: now,
      updated_at: now,
    })
  }

  async cancelPending(challengeId: string, now: Date) {
    await this.client
      .from('notification_outbox')
      .where('challenge_id', challengeId)
      .where('delivery_state', 'pending')
      .update({ delivery_state: 'failed', payload_encrypted: null, updated_at: now })
  }

  async discard(id: string, now: Date) {
    await this.client
      .from('notification_outbox')
      .where('id', id)
      .update({ delivery_state: 'failed', payload_encrypted: null, updated_at: now })
  }

  async delivered(id: string, attempt: number, now: Date) {
    await this.client.from('notification_outbox').where('id', id).update({
      delivery_state: 'delivered',
      delivered_at: now,
      attempt_count: attempt,
      payload_encrypted: null,
      updated_at: now,
    })
  }

  async retry(id: string, attempt: number, nextAttemptAt: Date, terminal: boolean, now: Date) {
    // Retain the exact encrypted payload until delivery succeeds or permanently fails.
    await this.client
      .from('notification_outbox')
      .where('id', id)
      .update({
        delivery_state: terminal ? 'failed' : 'pending',
        ...(terminal ? { payload_encrypted: null } : {}),
        attempt_count: attempt,
        next_attempt_at: nextAttemptAt,
        updated_at: now,
      })
  }
}
