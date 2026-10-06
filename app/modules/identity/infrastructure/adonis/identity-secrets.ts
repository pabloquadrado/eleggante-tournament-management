import { randomUUID, timingSafeEqual } from 'node:crypto'
import { IdentitySecrets } from '../../application/ports/identity-adapters.ts'
import { generateCode, protectedKey } from '../otp-cryptography.ts'

export class AdonisIdentitySecrets extends IdentitySecrets {
  id() {
    return randomUUID()
  }
  code() {
    return generateCode()
  }
  key(purpose: string, value: string) {
    return protectedKey(purpose, value)
  }
  matchesCode(id: string, code: string, verifier: string) {
    return timingSafeEqual(
      Buffer.from(verifier, 'hex'),
      Buffer.from(this.key(`code:${id}`, code), 'hex')
    )
  }
}
