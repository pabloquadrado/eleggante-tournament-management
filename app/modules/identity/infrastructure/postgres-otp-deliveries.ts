import db from '@adonisjs/lucid/services/db'
import encryption from '@adonisjs/core/services/encryption'
import mail from '@adonisjs/mail/services/main'

const deliveryPolicy = { maxAttempts: 5, backoffSeconds: 30 } as const

export class PostgresOtpDeliveries {
  async deliver(id: string) {
    await db.transaction(async (transaction) => {
      const reference = await transaction.from('notification_outbox').where('id', id).first()
      if (!reference) return
      const challenge = await transaction
        .from('otp_challenges')
        .where('id', reference.challenge_id)
        .forUpdate()
        .firstOrFail()
      const delivery = await transaction
        .from('notification_outbox')
        .where('id', id)
        .forUpdate()
        .firstOrFail()
      const now = new Date()
      if (delivery.delivery_state !== 'pending' || new Date(delivery.next_attempt_at) > now) return
      if (
        challenge.invalidated_at ||
        challenge.consumed_at ||
        new Date(challenge.expires_at) <= now
      ) {
        await transaction
          .from('notification_outbox')
          .where('id', id)
          .update({ delivery_state: 'failed', payload_encrypted: null, updated_at: now })
        return
      }
      const payload = encryption.decrypt<{ email: string; code: string }>(
        delivery.payload_encrypted
      )
      let sent = false
      let permanent = !payload
      try {
        if (payload) {
          await mail.send((message) => {
            message
              .to(payload.email)
              .subject('Seu código de acesso à Arena Eleggante')
              .text(
                `Seu código de acesso é ${payload.code}. Ele expira em 10 minutos. Se você não solicitou este código, ignore esta mensagem.`
              )
              .header('Message-ID', `<${id}@arena-eleggante>`)
          })
          sent = true
        }
      } catch (error) {
        permanent =
          typeof error === 'object' &&
          error !== null &&
          'responseCode' in error &&
          typeof error.responseCode === 'number' &&
          error.responseCode >= 500
      }
      const attempt = delivery.attempt_count + 1
      const terminal = permanent || attempt >= deliveryPolicy.maxAttempts
      if (sent) {
        await transaction.from('notification_outbox').where('id', id).update({
          delivery_state: 'delivered',
          delivered_at: now,
          attempt_count: attempt,
          payload_encrypted: null,
          updated_at: now,
        })
        return
      }
      await transaction
        .from('notification_outbox')
        .where('id', id)
        .update({
          delivery_state: terminal ? 'failed' : 'pending',
          payload_encrypted: terminal ? null : delivery.payload_encrypted,
          attempt_count: attempt,
          next_attempt_at: new Date(
            now.getTime() + deliveryPolicy.backoffSeconds * 2 ** (attempt - 1) * 1000
          ),
          updated_at: now,
        })
      if (terminal) {
        await transaction
          .from('otp_challenges')
          .where('id', challenge.id)
          .update({ invalidated_at: now, updated_at: now })
      }
    })
  }
}
