import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('google_auth_attempts', (table) => {
      table.uuid('id').primary()
      table.string('state_key', 64).notNullable().unique()
      table.string('browser_key', 64).notNullable()
      table.text('material_encrypted').nullable()
      table.timestamp('expires_at', { useTz: true }).notNullable().index()
      table.timestamp('consumed_at', { useTz: true }).nullable()
      table.timestamp('invalidated_at', { useTz: true }).nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
    })
  }

  async down() {
    this.schema.dropTable('google_auth_attempts')
  }
}
