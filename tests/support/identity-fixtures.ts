import { randomUUID } from 'node:crypto'
import type { FakeMailer } from '@adonisjs/mail'
import DispatchOtpOutboxJob from '../../app/jobs/dispatch-otp-outbox-job.ts'
import { IdentityBrowser } from './identity-browser.ts'

export async function deliveredCode(
  browser: IdentityBrowser,
  fake: FakeMailer,
  email = 'player@example.com'
) {
  const response = await browser.request(
    '/api/v1/auth/otp/request',
    'POST',
    { email },
    randomUUID()
  )

  if (response.status !== 202) throw new Error(`Code request failed: ${response.status}`)

  const { challengeId } = (await response.json()) as { challengeId: string }

  await new DispatchOtpOutboxJob().execute()
  const code = String(fake.messages.sent().at(-1)!.toJSON().message.text).match(/\b\d{6}\b/)![0]

  return { challengeId, code }
}

export async function signedInBrowser(fake: FakeMailer, email?: string) {
  const browser = await new IdentityBrowser().start()
  const challenge = await deliveredCode(browser, fake, email)
  const verified = await browser.request('/api/v1/auth/otp/verify', 'POST', challenge)

  if (verified.status !== 200) throw new Error(`Sign-in failed: ${verified.status}`)

  await browser.request('/api/v1/onboarding/profile')

  return browser
}
