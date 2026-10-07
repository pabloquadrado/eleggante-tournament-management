import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

export default class ScheduleOutbox extends BaseCommand {
  static commandName = 'outbox:schedule'
  static description = 'Schedule recovery and delivery of committed operational emails'
  static options: CommandOptions = { startApp: true }

  async run() {
    const { default: DispatchOtpOutboxJob } = await import('../app/jobs/dispatch-otp-outbox-job.ts')

    await DispatchOtpOutboxJob.schedule({}).id('otp-outbox-recovery').every('5s')
  }
}
