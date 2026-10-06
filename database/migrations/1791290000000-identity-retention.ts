import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.raw(
      'ALTER TABLE otp_challenges ALTER COLUMN email_encrypted DROP NOT NULL, ALTER COLUMN code_hash DROP NOT NULL'
    )
  }

  async down() {
    // Expired records cannot regain erased secrets on rollback.
    this.schema.raw(
      'DELETE FROM notification_outbox WHERE challenge_id IN (SELECT id FROM otp_challenges WHERE code_hash IS NULL)'
    )
    this.schema.raw('DELETE FROM otp_challenges WHERE code_hash IS NULL')
    this.schema.raw(
      'ALTER TABLE otp_challenges ALTER COLUMN email_encrypted SET NOT NULL, ALTER COLUMN code_hash SET NOT NULL'
    )
  }
}
