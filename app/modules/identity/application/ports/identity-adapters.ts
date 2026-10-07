import type { OtpPayload } from '../../domain/identity-records.ts'
import type { IdentityAccess } from '../../domain/session-policy.ts'
import type { IdentitySessionRepository } from './identity-repositories.ts'

export abstract class IdentitySecrets {
  abstract id(): string
  abstract code(): string
  abstract key(purpose: string, value: string): string
  abstract matchesCode(id: string, code: string, verifier: string): boolean
}

export abstract class IdentitySession {
  abstract establish(
    userId: string,
    access: IdentityAccess,
    repository: IdentitySessionRepository
  ): Promise<void>
  abstract activate(): void
}

export abstract class OtpMailTransport {
  abstract send(
    id: string,
    payload: OtpPayload
  ): Promise<'sent' | 'transient_failure' | 'permanent_failure'>
}

export abstract class OtpDeliveryQueue {
  abstract enqueue(outboxId: string): Promise<void>
}
