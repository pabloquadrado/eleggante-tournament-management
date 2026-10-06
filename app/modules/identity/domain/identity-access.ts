import type { IdentityAccess } from './session-policy.js'

type ProfileCompleteness = {
  name: string | null
  username: string | null
  phone: string | null
}

export function identityAccessFor(
  profile: ProfileCompleteness,
  currentConsent: boolean
): IdentityAccess {
  if (profile.name && profile.username && profile.phone && currentConsent) return 'player'
  return 'onboarding'
}
