import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import mail from '@adonisjs/mail/services/main'
import db from '@adonisjs/lucid/services/db'
import encryption from '@adonisjs/core/services/encryption'
import app from '@adonisjs/core/services/app'
import { IdentitySecrets } from '../../app/modules/identity/application/ports/identity-adapters.ts'
import type { GoogleSignInIntent } from '../../app/modules/identity/domain/identity-records.ts'
import { randomUUID } from 'node:crypto'
import { IdentityBrowser } from '../support/identity-browser.ts'
import { signedInBrowser } from '../support/identity-fixtures.ts'
import { GoogleProviderFixture, beginGoogle, googleCallback } from '../support/google-provider.ts'
import DispatchOtpOutboxJob from '../../app/jobs/dispatch-otp-outbox-job.ts'
import type { FakeMailer } from '@adonisjs/mail'
import { MessageBuilder } from '@adonisjs/core/helpers'
import { PostgresIdentityRetention } from '../../app/modules/identity/infrastructure/postgres/identity-retention.ts'

async function pendingProof(browser: IdentityBrowser, fake: FakeMailer) {
  const start = await beginGoogle(browser)
  const response = await browser.request(googleCallback(start.state))

  if (response.headers.get('location') !== '/sign-in/code') throw new Error('Expected email proof')

  const challenge = await db.from('otp_challenges').orderBy('created_at', 'desc').firstOrFail()
  const intent = encryption.decrypt<GoogleSignInIntent>(challenge.intent_encrypted)!

  await new DispatchOtpOutboxJob().execute()
  const code = String(fake.messages.sent().at(-1)!.toJSON().message.text).match(/\b\d{6}\b/)![0]

  return { state: start.state, challenge, intent, code }
}

