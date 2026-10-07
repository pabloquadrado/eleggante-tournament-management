import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import type { OtpRequestLimitRepository } from '../../application/ports/identity-repositories.ts'

export class PostgresRequestLimitRepository implements OtpRequestLimitRepository {
  constructor(private client: QueryClientContract) {}

  async hasRecent(emailKey: string, since: Date) {
    return Boolean(
      await this.client
        .from('otp_request_events')
        .where('email_key', emailKey)
        .where('created_at', '>', since)
        .first()
    )
  }

  async counts(emailKey: string, ipKey: string, since: Date) {
    const email = await this.client
      .from('otp_request_events')
      .where('email_key', emailKey)
      .where('created_at', '>', since)
      .count('* as count')
    const ip = await this.client
      .from('otp_request_events')
      .where('ip_key', ipKey)
      .where('created_at', '>', since)
      .count('* as count')

    return { email: Number(email[0].count), ip: Number(ip[0].count) }
  }

  async record(id: string, emailKey: string, ipKey: string, now: Date) {
    await this.client
      .table('otp_request_events')
      .insert({ id, email_key: emailKey, ip_key: ipKey, created_at: now, updated_at: now })
  }
}
