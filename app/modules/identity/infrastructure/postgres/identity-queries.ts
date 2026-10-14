import db from '@adonisjs/lucid/services/db'
import { IdentityQueries } from '../../application/ports/identity-repositories.ts'
import { playerRecord } from './player-repository.ts'
import { googleAttemptRecord } from './google-attempt-repository.ts'

export class PostgresIdentityQueries extends IdentityQueries {
  async googleAttempt(stateKey: string, browserKey: string) {
    const row = await db
      .from('google_auth_attempts')
      .where('state_key', stateKey)
      .where('browser_key', browserKey)
      .first()

    return row ? googleAttemptRecord(row) : null
  }
  async player(id: string) {
    return playerRecord(await db.from('users').where('id', id).firstOrFail())
  }

  async deliveryStatus(
    challengeId: string,
    browserKey: string
  ): Promise<'pending' | 'failed' | null> {
    const challenge = await db
      .from('otp_challenges')
      .where('id', challengeId)
      .where('browser_key', browserKey)
      .first()

    if (!challenge) return null

    const delivery = await db
      .from('notification_outbox')
      .where('challenge_id', challengeId)
      .firstOrFail()

    return delivery.delivery_state === 'failed' ? 'failed' : 'pending'
  }

  async pendingDeliveryIds(now: Date): Promise<string[]> {
    const rows = await db
      .from('notification_outbox')
      .select('id')
      .where('delivery_state', 'pending')
      .where('next_attempt_at', '<=', now)

    return rows.map((row) => row.id)
  }
}
