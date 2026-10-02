import env from '#start/env'
import { defineConfig, drivers } from '@adonisjs/queue'

export default defineConfig({
  default: env.get('QUEUE_DRIVER'),
  adapters: {
    database: drivers.database({ connectionName: 'primary' }),
    sync: drivers.sync(),
  },
  worker: {
    concurrency: 1,
    idleDelay: '2s',
  },
  locations: ['./app/jobs/**/*.{ts,js}'],
})
