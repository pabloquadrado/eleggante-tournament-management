import { IdentityError } from './identity-error.ts'

export function requireProfileVersion(current: number, expected: unknown): void {
  if (current !== expected)
    throw new IdentityError('Seu perfil foi alterado. Atualize a página antes de salvar.', 409)
}
