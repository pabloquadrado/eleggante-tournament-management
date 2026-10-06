import { Job } from '@adonisjs/queue'
import { PostgresOtpDeliveries } from '../modules/identity/infrastructure/postgres-otp-deliveries.js'

export default class DeliverOtpJob extends Job<{ outboxId: string }> {
  async execute() {
    await new PostgresOtpDeliveries().deliver(this.payload.outboxId)
  }
}
