import { isActiveIdentity } from './identity-actor.ts'
import type { PlayerRecord } from './identity-records.ts'
import type { VerifiedGoogleIdentity } from './google-identity-evidence.ts'

/** An existing subject association can never change the player's email or owner. */
export function googleAccountCanOpen(
  player: Pick<PlayerRecord, 'status' | 'email'>,
  identity: Pick<VerifiedGoogleIdentity, 'subject' | 'email'>
): boolean {
  return isActiveIdentity(player) && player.email === identity.email
}
