import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { IdentityBrowser } from '../support/identity-browser.js'
import db from '@adonisjs/lucid/services/db'
import { randomUUID } from 'node:crypto'
import { signedInBrowser } from '../support/identity-fixtures.js'
import { deliveredCode } from '../support/identity-fixtures.js'
import app from '@adonisjs/core/services/app'
import { ConsentPolicy } from '../../app/modules/identity/application/consent-policy.js'

test.group('Email sign-in', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('an empty or malformed email has a handled Portuguese field error', async ({ assert }) => {
    const browser = await new IdentityBrowser().start()
    for (const email of ['', 'not-an-email']) {
      const response = await browser.request('/api/v1/auth/otp/request', 'POST', { email })
      assert.equal(response.status, 422)
      assert.deepEqual(await response.json(), { errors: { email: 'Informe um e-mail válido.' } })
    }
  })

  test('a new-player request saves only a protected challenge and delivery intent', async ({
    assert,
  }) => {
    const browser = await new IdentityBrowser().start()
    const response = await browser.request(
      '/api/v1/auth/otp/request',
      'POST',
      {
        email: ' Player@Example.com ',
      },
      randomUUID()
    )
    assert.equal(response.status, 202)
    const result = (await response.json()) as { challengeId: string; message: string }
    assert.equal(
      result.message,
      'Se o endereço informado puder receber mensagens, enviaremos um código de acesso.'
    )
    const challenge = await db.from('otp_challenges').where('id', result.challengeId).firstOrFail()
    assert.match(challenge.code_hash, /^[a-f0-9]{64}$/)
    assert.equal(challenge.attempts, 0)
    const delivery = await db
      .from('notification_outbox')
      .where('challenge_id', result.challengeId)
      .firstOrFail()
    assert.equal(delivery.delivery_state, 'pending')
    assert.notInclude(delivery.payload_encrypted, 'player@example.com')
    const usersResult1 = await db.from('users').count('* as count')
    assert.equal(usersResult1[0].count, '0')
  })

  test('request replay sends no extra email and a fresh request obeys shared cooldown', async ({
    assert,
  }) => {
    const browser = await new IdentityBrowser().start()
    const key = randomUUID()
    const first = await browser.request(
      '/api/v1/auth/otp/request',
      'POST',
      { email: 'player@example.com' },
      key
    )
    const replay = await browser.request(
      '/api/v1/auth/otp/request',
      'POST',
      { email: 'player@example.com' },
      key
    )
    assert.deepEqual(await replay.json(), await first.json())
    const notificationOutboxResult2 = await db.from('notification_outbox').count('* as count')
    assert.equal(notificationOutboxResult2[0].count, '1')
    const otherBrowser = await new IdentityBrowser().start()
    const limited = await otherBrowser.request(
      '/api/v1/auth/otp/request',
      'POST',
      { email: 'PLAYER@example.com' },
      randomUUID()
    )
    assert.equal(limited.status, 429)
  })

  test('resending invalidates the previous code and the email window limits resends', async ({
    assert,
  }) => {
    const browser = await new IdentityBrowser().start()
    const ids: string[] = []
    for (let index = 0; index < 5; index++) {
      await db.from('otp_request_events').update({ created_at: new Date(Date.now() - 61000) })
      const response = await browser.request(
        '/api/v1/auth/otp/request',
        'POST',
        { email: 'player@example.com' },
        randomUUID()
      )
      assert.equal(response.status, 202)
      const responseResult3 = await response.json()
      ids.push((responseResult3 as { challengeId: string }).challengeId)
    }
    const first = await db.from('otp_challenges').where('id', ids[0]).firstOrFail()
    assert.isNotNull(first.invalidated_at)
    await db.from('otp_request_events').update({ created_at: new Date(Date.now() - 61000) })
    const limited = await browser.request(
      '/api/v1/auth/otp/request',
      'POST',
      { email: 'player@example.com' },
      randomUUID()
    )
    assert.equal(limited.status, 429)
    const otpChallengesResult4 = await db.from('otp_challenges').count('* as count')
    assert.equal(otpChallengesResult4[0].count, '5')
  })

  test('committed delivery intent sends an operational code and scrubs delivery secrets', async ({
    assert,
    cleanup,
  }) => {
    const { default: mail } = await import('@adonisjs/mail/services/main')
    const { default: DispatchOtpOutboxJob } =
      await import('../../app/jobs/dispatch-otp-outbox-job.js')
    const fake = mail.fake()
    cleanup(() => mail.restore())
    const browser = await new IdentityBrowser().start()
    await browser.request(
      '/api/v1/auth/otp/request',
      'POST',
      { email: 'player@example.com' },
      randomUUID()
    )
    fake.messages.assertNoneSent()
    await new DispatchOtpOutboxJob().execute()
    fake.messages.assertSentCount(1)
    const message = fake.messages.sent()[0]
    assert.include(message.toJSON().message.text!, 'Seu código de acesso')
    const delivery = await db.from('notification_outbox').firstOrFail()
    assert.equal(delivery.delivery_state, 'delivered')
    assert.isNull(delivery.payload_encrypted)
    await new DispatchOtpOutboxJob().execute()
    fake.messages.assertSentCount(1)
  })

  test('confirmed recipient rejection has a handled status visible only to its browser', async ({
    assert,
    cleanup,
  }) => {
    const { default: mail } = await import('@adonisjs/mail/services/main')
    const { default: DispatchOtpOutboxJob } =
      await import('../../app/jobs/dispatch-otp-outbox-job.js')
    const fake = mail.fake()
    cleanup(() => mail.restore())
    fake.transport.send = async () => {
      throw Object.assign(new Error('Private provider diagnostics'), { responseCode: 550 })
    }
    const browser = await new IdentityBrowser().start()
    const response = await browser.request(
      '/api/v1/auth/otp/request',
      'POST',
      { email: 'missing@example.com' },
      randomUUID()
    )
    const { challengeId } = (await response.json()) as { challengeId: string }
    await new DispatchOtpOutboxJob().execute()
    const status = await browser.request(`/api/v1/auth/otp/${challengeId}`)
    assert.equal(status.status, 200)
    assert.deepEqual(await status.json(), {
      state: 'failed',
      message: 'Não foi possível entregar o código. Confira o e-mail informado e tente novamente.',
    })
    const otherBrowser = await new IdentityBrowser().start()
    const responseResult5 = await otherBrowser.request(`/api/v1/auth/otp/${challengeId}`)
    assert.equal(responseResult5.status, 404)
    const delivery = await db.from('notification_outbox').firstOrFail()
    assert.isNull(delivery.payload_encrypted)
    const otpChallengesResult6 = await db.from('otp_challenges').firstOrFail()
    assert.isNotNull(otpChallengesResult6.invalidated_at)
  })

  test('verification rotates the persisted session, creates a limited identity, and rejects code reuse', async ({
    assert,
    cleanup,
  }) => {
    const { default: mail } = await import('@adonisjs/mail/services/main')
    const { default: DispatchOtpOutboxJob } =
      await import('../../app/jobs/dispatch-otp-outbox-job.js')
    const fake = mail.fake()
    cleanup(() => mail.restore())
    const browser = await new IdentityBrowser().start()
    const previousCookie = browser.cookies.get('adonis-session')
    const response = await browser.request(
      '/api/v1/auth/otp/request',
      'POST',
      { email: 'player@example.com' },
      randomUUID()
    )
    const { challengeId } = (await response.json()) as { challengeId: string }
    await new DispatchOtpOutboxJob().execute()
    const code = String(fake.messages.sent()[0].toJSON().message.text).match(/\b\d{6}\b/)![0]
    const verified = await browser.request('/api/v1/auth/otp/verify', 'POST', { challengeId, code })
    assert.equal(verified.status, 200)
    assert.deepEqual(await verified.json(), { access: 'onboarding', next: '/onboarding' })
    assert.notEqual(browser.cookies.get('adonis-session'), previousCookie)
    const profile = await browser.request('/api/v1/onboarding/profile')
    assert.equal(profile.status, 200)
    const { data } = (await profile.json()) as {
      data: { arenaId: string; email: string; phone: null }
    }
    assert.match(data.arenaId, /^AE-\d{6,}$/)
    assert.equal(data.email, 'player@example.com')
    assert.isNull(data.phone)
    const responseResult7 = await browser.request('/api/v1/me')
    assert.equal(responseResult7.status, 403)
    const replay = await browser.request('/api/v1/auth/otp/verify', 'POST', { challengeId, code })
    assert.equal(replay.status, 422)
    const usersResult8 = await db.from('users').count('* as count')
    assert.equal(usersResult8[0].count, '1')
  })

  test('limited onboarding saves an own profile, rejects stale writes, and preserves permanent identity', async ({
    assert,
    cleanup,
  }) => {
    const { default: mail } = await import('@adonisjs/mail/services/main')
    const fake = mail.fake()
    cleanup(() => mail.restore())
    const browser = await signedInBrowser(fake)
    const responseResult9 = await browser.request('/api/v1/onboarding/profile')
    const before = (await responseResult9.json()) as {
      data: { arenaId: string }
    }
    const key = randomUUID()
    const input = { name: 'Pablo', username: 'pablo.fc', phone: '+5551999009633', version: 1 }
    const saved = await browser.request('/api/v1/onboarding/profile', 'PATCH', input, key)
    assert.equal(saved.status, 200)
    const { data } = (await saved.json()) as {
      data: { arenaId: string; phone: string; version: number }
    }
    assert.equal(data.arenaId, before.data.arenaId)
    assert.equal(data.phone, '+5551999009633')
    assert.equal(data.version, 2)
    const replay = await browser.request('/api/v1/onboarding/profile', 'PATCH', input, key)
    assert.equal(replay.status, 200)
    const stale = await browser.request(
      '/api/v1/onboarding/profile',
      'PATCH',
      { ...input, name: 'Other name' },
      randomUUID()
    )
    assert.equal(stale.status, 409)
    const responseResult10 = await browser.request('/api/v1/me')
    assert.equal(responseResult10.status, 403)
  })

  test('an existing phone changes only after a fresh email code confirms the pending profile', async ({
    assert,
    cleanup,
  }) => {
    const { default: mail } = await import('@adonisjs/mail/services/main')
    const { default: DispatchOtpOutboxJob } =
      await import('../../app/jobs/dispatch-otp-outbox-job.js')
    const fake = mail.fake()
    cleanup(() => mail.restore())
    const browser = await signedInBrowser(fake)
    const initial = { name: 'Pablo', username: 'pablo', phone: '+5551999009633', version: 1 }
    await browser.request('/api/v1/onboarding/profile', 'PATCH', initial, randomUUID())
    await db.from('otp_request_events').update({ created_at: new Date(Date.now() - 61000) })
    const pending = await browser.request(
      '/api/v1/onboarding/profile',
      'PATCH',
      { ...initial, phone: '+5551999009634', version: 2 },
      randomUUID()
    )
    assert.equal(pending.status, 202)
    const { challengeId } = (await pending.json()) as { challengeId: string }
    const responseResult11 = await browser.request('/api/v1/onboarding/profile')
    const unchanged = (await responseResult11.json()) as {
      data: { phone: string; version: number }
    }
    assert.equal(unchanged.data.phone, initial.phone)
    assert.equal(unchanged.data.version, 2)
    await new DispatchOtpOutboxJob().execute()
    const code = String(fake.messages.sent().at(-1)!.toJSON().message.text).match(/\b\d{6}\b/)![0]
    const responseResult12 = await browser.request('/api/v1/auth/otp/verify', 'POST', {
      challengeId,
      code,
    })
    assert.equal(responseResult12.status, 422)
    const confirmed = await browser.request('/api/v1/onboarding/profile/phone/verify', 'POST', {
      challengeId,
      code,
    })
    assert.equal(confirmed.status, 200)
    const { data } = (await confirmed.json()) as { data: { phone: string; version: number } }
    assert.equal(data.phone, '+5551999009634')
    assert.equal(data.version, 3)
    const replay = await browser.request('/api/v1/onboarding/profile/phone/verify', 'POST', {
      challengeId,
      code,
    })
    assert.equal(replay.status, 422)
  })

  test('a returning eligible player keeps the same profile and logout revokes the old session', async ({
    assert,
    cleanup,
  }) => {
    const { default: mail } = await import('@adonisjs/mail/services/main')
    const fake = mail.fake()
    cleanup(() => mail.restore())
    const browser = await signedInBrowser(fake)
    const input = { name: 'Pablo', username: 'pablo', phone: '+5551999009633', version: 1 }
    const responseResult13 = await browser.request(
      '/api/v1/onboarding/profile',
      'PATCH',
      input,
      randomUUID()
    )
    const original = await responseResult13.json()
    await db.from('otp_request_events').update({ created_at: new Date(Date.now() - 61000) })
    app.container.swap(ConsentPolicy, () => ({ hasCurrentAcceptance: async () => true }))
    cleanup(() => app.container.restore(ConsentPolicy))
    const returning = await new IdentityBrowser().start()
    const challenge = await deliveredCode(returning, fake, 'PLAYER@example.com')
    const verified = await returning.request('/api/v1/auth/otp/verify', 'POST', challenge)
    assert.deepEqual(await verified.json(), { access: 'player', next: '/me' })
    const profile = await returning.request('/api/v1/me')
    assert.equal(profile.status, 200)
    assert.deepEqual(await profile.json(), original)
    const stolenOldSession = new IdentityBrowser()
    stolenOldSession.cookies = new Map(returning.cookies)
    const logout = await returning.request('/api/v1/auth/logout', 'POST')
    assert.equal(logout.status, 204)
    const responseResult14 = await stolenOldSession.request('/api/v1/me')
    assert.equal(responseResult14.status, 401)
  })

  test('expiry and the attempt limit deny sign-in without creating an account', async ({
    assert,
    cleanup,
  }) => {
    const { default: mail } = await import('@adonisjs/mail/services/main')
    const fake = mail.fake()
    cleanup(() => mail.restore())
    const browser = await new IdentityBrowser().start()
    const challenge = await deliveredCode(browser, fake)
    const wrongCode = challenge.code === '000000' ? '111111' : '000000'
    for (let attempt = 0; attempt < 5; attempt++) {
      const responseResult15 = await browser.request('/api/v1/auth/otp/verify', 'POST', {
        ...challenge,
        code: wrongCode,
      })
      assert.equal(responseResult15.status, 422)
    }
    const responseResult16 = await browser.request('/api/v1/auth/otp/verify', 'POST', challenge)
    assert.equal(responseResult16.status, 422)
    const otpChallengesResult17 = await db.from('otp_challenges').firstOrFail()
    assert.equal(otpChallengesResult17.attempts, 5)
    await db.from('otp_request_events').delete()
    const expired = await deliveredCode(browser, fake)
    await db
      .from('otp_challenges')
      .where('id', expired.challengeId)
      .update({ expires_at: new Date(0) })
    const responseResult18 = await browser.request('/api/v1/auth/otp/verify', 'POST', expired)
    assert.equal(responseResult18.status, 422)
    const usersResult19 = await db.from('users').count('* as count')
    assert.equal(usersResult19[0].count, '0')
    const responseResult20 = await browser.request('/api/v1/onboarding/profile')
    assert.equal(responseResult20.status, 401)
  })

  test('two simultaneous verifications can consume a challenge only once', async ({
    assert,
    cleanup,
  }) => {
    const { default: mail } = await import('@adonisjs/mail/services/main')
    const fake = mail.fake()
    cleanup(() => mail.restore())
    const first = await new IdentityBrowser().start()
    const challenge = await deliveredCode(first, fake)
    const second = new IdentityBrowser()
    second.cookies = new Map(first.cookies)
    const results = await Promise.all([
      first.request('/api/v1/auth/otp/verify', 'POST', challenge),
      second.request('/api/v1/auth/otp/verify', 'POST', challenge),
    ])
    assert.deepEqual(results.map((response) => response.status).sort(), [200, 422])
    const usersResult21 = await db.from('users').count('* as count')
    assert.equal(usersResult21[0].count, '1')
  })

  test('a failed persisted-session write rolls back identity creation and code consumption', async ({
    assert,
    cleanup,
  }) => {
    const { default: mail } = await import('@adonisjs/mail/services/main')
    const fake = mail.fake()
    cleanup(() => mail.restore())
    const browser = await new IdentityBrowser().start()
    const challenge = await deliveredCode(browser, fake)
    await db.rawQuery(`CREATE FUNCTION test_reject_identity_session() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.user_id IS NOT NULL THEN RAISE EXCEPTION 'session write unavailable'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER test_reject_identity_session BEFORE INSERT ON sessions FOR EACH ROW EXECUTE FUNCTION test_reject_identity_session()`)
    cleanup(async () => {
      await db.rawQuery(
        'DROP TRIGGER IF EXISTS test_reject_identity_session ON sessions; DROP FUNCTION IF EXISTS test_reject_identity_session()'
      )
    })
    const failed = await browser.request('/api/v1/auth/otp/verify', 'POST', challenge)
    assert.equal(failed.status, 500)
    const usersResult22 = await db.from('users').count('* as count')
    assert.equal(usersResult22[0].count, '0')
    const otpChallengesResult23 = await db
      .from('otp_challenges')
      .where('id', challenge.challengeId)
      .firstOrFail()
    assert.isNull(otpChallengesResult23.consumed_at)
    const responseResult24 = await browser.request('/api/v1/onboarding/profile')
    assert.equal(responseResult24.status, 401)
    await db.rawQuery(
      'DROP TRIGGER test_reject_identity_session ON sessions; DROP FUNCTION test_reject_identity_session()'
    )
    const recovered = await browser.request('/api/v1/auth/otp/verify', 'POST', challenge)
    assert.equal(recovered.status, 200)
  })

  test('case-insensitive username collisions and immutable-field writes leave both profiles intact', async ({
    assert,
    cleanup,
  }) => {
    const { default: mail } = await import('@adonisjs/mail/services/main')
    const fake = mail.fake()
    cleanup(() => mail.restore())
    const first = await signedInBrowser(fake)
    const second = await signedInBrowser(fake, 'other@example.com')
    const input = { name: 'Pablo', username: 'Pablo', phone: '+5551999009633', version: 1 }
    const responseResult25 = await first.request(
      '/api/v1/onboarding/profile',
      'PATCH',
      input,
      randomUUID()
    )
    assert.equal(responseResult25.status, 200)
    const collision = await second.request(
      '/api/v1/onboarding/profile',
      'PATCH',
      { ...input, username: 'pablo' },
      randomUUID()
    )
    assert.equal(collision.status, 422)
    assert.deepEqual(await collision.json(), {
      errors: { username: 'Este nome de usuário já está em uso.' },
    })
    for (const field of ['email', 'arenaId', 'status', 'role', 'identityAccess', 'id']) {
      const responseResult26 = await second.request(
        '/api/v1/onboarding/profile',
        'PATCH',
        { ...input, [field]: 'tampered' },
        randomUUID()
      )
      assert.equal(responseResult26.status, 422)
    }
    const responseResult27 = await second.request('/api/v1/onboarding/profile')
    const profile = (await responseResult27.json()) as {
      data: { username: null; version: number }
    }
    assert.isNull(profile.data.username)
    assert.equal(profile.data.version, 1)
  })

  test('expired sessions and anonymized identities cannot read private profiles', async ({
    assert,
    cleanup,
  }) => {
    const { default: mail } = await import('@adonisjs/mail/services/main')
    const fake = mail.fake()
    cleanup(() => mail.restore())
    const expired = await signedInBrowser(fake)
    await db
      .from('sessions')
      .whereNotNull('user_id')
      .update({ expires_at: new Date(0) })
    const responseResult28 = await expired.request('/api/v1/onboarding/profile')
    assert.equal(responseResult28.status, 401)
    await db.from('otp_request_events').delete()
    const anonymized = await signedInBrowser(fake)
    await db.from('users').update({ status: 'anonymized' })
    const responseResult29 = await anonymized.request('/api/v1/onboarding/profile')
    assert.equal(responseResult29.status, 401)
    await db.from('otp_request_events').delete()
    const retry = await new IdentityBrowser().start()
    const challenge = await deliveredCode(retry, fake)
    const responseResult30 = await retry.request('/api/v1/auth/otp/verify', 'POST', challenge)
    assert.equal(responseResult30.status, 422)
  })

  test('cookies cannot mutate a profile without CSRF protection', async ({ assert, cleanup }) => {
    const { default: mail } = await import('@adonisjs/mail/services/main')
    const fake = mail.fake()
    cleanup(() => mail.restore())
    const browser = await signedInBrowser(fake)
    browser.cookies.delete('XSRF-TOKEN')
    const rejected = await browser.request(
      '/api/v1/onboarding/profile',
      'PATCH',
      { name: 'Pablo', username: 'pablo', phone: '+5551999009633', version: 1 },
      randomUUID()
    )
    assert.equal(rejected.status, 403)
  })

  test('malformed challenge identifiers never become database errors', async ({ assert }) => {
    const browser = await new IdentityBrowser().start()
    for (const challengeId of ['-', '-'.repeat(36), 'g'.repeat(36), randomUUID()]) {
      const responseResult31 = await browser.request(`/api/v1/auth/otp/${challengeId}`)
      assert.equal(responseResult31.status, 404)
      const responseResult32 = await browser.request('/api/v1/auth/otp/verify', 'POST', {
        challengeId,
        code: '000000',
      })
      assert.equal(responseResult32.status, 422)
    }
    for (const body of [{}, { challengeId: randomUUID(), code: 123456 }]) {
      const responseResult33 = await browser.request('/api/v1/auth/otp/verify', 'POST', body)
      assert.equal(responseResult33.status, 422)
    }
  })

  test('a pending phone confirmation cannot overwrite a stale profile or claim a taken username', async ({
    assert,
    cleanup,
  }) => {
    const { default: mail } = await import('@adonisjs/mail/services/main')
    const { default: DispatchOtpOutboxJob } =
      await import('../../app/jobs/dispatch-otp-outbox-job.js')
    const fake = mail.fake()
    cleanup(() => mail.restore())
    const browser = await signedInBrowser(fake)
    const other = await signedInBrowser(fake, 'other@example.com')
    const input = { name: 'Pablo', username: 'pablo', phone: '+5551999009633', version: 1 }
    await browser.request('/api/v1/onboarding/profile', 'PATCH', input, randomUUID())
    await db.from('otp_request_events').delete()
    const result = await browser.request(
      '/api/v1/onboarding/profile',
      'PATCH',
      { ...input, phone: '+5551999009634', username: 'available', version: 2 },
      randomUUID()
    )
    const { challengeId } = (await result.json()) as { challengeId: string }
    await new DispatchOtpOutboxJob().execute()
    const code = String(fake.messages.sent().at(-1)!.toJSON().message.text).match(/\b\d{6}\b/)![0]
    const responseResult34 = await other.request(
      '/api/v1/onboarding/profile/phone/verify',
      'POST',
      {
        challengeId,
        code,
      }
    )
    assert.equal(responseResult34.status, 422)
    await other.request(
      '/api/v1/onboarding/profile',
      'PATCH',
      { ...input, username: 'AVAILABLE' },
      randomUUID()
    )
    const collision = await browser.request('/api/v1/onboarding/profile/phone/verify', 'POST', {
      challengeId,
      code,
    })
    assert.equal(collision.status, 422)
    assert.deepEqual(await collision.json(), {
      errors: { username: 'Este nome de usuário já está em uso.' },
    })
    await browser.request(
      '/api/v1/onboarding/profile',
      'PATCH',
      { ...input, name: 'Updated', version: 2 },
      randomUUID()
    )
    const responseResult35 = await browser.request(
      '/api/v1/onboarding/profile/phone/verify',
      'POST',
      {
        challengeId,
        code,
      }
    )
    assert.equal(responseResult35.status, 409)
    const responseResult36 = await browser.request('/api/v1/onboarding/profile')
    const current = (await responseResult36.json()) as {
      data: { phone: string; name: string }
    }
    assert.equal(current.data.phone, input.phone)
    assert.equal(current.data.name, 'Updated')
  })
})
