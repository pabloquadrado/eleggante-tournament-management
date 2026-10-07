import { IdentityError } from './identity-error.ts'
import type { IdentityAccess } from './session-policy.ts'

export type IdentityActor = {
  userId: string
  status: 'active' | 'anonymized'
  access: IdentityAccess
}

export function requireActiveIdentity(identity: { status: string }): void {
  if (!isActiveIdentity(identity)) throw new IdentityError('Entre para continuar.', 401)
}

export function isActiveIdentity(identity: { status: string }): boolean {
  return identity.status === 'active'
}

export function requireOnboardingActor(actor: IdentityActor | null): IdentityActor {
  if (!actor) throw new IdentityError('Entre para continuar.', 401)

  requireActiveIdentity(actor)

  return actor
}

export function requirePlayerActor(actor: IdentityActor | null): IdentityActor {
  const player = requireOnboardingActor(actor)

  if (player.access !== 'player')
    throw new IdentityError('Conclua seu perfil e aceite os documentos para continuar.', 403)

  return player
}
