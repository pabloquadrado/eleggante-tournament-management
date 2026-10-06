import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('profile_commands', (table) => {
      table.string('id', 64).primary()
      table.uuid('user_id').notNullable().references('users.id')
      table.string('fingerprint', 64).notNullable()
      table.text('response_encrypted').notNullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
    })
  }

  async down() {
    this.schema.dropTable('profile_commands')
  }
}
