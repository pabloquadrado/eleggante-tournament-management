import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import encryption from '@adonisjs/core/services/encryption'
import type { GoogleAttemptRepository } from '../../application/ports/identity-repositories.ts'
import type { GoogleAuthAttempt, GoogleAttemptMaterial } from '../../domain/google-auth-attempt.ts'

export interface GoogleAttemptRow {
  id: string
  state_key: string
  browser_key: string
  material_encrypted: string | null
  expires_at: Date
  consumed_at: Date | null
  invalidated_at: Date | null
  created_at: Date
}

export function googleAttemptRecord(row: GoogleAttemptRow): GoogleAuthAttempt {
  return {
    id: row.id,
    stateKey: row.state_key,
    browserKey: row.browser_key,
    material: row.material_encrypted
      ? encryption.decrypt<GoogleAttemptMaterial>(row.material_encrypted)
      : null,
    expiresAt: new Date(row.expires_at),
    consumedAt: row.consumed_at ? new Date(row.consumed_at) : null,
    invalidatedAt: row.invalidated_at ? new Date(row.invalidated_at) : null,
    createdAt: new Date(row.created_at),
  }
}

export class PostgresGoogleAttemptRepository implements GoogleAttemptRepository {
  constructor(private client: QueryClientContract) {}

  async append(attempt: GoogleAuthAttempt) {
    await this.client.table('google_auth_attempts').insert({
      id: attempt.id,
      state_key: attempt.stateKey,
      browser_key: attempt.browserKey,
      material_encrypted: encryption.encrypt(attempt.material),
      expires_at: attempt.expiresAt,
      consumed_at: null,
      invalidated_at: null,
      created_at: attempt.createdAt,
      updated_at: attempt.createdAt,
    })
  }

  async forBrowser(stateKey: string, browserKey: string) {
    const row = await this.client
      .from('google_auth_attempts')
      .where('state_key', stateKey)
      .where('browser_key', browserKey)
      .forUpdate()
      .first()

    return row ? googleAttemptRecord(row) : null
  }

  async finish(id: string, outcome: 'consumed' | 'invalidated', now: Date) {
    await this.client
      .from('google_auth_attempts')
      .where('id', id)
      .update({
        [outcome === 'consumed' ? 'consumed_at' : 'invalidated_at']: now,
        material_encrypted: null,
        updated_at: now,
      })
  }
}
