import { Job } from '@adonisjs/queue'
import db from '@adonisjs/lucid/services/db'
import DeliverOtpJob from './deliver-otp-job.js'
import { PostgresIdentityRetention } from '../modules/identity/infrastructure/postgres-identity-retention.js'

export default class DispatchOtpOutboxJob extends Job {
  async execute() {
    await new PostgresIdentityRetention().sweep()
    const rows = await db
      .from('notification_outbox')
      .select('id')
      .where('delivery_state', 'pending')
      .where('next_attempt_at', '<=', new Date())
    for (const row of rows) {
      await DeliverOtpJob.dispatch({ outboxId: row.id })
    }
  }
}
