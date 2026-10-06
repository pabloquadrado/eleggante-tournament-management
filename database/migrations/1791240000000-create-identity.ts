import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.raw("CREATE TYPE user_status AS ENUM ('active', 'anonymized')")
    this.schema.createTable('users', (table) => {
      table.uuid('id').primary()
      table.text('email').nullable().unique()
      table.text('username').nullable()
      table.text('name').nullable()
      table.text('phone').nullable()
      table.specificType('status', 'user_status').notNullable().defaultTo('active')
      table.integer('version').notNullable().defaultTo(1)
      table.specificType('arena_number', 'bigserial').notNullable().unique()
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())
    })
    this.schema.raw(`ALTER TABLE users ADD COLUMN arena_id text GENERATED ALWAYS AS
      ('AE-' || lpad(arena_number::text, greatest(6, length(arena_number::text)), '0')) STORED UNIQUE`)
    this.schema.raw(
      'CREATE UNIQUE INDEX users_username_unique ON users (lower(username)) WHERE username IS NOT NULL'
    )
    this.schema.raw(
      'ALTER TABLE users ADD CONSTRAINT normalized_email CHECK (email = lower(trim(email)))'
    )
    this.schema.createTable('sessions', (table) => {
      table.string('id').primary()
      table.uuid('user_id').nullable().references('users.id').index()
      table.text('data').notNullable()
      table.timestamp('expires_at', { useTz: true }).notNullable().index()
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())
    })
    this.schema.createTable('otp_challenges', (table) => {
      table.uuid('id').primary()
      table.string('email_key', 64).notNullable().index()
      table.text('email_encrypted').notNullable()
      table.string('browser_key', 64).notNullable()
      table.string('code_hash', 64).notNullable()
      table.integer('attempts').notNullable().defaultTo(0)
      table.timestamp('expires_at', { useTz: true }).notNullable()
      table.timestamp('consumed_at', { useTz: true }).nullable()
      table.timestamp('invalidated_at', { useTz: true }).nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
    })
    this.schema.createTable('notification_outbox', (table) => {
      table.uuid('id').primary()
      table.uuid('challenge_id').notNullable().references('otp_challenges.id').unique()
      table.text('payload_encrypted').nullable()
      table.string('notification_type').notNullable().defaultTo('auth_otp')
      table.string('delivery_state').notNullable().defaultTo('pending')
      table.integer('attempt_count').notNullable().defaultTo(0)
      table.timestamp('next_attempt_at', { useTz: true }).notNullable()
      table.timestamp('delivered_at', { useTz: true }).nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
    })
  }

  async down() {
    this.schema.dropTable('notification_outbox')
    this.schema.dropTable('otp_challenges')
    this.schema.dropTable('sessions')
    this.schema.dropTable('users')
    this.schema.raw('DROP TYPE user_status')
  }
}
