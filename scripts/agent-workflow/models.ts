export const profiles = ['openai', 'anthropic'] as const
export const roles = [
  'coordinator',
  'tech-lead',
  'engineer',
  'qa',
  'reviewer',
  'delivery-lead',
] as const
export type Profile = (typeof profiles)[number]
export type Role = (typeof roles)[number]
export type Effort = 'max' | 'xhigh'

export function modelFor(profile: Profile, role: Role, engineerOverride?: 'kimi-k3') {
  if (!profiles.includes(profile) || !roles.includes(role))
    throw new Error('Unknown model profile or role')

  if (engineerOverride && engineerOverride !== 'kimi-k3')
    throw new Error('Unknown engineer override')

  if (role === 'engineer' && engineerOverride) return { model: 'kimi-k3', effort: 'max' as Effort }

  const light = role === 'coordinator' || role === 'delivery-lead'

  return {
    model:
      profile === 'openai'
        ? light
          ? 'gpt-6-luna'
          : 'gpt-6.1-sol'
        : light
          ? 'claude-haiku-5-5'
          : 'claude-opus-5-5',
    effort: (light ? 'max' : 'xhigh') as Effort,
  }
}
