import { IdentityError } from './identity-error.ts'

export const otpPolicy = {
  digits: 6,
  lifetimeSeconds: 600,
  maxAttempts: 5,
  resendSeconds: 60,
  windowSeconds: 900,
  emailRequestLimit: 5,
  ipRequestLimit: 20,
} as const

export const otpRequestMessage =
  'Se o endereço informado puder receber mensagens, enviaremos um código de acesso.'

export function assertOtpCooldown(hasRecentRequest: boolean): void {
  if (hasRecentRequest)
    throw new IdentityError('Aguarde um pouco antes de solicitar outro código.', 429)
}

export function assertOtpRequestCounts(counts: { email: number; ip: number }): void {
  if (counts.email >= otpPolicy.emailRequestLimit || counts.ip >= otpPolicy.ipRequestLimit)
    throw new IdentityError('Aguarde um pouco antes de solicitar outro código.', 429)
}
