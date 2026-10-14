import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import type { AuthIdentityRepository } from '../../application/ports/identity-repositories.ts'

export class PostgresAuthIdentityRepository implements AuthIdentityRepository {
  constructor(private client: QueryClientContract) {}

  async findGoogle(subject: string) {
    const row = await this.client
      .from('auth_identities')
      .where('provider', 'google')
      .where('provider_subject', subject)
      .first()

    return row ? { id: row.id, userId: row.user_id } : null
  }

  async attachGoogle({
    id,
    userId,
    subject,
    now,
  }: {
    id: string
    userId: string
    subject: string
    now: Date
  }) {
    await this.client.table('auth_identities').insert({
      id,
      user_id: userId,
      provider: 'google',
      provider_subject: subject,
      created_at: now,
      updated_at: now,
    })
  }
}
