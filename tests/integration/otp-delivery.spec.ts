import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import mail from '@adonisjs/mail/services/main'
import type { FakeMailer } from '@adonisjs/mail'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { IdentityBrowser } from '../support/identity-browser.ts'
import DispatchOtpOutboxJob from '../../app/jobs/dispatch-otp-outbox-job.ts'
import app from '@adonisjs/core/services/app'
import { OperationalEmails } from '../../app/modules/identity/application/operational-emails.ts'

test.group('Operational OTP delivery', (group) => {
  let fake: FakeMailer
  let emails: OperationalEmails
  group.each.setup(() => testUtils.db().truncate())
  group.each.setup(async () => {
    emails = await app.container.make(OperationalEmails)
    fake = mail.fake()
    return () => mail.restore()
  })

  async function pendingEmail() {
    const browser = await new IdentityBrowser().start()
    const response = await browser.request(
      '/api/v1/auth/otp/request',
      'POST',
      { email: 'delivery@example.com' },
      randomUUID()
    )
    if (response.status !== 202) throw new Error('Expected a pending operational email')
    return db.from('notification_outbox').firstOrFail()
  }

  test('transient failures retry the same code without extending its expiry', async ({
    assert,
  }) => {
    const row = await pendingEmail()
    const initial = await db.from('otp_challenges').firstOrFail()
    const original = fake.transport.send.bind(fake.transport)
    fake.transport.send = async () => {
      throw Object.assign(new Error('Temporary failure'), { responseCode: 450 })
    }
    await new DispatchOtpOutboxJob().execute()
    const retry = await db.from('notification_outbox').firstOrFail()
    assert.equal(retry.delivery_state, 'pending')
    assert.equal(retry.attempt_count, 1)
    assert.equal(retry.payload_encrypted, row.payload_encrypted)
    await emails.deliver(row.id)
    const notificationOutboxResult1 = await db.from('notification_outbox').firstOrFail()
    assert.equal(notificationOutboxResult1.attempt_count, 1)
    fake.transport.send = original
    // The fake records attempted messages before its transport resolves.
    fake.messages.clear()
    await db.from('notification_outbox').update({ next_attempt_at: new Date(0) })
    await new DispatchOtpOutboxJob().execute()
    const notificationOutboxResult2 = await db.from('notification_outbox').firstOrFail()
    assert.equal(notificationOutboxResult2.delivery_state, 'delivered')
    const otpChallengesResult3 = await db.from('otp_challenges').firstOrFail()
    assert.deepEqual(otpChallengesResult3.expires_at, initial.expires_at)
    fake.messages.assertSentCount(1)
    await emails.deliver(row.id)
    fake.messages.assertSentCount(1)
    await emails.deliver(randomUUID())
  })

  test('repeated transport failures eventually invalidate the challenge and erase delivery material', async ({
    assert,
  }) => {
    await pendingEmail()
    fake.transport.send = async () => {
      throw new Error('Connection refused')
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      await db.from('notification_outbox').update({ next_attempt_at: new Date(0) })
      await new DispatchOtpOutboxJob().execute()
    }
    const row = await db.from('notification_outbox').firstOrFail()
    assert.equal(row.delivery_state, 'failed')
    assert.isNull(row.payload_encrypted)
    const otpChallengesResult4 = await db.from('otp_challenges').firstOrFail()
    assert.isNotNull(otpChallengesResult4.invalidated_at)
  })

  test('expired, superseded, consumed, or corrupted challenges cannot send usable codes', async ({
    assert,
  }) => {
    for (const mutation of [
      { expires_at: new Date(0) },
      { invalidated_at: new Date() },
      { consumed_at: new Date() },
    ]) {
      await db.from('otp_request_events').delete()
      const row = await pendingEmail()
      await db.from('otp_challenges').where('id', row.challenge_id).update(mutation)
      await emails.deliver(row.id)
      const notificationOutboxResult5 = await db
        .from('notification_outbox')
        .where('id', row.id)
        .firstOrFail()
      assert.isNull(notificationOutboxResult5.payload_encrypted)
      await db.from('notification_outbox').delete()
    }
    await db.from('otp_request_events').delete()
    const row = await pendingEmail()
    await db
      .from('notification_outbox')
      .where('id', row.id)
      .update({ payload_encrypted: 'corrupt' })
    await emails.deliver(row.id)
    const notificationOutboxResult6 = await db.from('notification_outbox').firstOrFail()
    assert.equal(notificationOutboxResult6.delivery_state, 'failed')
    fake.messages.assertNoneSent()
  })

  test('outbox maintenance expires sensitive records even after successful delivery', async ({
    assert,
  }) => {
    await pendingEmail()
    await new DispatchOtpOutboxJob().execute()
    await db.from('otp_challenges').update({ expires_at: new Date(Date.now() - 1000) })
    await db.from('otp_request_events').update({ created_at: new Date(0) })
    await new DispatchOtpOutboxJob().execute()
    const challenge = await db.from('otp_challenges').firstOrFail()
    assert.isNull(challenge.email_encrypted)
    assert.isNull(challenge.code_hash)
    const otpRequestEventsResult7 = await db.from('otp_request_events').count('* as count')
    assert.equal(otpRequestEventsResult7[0].count, '0')
  })
})
