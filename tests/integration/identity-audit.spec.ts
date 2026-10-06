import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import mail from '@adonisjs/mail/services/main'
import { randomUUID } from 'node:crypto'
import { IdentityBrowser } from '../support/identity-browser.js'
import { deliveredCode } from '../support/identity-fixtures.js'

test.group('Private identity audit', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('identity transitions append stable references without personal values or secrets', async ({
    assert,
    cleanup,
  }) => {
    const fake = mail.fake()
    cleanup(() => mail.restore())
    const browser = await new IdentityBrowser().start()
    const challenge = await deliveredCode(browser, fake, 'audited@example.com')
    const queued = await db.from('audit_events').firstOrFail()
    assert.equal(queued.operation, 'notification_queued')
    assert.isNull(queued.actor_user_id)
    assert.isNull(queued.entity_id)
    assert.isNull(queued.entity_version)
    assert.equal(queued.stable_references.challengeId, challenge.challengeId)
    assert.match(queued.stable_references.outboxId, /^[a-f0-9-]{36}$/)
    assert.match(queued.request_id, /^[a-f0-9-]{36}$/)
    const verified = await browser.request('/api/v1/auth/otp/verify', 'POST', challenge)
    assert.equal(verified.status, 200)
    const saved = await browser.request(
      '/api/v1/onboarding/profile',
      'PATCH',
      {
        name: 'Private Player',
        username: 'private.player',
        phone: '+5551999009633',
        version: 1,
      },
      randomUUID()
    )
    assert.equal(saved.status, 200)
    const events = await db.from('audit_events').orderBy('created_at')
    assert.deepEqual(
      events.map((event) => event.operation),
      ['notification_queued', 'created', 'updated']
    )
    assert.equal(events[1].entity_id, events[2].entity_id)
    assert.equal(events[2].entity_version, 2)
    for (const event of events) {
      assert.deepEqual(event.updated_at, event.created_at)
      for (const value of [
        'audited@example.com',
        'Private Player',
        'private.player',
        '+5551999009633',
      ]) {
        assert.notInclude(JSON.stringify(event), value)
      }
    }
    await assert.rejects(async () => {
      await db.from('audit_events').update({ operation: 'updated' })
    })
    await assert.rejects(async () => {
      await db.from('audit_events').delete()
    })
    const retained = await db.from('audit_events')
    assert.lengthOf(retained, 3)
    const publicResponse = await browser.request('/api/v1/audit')
    assert.equal(publicResponse.status, 404)
  })
})
