import { Job } from '@adonisjs/queue'
import app from '@adonisjs/core/services/app'
import { OperationalEmails } from '../modules/identity/application/operational-emails.ts'

export default class DeliverOtpJob extends Job<{ outboxId: string }> {
  async execute() {
    const emails = await app.container.make(OperationalEmails)
    await emails.deliver(this.payload.outboxId)
  }
}
