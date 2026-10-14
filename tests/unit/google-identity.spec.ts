import { test } from '@japa/runner'
import { GoogleIdentityEvidence } from '../../app/modules/identity/domain/google-identity-evidence.ts'
import { googleAccountCanOpen } from '../../app/modules/identity/domain/google-account-policy.ts'

test.group('Google verified identity', () => {
  test('a linked identity cannot open a different email or an inactive player', ({ assert }) => {
    const identity = { subject: 'subject', email: 'player@example.com' }

    assert.isTrue(googleAccountCanOpen({ status: 'active', email: 'player@example.com' }, identity))
    assert.isFalse(googleAccountCanOpen({ status: 'active', email: 'other@example.com' }, identity))
    assert.isFalse(
      googleAccountCanOpen({ status: 'anonymized', email: 'player@example.com' }, identity)
    )
    assert.isFalse(googleAccountCanOpen({ status: 'anonymized', email: null }, identity))
  })
  test('only a verified usable email and case-sensitive subject identify a player', ({
    assert,
  }) => {
    const identity = GoogleIdentityEvidence.parse({
      subject: 'GoogleSubject-A',
      email: ' Player+tag@Example.COM ',
      emailVerified: true,
    })

    assert.deepEqual(identity, { subject: 'GoogleSubject-A', email: 'player+tag@example.com' })
    assert.deepEqual(
      GoogleIdentityEvidence.parse({
        subject: 'googlesubject-a',
        email: 'p.l@example.com',
        emailVerified: true,
      }),
      {
        subject: 'googlesubject-a',
        email: 'p.l@example.com',
      }
    )

    for (const emailVerified of [false, undefined, null, 'true', 1])
      assert.isNull(
        GoogleIdentityEvidence.parse({
          subject: 'subject',
          email: 'player@example.com',
          emailVerified,
        })
      )

    for (const subject of [undefined, null, '', '   ', 'with space', 'a'.repeat(256), 123])
      assert.isNull(
        GoogleIdentityEvidence.parse({ subject, email: 'player@example.com', emailVerified: true })
      )

    for (const email of [undefined, null, '', 'bad-email', 123])
      assert.isNull(
        GoogleIdentityEvidence.parse({ subject: 'subject', email, emailVerified: true })
      )
  })
})
