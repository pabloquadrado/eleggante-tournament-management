import { isGoogleState, isPendingGoogleAttempt } from '../../domain/google-auth-attempt.ts'
import { GoogleIdentityEvidence } from '../../domain/google-identity-evidence.ts'
import { googleAccountCanOpen } from '../../domain/google-account-policy.ts'
import type { IdentityAccess } from '../../domain/session-policy.ts'
import type {
  GoogleAuthorization,
  IdentitySecrets,
  IdentitySession,
} from '../ports/identity-adapters.ts'
import type { IdentityQueries, IdentityUnitOfWork } from '../ports/identity-repositories.ts'
import type { SignInCompletionService } from '../services/sign-in-completion-service.ts'

export type GoogleSignInResult = { access: IdentityAccess } | { denied: 'failed' | 'canceled' }

export class CompleteGoogleSignInUseCase {
  constructor(
    private work: IdentityUnitOfWork,
    private queries: IdentityQueries,
    private secrets: IdentitySecrets,
    private provider: GoogleAuthorization,
    private session: IdentitySession,
    private completion: SignInCompletionService
  ) {}

  async execute(input: {
    state: unknown
    code: unknown
    providerError: unknown
    issuer: unknown
    browserId: string
    requestId: string
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
      const { googleAttempts, authIdentities, players, audit } = repositories
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
      const resolved = association
        ? { player: await players.lock(association.userId), created: false }
        : await players.resolveEmail(identity.email, this.secrets.id())

      if (!googleAccountCanOpen(resolved.player, identity)) {
        await googleAttempts.finish(locked.id, 'invalidated', now)

        return failed
      }

      const authIdentityId = association?.id ?? this.secrets.id()

      if (!association) {
        await authIdentities.attachGoogle({
          id: authIdentityId,
          userId: resolved.player.id,
          subject: identity.subject,
          now,
        })

        if (!resolved.created)
          await audit.append({
            actorUserId: resolved.player.id,
            entityId: resolved.player.id,
            operation: 'updated',
            entityVersion: resolved.player.version,
            requestId: input.requestId,
            references: { authIdentityId, attemptId: locked.id },
          })
      }

      await googleAttempts.finish(locked.id, 'consumed', now)
      const completed = await this.completion.complete(
        {
          ...resolved,
          requestId: input.requestId,
          references: { authIdentityId, attemptId: locked.id },
        },
        repositories,
        this.session
      )

      // Eligibility was checked on this same record in this serialized transaction.
      return completed!
    })

    if ('access' in result) this.session.activate()

    return result
  }
}
