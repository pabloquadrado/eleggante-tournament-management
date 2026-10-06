import { randomUUID } from 'node:crypto'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

type IdentityAuditEvent = {
  actorUserId: string | null
  entityId: string | null
  operation: 'notification_queued' | 'created' | 'updated'
  entityVersion: number | null
  requestId: string
  references: Record<string, string>
}

export async function appendIdentityAudit(
  transaction: TransactionClientContract,
  event: IdentityAuditEvent
) {
  const now = new Date()
  await transaction.table('audit_events').insert({
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
