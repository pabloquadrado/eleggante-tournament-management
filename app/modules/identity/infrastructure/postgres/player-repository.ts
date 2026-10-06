import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import type { PlayerRepository } from '../../application/ports/identity-repositories.ts'
import type { PlayerDetails, PlayerRecord } from '../../domain/identity-records.ts'
import { IdentityError } from '../../domain/identity-error.ts'

export interface PlayerRow {
  id: string
  arena_id: string
  email: string | null
  name: string | null
  username: string | null
  phone: string | null
  version: number
  status: PlayerRecord['status']
  created_at: Date
  updated_at: Date
}

export function playerRecord(row: PlayerRow): PlayerRecord {
  return {
    id: row.id,
    arenaId: row.arena_id,
    email: row.email,
    name: row.name,
    username: row.username,
    phone: row.phone,
    version: row.version,
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

export class PostgresPlayerRepository implements PlayerRepository {
  constructor(private client: QueryClientContract) {}

  async find(id: string) {
    return playerRecord(await this.client.from('users').where('id', id).firstOrFail())
  }
  async lock(id: string) {
    return playerRecord(await this.client.from('users').where('id', id).forUpdate().firstOrFail())
  }

  async resolveEmail(email: string, id: string) {
    const inserted = await this.client
      .table('users')
      .insert({ id, email })
      .onConflict('email')
      .ignore()
      .returning('id')
    const row = await this.client.from('users').where('email', email).firstOrFail()
    return { player: playerRecord(row), created: inserted.length > 0 }
  }

  async save(id: string, details: PlayerDetails, nextVersion: number, now: Date) {
    try {
      await this.client.from('users').where('id', id).update({
        name: details.name,
        username: details.username,
        phone: details.phone,
        version: nextVersion,
        updated_at: now,
      })
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505')
        throw new IdentityError('Este nome de usuário já está em uso.', 422, 'username')
      throw error
    }
  }
}
