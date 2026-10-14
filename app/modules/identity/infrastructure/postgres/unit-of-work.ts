import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import {
  IdentityUnitOfWork,
  type IdentityRepositories,
} from '../../application/ports/identity-repositories.ts'
import { lockIdentityWrites } from './identity-write-lock.ts'
import { PostgresPlayerRepository } from './player-repository.ts'
import { PostgresChallengeRepository } from './challenge-repository.ts'
import { PostgresRequestLimitRepository } from './request-limit-repository.ts'
import { PostgresProfileCommandRepository } from './profile-command-repository.ts'
import { PostgresOutboxRepository } from './outbox-repository.ts'
import { PostgresAuditRepository } from './audit-repository.ts'
import { PostgresSessionRepository } from './session-repository.ts'
import { PostgresAuthIdentityRepository } from './auth-identity-repository.ts'
import { PostgresGoogleAttemptRepository } from './google-attempt-repository.ts'

export class PostgresIdentityUnitOfWork extends IdentityUnitOfWork {
  async write<T>(operation: (repositories: IdentityRepositories) => Promise<T>): Promise<T> {
    return this.transaction(async (transaction) => {
      await lockIdentityWrites(transaction)

      return operation({
        players: new PostgresPlayerRepository(transaction),
        authIdentities: new PostgresAuthIdentityRepository(transaction),
        googleAttempts: new PostgresGoogleAttemptRepository(transaction),
        challenges: new PostgresChallengeRepository(transaction),
        limits: new PostgresRequestLimitRepository(transaction),
        commands: new PostgresProfileCommandRepository(transaction),
        outbox: new PostgresOutboxRepository(transaction),
        audit: new PostgresAuditRepository(transaction),
        sessions: new PostgresSessionRepository(transaction),
      })
    })
  }

  async delivery<T>(
    operation: (repositories: Pick<IdentityRepositories, 'challenges' | 'outbox'>) => Promise<T>
  ): Promise<T> {
    return this.transaction((transaction) =>
      operation({
        challenges: new PostgresChallengeRepository(transaction),
        outbox: new PostgresOutboxRepository(transaction),
      })
    )
  }

  private async transaction<T>(
    operation: (transaction: TransactionClientContract) => Promise<T>
  ): Promise<T> {
    let completion!: Promise<unknown>
    const result = await db.transaction((transaction) => {
      // Knex reports deferred COMMIT failures on executionPromise even when
      // commit() resolves. Confirm that outcome before any caller activates
      // a session or emits effects that depend on committed persistence.
      completion = transaction.knexClient.executionPromise

      return operation(transaction)
    })

    await completion

    return result
  }
}
