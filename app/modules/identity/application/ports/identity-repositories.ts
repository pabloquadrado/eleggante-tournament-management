import type {
  IdentityAuditEvent,
  OtpChallenge,
  OtpDelivery,
  OtpPayload,
  OtpPurpose,
  PlayerDetails,
  PlayerRecord,
  ProfileUpdateResult,
} from '../../domain/identity-records.ts'

export interface PlayerRepository {
  find(id: string): Promise<PlayerRecord>
  lock(id: string): Promise<PlayerRecord>
  resolveEmail(email: string, id: string): Promise<{ player: PlayerRecord; created: boolean }>
  save(id: string, details: PlayerDetails, nextVersion: number, now: Date): Promise<void>
}

export interface OtpChallengeRepository {
  replay(requestKey: string): Promise<OtpChallenge | null>
  /** Lock a browser-bound challenge before changing it or locking its outbox. */
  forBrowser(
    id: string,
    browserKey: string,
    purpose: OtpPurpose,
    userId?: string
  ): Promise<OtpChallenge | null>
  /** Lock the challenge before its delivery row; missing references are integrity errors. */
  forDelivery(id: string): Promise<OtpChallenge>
  append(challenge: OtpChallenge): Promise<void>
  invalidatePrevious(emailKey: string, now: Date): Promise<void>
  cancel(id: string, now: Date): Promise<void>
  consume(id: string, now: Date): Promise<void>
  recordFailure(id: string, attempts: number, now: Date): Promise<void>
  invalidate(id: string, now: Date): Promise<void>
}

export interface OtpRequestLimitRepository {
  hasRecent(emailKey: string, since: Date): Promise<boolean>
  counts(emailKey: string, ipKey: string, since: Date): Promise<{ email: number; ip: number }>
  record(id: string, emailKey: string, ipKey: string, now: Date): Promise<void>
}

export interface ProfileCommandRepository {
  find(id: string): Promise<{ fingerprint: string; response: ProfileUpdateResult } | null>
  save(
    id: string,
    userId: string,
    fingerprint: string,
    response: ProfileUpdateResult,
    now: Date
  ): Promise<void>
}

export interface NotificationOutboxRepository {
  find(id: string): Promise<OtpDelivery | null>
  lock(id: string): Promise<OtpDelivery>
  append(id: string, challengeId: string, payload: OtpPayload, now: Date): Promise<void>
  cancelPending(challengeId: string, now: Date): Promise<void>
  discard(id: string, now: Date): Promise<void>
  delivered(id: string, attempt: number, now: Date): Promise<void>
  retry(
    id: string,
    attempt: number,
    nextAttemptAt: Date,
    terminal: boolean,
    now: Date
  ): Promise<void>
}

export interface IdentityAuditRepository {
  append(event: IdentityAuditEvent): Promise<void>
}

export interface IdentitySessionRepository {
  replace(record: {
    id: string
    oldId: string
    userId: string
    data: string
    expiresAt: Date
  }): Promise<void>
  revoke(id: string): Promise<void>
}

export interface IdentityRepositories {
  players: PlayerRepository
  challenges: OtpChallengeRepository
  limits: OtpRequestLimitRepository
  commands: ProfileCommandRepository
  outbox: NotificationOutboxRepository
  audit: IdentityAuditRepository
  sessions: IdentitySessionRepository
}

export abstract class IdentityUnitOfWork {
  /** Serialize identity writes; commit all repositories together or roll them all back. */
  abstract write<T>(operation: (repositories: IdentityRepositories) => Promise<T>): Promise<T>
  /** One delivery transaction, with challenge-before-outbox locking and no identity-wide lock. */
  abstract delivery<T>(
    operation: (repositories: Pick<IdentityRepositories, 'challenges' | 'outbox'>) => Promise<T>
  ): Promise<T>
}

export abstract class IdentityQueries {
  abstract player(id: string): Promise<PlayerRecord>
  abstract deliveryStatus(
    challengeId: string,
    browserKey: string
  ): Promise<'pending' | 'failed' | null>
  abstract pendingDeliveryIds(now: Date): Promise<string[]>
}

export abstract class IdentityRetentionRepository {
  abstract clean(cutoffs: { now: Date; requestCutoff: Date; replayCutoff: Date }): Promise<void>
}
