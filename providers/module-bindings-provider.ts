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
import { ConsentPolicy } from '../app/modules/identity/domain/consent-policy.ts'
import { OtpRequestService } from '../app/modules/identity/application/services/otp-request-service.ts'
import { OtpConsumptionService } from '../app/modules/identity/application/services/otp-consumption-service.ts'
import { ProfileReader } from '../app/modules/identity/application/services/profile-reader.ts'
import { ProfileUpdateService } from '../app/modules/identity/application/services/profile-update-service.ts'
import { PhoneChangeService } from '../app/modules/identity/application/services/phone-change-service.ts'
import { RequestSignInCodeUseCase } from '../app/modules/identity/application/use-cases/request-sign-in-code-use-case.ts'
import { ReadOtpDeliveryStatusUseCase } from '../app/modules/identity/application/use-cases/read-otp-delivery-status-use-case.ts'
import { VerifySignInCodeUseCase } from '../app/modules/identity/application/use-cases/verify-sign-in-code-use-case.ts'
import { RevokeIdentitySessionUseCase } from '../app/modules/identity/application/use-cases/revoke-identity-session-use-case.ts'
import { DispatchPendingOtpEmailsUseCase } from '../app/modules/identity/application/use-cases/dispatch-pending-otp-emails-use-case.ts'
import { DeliverOtpEmailUseCase } from '../app/modules/identity/application/use-cases/deliver-otp-email-use-case.ts'
import { ReadOnboardingProfileUseCase } from '../app/modules/identity/application/use-cases/read-onboarding-profile-use-case.ts'
import { UpdateOnboardingProfileUseCase } from '../app/modules/identity/application/use-cases/update-onboarding-profile-use-case.ts'
import { ConfirmOnboardingPhoneUseCase } from '../app/modules/identity/application/use-cases/confirm-onboarding-phone-use-case.ts'
import { CancelOnboardingPhoneUseCase } from '../app/modules/identity/application/use-cases/cancel-onboarding-phone-use-case.ts'
import { ReadPlayerProfileUseCase } from '../app/modules/identity/application/use-cases/read-player-profile-use-case.ts'
import { UpdatePlayerProfileUseCase } from '../app/modules/identity/application/use-cases/update-player-profile-use-case.ts'
import { ConfirmPlayerPhoneUseCase } from '../app/modules/identity/application/use-cases/confirm-player-phone-use-case.ts'
import { CancelPlayerPhoneUseCase } from '../app/modules/identity/application/use-cases/cancel-player-phone-use-case.ts'
import { PostgresIdentityUnitOfWork } from '../app/modules/identity/infrastructure/postgres/unit-of-work.ts'
import { PostgresIdentityQueries } from '../app/modules/identity/infrastructure/postgres/identity-queries.ts'
import { PostgresIdentityRetention } from '../app/modules/identity/infrastructure/postgres/identity-retention.ts'
import { AdonisIdentitySession } from '../app/modules/identity/infrastructure/adonis/identity-session.ts'
import { AdonisIdentitySecrets } from '../app/modules/identity/infrastructure/adonis/identity-secrets.ts'
import { AdonisOtpMailTransport } from '../app/modules/identity/infrastructure/adonis/otp-mail-transport.ts'
import { AdonisOtpDeliveryQueue } from '../app/modules/identity/infrastructure/adonis/otp-delivery-queue.ts'
import { TournamentRepository } from '../app/modules/tournaments/application/tournament-repository.ts'
import { ListPublicTournamentsUseCase } from '../app/modules/tournaments/application/use-cases/list-public-tournaments-use-case.ts'
import { FindPublicTournamentUseCase } from '../app/modules/tournaments/application/use-cases/find-public-tournament-use-case.ts'
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
      OtpRequestService,
      async (resolver) => new OtpRequestService(await resolver.make(IdentitySecrets))
    )
    container.bind(
      OtpConsumptionService,
      async (resolver) => new OtpConsumptionService(await resolver.make(IdentitySecrets))
    )
    container.bind(
      ProfileReader,
      async (resolver) => new ProfileReader(await resolver.make(IdentityQueries))
    )
    container.bind(
      ProfileUpdateService,
      async (resolver) =>
        new ProfileUpdateService(
          await resolver.make(IdentitySecrets),
          await resolver.make(OtpRequestService)
        )
    )
    container.bind(
      PhoneChangeService,
      async (resolver) =>
        new PhoneChangeService(
          await resolver.make(OtpConsumptionService),
          await resolver.make(IdentitySecrets)
        )
    )
    container.bind(
      RequestSignInCodeUseCase,
      async (resolver) =>
        new RequestSignInCodeUseCase(
          await resolver.make(IdentityUnitOfWork),
          await resolver.make(OtpRequestService)
        )
    )
    container.bind(
      ReadOtpDeliveryStatusUseCase,
      async (resolver) =>
        new ReadOtpDeliveryStatusUseCase(
          await resolver.make(IdentityQueries),
          await resolver.make(IdentitySecrets)
        )
    )
    container.bind(
      VerifySignInCodeUseCase,
      async (resolver) =>
        new VerifySignInCodeUseCase(
          await resolver.make(IdentityUnitOfWork),
          await resolver.make(IdentitySecrets),
          await resolver.make(ConsentPolicy),
          await resolver.make(IdentitySession),
          await resolver.make(OtpConsumptionService)
        )
    )
    container.bind(
      RevokeIdentitySessionUseCase,
      async (resolver) => new RevokeIdentitySessionUseCase(await resolver.make(IdentityUnitOfWork))
    )
    container.bind(
      DispatchPendingOtpEmailsUseCase,
      async (resolver) =>
        new DispatchPendingOtpEmailsUseCase(
          await resolver.make(IdentityQueries),
          await resolver.make(IdentityRetentionRepository),
          await resolver.make(OtpDeliveryQueue)
        )
    )
    container.bind(
      DeliverOtpEmailUseCase,
      async (resolver) =>
        new DeliverOtpEmailUseCase(
          await resolver.make(IdentityUnitOfWork),
          await resolver.make(OtpMailTransport)
        )
    )
    container.bind(
      ReadOnboardingProfileUseCase,
      async (resolver) => new ReadOnboardingProfileUseCase(await resolver.make(ProfileReader))
    )
    container.bind(
      UpdateOnboardingProfileUseCase,
      async (resolver) =>
        new UpdateOnboardingProfileUseCase(
          await resolver.make(IdentityUnitOfWork),
          await resolver.make(ProfileUpdateService)
        )
    )
    container.bind(
      ConfirmOnboardingPhoneUseCase,
      async (resolver) =>
        new ConfirmOnboardingPhoneUseCase(
          await resolver.make(IdentityUnitOfWork),
          await resolver.make(PhoneChangeService)
        )
    )
    container.bind(
      CancelOnboardingPhoneUseCase,
      async (resolver) =>
        new CancelOnboardingPhoneUseCase(
          await resolver.make(IdentityUnitOfWork),
          await resolver.make(PhoneChangeService)
        )
    )
    container.bind(
      ReadPlayerProfileUseCase,
      async (resolver) => new ReadPlayerProfileUseCase(await resolver.make(ProfileReader))
    )
    container.bind(
      UpdatePlayerProfileUseCase,
      async (resolver) =>
        new UpdatePlayerProfileUseCase(
          await resolver.make(IdentityUnitOfWork),
          await resolver.make(ProfileUpdateService)
        )
    )
    container.bind(
      ConfirmPlayerPhoneUseCase,
      async (resolver) =>
        new ConfirmPlayerPhoneUseCase(
          await resolver.make(IdentityUnitOfWork),
          await resolver.make(PhoneChangeService)
        )
    )
    container.bind(
      CancelPlayerPhoneUseCase,
      async (resolver) =>
        new CancelPlayerPhoneUseCase(
          await resolver.make(IdentityUnitOfWork),
          await resolver.make(PhoneChangeService)
        )
    )
    container.bind(
      ListPublicTournamentsUseCase,
      async (resolver) =>
        new ListPublicTournamentsUseCase(await resolver.make(TournamentRepository))
    )
    container.bind(
      FindPublicTournamentUseCase,
      async (resolver) => new FindPublicTournamentUseCase(await resolver.make(TournamentRepository))
    )
  }
}
