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
