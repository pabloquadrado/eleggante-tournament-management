import { requireOtpOutcome } from '../../domain/otp-challenge-policy.ts'
import { isGoogleSignInIntent } from '../../domain/identity-records.ts'
import { GoogleIdentityEvidence } from '../../domain/google-identity-evidence.ts'
import { googleEmailProofMatches } from '../../domain/google-auth-attempt.ts'
import { isIdentifier } from '../../domain/identifier.ts'
import type { IdentitySecrets, IdentitySession } from '../ports/identity-adapters.ts'
import type { IdentityUnitOfWork } from '../ports/identity-repositories.ts'
import type { OtpConsumptionService } from '../services/otp-consumption-service.ts'
import type { SignInCompletionService } from '../services/sign-in-completion-service.ts'
import type { GoogleSignInCompletionService } from '../services/google-sign-in-completion-service.ts'

export class VerifySignInCodeUseCase {
  constructor(
    private work: IdentityUnitOfWork,
    private secrets: IdentitySecrets,
    private session: IdentitySession,
    private consumption: OtpConsumptionService,
    private completion: SignInCompletionService,
    private googleCompletion: GoogleSignInCompletionService
  ) {}

  async execute(input: {
    challengeId: unknown
    code: unknown
    browserId: string
    requestId: string
    googleChallengeId?: unknown
  }) {
    const { challengeId: id, code, browserId, requestId } = input
    const result = await this.work.write((repositories) =>
      this.consumption.consume(
        id,
        code,
        browserId,
        'sign_in',
        repositories,
        async (challenge, transactionRepositories) => {
          if (!challenge.email) return null

          const intent = challenge.intent

          if (
            challenge.intentKey !==
            this.secrets.key('otp-intent', JSON.stringify(intent ?? 'sign_in'))
          )
            return null

          if (isGoogleSignInIntent(intent)) {
            if (
              input.googleChallengeId !== id ||
              intent.email !== challenge.email ||
              !isIdentifier(intent.attemptId) ||
              !(new Date(intent.expiresAt) > new Date())
            )
              return null

            const identity = GoogleIdentityEvidence.parse({
              subject: intent.subject,
              email: intent.email,
              emailVerified: true,
            })
            const attempt = await transactionRepositories.googleAttempts.forEmailVerification(
              intent.attemptId,
              this.secrets.key('google-browser', browserId)
            )

            if (!identity || !googleEmailProofMatches(attempt, intent, new Date())) return null

            const completed = await this.googleCompletion.complete(
              { identity, attemptId: intent.attemptId, requestId },
              transactionRepositories,
              this.session
            )

            if (completed)
              await transactionRepositories.googleAttempts.finish(
                intent.attemptId,
                'consumed',
                new Date()
              )

            return completed
          }

          if (intent || input.googleChallengeId !== undefined) return null

          const { player, created } = await transactionRepositories.players.resolveEmail(
            challenge.email,
            this.secrets.id()
          )

          return this.completion.complete(
            { player, created, requestId, references: { challengeId: challenge.id } },
            transactionRepositories,
            this.session
          )
        }
      )
    )
    const verified = requireOtpOutcome(result)

    this.session.activate()

    return verified
  }
}
