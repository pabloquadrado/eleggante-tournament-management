import db from '@adonisjs/lucid/services/db'
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

export class PostgresIdentityUnitOfWork extends IdentityUnitOfWork {
  async write<T>(operation: (repositories: IdentityRepositories) => Promise<T>): Promise<T> {
    return db.transaction(async (transaction) => {
      await lockIdentityWrites(transaction)
      return operation({
        players: new PostgresPlayerRepository(transaction),
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
    return db.transaction((transaction) =>
      operation({
        challenges: new PostgresChallengeRepository(transaction),
        outbox: new PostgresOutboxRepository(transaction),
      })
    )
  }
}
