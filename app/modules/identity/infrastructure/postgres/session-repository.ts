import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import type { IdentitySessionRepository } from '../../application/ports/identity-repositories.ts'

export class PostgresSessionRepository implements IdentitySessionRepository {
  constructor(private client: QueryClientContract) {}

  async replace(record: {
    id: string
    oldId: string
    userId: string
    data: string
    expiresAt: Date
  }) {
    await this.client.table('sessions').insert({
      id: record.id,
      user_id: record.userId,
      data: record.data,
      expires_at: record.expiresAt,
    })
    await this.revoke(record.oldId)
  }

  async revoke(id: string) {
    await this.client.from('sessions').where('id', id).delete()
  }
}
