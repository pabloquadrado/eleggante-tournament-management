import { googleAccountCanOpen } from '../../domain/google-account-policy.ts'
import type { VerifiedGoogleIdentity } from '../../domain/google-identity-evidence.ts'
import type { IdentitySecrets, IdentitySession } from '../ports/identity-adapters.ts'
import type { IdentityRepositories } from '../ports/identity-repositories.ts'
import type { SignInCompletionService } from './sign-in-completion-service.ts'

/** Called only after authoritative Google proof or the exact bound email code. */
export class GoogleSignInCompletionService {
  constructor(
    private secrets: IdentitySecrets,
    private completion: SignInCompletionService
  ) {}

  async complete(
    input: { identity: VerifiedGoogleIdentity; attemptId: string; requestId: string },
    repositories: IdentityRepositories,
    session: IdentitySession
  ) {
    const { identity, attemptId, requestId } = input
    const { authIdentities, players, audit } = repositories
    const association = await authIdentities.findGoogle(identity.subject)
    const resolved = association
      ? { player: await players.lock(association.userId), created: false }
      : await players.resolveEmail(identity.email, this.secrets.id())

    if (!googleAccountCanOpen(resolved.player, identity)) return null

    const authIdentityId = association?.id ?? this.secrets.id()
    const references = { authIdentityId, attemptId }

    if (!association) {
      await authIdentities.attachGoogle({
        id: authIdentityId,
        userId: resolved.player.id,
        subject: identity.subject,
        now: new Date(),
      })

      if (!resolved.created)
        await audit.append({
          actorUserId: resolved.player.id,
          entityId: resolved.player.id,
          operation: 'updated',
          entityVersion: resolved.player.version,
          requestId,
          references,
        })
    }

    return this.completion.complete({ ...resolved, requestId, references }, repositories, session)
  }
}
