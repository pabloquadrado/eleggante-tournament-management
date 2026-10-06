import type { ApplicationService } from '@adonisjs/core/types'
import { HttpContext } from '@adonisjs/core/http'
import {
  IdentityQueries,
  IdentityRetentionRepository,
  IdentityUnitOfWork,
} from '../app/modules/identity/application/ports/identity-repositories.ts'
import {
  IdentitySecrets,
  IdentitySession,
  OtpDeliveryQueue,
  OtpMailTransport,
} from '../app/modules/identity/application/ports/identity-adapters.ts'
import { ConsentPolicy } from '../app/modules/identity/application/consent-policy.ts'
import { OtpRequests } from '../app/modules/identity/application/otp-requests.ts'
import { OtpVerification } from '../app/modules/identity/application/otp-verification.ts'
import { PlayerProfiles } from '../app/modules/identity/application/player-profiles.ts'
import { OperationalEmails } from '../app/modules/identity/application/operational-emails.ts'
import { IdentitySessions } from '../app/modules/identity/application/identity-sessions.ts'
import { PostgresIdentityUnitOfWork } from '../app/modules/identity/infrastructure/postgres/unit-of-work.ts'
import { PostgresIdentityQueries } from '../app/modules/identity/infrastructure/postgres/identity-queries.ts'
import { PostgresIdentityRetention } from '../app/modules/identity/infrastructure/postgres/identity-retention.ts'
import { AdonisIdentitySession } from '../app/modules/identity/infrastructure/adonis/identity-session.ts'
import { AdonisIdentitySecrets } from '../app/modules/identity/infrastructure/adonis/identity-secrets.ts'
import { AdonisOtpMailTransport } from '../app/modules/identity/infrastructure/adonis/otp-mail-transport.ts'
import { AdonisOtpDeliveryQueue } from '../app/modules/identity/infrastructure/adonis/otp-delivery-queue.ts'
import { TournamentRepository } from '../app/modules/tournaments/application/tournament-repository.ts'
import { PublicTournamentCatalog } from '../app/modules/tournaments/application/public-tournament-catalog.ts'
import { PostgresTournamentRepository } from '../app/modules/tournaments/infrastructure/postgres/tournament-repository.ts'

/** Composition root: application contracts are bound to infrastructure here. */
export default class ModuleBindingsProvider {
  constructor(private app: ApplicationService) {}

  register() {
    const container = this.app.container
    container.singleton(IdentityUnitOfWork, () => new PostgresIdentityUnitOfWork())
    container.singleton(IdentityQueries, () => new PostgresIdentityQueries())
    container.singleton(IdentityRetentionRepository, () => new PostgresIdentityRetention())
    container.singleton(IdentitySecrets, () => new AdonisIdentitySecrets())
    container.singleton(OtpMailTransport, () => new AdonisOtpMailTransport())
    container.singleton(OtpDeliveryQueue, () => new AdonisOtpDeliveryQueue())
    container.singleton(TournamentRepository, () => new PostgresTournamentRepository())
    // Resolve this through the request's resolver; never share a browser session.
    container.bind(
      IdentitySession,
      async (resolver) => new AdonisIdentitySession(await resolver.make(HttpContext))
    )
    container.bind(
      OtpRequests,
      async (resolver) =>
        new OtpRequests(
          await resolver.make(IdentityUnitOfWork),
          await resolver.make(IdentityQueries),
          await resolver.make(IdentitySecrets)
        )
    )
    // Resolve policy on each use case, including test and future consent adapters.
    container.bind(
      OtpVerification,
      async (resolver) =>
        new OtpVerification(
          await resolver.make(IdentityUnitOfWork),
          await resolver.make(IdentitySecrets),
          await resolver.make(ConsentPolicy)
        )
    )
    container.bind(
      PlayerProfiles,
      async (resolver) =>
        new PlayerProfiles(
          await resolver.make(IdentityUnitOfWork),
          await resolver.make(IdentityQueries),
          await resolver.make(IdentitySecrets),
          await resolver.make(OtpRequests)
        )
    )
    container.bind(
      OperationalEmails,
      async (resolver) =>
        new OperationalEmails(
          await resolver.make(IdentityUnitOfWork),
          await resolver.make(IdentityQueries),
          await resolver.make(IdentityRetentionRepository),
          await resolver.make(OtpMailTransport),
          await resolver.make(OtpDeliveryQueue)
        )
    )
    container.bind(
      IdentitySessions,
      async (resolver) => new IdentitySessions(await resolver.make(IdentityUnitOfWork))
    )
    container.bind(
      PublicTournamentCatalog,
      async (resolver) => new PublicTournamentCatalog(await resolver.make(TournamentRepository))
    )
  }
}