test.group('Current Google email ownership', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('code issuance leaves the Google attempt unconsumed and callback replay preserves usable proof', async ({
    assert,
    cleanup,
  }) => {
    const fake = mail.fake()

    cleanup(() => mail.restore())
    const provider = new GoogleProviderFixture()

    provider.proof = { sub: 'external-subject', email: 'fresh@example.net', email_verified: true }
    cleanup(provider.install())
    const browser = await new IdentityBrowser().start()
    const { state } = await beginGoogle(browser)
    const cookie = browser.cookies.get('adonis-session')
    const callback = await browser.request(googleCallback(state))

    assert.equal(callback.headers.get('location'), '/sign-in/code')
    assert.equal(browser.cookies.get('adonis-session'), cookie)
    assert.lengthOf(await db.from('users'), 0)
    assert.lengthOf(await db.from('auth_identities'), 0)
    assert.lengthOf(await db.from('sessions').whereNotNull('user_id'), 0)
    assert.lengthOf(await db.from('audit_events').whereIn('operation', ['created', 'updated']), 0)
    const attempt = await db.from('google_auth_attempts').firstOrFail()

    assert.isNull(attempt.consumed_at)
    assert.isNull(attempt.invalidated_at)
    assert.isNull(attempt.material_encrypted)
    const challenge = await db.from('otp_challenges').firstOrFail()
    const exchanges = provider.exchanges
    const replay = await browser.request(googleCallback(state))

    assert.equal(replay.headers.get('location'), '/sign-in')
    assert.equal(provider.exchanges, exchanges)
    assert.deepEqual(await db.from('google_auth_attempts').firstOrFail(), attempt)
    assert.lengthOf(await db.from('otp_challenges'), 1)
    await new DispatchOtpOutboxJob().execute()
    const code = String(fake.messages.sent().at(-1)!.toJSON().message.text).match(/\b\d{6}\b/)![0]
    const verified = await browser.request('/api/v1/auth/otp/verify', 'POST', {
      challengeId: challenge.id,
      code,
    })

    assert.equal(verified.status, 200)
    assert.equal(browser.cookies.get('adonis-session') === cookie, false)
    assert.lengthOf(await db.from('users'), 1)
    assert.lengthOf(await db.from('auth_identities'), 1)
    const finished = await db.from('google_auth_attempts').firstOrFail()

    assert.isNotNull(finished.consumed_at)
    const consumedChallenge = await db.from('otp_challenges').firstOrFail()

    assert.isNotNull(consumedChallenge.consumed_at)
  })

  test('stale third-party Google email cannot link or open the current mailbox owner profile', async ({
    assert,
    cleanup,
  }) => {
    const fake = mail.fake()

    cleanup(() => mail.restore())
    const victim = await signedInBrowser(fake, 'recycled@example.net')
    const saved = await victim.request(
      '/api/v1/onboarding/profile',
      'PATCH',
      { name: 'Current Owner', username: 'current.owner', phone: '+5551999009633', version: 1 },
      randomUUID()
    )
    const original = await saved.json()

    await db.from('otp_request_events').delete()
    const provider = new GoogleProviderFixture()

    provider.proof = {
      sub: 'former-mailbox-owner',
      email: 'recycled@example.net',
      email_verified: true,
    }
    cleanup(provider.install())
    const attacker = await new IdentityBrowser().start()
    const { state } = await beginGoogle(attacker)
    const completed = await attacker.request(googleCallback(state))

    assert.equal(completed.headers.get('location'), '/sign-in/code')
    const privateProfile = await attacker.request('/api/v1/onboarding/profile')

    assert.equal(privateProfile.status, 401)
    assert.lengthOf(await db.from('auth_identities'), 0)
    const retained = await victim.request('/api/v1/onboarding/profile')

    assert.deepEqual(await retained.json(), original)
  })

  test('fresh exact-email proof converges with an OTP profile and the stable linked subject returns without another code', async ({
    assert,
    cleanup,
  }) => {
    const fake = mail.fake()

    cleanup(() => mail.restore())
    const owner = await signedInBrowser(fake, 'current@example.net')
    const saved = await owner.request(
      '/api/v1/onboarding/profile',
      'PATCH',
      {
        name: 'Current Player',
        username: 'current.player',
        phone: '+5551999009633',
        version: 1,
      },
      randomUUID()
    )
    const original = await saved.json()
    const originalUser = await db.from('users').firstOrFail()

    await db.from('otp_request_events').delete()
    const provider = new GoogleProviderFixture()

    provider.proof = {
      sub: 'new-stable-subject',
      email: 'CURRENT@Example.NET',
      email_verified: true,
    }
    cleanup(provider.install())
    const browser = await new IdentityBrowser().start()
    const { challenge, code } = await pendingProof(browser, fake)
    const completed = await browser.request('/api/v1/auth/otp/verify', 'POST', {
      challengeId: challenge.id,
      code,
    })

    assert.equal(completed.status, 200)
    const profile = await browser.request('/api/v1/onboarding/profile')

    assert.deepEqual(await profile.json(), original)
    assert.deepEqual(await db.from('users').firstOrFail(), originalUser)
    const association = await db.from('auth_identities').firstOrFail()

    assert.equal(association.user_id, originalUser.id)
    const audits = await db.from('audit_events').where('operation', 'updated')

    assert.equal(audits.at(-1)!.entity_id, originalUser.id)
    const replay = await browser.request('/api/v1/auth/otp/verify', 'POST', {
      challengeId: challenge.id,
      code,
    })

    assert.equal(replay.status, 422)
    const returning = await new IdentityBrowser().start()
    const start = await beginGoogle(returning)
    const callback = await returning.request(googleCallback(start.state))

    assert.equal(callback.headers.get('location'), '/onboarding')
    assert.lengthOf(await db.from('otp_challenges'), 2)
    assert.lengthOf(await db.from('users'), 1)
    assert.lengthOf(await db.from('auth_identities'), 1)
    assert.lengthOf(await db.from('audit_events').where('operation', 'updated'), audits.length)
  })

  for (const mismatch of [
    'wrong-code',
    'foreign-browser',
    'abandoned',
    'expired-code',
    'intent-key',
    'email',
    'subject',
    'invalid-subject',
    'attempt-id',
    'expired-intent',
    'no-intent',
    'other-intent',
    'missing-attempt',
    'foreign-attempt',
    'invalidated-attempt',
    'consumed-attempt',
    'deadline',
    'no-proof',
    'restored-material',
    'proof-subject',
    'proof-email',
  ]) {
    test(`${mismatch} cannot turn a pending Google code into an identity or session`, async ({
      assert,
      cleanup,
    }) => {
      const fake = mail.fake()

      cleanup(() => mail.restore())
      const provider = new GoogleProviderFixture()

      provider.proof = { sub: 'bound-subject', email: 'bound@example.net', email_verified: true }
      cleanup(provider.install())
      const browser = await new IdentityBrowser().start()
      const { challenge, intent, code } = await pendingProof(browser, fake)
      let caller = browser
      let submittedCode = code
      const secrets = await app.container.make(IdentitySecrets)
      const amendIntent = async (changed: unknown) =>
        db
          .from('otp_challenges')
          .where('id', challenge.id)
          .update({
            intent_encrypted: changed === null ? null : encryption.encrypt(changed),
            intent_key: secrets.key('otp-intent', JSON.stringify(changed ?? 'sign_in')),
          })

      if (mismatch === 'wrong-code') submittedCode = 'invalid'

      if (mismatch === 'foreign-browser') caller = await new IdentityBrowser().start()

      if (mismatch === 'abandoned') await browser.request('/sign-in')

      if (mismatch === 'expired-code')
        await db.from('otp_challenges').update({ expires_at: new Date(0) })

      if (mismatch === 'intent-key')
        await db.from('otp_challenges').update({ intent_key: 'invalid' })

      if (mismatch === 'email') await amendIntent({ ...intent, email: 'other@example.net' })

      if (mismatch === 'subject') await amendIntent({ ...intent, subject: 'another-subject' })

      if (mismatch === 'invalid-subject') await amendIntent({ ...intent, subject: '' })

      if (mismatch === 'attempt-id') await amendIntent({ ...intent, attemptId: 'invalid' })

      if (mismatch === 'expired-intent')
        await amendIntent({ ...intent, expiresAt: new Date(0).toISOString() })

      if (mismatch === 'no-intent') await amendIntent(null)

      if (mismatch === 'other-intent')
        await amendIntent({ kind: 'phone_change', userId: randomUUID() })

      if (mismatch === 'missing-attempt') await db.from('google_auth_attempts').delete()

      if (mismatch === 'foreign-attempt')
        await db.from('google_auth_attempts').update({ browser_key: 'other' })

      if (mismatch === 'invalidated-attempt')
        await db.from('google_auth_attempts').update({ invalidated_at: new Date() })

      if (mismatch === 'consumed-attempt')
        await db.from('google_auth_attempts').update({ consumed_at: new Date() })

      if (mismatch === 'deadline')
        await db.from('google_auth_attempts').update({ expires_at: new Date(Date.now() + 100000) })

      if (mismatch === 'no-proof')
        await db.from('google_auth_attempts').update({ email_proof_encrypted: null })

      if (mismatch === 'restored-material')
        await db.from('google_auth_attempts').update({
          material_encrypted: encryption.encrypt({ state: 'state', verifier: 'verifier' }),
        })

      if (mismatch === 'proof-subject')
        await db.from('google_auth_attempts').update({
          email_proof_encrypted: encryption.encrypt({
            subject: 'another-subject',
            email: intent.email,
          }),
        })

      if (mismatch === 'proof-email')
        await db.from('google_auth_attempts').update({
          email_proof_encrypted: encryption.encrypt({
            subject: intent.subject,
            email: 'other@example.net',
          }),
        })

      const cookie = caller.cookies.get('adonis-session')
      const denied = await caller.request('/api/v1/auth/otp/verify', 'POST', {
        challengeId: challenge.id,
        code: submittedCode,
      })

      assert.equal(denied.status, 422)
      assert.equal(caller.cookies.get('adonis-session'), cookie)
      const privateProfile = await caller.request('/api/v1/onboarding/profile')

      assert.equal(privateProfile.status, 401)
      assert.lengthOf(await db.from('users'), 0)
      assert.lengthOf(await db.from('auth_identities'), 0)
      assert.lengthOf(await db.from('sessions').whereNotNull('user_id'), 0)
      assert.lengthOf(await db.from('audit_events').whereIn('operation', ['created', 'updated']), 0)
      const unusedChallenge = await db.from('otp_challenges').firstOrFail()

      assert.isNull(unusedChallenge.consumed_at)
    })
  }

  test('resends retain the immutable Google intent, cooldown, one active code and request idempotency', async ({
    assert,
    cleanup,
  }) => {
    const fake = mail.fake()

    cleanup(() => mail.restore())
    const provider = new GoogleProviderFixture()

    provider.proof = { sub: 'resend-subject', email: 'resend@example.net', email_verified: true }
    cleanup(provider.install())
    const browser = await new IdentityBrowser().start()
    const first = await pendingProof(browser, fake)
    const request = () =>
      browser.request('/api/v1/auth/otp/request', 'POST', { email: 'RESEND@Example.NET' }, key)
    const key = randomUUID()

    const cooldown = await request()

    assert.equal(cooldown.status, 429)
    await db.from('otp_request_events').update({ created_at: new Date(0) })
    const resent = await request()

    assert.equal(resent.status, 202)
    const receipt = (await resent.json()) as { challengeId: string }
    const replay = await request()

    assert.equal(replay.status, 202)
    assert.deepEqual(await replay.json(), receipt)
    const updated = await db.from('otp_challenges').where('id', receipt.challengeId).firstOrFail()

    assert.deepEqual(encryption.decrypt(updated.intent_encrypted), first.intent)
    assert.isAtMost(
      new Date(updated.expires_at).getTime(),
      new Date(first.intent.expiresAt).getTime()
    )
    const oldCode = await browser.request('/api/v1/auth/otp/verify', 'POST', {
      challengeId: first.challenge.id,
      code: first.code,
    })

    assert.equal(oldCode.status, 422)
    assert.lengthOf(await db.from('notification_outbox'), 2)
    const pendingAttempt = await db.from('google_auth_attempts').firstOrFail()

    assert.isNull(pendingAttempt.consumed_at)
    await new DispatchOtpOutboxJob().execute()
    const code = String(fake.messages.sent().at(-1)!.toJSON().message.text).match(/\b\d{6}\b/)![0]
    const completed = await browser.request('/api/v1/auth/otp/verify', 'POST', {
      challengeId: receipt.challengeId,
      code,
    })

    assert.equal(completed.status, 200)
    assert.lengthOf(await db.from('users'), 1)
    assert.lengthOf(await db.from('auth_identities'), 1)
  })

  test('a corrupted pending challenge reference fails safely and cannot enqueue a Google resend', async ({
    assert,
    cleanup,
  }) => {
    const fake = mail.fake()

    cleanup(() => mail.restore())
    const provider = new GoogleProviderFixture()

    provider.proof = { sub: 'bound-subject', email: 'bound@example.net', email_verified: true }
    cleanup(provider.install())
    const browser = await new IdentityBrowser().start()

    await pendingProof(browser, fake)
    const session = await db.from('sessions').firstOrFail()
    const messages = new MessageBuilder()
    const data = messages.verify<{ pendingOtp: { challengeId: unknown } }>(
      session.data,
      session.id
    )!

    data.pendingOtp.challengeId = null
    await db
      .from('sessions')
      .where('id', session.id)
      .update({ data: messages.build(data, undefined, session.id) })
    const denied = await browser.request(
      '/api/v1/auth/otp/request',
      'POST',
      { email: 'bound@example.net' },
      randomUUID()
    )

    assert.equal(denied.status, 422)
    assert.lengthOf(await db.from('otp_challenges'), 1)
    assert.lengthOf(await db.from('notification_outbox'), 1)
    assert.lengthOf(await db.from('users'), 0)
  })

  test('expiry clears pending attempt and challenge secrets without allowing expired proof', async ({
    assert,
    cleanup,
  }) => {
    const fake = mail.fake()

    cleanup(() => mail.restore())
    const provider = new GoogleProviderFixture()

    provider.proof = {
      sub: 'expiring-subject',
      email: 'expiring@example.net',
      email_verified: true,
    }
    cleanup(provider.install())
    const browser = await new IdentityBrowser().start()
    const { challenge, code } = await pendingProof(browser, fake)

    await db.from('google_auth_attempts').update({ expires_at: new Date(0) })
    await db.from('otp_challenges').update({ expires_at: new Date(0) })
    const now = new Date()

    await new PostgresIdentityRetention().clean({
      now,
      requestCutoff: new Date(0),
      replayCutoff: new Date(-1),
    })
    const attempt = await db.from('google_auth_attempts').firstOrFail()
    const expiredChallenge = await db.from('otp_challenges').firstOrFail()

    assert.isNull(attempt.material_encrypted)
    assert.isNull(attempt.email_proof_encrypted)
    assert.isNull(expiredChallenge.intent_encrypted)
    assert.isNull(expiredChallenge.email_encrypted)
    assert.isNull(expiredChallenge.code_hash)
    const denied = await browser.request('/api/v1/auth/otp/verify', 'POST', {
      challengeId: challenge.id,
      code,
    })

    assert.equal(denied.status, 422)
    assert.lengthOf(await db.from('users'), 0)
    assert.lengthOf(await db.from('auth_identities'), 0)
  })

  test('trusted Gmail and matching Workspace are direct while a mismatched hosted domain requires proof', async ({
    assert,
    cleanup,
  }) => {
    const provider = new GoogleProviderFixture()

    cleanup(provider.install())

    for (const [email, hd, direct] of [
      ['Player@Gmail.COM', undefined, true],
      ['Player@Workspace.EXAMPLE', 'WORKSPACE.EXAMPLE', true],
      ['player@third-party.example', 'workspace.example', false],
    ] as const) {
      provider.proof = { sub: email, email, email_verified: true, hd }
      const browser = await new IdentityBrowser().start()
      const { state } = await beginGoogle(browser)
      const callback = await browser.request(googleCallback(state))

      assert.equal(callback.headers.get('location'), direct ? '/onboarding' : '/sign-in/code')
      const profile = await browser.request('/api/v1/onboarding/profile')

      assert.equal(profile.status, direct ? 200 : 401)
    }

    assert.lengthOf(await db.from('users'), 2)
    assert.lengthOf(await db.from('auth_identities'), 2)
  })

  for (const mismatch of [
    'email',
    'challenge-id',
    'expired-challenge',
    'no-intent',
    'intent-email',
    'expired-intent',
    'intent-key',
    'attempt',
  ]) {
    test(`a Google resend with ${mismatch} cannot replace the bound proof`, async ({
      assert,
      cleanup,
    }) => {
      const fake = mail.fake()

      cleanup(() => mail.restore())
      const provider = new GoogleProviderFixture()

      provider.proof = { sub: 'resend-subject', email: 'resend@example.net', email_verified: true }
      cleanup(provider.install())
      const browser = await new IdentityBrowser().start()
      const { challenge, intent } = await pendingProof(browser, fake)

      if (mismatch === 'challenge-id')
        await db
          .from('otp_challenges')
          .where('id', challenge.id)
          .update({ browser_key: 'other-browser' })

      if (mismatch === 'expired-challenge')
        await db.from('otp_challenges').update({ expires_at: new Date(0) })

      if (mismatch === 'no-intent')
        await db.from('otp_challenges').update({ intent_encrypted: null })

      if (mismatch === 'intent-email')
        await db.from('otp_challenges').update({
          intent_encrypted: encryption.encrypt({ ...intent, email: 'other@example.net' }),
        })

      if (mismatch === 'expired-intent')
        await db.from('otp_challenges').update({
          intent_encrypted: encryption.encrypt({
            ...intent,
            expiresAt: new Date(0).toISOString(),
          }),
        })

      if (mismatch === 'intent-key')
        await db.from('otp_challenges').update({ intent_key: 'invalid' })

      if (mismatch === 'attempt')
        await db.from('google_auth_attempts').update({ invalidated_at: new Date() })

      const denied = await browser.request(
        '/api/v1/auth/otp/request',
        'POST',
        { email: mismatch === 'email' ? 'other@example.net' : 'resend@example.net' },
        randomUUID()
      )

      assert.equal(denied.status, 422)
      assert.lengthOf(await db.from('otp_challenges'), 1)
      assert.lengthOf(await db.from('notification_outbox'), 1)
      assert.lengthOf(await db.from('users'), 0)
      assert.lengthOf(await db.from('auth_identities'), 0)
      const pendingAttempt = await db.from('google_auth_attempts').firstOrFail()

      assert.isNull(pendingAttempt.consumed_at)
    })
  }

  test('an inactive account or conflicting subject established after issuance cannot be opened by pending proof', async ({
    assert,
    cleanup,
  }) => {
    const fake = mail.fake()

    cleanup(() => mail.restore())
    const owner = await signedInBrowser(fake, 'inactive@example.net')

    await db.from('otp_request_events').delete()
    const provider = new GoogleProviderFixture()

    provider.proof = {
      sub: 'inactive-subject',
      email: 'inactive@example.net',
      email_verified: true,
    }
    cleanup(provider.install())
    const browser = await new IdentityBrowser().start()
    const first = await pendingProof(browser, fake)

    await db.from('users').update({ status: 'anonymized' })
    const denied = await browser.request('/api/v1/auth/otp/verify', 'POST', {
      challengeId: first.challenge.id,
      code: first.code,
    })

    assert.equal(denied.status, 422)
    assert.lengthOf(await db.from('auth_identities'), 0)
    const inactiveProfile = await owner.request('/api/v1/onboarding/profile')
    const pendingAttempt = await db.from('google_auth_attempts').firstOrFail()

    assert.equal(inactiveProfile.status, 401)
    assert.isNull(pendingAttempt.consumed_at)

    provider.proof = { sub: 'conflict-subject', email: 'fresh@example.net', email_verified: true }
    const pendingBrowser = await new IdentityBrowser().start()
    const pending = await pendingProof(pendingBrowser, fake)

    provider.proof = { sub: 'conflict-subject', email: 'other@gmail.com', email_verified: true }
    const other = await new IdentityBrowser().start()
    const start = await beginGoogle(other)

    const otherCallback = await other.request(googleCallback(start.state))

    assert.equal(otherCallback.headers.get('location'), '/onboarding')
    const linked = await db.from('auth_identities').firstOrFail()
    const conflicting = await pendingBrowser.request('/api/v1/auth/otp/verify', 'POST', {
      challengeId: pending.challenge.id,
      code: pending.code,
    })

    assert.equal(conflicting.status, 422)
    assert.deepEqual(await db.from('auth_identities').firstOrFail(), linked)
    assert.lengthOf(await db.from('users'), 2)
    const conflictingAttempt = await db
      .from('google_auth_attempts')
      .where('id', pending.intent.attemptId)
      .firstOrFail()

    assert.isNull(conflictingAttempt.consumed_at)
  })

  test('concurrent fresh proof can consume one challenge only once and an independent OTP session converges', async ({
    assert,
    cleanup,
  }) => {
    const fake = mail.fake()

    cleanup(() => mail.restore())
    const provider = new GoogleProviderFixture()

    provider.proof = {
      sub: 'parallel-subject',
      email: 'parallel@example.net',
      email_verified: true,
    }
    cleanup(provider.install())
    const browser = await new IdentityBrowser().start()
    const { challenge, code } = await pendingProof(browser, fake)
    const responses = await Promise.all(
      [1, 2].map(() =>
        browser.request('/api/v1/auth/otp/verify', 'POST', { challengeId: challenge.id, code })
      )
    )

    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 422])
    const originalUser = await db.from('users').firstOrFail()

    await db.from('otp_request_events').delete()
    const otp = await signedInBrowser(fake, 'PARALLEL@Example.NET')
    const profile = await otp.request('/api/v1/onboarding/profile')

    assert.equal(((await profile.json()) as { data: { id: string } }).data.id, originalUser.id)
    assert.lengthOf(await db.from('users'), 1)
    assert.lengthOf(await db.from('auth_identities'), 1)
    assert.lengthOf(await db.from('audit_events').where('operation', 'created'), 1)
  })

  test('every final proof write and deferred commit failure preserves the previous browser and both unused proofs', async ({
    assert,
    cleanup,
  }) => {
    const fake = mail.fake()

    cleanup(() => mail.restore())
    const browser = await signedInBrowser(fake, 'previous@example.net')
    const originalResponse = await browser.request('/api/v1/onboarding/profile')
    const original = await originalResponse.json()
    const provider = new GoogleProviderFixture()

    provider.proof = { sub: 'new-subject', email: 'new@example.net', email_verified: true }
    cleanup(provider.install())
    const { challenge, intent, code } = await pendingProof(browser, fake)
    const originalAudit = await db.from('audit_events').orderBy('id')
    const points = [
      { table: 'users', event: 'AFTER INSERT' },
      { table: 'auth_identities', event: 'AFTER INSERT' },
      { table: 'audit_events', event: 'AFTER INSERT' },
      { table: 'google_auth_attempts', event: 'AFTER UPDATE' },
      { table: 'otp_challenges', event: 'AFTER UPDATE' },
      { table: 'sessions', event: 'AFTER INSERT' },
      { table: 'sessions', event: 'AFTER INSERT', deferred: true },
    ]

    cleanup(async () => {
      for (const { table } of points)
        await db.rawQuery(`DROP TRIGGER IF EXISTS test_proof_failure ON ${table}`)

      await db.rawQuery('DROP FUNCTION IF EXISTS test_proof_failure()')
    })

    for (const { table, event, deferred } of points) {
      const priorCookie = browser.cookies.get('adonis-session')

      await db.rawQuery(`CREATE FUNCTION test_proof_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Private proof failure'; END $$;
        CREATE ${deferred ? 'CONSTRAINT ' : ''}TRIGGER test_proof_failure ${event} ON ${table} ${deferred ? 'DEFERRABLE INITIALLY DEFERRED' : ''} FOR EACH ROW EXECUTE FUNCTION test_proof_failure()`)
      const failed = await browser.request('/api/v1/auth/otp/verify', 'POST', {
        challengeId: challenge.id,
        code,
      })

      assert.equal(failed.status, 500)
      assert.deepEqual(await failed.json(), {
        errors: { general: 'Não foi possível concluir a solicitação. Tente novamente.' },
      })
      assert.equal(browser.cookies.get('adonis-session'), priorCookie)
      await db.rawQuery(
        `DROP TRIGGER test_proof_failure ON ${table}; DROP FUNCTION test_proof_failure()`
      )
      const retainedResponse = await browser.request('/api/v1/onboarding/profile')

      assert.deepEqual(await retainedResponse.json(), original)
      assert.lengthOf(await db.from('users'), 1)
      assert.lengthOf(await db.from('auth_identities'), 0)
      assert.deepEqual(await db.from('audit_events').orderBy('id'), originalAudit)
      const attempt = await db
        .from('google_auth_attempts')
        .where('id', intent.attemptId)
        .firstOrFail()

      assert.isNull(attempt.consumed_at)
      assert.isNotNull(attempt.email_proof_encrypted)
      const unusedChallenge = await db
        .from('otp_challenges')
        .where('id', challenge.id)
        .firstOrFail()

      assert.isNull(unusedChallenge.consumed_at)
      assert.lengthOf(await db.from('sessions').whereNotNull('user_id'), 1)
    }

    const recovered = await browser.request('/api/v1/auth/otp/verify', 'POST', {
      challengeId: challenge.id,
      code,
    })

    assert.equal(recovered.status, 200)
    assert.lengthOf(await db.from('users'), 2)
    assert.lengthOf(await db.from('auth_identities'), 1)
    const consumedAttempt = await db
      .from('google_auth_attempts')
      .where('id', intent.attemptId)
      .firstOrFail()

    assert.isNull(consumedAttempt.email_proof_encrypted)
  })
})
