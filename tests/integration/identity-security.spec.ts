import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import mail from '@adonisjs/mail/services/main'
import encryption from '@adonisjs/core/services/encryption'
import { randomUUID } from 'node:crypto'
import { setTimeout } from 'node:timers/promises'
import { IdentityBrowser } from '../support/identity-browser.ts'
import { deliveredCode, signedInBrowser } from '../support/identity-fixtures.ts'
import DispatchOtpOutboxJob from '../../app/jobs/dispatch-otp-outbox-job.ts'
import type { FakeMailer } from '@adonisjs/mail'

test.group('Identity security and recovery', (group) => {
  let fake: FakeMailer

  group.each.setup(() => testUtils.db().truncate())
  group.each.setup(() => {
    fake = mail.fake()

    return () => mail.restore()
  })

  async function waitUntil(condition: () => Promise<boolean>) {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await condition()) return

      await setTimeout(10)
    }

    throw new Error('Expected the observable database transition')
  }

  async function phoneChange(deliver = true, existingBrowser?: IdentityBrowser) {
    const browser = existingBrowser ?? (await signedInBrowser(fake))
    const input = { name: 'Pablo', username: 'pablo', phone: '+5551999009633', version: 1 }

    await browser.request('/api/v1/onboarding/profile', 'PATCH', input, randomUUID())
    await db.from('otp_request_events').delete()
    const response = await browser.request(
      '/api/v1/onboarding/profile',
      'PATCH',
      { ...input, phone: '+5551999009634', version: 2 },
      randomUUID()
    )
    const pending = (await response.json()) as { challengeId: string }
    const delivery = await db
      .from('notification_outbox')
      .where('challenge_id', pending.challengeId)
      .firstOrFail()
    const code = encryption.decrypt<{ code: string }>(delivery.payload_encrypted)!.code

    if (deliver) await new DispatchOtpOutboxJob().execute()

    const profile = await browser.request('/api/v1/onboarding/profile')
    const { data } = (await profile.json()) as { data: { id: string } }

    return { browser, input, userId: data.id, challenge: { ...pending, code } }
  }

  test('canceling a phone change invalidates its code and removes pending delivery material', async ({
    assert,
  }) => {
    const { browser, userId, challenge } = await phoneChange(false)
    const sentBefore = fake.messages.sent().length

    for (let attempt = 0; attempt < 2; attempt++) {
      const canceled = await browser.request('/api/v1/onboarding/profile/phone/cancel', 'POST', {
        challengeId: challenge.challengeId,
      })

      assert.equal(canceled.status, 204)
    }

    const stored = await db.from('otp_challenges').where('id', challenge.challengeId).firstOrFail()

    assert.isNotNull(stored.invalidated_at)

    for (const key of ['email_encrypted', 'intent_encrypted', 'code_hash'])
      assert.isNull(stored[key])

    const delivery = await db
      .from('notification_outbox')
      .where('challenge_id', challenge.challengeId)
      .firstOrFail()

    assert.equal(delivery.delivery_state, 'failed')
    assert.isNull(delivery.payload_encrypted)
    await new DispatchOtpOutboxJob().execute()
    assert.equal(fake.messages.sent().length, sentBefore)
    const rejected = await browser.request(
      '/api/v1/onboarding/profile/phone/verify',
      'POST',
      challenge
    )

    assert.equal(rejected.status, 422)
    const unchanged = await db.from('users').where('id', userId).firstOrFail()

    assert.equal(unchanged.phone, '+5551999009633')
    assert.equal(unchanged.version, 2)
  })

  test('phone cancellation requires CSRF and the authenticated initiating browser', async ({
    assert,
  }) => {
    const { browser, challenge } = await phoneChange()
    const anonymous = await new IdentityBrowser().start()
    const body = { challengeId: challenge.challengeId }
    const unauthenticated = await anonymous.request(
      '/api/v1/onboarding/profile/phone/cancel',
      'POST',
      body
    )

    assert.equal(unauthenticated.status, 401)
    const other = await signedInBrowser(fake, 'other@example.com')
    const forbidden = await other.request('/api/v1/onboarding/profile/phone/cancel', 'POST', body)

    assert.equal(forbidden.status, 404)

    for (const challengeId of ['bad-id', randomUUID()]) {
      const missing = await browser.request('/api/v1/onboarding/profile/phone/cancel', 'POST', {
        challengeId,
      })

      assert.equal(missing.status, 404)
    }

    const signIn = await db
      .from('otp_challenges')
      .where('purpose', 'sign_in')
      .whereNull('user_id')
      .firstOrFail()
    const wrongPurpose = await browser.request('/api/v1/onboarding/profile/phone/cancel', 'POST', {
      challengeId: signIn.id,
    })

    assert.equal(wrongPurpose.status, 404)
    const xsrf = browser.cookies.get('XSRF-TOKEN')!

    browser.cookies.delete('XSRF-TOKEN')
    const noCsrf = await browser.request('/api/v1/onboarding/profile/phone/cancel', 'POST', body)

    assert.equal(noCsrf.status, 403)
    browser.cookies.set('XSRF-TOKEN', xsrf)
    const verified = await browser.request(
      '/api/v1/onboarding/profile/phone/verify',
      'POST',
      challenge
    )

    assert.equal(verified.status, 200)
    const alreadyConfirmed = await browser.request(
      '/api/v1/onboarding/profile/phone/cancel',
      'POST',
      body
    )

    assert.equal(alreadyConfirmed.status, 409)
  })

  test('another session of the same player cannot cancel the initiating browser challenge', async ({
    assert,
  }) => {
    const first = await signedInBrowser(fake)

    await db.from('otp_request_events').delete()
    const second = await signedInBrowser(fake)
    const { browser, challenge } = await phoneChange(true, first)
    const forbidden = await second.request('/api/v1/onboarding/profile/phone/cancel', 'POST', {
      challengeId: challenge.challengeId,
    })

    assert.equal(forbidden.status, 404)
    const confirmed = await browser.request(
      '/api/v1/onboarding/profile/phone/verify',
      'POST',
      challenge
    )

    assert.equal(confirmed.status, 200)
  })

  test('unverified pages redirect safely and a limited session cannot reach the player page', async ({
    assert,
  }) => {
    const browser = await new IdentityBrowser().start()

    for (const path of ['/sign-in/code', '/me', '/onboarding']) {
      const response = await browser.request(path)

      assert.equal(response.status, 302)
      assert.equal(response.headers.get('location'), '/sign-in')
    }

    const signed = await signedInBrowser(fake)
    const limited = await signed.request('/me')

    assert.equal(limited.status, 302)
    assert.equal(limited.headers.get('location'), '/onboarding')
  })

  test('request keys reject missing keys and changed input without creating extra deliveries', async ({
    assert,
  }) => {
    const browser = await new IdentityBrowser().start()
    const missing = await browser.request('/api/v1/auth/otp/request', 'POST', {
      email: 'player@example.com',
    })

    assert.equal(missing.status, 422)
    const key = randomUUID()
    const accepted = await browser.request(
      '/api/v1/auth/otp/request',
      'POST',
      { email: 'player@example.com' },
      key
    )

    assert.equal(accepted.status, 202)
    const conflict = await browser.request(
      '/api/v1/auth/otp/request',
      'POST',
      { email: 'other@example.com' },
      key
    )

    assert.equal(conflict.status, 409)
    const deliveries = await db.from('notification_outbox')

    assert.lengthOf(deliveries, 1)
    const events = await db.from('audit_events')

    assert.lengthOf(events, 1)
  })

  test('forwarded headers cannot evade the direct connection request limit', async ({ assert }) => {
    const browser = await new IdentityBrowser().start()

    for (let index = 0; index < 20; index++) {
      browser.extraHeaders = { 'x-forwarded-for': `203.0.113.${index}` }
      const accepted = await browser.request(
        '/api/v1/auth/otp/request',
        'POST',
        { email: `player${index}@example.com` },
        randomUUID()
      )

      assert.equal(accepted.status, 202)
    }

    const limited = await browser.request(
      '/api/v1/auth/otp/request',
      'POST',
      { email: 'one-more@example.com' },
      randomUUID()
    )

    assert.equal(limited.status, 429)
    const deliveries = await db.from('notification_outbox')

    assert.lengthOf(deliveries, 20)
  })

  test('profile commands validate keys and versions and reject conflicting replay input', async ({
    assert,
  }) => {
    const browser = await signedInBrowser(fake)
    const input = { name: 'Pablo', username: 'pablo', phone: '+5551999009633', version: 1 }
    const missingKey = await browser.request('/api/v1/onboarding/profile', 'PATCH', input)

    assert.equal(missingKey.status, 422)

    for (const version of [undefined, 0, -1, 1.5]) {
      const invalid = await browser.request(
        '/api/v1/onboarding/profile',
        'PATCH',
        { ...input, version },
        randomUUID()
      )

      assert.equal(invalid.status, 422)
    }

    const key = randomUUID()
    const saved = await browser.request('/api/v1/onboarding/profile', 'PATCH', input, key)

    assert.equal(saved.status, 200)
    const changedReplay = await browser.request(
      '/api/v1/onboarding/profile',
      'PATCH',
      { ...input, name: 'Changed input' },
      key
    )

    assert.equal(changedReplay.status, 409)
    const current = await browser.request('/api/v1/onboarding/profile')
    const { data } = (await current.json()) as { data: { name: string; version: number } }

    assert.equal(data.name, 'Pablo')
    assert.equal(data.version, 2)
  })

  test('concurrent players cannot claim the same case-insensitive username', async ({ assert }) => {
    const first = await signedInBrowser(fake, 'first@example.com')
    const second = await signedInBrowser(fake, 'second@example.com')
    const input = { name: 'Player', username: 'Pablo', phone: '+5551999009633', version: 1 }
    const results = await Promise.all([
      first.request('/api/v1/onboarding/profile', 'PATCH', input, randomUUID()),
      second.request(
        '/api/v1/onboarding/profile',
        'PATCH',
        { ...input, username: 'pablo' },
        randomUUID()
      ),
    ])

    assert.deepEqual(results.map((response) => response.status).sort(), [200, 422])
    const users = await db.from('users').whereNotNull('username')

    assert.lengthOf(users, 1)
  })

  test('a failed profile write rolls back changes and permits retry with the same key', async ({
    assert,
    cleanup,
  }) => {
    const browser = await signedInBrowser(fake)
    const original = await db.from('users').firstOrFail()
    const input = { name: 'Pablo', username: 'pablo', phone: '+5551999009633', version: 1 }
    const key = randomUUID()

    await db.rawQuery(`CREATE FUNCTION test_reject_profile_write() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Profile write unavailable'; END $$;
      CREATE TRIGGER test_reject_profile_write AFTER UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION test_reject_profile_write()`)
    cleanup(async () => {
      await db.rawQuery(
        'DROP TRIGGER IF EXISTS test_reject_profile_write ON users; DROP FUNCTION IF EXISTS test_reject_profile_write()'
      )
    })

    const rejected = await browser.request('/api/v1/onboarding/profile', 'PATCH', input, key)

    assert.equal(rejected.status, 500)
    assert.deepEqual(await rejected.json(), {
      errors: { general: 'Não foi possível concluir a solicitação. Tente novamente.' },
    })
    const unchanged = await db.from('users').where('id', original.id).firstOrFail()

    assert.deepEqual(unchanged, original)
    const commands = await db.from('profile_commands').where('user_id', original.id)

    assert.lengthOf(commands, 0)
    const updates = await db
      .from('audit_events')
      .where('entity_id', original.id)
      .where('operation', 'updated')

    assert.lengthOf(updates, 0)

    await db.rawQuery(
      'DROP TRIGGER test_reject_profile_write ON users; DROP FUNCTION test_reject_profile_write()'
    )
    const recovered = await browser.request('/api/v1/onboarding/profile', 'PATCH', input, key)

    assert.equal(recovered.status, 200)
    const saved = await db.from('users').where('id', original.id).firstOrFail()

    assert.equal(saved.name, input.name)
    assert.equal(saved.username, input.username)
    assert.equal(saved.phone, input.phone)
    assert.equal(saved.version, 2)
    const committedCommands = await db.from('profile_commands').where('user_id', original.id)

    assert.lengthOf(committedCommands, 1)
    const committedUpdates = await db
      .from('audit_events')
      .where('entity_id', original.id)
      .where('operation', 'updated')

    assert.lengthOf(committedUpdates, 1)
  })

  test('an unavailable outbox rolls back the challenge and queues no email', async ({
    assert,
    cleanup,
  }) => {
    await db.rawQuery(`CREATE FUNCTION test_reject_outbox() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Outbox unavailable'; END $$;
      CREATE TRIGGER test_reject_outbox BEFORE INSERT ON notification_outbox
      FOR EACH ROW EXECUTE FUNCTION test_reject_outbox()`)
    cleanup(async () => {
      await db.rawQuery(
        'DROP TRIGGER test_reject_outbox ON notification_outbox; DROP FUNCTION test_reject_outbox()'
      )
    })
    const browser = await new IdentityBrowser().start()
    const rejected = await browser.request(
      '/api/v1/auth/otp/request',
      'POST',
      { email: 'player@example.com' },
      randomUUID()
    )

    assert.equal(rejected.status, 500)

    for (const table of [
      'otp_challenges',
      'notification_outbox',
      'otp_request_events',
      'audit_events',
      'users',
    ]) {
      const records = await db.from(table)

      assert.lengthOf(records, 0)
    }

    await new DispatchOtpOutboxJob().execute()
    fake.messages.assertNoneSent()
  })

  test('the permanent Arena Eleggante sequence number cannot be changed', async ({ assert }) => {
    await signedInBrowser(fake)
    const user = await db.from('users').firstOrFail()

    await assert.rejects(async () => {
      await db
        .from('users')
        .where('id', user.id)
        .update({ arena_number: Number(user.arena_number) + 1000 })
    })
    const unchanged = await db.from('users').where('id', user.id).firstOrFail()

    assert.equal(unchanged.arena_id, user.arena_id)
  })

  test('corrupted sign-in and phone-change material cannot create or change an identity', async ({
    assert,
  }) => {
    const first = await new IdentityBrowser().start()
    const code = await deliveredCode(first, fake)

    await db
      .from('otp_challenges')
      .where('id', code.challengeId)
      .update({ email_encrypted: 'corrupt' })
    const denied = await first.request('/api/v1/auth/otp/verify', 'POST', code)

    assert.equal(denied.status, 422)
    await db.from('otp_request_events').delete()
    const { browser, userId, challenge } = await phoneChange()
    const original = await db
      .from('otp_challenges')
      .where('id', challenge.challengeId)
      .firstOrFail()

    for (const changes of [
      { user_id: null },
      { user_id: userId, intent_encrypted: 'corrupt' },
      {
        user_id: userId,
        intent_encrypted: encryption.encrypt({
          ...encryption.decrypt<Record<string, unknown>>(original.intent_encrypted),
          userId: randomUUID(),
        }),
      },
    ]) {
      await db.from('otp_challenges').where('id', challenge.challengeId).update(changes)
      const result = await browser.request(
        '/api/v1/onboarding/profile/phone/verify',
        'POST',
        challenge
      )

      assert.equal(result.status, 422)
    }

    const profile = await browser.request('/api/v1/onboarding/profile')
    const { data } = (await profile.json()) as { data: { phone: string; version: number } }

    assert.equal(data.phone, '+5551999009633')
    assert.equal(data.version, 2)
  })

  test('deactivation racing a profile write or phone confirmation prevents the mutation', async ({
    assert,
  }) => {
    for (const operation of ['profile', 'phone']) {
      await db.from('otp_request_events').delete()
      const { browser, input, userId, challenge } = await phoneChange()
      let response!: Promise<Response>

      await db.transaction(async (transaction) => {
        await transaction.from('users').where('id', userId).forUpdate().firstOrFail()
        response =
          operation === 'profile'
            ? browser.request(
                '/api/v1/onboarding/profile',
                'PATCH',
                { ...input, name: 'Forbidden update', version: 2 },
                randomUUID()
              )
            : browser.request('/api/v1/onboarding/profile/phone/verify', 'POST', challenge)
        await waitUntil(async () => {
          await transaction.rawQuery('SELECT pg_stat_clear_snapshot()')
          const waiting = await transaction.rawQuery(
            "SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query ILIKE '%users%' AND query ILIKE '%for update%'"
          )

          return waiting.rows.length > 0
        })
        await transaction
          .from('users')
          .where('id', userId)
          .update({ status: 'anonymized', email: null, username: null })
      })
      const rejected = await response

      assert.equal(rejected.status, operation === 'profile' ? 401 : 422)
      const unchanged = await db.from('users').where('id', userId).firstOrFail()

      assert.equal(unchanged.name, 'Pablo')
      assert.equal(unchanged.phone, input.phone)
    }
  })
})
