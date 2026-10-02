import { rm } from 'node:fs/promises'

await rm('coverage/browser/raw', { recursive: true, force: true })
