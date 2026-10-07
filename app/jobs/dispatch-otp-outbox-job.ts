import { Job } from '@adonisjs/queue'
import app from '@adonisjs/core/services/app'
import { DispatchPendingOtpEmailsUseCase } from '../modules/identity/application/use-cases/dispatch-pending-otp-emails-use-case.ts'

export default class DispatchOtpOutboxJob extends Job {
  async execute() {
    const emails = await app.container.make(DispatchPendingOtpEmailsUseCase)

    await emails.execute({})
  }
}
