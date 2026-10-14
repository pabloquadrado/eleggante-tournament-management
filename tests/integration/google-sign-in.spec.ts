import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { IdentityBrowser } from '../support/identity-browser.ts'
import { GoogleProviderFixture, beginGoogle, googleCallback } from '../support/google-provider.ts'
import { signedInBrowser, deliveredCode } from '../support/identity-fixtures.ts'
import mail from '@adonisjs/mail/services/main'
import db from '@adonisjs/lucid/services/db'
import { randomUUID } from 'node:crypto'
import crypto from 'node:crypto'
import { syncBuiltinESMExports } from 'node:module'
import { mock } from 'node:test'
import app from '@adonisjs/core/services/app'
import { ConsentPolicy } from '../../app/modules/identity/domain/consent-policy.ts'
import { PostgresIdentityRetention } from '../../app/modules/identity/infrastructure/postgres/identity-retention.ts'
import logger from '@adonisjs/core/services/logger'

test.group('Google player sign-in', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('unavailable authorization entropy returns safe recovery with no partial attempt or identity', async ({
    assert,
    cleanup,
  }) => {
    const provider = new GoogleProviderFixture()

    cleanup(provider.install())
    const browser = await new IdentityBrowser().start()
    const originalRandom = crypto.randomBytes
    const random = mock.method(crypto, 'randomBytes', (size: number) => {
      if (size === 32) throw new Error('Private system entropy diagnostic')

      return originalRandom(size)
    })

    syncBuiltinESMExports()
    cleanup(() => {
      random.mock.restore()
      syncBuiltinESMExports()
    })
    const failed = await browser.request('/auth/google')

    assert.equal(failed.status, 302)
    assert.equal(failed.headers.get('location'), '/sign-in')
    assert.equal(failed.headers.get('cache-control'), 'no-store')
    assert.notInclude(await failed.text(), 'Private system entropy diagnostic')
    assert.equal(provider.exchanges, 0)
    assert.lengthOf(await db.from('google_auth_attempts'), 0)
    assert.lengthOf(await db.from('auth_identities'), 0)
    assert.lengthOf(await db.from('users'), 0)
    assert.lengthOf(await db.from('sessions').whereNotNull('user_id'), 0)
  })

  test('Google audit, public responses and failed-request logs exclude private provider material', async ({
    assert,
    cleanup,
  }) => {
    const provider = new GoogleProviderFixture()

    cleanup(provider.install())
    const records: string[] = []
    const previousLogger = logger.pino

    logger.pino = logger.create({
      enabled: true,
      level: 'trace',
      destination: { write: (message: string) => records.push(message) },
    }).pino
    cleanup(() => {
      logger.pino = previousLogger
    })
    const browser = await new IdentityBrowser().start()
    const start = await beginGoogle(browser)
    const secretAttempt = await db.from('google_auth_attempts').firstOrFail()
    const completed = await browser.request(googleCallback(start.state))

    assert.equal(completed.headers.get('location'), '/onboarding')
    const publicResponse = await browser.request('/api/v1/tournaments')
    const publicBody = await publicResponse.text()
    const audit = await db.from('audit_events')

    assert.lengthOf(audit, 1)
    assert.equal(audit[0].operation, 'created')
    assert.match(audit[0].stable_references.authIdentityId, /^[a-f0-9-]{36}$/)
    assert.match(audit[0].stable_references.attemptId, /^[a-f0-9-]{36}$/)
    // Fail an actual start write to exercise the production exception/log path.
    await db.rawQuery(`CREATE FUNCTION test_google_start_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Private provider diagnostic fixture-secret'; END $$;
      CREATE TRIGGER test_google_start_failure BEFORE INSERT ON google_auth_attempts FOR EACH ROW EXECUTE FUNCTION test_google_start_failure()`)
    cleanup(async () => {
      await db.rawQuery(
        'DROP TRIGGER IF EXISTS test_google_start_failure ON google_auth_attempts; DROP FUNCTION IF EXISTS test_google_start_failure()'
      )
    })
    const failed = await browser.request('/auth/google')
    const failedBody = await failed.text()

    assert.equal(failed.headers.get('location'), '/sign-in')
    assert.include(records.join(''), 'Identity request failed; private diagnostics omitted')

    for (const privateValue of [
      'player@example.com',
      'PLAYER@example.com',
      'fixture-subject',
      'fixture-code',
      'fixture-access-token',
      'ignored-untrusted-id-token',
      'ignored-refresh-token',
      'fixture-secret',
      'Ignored Google Name',
      'https://example.com/ignored',
      start.state,
      secretAttempt.material_encrypted,
      'Private provider diagnostic',
    ]) {
      assert.notInclude(JSON.stringify(audit), privateValue)
      assert.notInclude(publicBody, privateValue)
      assert.notInclude(failedBody, privateValue)
      assert.notInclude(records.join(''), privateValue)
    }

    assert.lengthOf(await db.from('google_auth_attempts'), 1)
  })

  test('account, link, audit, attempt, session and commit failures preserve prior access atomically', async ({
    assert,
    cleanup,
  }) => {
    const fake = mail.fake()

    cleanup(() => mail.restore())
    const browser = await signedInBrowser(fake)
    const before = await browser.request('/api/v1/onboarding/profile')
    const original = await before.json()
    const provider = new GoogleProviderFixture()

    provider.proof = { sub: 'new-subject', email: 'new@example.com', email_verified: true }
    cleanup(provider.install())
    const failurePoints = [
      { table: 'users', event: 'AFTER INSERT' },
      { table: 'auth_identities', event: 'AFTER INSERT' },
      { table: 'audit_events', event: 'AFTER INSERT' },
      { table: 'google_auth_attempts', event: 'AFTER UPDATE' },
      { table: 'sessions', event: 'AFTER INSERT' },
      { table: 'sessions', event: 'AFTER INSERT', deferred: true },
    ]
    const originalUser = await db.from('users').firstOrFail()
    const originalAudit = await db.from('audit_events').orderBy('id')

    cleanup(async () => {
      for (const table of new Set(failurePoints.map((point) => point.table)))
        await db.rawQuery(`DROP TRIGGER IF EXISTS test_google_failure ON ${table}`)

      await db.rawQuery('DROP FUNCTION IF EXISTS test_google_failure()')
    })

    for (const { table, event, deferred } of failurePoints) {
      const { state } = await beginGoogle(browser)
      const priorCookie = browser.cookies.get('adonis-session')
      const attempt = await db
        .from('google_auth_attempts')
        .orderBy('created_at', 'desc')
        .firstOrFail()

      await db.rawQuery(`CREATE FUNCTION test_google_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Private injected callback failure'; END $$;
        CREATE ${deferred ? 'CONSTRAINT ' : ''}TRIGGER test_google_failure ${event} ON ${table} ${deferred ? 'DEFERRABLE INITIALLY DEFERRED' : ''} FOR EACH ROW EXECUTE FUNCTION test_google_failure()`)
      const failed = await browser.request(googleCallback(state))

      assert.equal(failed.headers.get('location'), '/sign-in')
      assert.equal(failed.headers.get('cache-control'), 'no-store')
      assert.equal(failed.headers.get('referrer-policy'), 'no-referrer')
      assert.isTrue(
        browser.cookies.get('adonis-session') === priorCookie,
        `${table} ${deferred ? 'deferred commit' : event} must preserve the prior cookie`
      )
      // Remove the injected outage before reading through the ordinary session
      // store, which also uses INSERT when refreshing an existing session.
      await db.rawQuery(
        `DROP TRIGGER test_google_failure ON ${table}; DROP FUNCTION test_google_failure()`
      )
      const retained = await browser.request('/api/v1/onboarding/profile')

      assert.deepEqual(await retained.json(), original)
      const rolledBackAttempt = await db
        .from('google_auth_attempts')
        .where('id', attempt.id)
        .firstOrFail()
      const users = await db.from('users').count('* as count')
      const links = await db.from('auth_identities').count('* as count')

      assert.equal(users[0].count, '1')
      assert.equal(links[0].count, '0')
      assert.deepEqual(await db.from('users').firstOrFail(), originalUser)
      assert.deepEqual(await db.from('audit_events').orderBy('id'), originalAudit)
      const sessions = await db.from('sessions').whereNotNull('user_id')

      assert.lengthOf(sessions, 1)
      assert.equal(sessions[0].user_id, originalUser.id)
      assert.isNull(rolledBackAttempt.consumed_at)
      assert.isNotNull(rolledBackAttempt.material_encrypted)
    }

    const fresh = await beginGoogle(browser)
    const recovered = await browser.request(googleCallback(fresh.state))

    assert.equal(recovered.headers.get('location'), '/onboarding')
    const users = await db.from('users').count('* as count')

    assert.equal(users[0].count, '2')
  })

  test('OTP and profile writes progress during provider I/O and Google preserves their committed result', async ({
    assert,
    cleanup,
  }) => {
    const provider = new GoogleProviderFixture()
    const fake = mail.fake()

    cleanup(provider.install())
    cleanup(() => mail.restore())
    const google = await new IdentityBrowser().start()
    const otp = await new IdentityBrowser().start()
    const challenge = await deliveredCode(otp, fake)
    let saved: unknown
    let player: unknown

    provider.onExchange = async () => {
      const completed = await otp.request('/api/v1/auth/otp/verify', 'POST', challenge)

      assert.equal(completed.status, 200)
      const profile = await otp.request(
        '/api/v1/onboarding/profile',
        'PATCH',
        {
          name: 'Concurrent Player',
          username: 'concurrent.player',
          phone: '+5551999009633',
          version: 1,
        },
        randomUUID()
      )

      assert.equal(profile.status, 200)
      saved = await profile.json()
      player = await db.from('users').firstOrFail()
    }
    const { state } = await beginGoogle(google)
    const callback = await google.request(googleCallback(state))

    assert.equal(callback.headers.get('location'), '/onboarding')
    const result = await google.request('/api/v1/onboarding/profile')

    assert.deepEqual(await result.json(), saved)
    assert.deepEqual(await db.from('users').firstOrFail(), player)
  })

  test('completion rechecks deleted or expired attempts and account eligibility after provider I/O', async ({
    assert,
    cleanup,
  }) => {
    const provider = new GoogleProviderFixture()
    const fake = mail.fake()

    cleanup(provider.install())
    cleanup(() => mail.restore())
    const owner = await signedInBrowser(fake)
    const before = await owner.request('/api/v1/onboarding/profile')
    const original = await before.json()

    for (const change of ['deleted', 'expired', 'inactive']) {
      const browser = await new IdentityBrowser().start()
      const { state } = await beginGoogle(browser)

      provider.onExchange = async () => {
        if (change === 'deleted') await db.from('google_auth_attempts').delete()

        if (change === 'expired')
          await db.from('google_auth_attempts').update({ expires_at: new Date(0) })

        if (change === 'inactive') await db.from('users').update({ status: 'anonymized' })
      }
      const callback = await browser.request(googleCallback(state))

      assert.equal(callback.headers.get('location'), '/sign-in')
      const privateProfile = await browser.request('/api/v1/onboarding/profile')

      assert.equal(privateProfile.status, 401)
      assert.lengthOf(await db.from('auth_identities'), 0)

      if (change !== 'inactive') {
        const retained = await owner.request('/api/v1/onboarding/profile')

        assert.deepEqual(await retained.json(), original)
      }
    }
  })

  test('foreign attempts stay usable and distinct Google subjects can open the same player', async ({
    assert,
    cleanup,
  }) => {
    const provider = new GoogleProviderFixture()

    cleanup(provider.install())
    const owner = await new IdentityBrowser().start()
    const foreign = await new IdentityBrowser().start()
    const { state } = await beginGoogle(owner)
    const denied = await foreign.request(googleCallback(state))

    assert.equal(denied.headers.get('location'), '/sign-in')
    assert.equal(provider.exchanges, 0)
    const completed = await owner.request(
      googleCallback(state, 'code=fixture-code&iss=https%3A%2F%2Faccounts.google.com')
    )

    assert.equal(completed.headers.get('location'), '/onboarding')
    const profile = await owner.request('/api/v1/onboarding/profile')
    const original = await profile.json()

    provider.proof = { sub: 'another-subject', email: 'player@example.com', email_verified: true }
    const fresh = await beginGoogle(foreign)

    await foreign.request(googleCallback(fresh.state))
    const sameProfile = await foreign.request('/api/v1/onboarding/profile')

    assert.deepEqual(await sameProfile.json(), original)
    assert.lengthOf(await db.from('users'), 1)
    assert.lengthOf(await db.from('auth_identities'), 2)
  })

  test('cancellation and provider failures scrub their attempts and expose only safe recovery', async ({
    assert,
    cleanup,
  }) => {
    const provider = new GoogleProviderFixture()

    cleanup(provider.install())
    const browser = await new IdentityBrowser().start()
    const cancellation = await beginGoogle(browser)
    const canceled = await browser.request(
      googleCallback(
        cancellation.state,
        'error=access_denied&error_description=private-provider-detail'
      )
    )

    assert.equal(canceled.headers.get('location'), '/sign-in')
    assert.equal(provider.exchanges, 0)
    provider.onExchange = async () => {
      throw new Error('Private provider diagnostic')
    }
    const fresh = await beginGoogle(browser)
    const failed = await browser.request(googleCallback(fresh.state))

    assert.equal(failed.headers.get('location'), '/sign-in')
    const rows = await db.from('google_auth_attempts')

    for (const row of rows) {
      assert.isNull(row.material_encrypted)
      assert.isNotNull(row.invalidated_at)
    }

    const users = await db.from('users').count('* as count')

    assert.equal(users[0].count, '0')
  })

  test('retention erases expired attempt secrets immediately and removes replay records after one day', async ({
    assert,
    cleanup,
  }) => {
    const provider = new GoogleProviderFixture()

    cleanup(provider.install())
    const browser = await new IdentityBrowser().start()

    await beginGoogle(browser)
    await db.from('google_auth_attempts').update({ expires_at: new Date(Date.now() - 60000) })
    const now = new Date()
    const retention = new PostgresIdentityRetention()

    await retention.clean({
      now,
      requestCutoff: new Date(0),
      replayCutoff: new Date(now.getTime() - 86400000),
    })
    const retained = await db.from('google_auth_attempts').firstOrFail()

    assert.isNull(retained.material_encrypted)
    await db.from('google_auth_attempts').update({ expires_at: new Date(0) })
    await retention.clean({
      now,
      requestCutoff: new Date(0),
      replayCutoff: new Date(now.getTime() - 86400000),
    })
    const rows = await db.from('google_auth_attempts')

    assert.lengthOf(rows, 0)
  })

  test('Google then email code and independent Google attempts converge on one player', async ({
    assert,
    cleanup,
  }) => {
    const provider = new GoogleProviderFixture()

    cleanup(provider.install())
    const google = await new IdentityBrowser().start()
    const { state } = await beginGoogle(google)

    await google.request(googleCallback(state))
    const firstProfile = await google.request('/api/v1/onboarding/profile')
    const original = await firstProfile.json()
    const fake = mail.fake()

    cleanup(() => mail.restore())
    const otp = await signedInBrowser(fake, 'Player@Example.COM')
    const viaOtp = await otp.request('/api/v1/onboarding/profile')

    assert.deepEqual(await viaOtp.json(), original)
    const others = await Promise.all([new IdentityBrowser().start(), new IdentityBrowser().start()])
    const starts = await Promise.all(others.map((browser) => beginGoogle(browser)))
    const callbacks = await Promise.all(
      others.map((browser, index) => browser.request(googleCallback(starts[index].state)))
    )

    assert.deepEqual(
      callbacks.map((response) => response.headers.get('location')),
      ['/onboarding', '/onboarding']
    )

    for (const browser of others) {
      const response = await browser.request('/api/v1/onboarding/profile')

      assert.deepEqual(await response.json(), original)
    }

    const users = await db.from('users').count('* as count')
    const identities = await db.from('auth_identities').count('* as count')

    assert.equal(users[0].count, '1')
    assert.equal(identities[0].count, '1')
  })

  test('simultaneous first Google and email-code completions create one account', async ({
    assert,
    cleanup,
  }) => {
    const provider = new GoogleProviderFixture()

    cleanup(provider.install())
    const fake = mail.fake()

    cleanup(() => mail.restore())
    const google = await new IdentityBrowser().start()
    const otp = await new IdentityBrowser().start()
    const { state } = await beginGoogle(google)
    const challenge = await deliveredCode(otp, fake)
    const replies = await Promise.all([
      google.request(googleCallback(state)),
      otp.request('/api/v1/auth/otp/verify', 'POST', challenge),
    ])

    assert.deepEqual(
      replies.map((response) => response.status),
      [302, 200]
    )
    const googleProfile = await google.request('/api/v1/onboarding/profile')
    const otpProfile = await otp.request('/api/v1/onboarding/profile')

    assert.deepEqual(await googleProfile.json(), await otpProfile.json())
    const users = await db.from('users').count('* as count')

    assert.equal(users[0].count, '1')
  })

  test('a raced callback establishes one session and replay cannot reopen private access', async ({
    assert,
    cleanup,
  }) => {
    const provider = new GoogleProviderFixture()

    cleanup(provider.install())
    const first = await new IdentityBrowser().start()
    const { state } = await beginGoogle(first)
    const second = new IdentityBrowser()

    second.cookies = new Map(first.cookies)
    let release!: () => void
    const bothExchanged = new Promise<void>((resolve) => {
      release = resolve
    })

    provider.onExchange = async () => {
      if (provider.exchanges === 2) release()

      await bothExchanged
    }
    const replies = await Promise.all([
      first.request(googleCallback(state)),
      second.request(googleCallback(state)),
    ])

    assert.deepEqual(replies.map((response) => response.headers.get('location')).sort(), [
      '/onboarding',
      '/sign-in',
    ])
    const sessions = await db.from('sessions').whereNotNull('user_id').count('* as count')

    assert.equal(sessions[0].count, '1')
    const replay = await first.request(googleCallback(state))

    assert.equal(replay.headers.get('location'), '/sign-in')
    assert.equal(provider.exchanges, 2)
  })

  test('foreign browsers, malformed callback fields and expired state stop before provider exchange', async ({
    assert,
    cleanup,
  }) => {
    const provider = new GoogleProviderFixture()

    cleanup(provider.install())
    const owner = await new IdentityBrowser().start()
    const { state } = await beginGoogle(owner)
    const foreign = await new IdentityBrowser().start()
    const stolen = await foreign.request(googleCallback(state))

    assert.equal(stolen.headers.get('location'), '/sign-in')

    for (const path of [
      '/auth/google/callback',
      '/auth/google/callback?state=bad&code=anything',
      `${googleCallback(state)}&state=${state}`,
      googleCallback(state, 'code=a&code=b'),
      googleCallback(state, 'code=x&iss=https%3A%2F%2Fevil.example'),
    ]) {
      const response = await owner.request(path)

      assert.equal(response.headers.get('location'), '/sign-in')
    }

    assert.equal(provider.exchanges, 0)
    const fresh = await beginGoogle(owner)

    await db
      .from('google_auth_attempts')
      .whereNull('consumed_at')
      .update({ expires_at: new Date(0) })
    const expired = await owner.request(googleCallback(fresh.state))

    assert.equal(expired.headers.get('location'), '/sign-in')
    assert.equal(provider.exchanges, 0)
    const pendingSecrets = await db
      .from('google_auth_attempts')
      .whereNotNull('material_encrypted')
      .count('* as count')

    assert.equal(pendingSecrets[0].count, '0')
    const users = await db.from('users').count('* as count')

    assert.equal(users[0].count, '0')
  })

  test('unverified and malformed online Google evidence never changes an account', async ({
    assert,
    cleanup,
  }) => {
    const provider = new GoogleProviderFixture()

    cleanup(provider.install())

    for (const proof of [
      { sub: 's', email: 'player@example.com', email_verified: false },
      { sub: 's', email: 'player@example.com', email_verified: 'true' },
      { sub: 's', email: 'player@example.com', email_verified: 'false' },
      { sub: 's', email: 'player@example.com' },
      { sub: 's', email_verified: true },
      { sub: 's', email: 'bad-email', email_verified: true },
      { sub: '', email: 'player@example.com', email_verified: true },
    ]) {
      provider.proof = proof
      const browser = await new IdentityBrowser().start()
      const { state } = await beginGoogle(browser)
      const denied = await browser.request(googleCallback(state))

      assert.equal(denied.headers.get('location'), '/sign-in')
      const privateProfile = await browser.request('/api/v1/onboarding/profile')

      assert.equal(privateProfile.status, 401)
    }

    const users = await db.from('users').count('* as count')
    const links = await db.from('auth_identities').count('* as count')

    assert.equal(users[0].count, '0')
    assert.equal(links[0].count, '0')
  })

  test('a linked subject cannot transfer to a different email or restore an anonymized account', async ({
    assert,
    cleanup,
  }) => {
    const provider = new GoogleProviderFixture()

    cleanup(provider.install())
    const first = await new IdentityBrowser().start()
    const start = await beginGoogle(first)

    await first.request(googleCallback(start.state))
    const player = await db.from('users').firstOrFail()
    const link = await db.from('auth_identities').firstOrFail()

    provider.proof = { sub: 'fixture-subject', email: 'other@example.com', email_verified: true }
    const different = await new IdentityBrowser().start()
    const mismatch = await beginGoogle(different)

    const mismatchResponse = await different.request(googleCallback(mismatch.state))

    assert.equal(mismatchResponse.headers.get('location'), '/sign-in')
    await db.from('users').where('id', player.id).update({ status: 'anonymized' })
    provider.proof = { sub: 'fixture-subject', email: 'player@example.com', email_verified: true }
    const inactive = await beginGoogle(different)

    const inactiveResponse = await different.request(googleCallback(inactive.state))

    assert.equal(inactiveResponse.headers.get('location'), '/sign-in')
    provider.proof = { sub: 'unlinked-subject', email: 'player@example.com', email_verified: true }
    const inactiveEmail = await beginGoogle(different)

    const inactiveEmailResponse = await different.request(googleCallback(inactiveEmail.state))

    assert.equal(inactiveEmailResponse.headers.get('location'), '/sign-in')
    const unchangedLink = await db.from('auth_identities').firstOrFail()

    assert.deepEqual(unchangedLink, link)
    const users = await db.from('users').count('* as count')

    assert.equal(users[0].count, '1')
  })

  test('complete Google profiles obey consent, ownership, logout and session expiry', async ({
    assert,
    cleanup,
  }) => {
    const provider = new GoogleProviderFixture()

    cleanup(provider.install())
    const browser = await new IdentityBrowser().start()
    const initial = await beginGoogle(browser)

    await browser.request(
      googleCallback(initial.state, 'code=fixture-code&role=admin&userId=forged')
    )
    const deniedProfile = await browser.request('/api/v1/me')

    assert.equal(deniedProfile.status, 403)
    await browser.request(
      '/api/v1/onboarding/profile',
      'PATCH',
      { name: 'Player', username: 'player', phone: '+5551999009633', version: 1 },
      randomUUID()
    )
    const limited = await beginGoogle(browser)

    const limitedResponse = await browser.request(googleCallback(limited.state))

    assert.equal(limitedResponse.headers.get('location'), '/onboarding')
    app.container.swap(ConsentPolicy, () => ({ hasCurrentAcceptance: async () => true }))
    cleanup(() => app.container.restore(ConsentPolicy))
    const eligible = await beginGoogle(browser)

    const eligibleResponse = await browser.request(googleCallback(eligible.state))

    assert.equal(eligibleResponse.headers.get('location'), '/me')
    const privateProfile = await browser.request('/api/v1/me?userId=forged')

    assert.equal(privateProfile.status, 200)
    const old = new IdentityBrowser()

    old.cookies = new Map(browser.cookies)
    await browser.request('/api/v1/auth/logout', 'POST')
    const signedOutProfile = await old.request('/api/v1/me')

    assert.equal(signedOutProfile.status, 401)
    const next = await beginGoogle(browser)

    await browser.request(googleCallback(next.state))
    await db
      .from('sessions')
      .whereNotNull('user_id')
      .update({ expires_at: new Date(0) })
    const expiredProfile = await browser.request('/api/v1/me')

    assert.equal(expiredProfile.status, 401)
  })

  test('email-code then Google opens the identical saved profile and immutable identity', async ({
    assert,
    cleanup,
  }) => {
    const fake = mail.fake()

    cleanup(() => mail.restore())
    const otp = await signedInBrowser(fake)
    const saved = await otp.request(
      '/api/v1/onboarding/profile',
      'PATCH',
      {
        name: 'Saved Player',
        username: 'saved.player',
        phone: '+5551999009633',
        version: 1,
      },
      randomUUID()
    )
    const original = await saved.json()
    const playerBefore = await db.from('users').firstOrFail()
    const provider = new GoogleProviderFixture()

    cleanup(provider.install())
    const google = await new IdentityBrowser().start()
    const { state } = await beginGoogle(google)
    const completed = await google.request(googleCallback(state))

    assert.equal(completed.status, 302)
    assert.equal(completed.headers.get('location'), '/onboarding')
    const profile = await google.request('/api/v1/onboarding/profile')

    assert.deepEqual(await profile.json(), original)
    const playerAfter = await db.from('users').firstOrFail()

    assert.deepEqual(playerAfter, playerBefore)
    const links = await db.from('auth_identities').count('* as count')

    assert.equal(links[0].count, '1')
    const attempts = await db.from('google_auth_attempts').firstOrFail()

    assert.isNotNull(attempts.consumed_at)
    assert.isNull(attempts.material_encrypted)
  })

  test('an unavailable provider returns to a clean sign-in page with private recovery', async ({
    assert,
  }) => {
    const browser = await new IdentityBrowser().start()
    const response = await browser.request('/auth/google')

    assert.equal(response.status, 302)
    assert.equal(response.headers.get('location'), '/sign-in')
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
  })
})
