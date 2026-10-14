import { isGoogleState, isPendingGoogleAttempt } from '../../domain/google-auth-attempt.ts'
import { GoogleIdentityEvidence } from '../../domain/google-identity-evidence.ts'
import { EmailAddress } from '../../domain/email-address.ts'
import { requestClientAddress } from '../../domain/request-client-address.ts'
import type { OtpReceipt } from '../../domain/identity-records.ts'
import type { IdentityAccess } from '../../domain/session-policy.ts'
import type {
  GoogleAuthorization,
  IdentitySecrets,
  IdentitySession,
} from '../ports/identity-adapters.ts'
import type { IdentityQueries, IdentityUnitOfWork } from '../ports/identity-repositories.ts'
import type { GoogleSignInCompletionService } from '../services/google-sign-in-completion-service.ts'
import type { OtpRequestService } from '../services/otp-request-service.ts'

export type GoogleSignInResult =
  | { access: IdentityAccess }
  | { denied: 'failed' | 'canceled' }
  | { emailVerificationRequired: true; email: string; receipt: OtpReceipt }

export class CompleteGoogleSignInUseCase {
  constructor(
    private work: IdentityUnitOfWork,
    private queries: IdentityQueries,
    private secrets: IdentitySecrets,
    private provider: GoogleAuthorization,
    private session: IdentitySession,
    private completion: GoogleSignInCompletionService,
    private requests: OtpRequestService
  ) {}

  async execute(input: {
    state: unknown
    code: unknown
    providerError: unknown
    issuer: unknown
    browserId: string
    requestId: string
    clientAddress?: string
  }): Promise<GoogleSignInResult> {
    const failed = { denied: 'failed' } as const

    if (!isGoogleState(input.state)) return failed

    const stateKey = this.secrets.key('google-state', input.state)
    const browserKey = this.secrets.key('google-browser', input.browserId)
    const attempt = await this.queries.googleAttempt(stateKey, browserKey)

    if (!attempt) return failed

    if (!isPendingGoogleAttempt(attempt, new Date())) {
      if (attempt.material)
        await this.work.write(async ({ googleAttempts }) => {
          const locked = await googleAttempts.forBrowser(stateKey, browserKey)

          if (locked && locked.material && !isPendingGoogleAttempt(locked, new Date()))
            await googleAttempts.finish(locked.id, 'invalidated', new Date())
        })

      return failed
    }

    const canceled = input.providerError === 'access_denied'
    const callbackValid =
      input.providerError === undefined &&
      typeof input.code === 'string' &&
      /^[\x21-\x7e]{1,4096}$/.test(input.code) &&
      (input.issuer === undefined || input.issuer === 'https://accounts.google.com')
    const proof = callbackValid
      ? await this.provider.exchange({ ...attempt.material!, code: input.code as string })
      : null
    const identity = proof ? GoogleIdentityEvidence.parse(proof) : null

    const result = await this.work.write<GoogleSignInResult>(async (repositories) => {
      const { googleAttempts, authIdentities } = repositories
      const locked = await googleAttempts.forBrowser(stateKey, browserKey)
      const now = new Date()

      if (!locked) return failed

      if (!isPendingGoogleAttempt(locked, now)) {
        if (locked.material) await googleAttempts.finish(locked.id, 'invalidated', now)

        return failed
      }

      if (!identity) {
        await googleAttempts.finish(locked.id, 'invalidated', now)

        return { denied: canceled ? 'canceled' : 'failed' }
      }

      const association = await authIdentities.findGoogle(identity.subject)

      if (!association && !identity.emailAuthoritative) {
        const receipt = await this.requests.request(
          EmailAddress.parse(identity.email),
          input.browserId,
          requestClientAddress(input.clientAddress),
          locked.id,
          input.requestId,
          repositories,
          {
            kind: 'google_sign_in',
            attemptId: locked.id,
            subject: identity.subject,
            email: identity.email,
            expiresAt: locked.expiresAt.toISOString(),
          }
        )

        await googleAttempts.awaitEmailProof(
          locked.id,
          { subject: identity.subject, email: identity.email },
          now
        )

        return { emailVerificationRequired: true, email: identity.email, receipt }
      }

      const completed = await this.completion.complete(
        { identity, requestId: input.requestId, attemptId: locked.id },
        repositories,
        this.session
      )

      await googleAttempts.finish(locked.id, completed ? 'consumed' : 'invalidated', now)

      return completed ?? failed
    })

    if ('access' in result) this.session.activate()

    return result
  }
}
