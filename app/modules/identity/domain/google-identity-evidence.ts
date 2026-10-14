import { EmailAddress } from './email-address.ts'

export interface VerifiedGoogleIdentity {
  subject: string
  email: string
}

/** Evidence comes only from the trusted provider adapter, never from an HTTP form. */
export class GoogleIdentityEvidence {
  static parse(input: {
    subject: unknown
    email: unknown
    emailVerified: unknown
  }): VerifiedGoogleIdentity | null {
    if (
      input.emailVerified !== true ||
      typeof input.subject !== 'string' ||
      !/^[\x21-\x7e]{1,255}$/.test(input.subject)
    )
      return null

    try {
      return { subject: input.subject, email: EmailAddress.parse(input.email).value }
    } catch {
      return null
    }
  }
}
