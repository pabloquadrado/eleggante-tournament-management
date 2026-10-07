import type { IdentityActor } from '../domain/identity-actor.ts'

export type OwnProfileInput = { actor: IdentityActor | null }

export type ProfileUpdateInput = OwnProfileInput & {
  data: Record<string, unknown>
  key: unknown
  browserId: string
  clientAddress: string | undefined
  requestId: string
}

export type PhoneCancellationInput = OwnProfileInput & {
  challengeId: unknown
  browserId: string
}

export type PhoneConfirmationInput = PhoneCancellationInput & {
  code: unknown
  requestId: string
}
