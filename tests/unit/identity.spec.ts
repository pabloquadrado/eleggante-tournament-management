import { test } from '@japa/runner'
import { EmailAddress } from '../../app/modules/identity/domain/email-address.ts'
import { PlayerProfileInput } from '../../app/modules/identity/domain/player-profile-input.ts'
import { identityAccessFor } from '../../app/modules/identity/domain/identity-access.ts'
import { requestClientAddress } from '../../app/modules/identity/domain/request-client-address.ts'

test('email identity ignores case and surrounding spaces, but preserves provider aliases', ({
  assert,
}) => {
  assert.equal(EmailAddress.parse(' Player+FC@Example.COM ').value, 'player+fc@example.com')
})

test('profile completion trims names and normalizes Brazilian mobile numbers', ({ assert }) => {
  assert.deepEqual(
    PlayerProfileInput.parse({
      name: ' Pablo ',
      username: 'Pablo.FC',
      phone: '+55 (51) 99900-9633',
    }),
    {
      name: 'Pablo',
      username: 'Pablo.FC',
      phone: '+5551999009633',
    }
  )
  assert.equal(
    PlayerProfileInput.parse({ name: 'Pablo', username: 'pablo', phone: '(51) 99900-9633' }).phone,
    '+5551999009633'
  )
})

test('incomplete profiles, invalid usernames, landlines, and immutable fields are rejected', ({
  assert,
}) => {
  const valid = { name: 'Pablo', username: 'pablo', phone: '+5551999009633' }

  for (const invalid of [
    { ...valid, name: '' },
    { ...valid, name: null },
    { ...valid, name: 'x'.repeat(101) },
    { ...valid, username: 'ab' },
    { ...valid, username: null },
    { ...valid, username: 'bad user' },
    { ...valid, phone: '+555133339633' },
    { ...valid, phone: '' },
    { ...valid, phone: null },
    { ...valid, email: 'other@example.com' },
  ])
    assert.throws(() => PlayerProfileInput.parse(invalid))
})

test('missing and malformed email addresses have a handled field error', ({ assert }) => {
  for (const input of [undefined, '', 'not-an-email', 'a@@b.com', 'a b@example.com']) {
    assert.throws(() => EmailAddress.parse(input), 'Informe um e-mail válido.')
  }
})

test('email ownership grants player access only with a complete profile and current consent', ({
  assert,
}) => {
  const complete = { name: 'Pablo', username: 'pablo', phone: '+5551999009633' }

  assert.equal(identityAccessFor(complete, true), 'player')
  assert.equal(identityAccessFor(complete, false), 'onboarding')

  for (const field of ['name', 'username', 'phone']) {
    assert.equal(identityAccessFor({ ...complete, [field]: null }, true), 'onboarding')
  }
})

test('abuse-control keys preserve direct IPv4 and IPv6 addresses and group unavailable metadata', ({
  assert,
}) => {
  assert.equal(requestClientAddress('192.0.2.7'), '192.0.2.7')
  assert.equal(requestClientAddress('::1'), '::1')
  assert.equal(requestClientAddress(undefined), 'unknown')
})
