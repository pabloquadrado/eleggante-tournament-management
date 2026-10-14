import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.raw("CREATE TYPE auth_provider AS ENUM ('google')")
    this.schema.createTable('auth_identities', (table) => {
      table.uuid('id').primary()
      table.uuid('user_id').notNullable().references('users.id').index()
      table.specificType('provider', 'auth_provider').notNullable()
      table.string('provider_subject', 255).notNullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
      table.unique(['provider', 'provider_subject'])
    })
  }

  async down() {
    this.schema.dropTable('auth_identities')
    this.schema.raw('DROP TYPE auth_provider')
  }
}
