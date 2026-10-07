export type PlayerDetails = { name: string; username: string; phone: string }

export interface PlayerRecord {
  id: string
  arenaId: string
  email: string | null
  name: string | null
  username: string | null
  phone: string | null
  version: number
  status: 'active' | 'anonymized'
  createdAt: Date
  updatedAt: Date
}

export interface PhoneChangeIntent extends PlayerDetails {
  userId: string
  version: number
}

export type OtpPurpose = 'sign_in' | 'phone_change'

export interface OtpChallenge {
  id: string
  requestKey: string
  purpose: OtpPurpose
  userId: string | null
  intentKey: string
  intent: PhoneChangeIntent | null
  emailKey: string
  email: string | null
  browserKey: string
  codeHash: string | null
  expiresAt: Date
  createdAt: Date
  invalidatedAt: Date | null
  consumedAt: Date | null
  attempts: number
}

export interface OtpReceipt {
  challengeId: string
  message: string
  expiresAt: string
  resendAt: string
}

export function playerProfile(player: PlayerRecord) {
  return {
    id: player.id,
    arenaId: player.arenaId,
    email: player.email,
    name: player.name,
    username: player.username,
    phone: player.phone,
    version: player.version,
    state: player.status,
    createdAt: player.createdAt.toISOString(),
    updatedAt: player.updatedAt.toISOString(),
  }
}

export type ProfileUpdateResult =
  { data: ReturnType<typeof playerProfile> } | (OtpReceipt & { phoneVerificationRequired: true })

export type OtpPayload = { email: string; code: string }

export interface OtpDelivery {
  id: string
  challengeId: string
  state: 'pending' | 'delivered' | 'failed'
  nextAttemptAt: Date
  attemptCount: number
  payload: OtpPayload | null
}

export interface IdentityAuditEvent {
  actorUserId: string | null
  entityId: string | null
  operation: 'notification_queued' | 'created' | 'updated'
  entityVersion: number | null
  requestId: string
  references: Record<string, string>
}
