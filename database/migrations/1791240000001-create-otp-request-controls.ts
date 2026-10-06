import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('otp_challenges', (table) => {
      table.string('request_key', 64).nullable().unique()
    })
    this.schema.createTable('otp_request_events', (table) => {
      table.uuid('id').primary()
      table.string('email_key', 64).notNullable().index()
      table.string('ip_key', 64).notNullable().index()
      table.timestamp('created_at', { useTz: true }).notNullable().index()
      table.timestamp('updated_at', { useTz: true }).notNullable()
    })
  }

  async down() {
    this.schema.dropTable('otp_request_events')
    this.schema.alterTable('otp_challenges', (table) => table.dropColumn('request_key'))
  }
}
