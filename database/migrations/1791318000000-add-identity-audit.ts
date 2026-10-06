import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.raw(
      "CREATE TYPE notification_type AS ENUM ('auth_otp', 'tournament_submitted', 'tournament_rejected', 'registration_approved', 'registration_rejected', 'draw_invitation', 'suspension', 'cancellation')"
    )
    this.schema.raw(
      "CREATE TYPE notification_delivery_state AS ENUM ('pending', 'processing', 'delivered', 'failed')"
    )
    this.schema.raw(
      'ALTER TABLE notification_outbox ALTER COLUMN notification_type DROP DEFAULT, ALTER COLUMN delivery_state DROP DEFAULT'
    )
    this.schema.raw(
      'ALTER TABLE notification_outbox ALTER COLUMN notification_type TYPE notification_type USING notification_type::notification_type, ALTER COLUMN delivery_state TYPE notification_delivery_state USING delivery_state::notification_delivery_state'
    )
    this.schema.raw(
      "ALTER TABLE notification_outbox ALTER COLUMN notification_type SET DEFAULT 'auth_otp', ALTER COLUMN delivery_state SET DEFAULT 'pending'"
    )
    this.schema.raw(
      "CREATE TYPE audit_entity_type AS ENUM ('organization', 'membership', 'user', 'consent', 'tournament', 'registration', 'participation', 'draw', 'match', 'result', 'publication')"
    )
    this.schema.raw(
      "CREATE TYPE audit_operation AS ENUM ('created', 'updated', 'state_changed', 'approved', 'rejected', 'withdrawn', 'substituted', 'draw_executed', 'result_published', 'result_corrected', 'anonymized', 'notification_queued')"
    )
    this.schema.createTable('audit_events', (table) => {
      table.uuid('id').primary()
      table.uuid('actor_user_id').nullable().references('users.id')
      table.specificType('entity_type', 'audit_entity_type').notNullable()
      // Anonymous authentication intents have stable references but no user yet.
      table.uuid('entity_id').nullable()
      table.specificType('operation', 'audit_operation').notNullable()
      table.integer('entity_version').nullable()
      table.string('request_id').notNullable()
      table.jsonb('stable_references').notNullable()
      table.timestamp('occurred_at', { useTz: true }).notNullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
    })
    this.schema.raw(
      'ALTER TABLE audit_events ADD CONSTRAINT immutable_audit_timestamp CHECK (created_at = updated_at)'
    )
    this.schema
      .raw(`CREATE OR REPLACE FUNCTION preserve_identity_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Audit events are append-only'; END $$;
      CREATE TRIGGER preserve_identity_audit BEFORE UPDATE OR DELETE ON audit_events
      FOR EACH ROW EXECUTE FUNCTION preserve_identity_audit()`)
  }

  async down() {
    this.schema.dropTable('audit_events')
    this.schema.raw('DROP FUNCTION preserve_identity_audit()')
    this.schema.raw('DROP TYPE audit_operation, audit_entity_type')
    this.schema.raw(
      'ALTER TABLE notification_outbox ALTER COLUMN notification_type DROP DEFAULT, ALTER COLUMN delivery_state DROP DEFAULT'
    )
    this.schema.raw(
      'ALTER TABLE notification_outbox ALTER COLUMN notification_type TYPE text USING notification_type::text, ALTER COLUMN delivery_state TYPE text USING delivery_state::text'
    )
    this.schema.raw(
      "ALTER TABLE notification_outbox ALTER COLUMN notification_type SET DEFAULT 'auth_otp', ALTER COLUMN delivery_state SET DEFAULT 'pending'"
    )
    this.schema.raw('DROP TYPE notification_delivery_state, notification_type')
  }
}
