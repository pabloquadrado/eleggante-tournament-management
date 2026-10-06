import db from '@adonisjs/lucid/services/db'
import { IdentityRetentionRepository } from '../../application/ports/identity-repositories.ts'
import { lockIdentityWrites } from './identity-write-lock.ts'

export class PostgresIdentityRetention extends IdentityRetentionRepository {
  async clean({
    now,
    requestCutoff,
    replayCutoff,
  }: {
    now: Date
    requestCutoff: Date
    replayCutoff: Date
  }) {
    await db.transaction(async (transaction) => {
      await lockIdentityWrites(transaction)
      const terminal = transaction
        .from('otp_challenges')
        .select('id')
        .where((query) => {
          query
            .where('expires_at', '<=', now)
            .orWhereNotNull('consumed_at')
            .orWhereNotNull('invalidated_at')
        })
      // Always lock challenges before their outbox rows, as delivery does.
      await transaction.from('otp_challenges').whereIn('id', terminal.clone()).update({
        email_encrypted: null,
        intent_encrypted: null,
        code_hash: null,
        updated_at: now,
      })
      await transaction
        .from('notification_outbox')
        .whereIn('challenge_id', terminal.clone())
        .where('delivery_state', 'pending')
        .update({ delivery_state: 'failed', payload_encrypted: null, updated_at: now })
      await transaction.from('otp_request_events').where('created_at', '<=', requestCutoff).delete()
      await transaction.from('profile_commands').where('created_at', '<=', replayCutoff).delete()
      const old = transaction
        .from('otp_challenges')
        .select('id')
        .where('expires_at', '<=', replayCutoff)
      await transaction.from('notification_outbox').whereIn('challenge_id', old.clone()).delete()
      await transaction.from('otp_challenges').whereIn('id', old).delete()
    })
  }
}
