import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import encryption from '@adonisjs/core/services/encryption'
import type { ProfileCommandRepository } from '../../application/ports/identity-repositories.ts'
import type { ProfileUpdateResult } from '../../domain/identity-records.ts'

export class PostgresProfileCommandRepository implements ProfileCommandRepository {
  constructor(private client: QueryClientContract) {}

  async find(id: string) {
    const row = await this.client.from('profile_commands').where('id', id).first()

    return row
      ? {
          fingerprint: row.fingerprint,
          response: encryption.decrypt<ProfileUpdateResult>(row.response_encrypted)!,
        }
      : null
  }

  async save(
    id: string,
    userId: string,
    fingerprint: string,
    response: ProfileUpdateResult,
    now: Date
  ) {
    await this.client.table('profile_commands').insert({
      id,
      user_id: userId,
      fingerprint,
      response_encrypted: encryption.encrypt(response),
      created_at: now,
      updated_at: now,
    })
  }
}
