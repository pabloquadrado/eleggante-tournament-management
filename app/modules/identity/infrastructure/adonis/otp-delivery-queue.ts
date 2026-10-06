import DeliverOtpJob from '../../../../jobs/deliver-otp-job.ts'
import { OtpDeliveryQueue } from '../../application/ports/identity-adapters.ts'

export class AdonisOtpDeliveryQueue extends OtpDeliveryQueue {
  async enqueue(outboxId: string) {
    await DeliverOtpJob.dispatch({ outboxId })
  }
}
