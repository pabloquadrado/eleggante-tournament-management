import { test } from '@japa/runner'
import crypto from 'node:crypto'
import { syncBuiltinESMExports } from 'node:module'
import { mock } from 'node:test'
import { HttpContextFactory } from '@adonisjs/core/factories/http'
import {
  AllyGoogleAuthorization,
  googleDiagnosticsAreSafe,
} from '../../app/modules/identity/infrastructure/ally-google-authorization.ts'
import { AttemptBoundGoogleDriver } from '../../app/modules/identity/infrastructure/attempt-bound-google-driver.ts'
import {
  GoogleHttpClient,
  googleTokenUrl,
  googleUserInfoUrl,
  type GoogleFetch,
} from '../../app/modules/identity/infrastructure/google-http-client.ts'

const settings = {
  clientId: 'fixture-client',
  clientSecret: 'fixture-secret',
  callbackUrl: 'http://localhost:3333/auth/google/callback',
}
const material = { state: 's'.repeat(43), verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk' }
const validProof = {
  sub: 'fixture-subject',
  email: 'Player@Example.COM',
  email_verified: true,
  name: 'Ignored name',
}

test('an unavailable entropy source gives sanitized recovery without a provider request', async ({
  assert,
  cleanup,
}) => {
  const random = mock.method(crypto, 'randomBytes', () => {
    throw new Error('Private system entropy diagnostic')
  })

  syncBuiltinESMExports()
  cleanup(() => {
    random.mock.restore()
    syncBuiltinESMExports()
  })
  const provider = new AllyGoogleAuthorization(
    new HttpContextFactory().create(),
    settings,
    async () => {
      throw new Error('Must not request the provider without an authorization attempt')
    }
  )

  assert.isNull(await provider.prepare())
})

test('Ally sends the explicit state, RFC7636 S256 challenge and same verifier without cookies', async ({
  assert,
}) => {
  const requests: { url: string; init: RequestInit }[] = []
  const transport: GoogleFetch = async (url, init) => {
    requests.push({ url, init })

    return Response.json(
      url === googleTokenUrl
        ? { access_token: 'fixture-token', token_type: 'Bearer', id_token: 'never-used' }
        : validProof
    )
  }
  const context = new HttpContextFactory().create()
  const driver = new AttemptBoundGoogleDriver(
    context,
    {
      ...settings,
      scopes: ['openid', 'email'],
      accessType: 'online',
      userInfoUrl: googleUserInfoUrl,
    },
    material,
    transport
  )
  const url = new URL(
    await driver.getRedirectUrl((builder) => builder.param('state', material.state))
  )

  assert.equal(url.origin, 'https://accounts.google.com')
  assert.equal(url.searchParams.get('state'), material.state)
  assert.equal(
    url.searchParams.get('code_challenge'),
    'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
  )
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(url.searchParams.get('scope'), 'openid email')
  assert.equal(url.searchParams.get('access_type'), 'online')
  assert.equal(url.searchParams.get('redirect_uri'), settings.callbackUrl)
  const token = await driver.getAccessToken((builder) => builder.field('code', 'fixture-code'))
  const user = await driver.userFromToken(token.token)
  const fields = new URLSearchParams(requests[0].init.body as string)

  assert.equal(fields.get('code_verifier'), material.verifier)
  assert.equal(fields.get('code'), 'fixture-code')
  assert.equal(fields.get('grant_type'), 'authorization_code')
  assert.equal(fields.get('client_id'), settings.clientId)
  assert.equal(fields.get('client_secret'), settings.clientSecret)
  assert.equal(fields.get('redirect_uri'), settings.callbackUrl)
  assert.equal(requests[0].url, googleTokenUrl)
  assert.equal(requests[1].url, googleUserInfoUrl)
  assert.equal(new Headers(requests[1].init.headers).get('authorization'), 'Bearer fixture-token')
  assert.equal(requests[0].init.redirect, 'error')
  assert.isDefined(requests[0].init.signal)
  assert.equal(user.original.sub, 'fixture-subject')
})

test('the wrapper returns only strict trusted userinfo proof and discards all token/profile fields', async ({
  assert,
}) => {
  const context = new HttpContextFactory().create()
  let proof: unknown = validProof
  let token: unknown = {
    access_token: 'fixture-token',
    token_type: 'Bearer',
    id_token: 'claims-for-a-different-user',
    refresh_token: 'ignored',
  }
  const provider = new AllyGoogleAuthorization(context, settings, async (url) =>
    Response.json(url === googleTokenUrl ? token : proof)
  )
  const prepared = await provider.prepare()

  assert.isNotNull(prepared)
  const target = new URL(prepared!.url)

  assert.equal(target.searchParams.get('state'), prepared!.state)
  assert.equal(target.searchParams.get('hl'), 'pt-BR')
  assert.isNull(target.searchParams.get('nonce'))
  assert.deepEqual(await provider.exchange({ ...material, code: 'fixture-code' }), {
    subject: 'fixture-subject',
    email: 'player@example.com',
    emailVerified: true,
    hostedDomain: undefined,
  })

  for (const hostedDomain of ['Example.COM', 'other.example', '', null, 1]) {
    proof = { ...validProof, hd: hostedDomain }
    assert.deepEqual(await provider.exchange({ ...material, code: 'fixture-code' }), {
      subject: 'fixture-subject',
      email: 'player@example.com',
      emailVerified: true,
      hostedDomain,
    })
  }

  for (const emailVerified of [false, undefined, 'true', 'false', null]) {
    proof = { ...validProof, email_verified: emailVerified }
    assert.isNull(await provider.exchange({ ...material, code: 'fixture-code' }))
  }

  for (const malformed of [
    null,
    [],
    'invalid',
    { ...validProof, sub: '' },
    { ...validProof, email: null },
  ]) {
    proof = malformed
    assert.isNull(await provider.exchange({ ...material, code: 'fixture-code' }))
  }

  proof = validProof

  for (const invalidToken of [
    {},
    { access_token: 1, token_type: 'Bearer' },
    { access_token: 'bad token', token_type: 'Bearer' },
    { access_token: 'token' },
    { access_token: 'token', token_type: 'mac' },
    { access_token: 'token', token_type: 1 },
  ]) {
    token = invalidToken
    assert.isNull(await provider.exchange({ ...material, code: 'fixture-code' }))
  }

  assert.isNull(await provider.exchange({ ...material, state: '', code: 'fixture-code' }))
  assert.isNull(await provider.exchange({ ...material, verifier: '', code: 'fixture-code' }))
  const unavailable = new AllyGoogleAuthorization(context, null)

  assert.isNull(await unavailable.prepare())
  assert.isNull(await unavailable.exchange({ ...material, code: 'fixture-code' }))
})

test('unsafe provider diagnostics and invalid verifier material fail closed', async ({
  assert,
  cleanup,
}) => {
  for (const setting of ['*', 'oauth_client', 'OAUTH_CLIENT', 'adonisjs:ally', 'oauth_*'])
    assert.isFalse(googleDiagnosticsAreSafe(setting))

  assert.isTrue(googleDiagnosticsAreSafe(''))
  assert.isTrue(googleDiagnosticsAreSafe('http'))
  const original = process.env.NODE_DEBUG

  cleanup(() => {
    if (original === undefined) delete process.env.NODE_DEBUG
    else process.env.NODE_DEBUG = original
  })
  process.env.NODE_DEBUG = 'oauth_client'
  const provider = new AllyGoogleAuthorization(
    new HttpContextFactory().create(),
    settings,
    async () => {
      throw new Error('Must not call unsafe provider')
    }
  )

  assert.isNull(await provider.prepare())
  assert.isNull(await provider.exchange({ ...material, code: 'fixture-code' }))
  const driver = new AttemptBoundGoogleDriver(
    new HttpContextFactory().create(),
    settings,
    { ...material, verifier: '' },
    async () => {
      throw new Error('Must not exchange invalid PKCE')
    }
  )

  assert.throws(() => driver.getRedirectUrl(), 'Google attempt unavailable')
  await assert.rejects(() => driver.getAccessToken(), 'Google attempt unavailable')
})

test('bounded Google transport rejects untrusted endpoints, redirects, errors and malformed responses', async ({
  assert,
}) => {
  const never: GoogleFetch = async () => {
    throw new Error('Unexpected network request')
  }

  await assert.rejects(
    () => new GoogleHttpClient('https://evil.example/token', never).post(),
    'Google transport unavailable'
  )
  await assert.rejects(
    () => new GoogleHttpClient(googleTokenUrl, never).get(),
    'Google transport unavailable'
  )

  for (const response of [
    new Response('', { status: 302 }),
    Response.json({ error: 'private diagnostic' }, { status: 400 }),
    Response.json({ error: 'private diagnostic' }),
    Response.json(null),
    Response.json([]),
    Response.json('invalid'),
    new Response('invalid-json'),
  ]) {
    const provider = new AllyGoogleAuthorization(
      new HttpContextFactory().create(),
      settings,
      async () => response
    )

    assert.isNull(await provider.exchange({ ...material, code: 'fixture-code' }))
  }

  const redirected = Response.json({ access_token: 'token', token_type: 'Bearer' })

  Object.defineProperty(redirected, 'url', { value: 'https://evil.example/token' })
  const provider = new AllyGoogleAuthorization(
    new HttpContextFactory().create(),
    settings,
    async () => redirected
  )

  assert.isNull(await provider.exchange({ ...material, code: 'fixture-code' }))
  const timeout = new AllyGoogleAuthorization(
    new HttpContextFactory().create(),
    settings,
    async (_url, init) => {
      await new Promise<void>((resolve) =>
        init.signal!.addEventListener('abort', () => resolve(), { once: true })
      )
      throw new Error('Private timeout diagnostic')
    }
  )

  assert.isNull(await timeout.exchange({ ...material, code: 'fixture-code' }))
}).timeout(10000)
