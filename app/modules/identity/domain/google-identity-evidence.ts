import { EmailAddress } from './email-address.ts'

export interface VerifiedGoogleIdentity {
  subject: string
  email: string
  emailAuthoritative: boolean
}

/** Evidence comes only from the trusted provider adapter, never from an HTTP form. */
export class GoogleIdentityEvidence {
  static parse(input: {
    subject: unknown
    email: unknown
    emailVerified: unknown
    hostedDomain?: unknown
  }): VerifiedGoogleIdentity | null {
    if (
      input.emailVerified !== true ||
      typeof input.subject !== 'string' ||
      !/^[\x21-\x7e]{1,255}$/.test(input.subject)
    )
      return null

    try {
      const email = EmailAddress.parse(input.email).value
      const hostedDomain = input.hostedDomain
      const workspace =
        typeof hostedDomain === 'string' &&
        hostedDomain.length <= 253 &&
        /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(
          hostedDomain
        ) &&
        hostedDomain.toLowerCase() === email.slice(email.lastIndexOf('@') + 1)

      return {
        subject: input.subject,
        email,
        emailAuthoritative: email.endsWith('@gmail.com') || workspace,
      }
    } catch {
      return null
    }
  }
}
