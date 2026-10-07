import { Job } from '@adonisjs/queue'
import app from '@adonisjs/core/services/app'
import { DeliverOtpEmailUseCase } from '../modules/identity/application/use-cases/deliver-otp-email-use-case.ts'

export default class DeliverOtpJob extends Job<{ outboxId: string }> {
  async execute() {
    const emails = await app.container.make(DeliverOtpEmailUseCase)

    await emails.execute({ outboxId: this.payload.outboxId })
  }
}
