import { randomUUID } from 'node:crypto'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import type { IdentityAuditRepository } from '../../application/ports/identity-repositories.ts'
import type { IdentityAuditEvent } from '../../domain/identity-records.ts'

export class PostgresAuditRepository implements IdentityAuditRepository {
  constructor(private client: QueryClientContract) {}

  async append(event: IdentityAuditEvent) {
    const now = new Date()
    await this.client.table('audit_events').insert({
      id: randomUUID(),
      actor_user_id: event.actorUserId,
      entity_type: 'user',
      entity_id: event.entityId,
      operation: event.operation,
      entity_version: event.entityVersion,
      request_id: event.requestId,
      stable_references: event.references,
      occurred_at: now,
      created_at: now,
      updated_at: now,
    })
  }
}
