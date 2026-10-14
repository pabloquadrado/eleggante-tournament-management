import { test } from '@japa/runner'
import { GoogleIdentityEvidence } from '../../app/modules/identity/domain/google-identity-evidence.ts'
import { googleAccountCanOpen } from '../../app/modules/identity/domain/google-account-policy.ts'
import {
  googleEmailProofMatches,
  isPendingGoogleAttempt,
  type GoogleAuthAttempt,
} from '../../app/modules/identity/domain/google-auth-attempt.ts'

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

    assert.deepEqual(identity, {
      subject: 'GoogleSubject-A',
      email: 'player+tag@example.com',
      emailAuthoritative: false,
    })
    assert.deepEqual(
      GoogleIdentityEvidence.parse({
        subject: 'googlesubject-a',
        email: 'p.l@example.com',
        emailVerified: true,
      }),
      {
        subject: 'googlesubject-a',
        email: 'p.l@example.com',
        emailAuthoritative: false,
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

  test('only exact Gmail or valid trusted hosted-domain evidence provides Google email authority', ({
    assert,
  }) => {
    for (const email of ['Player@Gmail.COM', 'someone+tag@gmail.com']) {
      assert.isTrue(
        GoogleIdentityEvidence.parse({ subject: 's', email, emailVerified: true })!
          .emailAuthoritative
      )
    }

    for (const email of [
      'player@gmail.com.evil.example',
      'player@googlemail.com',
      'player@example.net',
    ]) {
      assert.isFalse(
        GoogleIdentityEvidence.parse({ subject: 's', email, emailVerified: true })!
          .emailAuthoritative
      )
    }

    for (const hostedDomain of ['example.com', 'WORKSPACE.EXAMPLE', 'a-b.example']) {
      assert.isTrue(
        GoogleIdentityEvidence.parse({
          subject: 's',
          email: `player@${hostedDomain}`,
          emailVerified: true,
          hostedDomain,
        })!.emailAuthoritative
      )
      assert.isFalse(
        GoogleIdentityEvidence.parse({
          subject: 's',
          email: 'player@example.net',
          emailVerified: true,
          hostedDomain,
        })!.emailAuthoritative
      )
    }

    for (const hostedDomain of [
      undefined,
      null,
      true,
      [],
      '',
      ' ',
      'example',
      'bad_domain.example',
      '.example.com',
      'a'.repeat(64) + '.example',
      'a.'.repeat(127) + 'com',
    ]) {
      assert.isFalse(
        GoogleIdentityEvidence.parse({
          subject: 's',
          email: 'player@example.net',
          emailVerified: true,
          hostedDomain,
        })!.emailAuthoritative
      )
    }
  })

  test('pending email proof matches only its original subject, email, attempt, browser lookup and deadline', ({
    assert,
  }) => {
    const now = new Date('2026-10-14T12:00:00Z')
    const expiresAt = new Date('2026-10-14T12:10:00Z')
    const attempt: GoogleAuthAttempt = {
      id: 'attempt',
      stateKey: 'state',
      browserKey: 'browser',
      material: null,
      emailProof: { subject: 'Subject', email: 'player@example.net' },
      expiresAt,
      consumedAt: null,
      invalidatedAt: null,
      createdAt: now,
    }
    const intent = {
      ...attempt.emailProof!,
      attemptId: 'attempt',
      expiresAt: expiresAt.toISOString(),
    }

    assert.isFalse(isPendingGoogleAttempt(attempt, now))
    assert.isFalse(
      isPendingGoogleAttempt(
        { ...attempt, material: { state: 'state', verifier: 'verifier' } },
        now
      )
    )
    assert.isTrue(googleEmailProofMatches(attempt, intent, now))
    assert.isFalse(googleEmailProofMatches(null, intent, now))

    for (const changed of [
      { material: { state: 'state', verifier: 'verifier' } },
      { emailProof: null },
      { consumedAt: now },
      { invalidatedAt: now },
      { expiresAt: now },
      { id: 'another-attempt' },
      { expiresAt: new Date('2026-10-14T12:09:00Z') },
      { emailProof: { subject: 'subject', email: 'player@example.net' } },
      { emailProof: { subject: 'Subject', email: 'other@example.net' } },
    ])
      assert.isFalse(googleEmailProofMatches({ ...attempt, ...changed }, intent, now))
  })
})
