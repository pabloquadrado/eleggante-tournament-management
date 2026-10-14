import { googleAttemptLifetimeMs } from '../../domain/google-auth-attempt.ts'
import type { GoogleAuthorization, IdentitySecrets } from '../ports/identity-adapters.ts'
import type { IdentityUnitOfWork } from '../ports/identity-repositories.ts'

export class BeginGoogleSignInUseCase {
  constructor(
    private work: IdentityUnitOfWork,
    private secrets: IdentitySecrets,
    private provider: GoogleAuthorization
  ) {}

  async execute(input: { browserId: string }) {
    const prepared = await this.provider.prepare()

    if (!prepared) return null

    const now = new Date()

    await this.work.write(({ googleAttempts }) =>
      googleAttempts.append({
        id: this.secrets.id(),
        stateKey: this.secrets.key('google-state', prepared.state),
        browserKey: this.secrets.key('google-browser', input.browserId),
        material: { state: prepared.state, verifier: prepared.verifier },
        emailProof: null,
        createdAt: now,
        expiresAt: new Date(now.getTime() + googleAttemptLifetimeMs),
        consumedAt: null,
        invalidatedAt: null,
      })
    )

    return { url: prepared.url }
  }
}
