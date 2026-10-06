import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.raw("CREATE TYPE otp_purpose AS ENUM ('sign_in', 'phone_change')")
    this.schema.alterTable('otp_challenges', (table) => {
      table.specificType('purpose', 'otp_purpose').notNullable().defaultTo('sign_in')
      table.uuid('user_id').nullable().references('users.id')
      table.text('intent_encrypted').nullable()
      table.string('intent_key', 64).nullable()
    })
  }
  async down() {
    this.schema.alterTable('otp_challenges', (table) => {
      table.dropColumns('purpose', 'user_id', 'intent_encrypted', 'intent_key')
    })
    this.schema.raw('DROP TYPE otp_purpose')
  }
}
