import mail from '@adonisjs/mail/services/main'
import { OtpMailTransport } from '../../application/ports/identity-adapters.ts'
import type { OtpPayload } from '../../domain/identity-records.ts'

export class AdonisOtpMailTransport extends OtpMailTransport {
  async send(
    id: string,
    payload: OtpPayload
  ): Promise<'sent' | 'transient_failure' | 'permanent_failure'> {
    try {
      await mail.send((message) => {
        message
          .to(payload.email)
          .subject('Seu código de acesso à Arena Eleggante')
          .text(
            `Seu código de acesso é ${payload.code}. Ele expira em 10 minutos. Se você não solicitou este código, ignore esta mensagem.`
          )
          .header('Message-ID', `<${id}@arena-eleggante>`)
      })

      return 'sent'
    } catch (error) {
      return typeof error === 'object' &&
        error !== null &&
        'responseCode' in error &&
        typeof error.responseCode === 'number' &&
        error.responseCode >= 500
        ? 'permanent_failure'
        : 'transient_failure'
    }
  }
}
