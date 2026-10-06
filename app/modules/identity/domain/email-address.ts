import { IdentityError } from './identity-error.ts'

export class EmailAddress {
  private constructor(readonly value: string) {}

  static parse(input: unknown): EmailAddress {
    if (typeof input !== 'string') {
      throw new IdentityError('Informe um e-mail válido.', 422, 'email')
    }
    const normalized = input.trim().toLowerCase()
    if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throw new IdentityError('Informe um e-mail válido.', 422, 'email')
    }
    return new EmailAddress(normalized)
  }
}
