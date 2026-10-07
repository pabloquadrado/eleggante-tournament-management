import { createHmac, randomInt } from 'node:crypto'
import env from '#start/env'
import { otpPolicy } from '../domain/otp-policy.ts'

export function protectedKey(purpose: string, value: string): string {
  return createHmac('sha256', env.get('APP_KEY').release())
    .update(`${purpose}:${value}`)
    .digest('hex')
}

export function generateCode(): string {
  return randomInt(10 ** otpPolicy.digits)
    .toString()
    .padStart(otpPolicy.digits, '0')
}
