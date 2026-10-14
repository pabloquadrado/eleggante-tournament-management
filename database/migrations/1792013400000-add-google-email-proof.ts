import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('google_auth_attempts', (table) => {
      table.text('email_proof_encrypted').nullable()
    })
  }

  async down() {
    this.schema.alterTable('google_auth_attempts', (table) => {
      table.dropColumn('email_proof_encrypted')
    })
  }
}
