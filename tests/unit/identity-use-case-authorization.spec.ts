import { test } from '@japa/runner'
import { IdentityError } from '../../app/modules/identity/domain/identity-error.ts'
import type { IdentityActor } from '../../app/modules/identity/domain/identity-actor.ts'
import type { IdentityRepositories } from '../../app/modules/identity/application/ports/identity-repositories.ts'
import {
  IdentityQueries,
  IdentityUnitOfWork,
} from '../../app/modules/identity/application/ports/identity-repositories.ts'
import { IdentitySecrets } from '../../app/modules/identity/application/ports/identity-adapters.ts'
import { ProfileReader } from '../../app/modules/identity/application/services/profile-reader.ts'
import { ProfileUpdateService } from '../../app/modules/identity/application/services/profile-update-service.ts'
import { OtpRequestService } from '../../app/modules/identity/application/services/otp-request-service.ts'
import { OtpConsumptionService } from '../../app/modules/identity/application/services/otp-consumption-service.ts'
import { PhoneChangeService } from '../../app/modules/identity/application/services/phone-change-service.ts'
import { ReadOnboardingProfileUseCase } from '../../app/modules/identity/application/use-cases/read-onboarding-profile-use-case.ts'
import { ReadPlayerProfileUseCase } from '../../app/modules/identity/application/use-cases/read-player-profile-use-case.ts'
import { UpdateOnboardingProfileUseCase } from '../../app/modules/identity/application/use-cases/update-onboarding-profile-use-case.ts'
import { UpdatePlayerProfileUseCase } from '../../app/modules/identity/application/use-cases/update-player-profile-use-case.ts'
import { ConfirmOnboardingPhoneUseCase } from '../../app/modules/identity/application/use-cases/confirm-onboarding-phone-use-case.ts'
import { ConfirmPlayerPhoneUseCase } from '../../app/modules/identity/application/use-cases/confirm-player-phone-use-case.ts'
import { CancelOnboardingPhoneUseCase } from '../../app/modules/identity/application/use-cases/cancel-onboarding-phone-use-case.ts'
import { CancelPlayerPhoneUseCase } from '../../app/modules/identity/application/use-cases/cancel-player-phone-use-case.ts'

class UnexpectedWork extends IdentityUnitOfWork {
  async write<Result>(
    _operation: (repositories: IdentityRepositories) => Promise<Result>
  ): Promise<Result> {
    throw new Error('A denied caller must not enter a transaction')
  }

  async delivery<Result>(
    _operation: (
      repositories: Pick<IdentityRepositories, 'challenges' | 'outbox'>
    ) => Promise<Result>
  ): Promise<Result> {
    throw new Error('A profile caller must not enter email delivery')
  }
}

class UnexpectedQueries extends IdentityQueries {
  async player(): Promise<never> {
    throw new Error('A denied caller must not read private data')
  }

  async deliveryStatus(): Promise<never> {
    throw new Error('A profile caller must not read delivery status')
  }

  async pendingDeliveryIds(): Promise<never> {
    throw new Error('A profile caller must not dispatch email')
  }
}

class UnexpectedSecrets extends IdentitySecrets {
  id(): never {
    throw new Error('A denied caller must not allocate an identity')
  }
  code(): never {
    throw new Error('A denied caller must not create a code')
  }
  key(): never {
    throw new Error('A denied caller must not prepare a mutation')
  }
  matchesCode(): never {
    throw new Error('A denied caller must not verify a code')
  }
}

test('use cases deny unauthenticated, deactivated, and limited callers without controller guards', async ({
  assert,
}) => {
  const work = new UnexpectedWork()
  const secrets = new UnexpectedSecrets()
  const reader = new ProfileReader(new UnexpectedQueries())
  const updater = new ProfileUpdateService(secrets, new OtpRequestService(secrets))
  const phones = new PhoneChangeService(new OtpConsumptionService(secrets), secrets)
  const update = {
    data: {},
    key: 'unused',
    browserId: 'browser',
    clientAddress: undefined,
    requestId: 'request',
  }
  const phone = {
    challengeId: 'unused',
    code: 'unused',
    browserId: 'browser',
    requestId: 'request',
  }
  const onboarding: ((actor: IdentityActor | null) => Promise<unknown>)[] = [
    (actor) => new ReadOnboardingProfileUseCase(reader).execute({ actor }),
    (actor) => new UpdateOnboardingProfileUseCase(work, updater).execute({ ...update, actor }),
    (actor) => new ConfirmOnboardingPhoneUseCase(work, phones).execute({ ...phone, actor }),
    (actor) => new CancelOnboardingPhoneUseCase(work, phones).execute({ ...phone, actor }),
  ]
  const player: ((actor: IdentityActor | null) => Promise<unknown>)[] = [
    (actor) => new ReadPlayerProfileUseCase(reader).execute({ actor }),
    (actor) => new UpdatePlayerProfileUseCase(work, updater).execute({ ...update, actor }),
    (actor) => new ConfirmPlayerPhoneUseCase(work, phones).execute({ ...phone, actor }),
    (actor) => new CancelPlayerPhoneUseCase(work, phones).execute({ ...phone, actor }),
  ]

  for (const execute of [...onboarding, ...player]) {
    for (const actor of [
      null,
      { userId: 'player', status: 'anonymized', access: 'player' },
    ] as const) {
      await assert.rejects(() => execute(actor), 'Entre para continuar.')
    }
  }

  for (const execute of player) {
    await assert.rejects(
      () => execute({ userId: 'player', status: 'active', access: 'onboarding' }),
      'Conclua seu perfil e aceite os documentos para continuar.'
    )
  }
})

test('own-profile reads deny a persisted deactivation after the actor was authenticated', async ({
  assert,
}) => {
  let reads = 0
  // Use the contract directly so this models a change between authentication and the read.
  const queries: IdentityQueries = {
    async player() {
      reads++

      return {
        id: 'player',
        arenaId: 'AE-000001',
        email: null,
        name: null,
        username: null,
        phone: null,
        version: 1,
        status: 'anonymized',
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    },
    deliveryStatus: async () => {
      throw new Error('Unexpected delivery query')
    },
    pendingDeliveryIds: async () => {
      throw new Error('Unexpected outbox query')
    },
  }
  const reader = new ProfileReader(queries)
  const actor: IdentityActor = { userId: 'player', status: 'active', access: 'player' }

  for (const useCase of [
    new ReadOnboardingProfileUseCase(reader),
    new ReadPlayerProfileUseCase(reader),
  ]) {
    try {
      await useCase.execute({ actor })
      assert.fail('A deactivated identity must not expose a private profile')
    } catch (error) {
      assert.instanceOf(error, IdentityError)

      if (error instanceof IdentityError) assert.equal(error.status, 401)
    }
  }

  assert.equal(reads, 2)
})
