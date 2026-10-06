import env from '#start/env'
import { defineConfig, transports } from '@adonisjs/mail'

const username = env.get('SMTP_USERNAME')

export default defineConfig({
  default: 'smtp',
  from: { address: env.get('SMTP_FROM', 'acesso@arena.example'), name: 'Arena Eleggante' },
  mailers: {
    smtp: transports.smtp({
      host: env.get('SMTP_HOST', 'mail'),
      port: env.get('SMTP_PORT', 1025),
      secure: env.get('SMTP_SECURE', false),
      auth: username
        ? {
            user: username,
            pass: env.get('SMTP_PASSWORD')?.release() ?? '',
            type: 'login',
          }
        : undefined,
      connectionTimeout: 10000,
      socketTimeout: 10000,
    }),
  },
})
