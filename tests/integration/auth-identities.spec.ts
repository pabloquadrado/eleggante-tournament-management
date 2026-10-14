import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { PostgresIdentityUnitOfWork } from '../../app/modules/identity/infrastructure/postgres/unit-of-work.ts'
import { googleAccountCanOpen } from '../../app/modules/identity/domain/google-account-policy.ts'

/** Explicit persistence invariants; player-facing convergence is exercised over HTTP. */
test.group('Google association persistence', (group) => {
  group.each.setup(() => testUtils.db().truncate())
  const work = new PostgresIdentityUnitOfWork()

  test('a rolled-back completion keeps the previous session and removes all new identity writes', async ({
    assert,
  }) => {
    const oldUserId = randomUUID()
    const newUserId = randomUUID()
    const oldSessionId = randomUUID()
    const newSessionId = randomUUID()

    await work.write(async ({ players }) => {
      await players.resolveEmail('existing@example.com', oldUserId)
    })
    await db.table('sessions').insert({
      id: oldSessionId,
      user_id: oldUserId,
      data: 'prior protected session fixture',
      expires_at: new Date(Date.now() + 7200000),
    })
    const prior = await db.from('sessions').where('id', oldSessionId).firstOrFail()

    await assert.rejects(
      () =>
        work.write(async ({ players, authIdentities, audit, sessions }) => {
          const { player } = await players.resolveEmail('new@example.com', newUserId)
          const identityId = randomUUID()

          await authIdentities.attachGoogle({
            id: identityId,
            userId: player.id,
            subject: 'subject',
            now: new Date(),
          })
          await audit.append({
            actorUserId: player.id,
            entityId: player.id,
            operation: 'created',
            entityVersion: 1,
            requestId: randomUUID(),
            references: { authIdentityId: identityId },
          })
          await sessions.replace({
            id: newSessionId,
            oldId: oldSessionId,
            userId: player.id,
            data: 'new protected session fixture',
            expiresAt: new Date(Date.now() + 7200000),
          })
          throw new Error('Interrupted before commit')
        }),
      'Interrupted before commit'
    )
    const preserved = await db.from('sessions').where('id', oldSessionId).firstOrFail()
    const newSession = await db.from('sessions').where('id', newSessionId).first()
    const newUser = await db.from('users').where('id', newUserId).first()
    const links = await db.from('auth_identities').count('* as count')
    const audits = await db.from('audit_events').count('* as count')

    assert.deepEqual(preserved, prior)
    assert.isNull(newSession)
    assert.isNull(newUser)
    assert.equal(links[0].count, '0')
    assert.equal(audits[0].count, '0')
  })

  test('serialized concurrent identity writes preserve one existing account and its saved profile', async ({
    assert,
  }) => {
    const id = randomUUID()
    const details = { name: 'Saved Player', username: 'saved.player', phone: '+5551999009633' }

    await work.write(async ({ players }) => {
      await players.resolveEmail('player@example.com', id)
      await players.save(id, details, 2, new Date())
    })
    const original = await db.from('users').where('id', id).firstOrFail()
    const results = await Promise.all(
      ['subject-a', 'subject-b'].map((subject) =>
        work.write(async ({ players, authIdentities }) => {
          const resolved = await players.resolveEmail('player@example.com', randomUUID())

          await authIdentities.attachGoogle({
            id: randomUUID(),
            userId: resolved.player.id,
            subject,
            now: new Date(),
          })

          return resolved
        })
      )
    )

    for (const { player, created } of results) {
      assert.equal(player.id, id)
      assert.equal(player.arenaId, original.arena_id)
      assert.isFalse(created)
      assert.equal(player.name, details.name)
      assert.equal(player.username, details.username)
      assert.equal(player.phone, details.phone)
      assert.equal(player.version, 2)
    }

    const unchanged = await db.from('users').where('id', id).firstOrFail()

    assert.deepEqual(unchanged, original)
  })

  test('persisted linked players retain the active and matching-email requirement', async ({
    assert,
  }) => {
    const id = randomUUID()

    await work.write(async ({ players, authIdentities }) => {
      await players.resolveEmail('player@example.com', id)
      await authIdentities.attachGoogle({
        id: randomUUID(),
        userId: id,
        subject: 'subject',
        now: new Date(),
      })
      const link = await authIdentities.findGoogle('subject')
      const player = await players.lock(link!.userId)

      assert.isTrue(
        googleAccountCanOpen(player, { subject: 'subject', email: 'player@example.com' })
      )
      assert.isFalse(
        googleAccountCanOpen(player, { subject: 'subject', email: 'other@example.com' })
      )
    })
    await db.from('users').where('id', id).update({ status: 'anonymized' })
    await work.write(async ({ players, authIdentities }) => {
      const link = await authIdentities.findGoogle('subject')
      const player = await players.lock(link!.userId)

      assert.isFalse(
        googleAccountCanOpen(player, { subject: 'subject', email: 'player@example.com' })
      )
      assert.equal(link!.userId, id)
    })
  })

  test('subjects are case-sensitive, unique across users, and may share one player', async ({
    assert,
  }) => {
    const playerId = randomUUID()
    const otherId = randomUUID()
    const firstId = randomUUID()
    const secondId = randomUUID()

    await work.write(async ({ players, authIdentities }) => {
      await players.resolveEmail('player@example.com', playerId)
      await players.resolveEmail('other@example.com', otherId)
      assert.isNull(await authIdentities.findGoogle('Subject-A'))
      await authIdentities.attachGoogle({
        id: firstId,
        userId: playerId,
        subject: 'Subject-A',
        now: new Date(),
      })
      await authIdentities.attachGoogle({
        id: secondId,
        userId: playerId,
        subject: 'subject-a',
        now: new Date(),
      })
      assert.deepEqual(await authIdentities.findGoogle('Subject-A'), {
        id: firstId,
        userId: playerId,
      })
      assert.deepEqual(await authIdentities.findGoogle('subject-a'), {
        id: secondId,
        userId: playerId,
      })
    })
    await assert.rejects(() =>
      work.write(({ authIdentities }) =>
        authIdentities.attachGoogle({
          id: randomUUID(),
          userId: otherId,
          subject: 'Subject-A',
          now: new Date(),
        })
      )
    )
    await work.write(async ({ authIdentities }) => {
      assert.deepEqual(await authIdentities.findGoogle('Subject-A'), {
        id: firstId,
        userId: playerId,
      })
    })
    const rows = await db.from('auth_identities').select('user_id')

    assert.equal(rows.length, 2)
    assert.deepEqual(
      rows.map((row) => row.user_id),
      [playerId, playerId]
    )
  })

  test('association and account writes roll back together on interrupted completion', async ({
    assert,
  }) => {
    const userId = randomUUID()

    await assert.rejects(
      () =>
        work.write(async ({ players, authIdentities }) => {
          await players.resolveEmail('player@example.com', userId)
          await authIdentities.attachGoogle({
            id: randomUUID(),
            userId,
            subject: 'subject',
            now: new Date(),
          })
          throw new Error('Injected completion failure')
        }),
      'Injected completion failure'
    )
    const rolledBackUsers = await db.from('users').count('* as count')
    const rolledBackLinks = await db.from('auth_identities').count('* as count')

    assert.equal(rolledBackUsers[0].count, '0')
    assert.equal(rolledBackLinks[0].count, '0')
    await work.write(async ({ players, authIdentities }) => {
      const { player, created } = await players.resolveEmail('player@example.com', userId)

      assert.isTrue(created)
      await authIdentities.attachGoogle({
        id: randomUUID(),
        userId: player.id,
        subject: 'subject',
        now: new Date(),
      })
    })
    const recoveredUsers = await db.from('users').count('* as count')

    assert.equal(recoveredUsers[0].count, '1')
  })
})
