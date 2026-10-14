import { requireOtpOutcome } from '../../domain/otp-challenge-policy.ts'
import type { IdentitySecrets, IdentitySession } from '../ports/identity-adapters.ts'
import type { IdentityUnitOfWork } from '../ports/identity-repositories.ts'
import type { OtpConsumptionService } from '../services/otp-consumption-service.ts'
import type { SignInCompletionService } from '../services/sign-in-completion-service.ts'

export class VerifySignInCodeUseCase {
  constructor(
    private work: IdentityUnitOfWork,
    private secrets: IdentitySecrets,
    private session: IdentitySession,
    private consumption: OtpConsumptionService,
    private completion: SignInCompletionService
  ) {}

  async execute(input: {
    challengeId: unknown
    code: unknown
    browserId: string
    requestId: string
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
