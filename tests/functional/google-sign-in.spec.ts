import { test } from '@japa/runner'
import { captureBrowserCoverage } from '../support/browser-coverage.ts'
import testUtils from '@adonisjs/core/services/test_utils'
import { GoogleProviderFixture } from '../support/google-provider.ts'
import type { Page } from 'playwright'
import mail from '@adonisjs/mail/services/main'
import DispatchOtpOutboxJob from '../../app/jobs/dispatch-otp-outbox-job.ts'
import db from '@adonisjs/lucid/services/db'
import app from '@adonisjs/core/services/app'
import { ConsentPolicy } from '../../app/modules/identity/domain/consent-policy.ts'

async function authorizeGoogle(page: Page, outcome = 'code=fixture-code') {
  const origin = new URL(page.url()).origin

  // Playwright routes the initial request in a redirect chain. Fetch the real
  // start response without following Google and retain its browser cookie.
  await page.route('**/auth/google', async (route) => {
    const response = await route.fetch({ maxRedirects: 0 })
    const target = new URL(response.headers().location)

    if (response.status() !== 302 || target.origin !== 'https://accounts.google.com')
      throw new Error('The real Google start did not redirect to the provider')

    const state = target.searchParams.get('state')!

    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        location: `${origin}/auth/google/callback?state=${encodeURIComponent(state)}&${outcome}`,
      },
    })
  })
  await page.getByRole('link', { name: 'Entrar com Google' }).focus()
  const callback = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/auth/google/callback',
    { timeout: 5000 }
  )

  await page.getByRole('link', { name: 'Entrar com Google' }).press('Enter')
  const response = await callback

  if (response.status() !== 302 || response.headers()['referrer-policy'] !== 'no-referrer')
    throw new Error('The callback did not return its private recovery/success redirect')

  return response.url()
}

test.group('Google browser sign-in', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('third-party Google sign-in requires the bound email code and supports pt-BR recovery and resend before onboarding', async ({
    visit,
    assert,
    cleanup,
  }) => {
    const provider = new GoogleProviderFixture()

    provider.proof = {
      sub: 'private-third-party-subject',
      email: 'third.party@example.net',
      email_verified: true,
    }
    cleanup(provider.install())
    const fake = mail.fake()

    cleanup(() => mail.restore())
    const page = await visit('/sign-in')

    await page.clock.install()
    await authorizeGoogle(page)
    await page.getByLabel('Código de acesso').waitFor()
    await page
      .getByText('Confirme o código enviado ao seu e-mail para concluir a entrada com o Google.')
      .waitFor()
    assert.equal(new URL(page.url()).pathname, '/sign-in/code')
    assert.equal(new URL(page.url()).search, '')
    assert.isTrue(await page.getByRole('button', { name: 'Reenviar código' }).isDisabled())
    assert.lengthOf(await db.from('users'), 0)
    assert.lengthOf(await db.from('auth_identities'), 0)
    const pendingAttempt = await db.from('google_auth_attempts').firstOrFail()
    const privateProfile = await page.request.get('/api/v1/onboarding/profile')

    assert.isNull(pendingAttempt.consumed_at)
    assert.equal(privateProfile.status(), 401)

    for (const value of [
      'private-third-party-subject',
      'fixture-access-token',
      'google_sign_in',
      'attemptId',
    ])
      assert.notInclude(await page.locator('body').innerText(), value)

    await captureBrowserCoverage(page, 'google-email-proof-pending')
    await page.getByLabel('Código de acesso').fill('invalid')
    await page.getByRole('button', { name: 'Verificar código' }).click()
    await page.getByText('Código inválido ou expirado. Solicite um novo código.').waitFor()
    await captureBrowserCoverage(page, 'google-email-proof-invalid')
    await db.from('otp_request_events').update({ created_at: new Date(Date.now() - 61000) })
    await page.clock.fastForward(61_000)
    const resent = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/v1/auth/otp/request'
    )

    await page.getByRole('button', { name: 'Reenviar código' }).click()
    const resendResponse = await resent

    assert.equal(resendResponse.status(), 202)
    await page.getByLabel('Código de acesso').waitFor()
    await new DispatchOtpOutboxJob().execute()
    const code = String(fake.messages.sent().at(-1)!.toJSON().message.text).match(/\b\d{6}\b/)![0]

    await page.getByLabel('Código de acesso').fill(code)
    await page.getByRole('button', { name: 'Verificar código' }).click()
    await page.getByRole('heading', { name: 'Complete seu perfil' }).waitFor()
    assert.equal(new URL(page.url()).search, '')
    assert.equal(await page.getByLabel('Nome de exibição').inputValue(), '')
    assert.lengthOf(await db.from('users'), 1)
    assert.lengthOf(await db.from('auth_identities'), 1)
    const completedAttempt = await db.from('google_auth_attempts').firstOrFail()

    assert.isNotNull(completedAttempt.consumed_at)
    await captureBrowserCoverage(page, 'google-email-proof-onboarding')
    await page.getByRole('button', { name: 'Sair' }).click()
    await page.getByRole('heading', { name: 'Entrar na Arena Eleggante' }).waitFor()
    await page.goto('/onboarding')
    await page.getByRole('heading', { name: 'Entrar na Arena Eleggante' }).waitFor()
  })

  test('a player completes Google onboarding and keeps the same profile through both sign-in methods', async ({
    visit,
    assert,
    cleanup,
  }) => {
    const provider = new GoogleProviderFixture()

    cleanup(provider.install())
    const fake = mail.fake()

    cleanup(() => mail.restore())
    const page = await visit('/sign-in')

    await captureBrowserCoverage(page, 'google-start-page')
    const completedCallback = await authorizeGoogle(page)

    await page.getByRole('heading', { name: 'Complete seu perfil' }).waitFor()
    assert.equal(new URL(page.url()).pathname, '/onboarding')
    assert.equal(new URL(page.url()).search, '')
    assert.equal(await page.getByLabel('Nome de exibição').inputValue(), '')
    const arenaId = await page.getByText(/^AE-\d+$/).innerText()

    await page.getByLabel('Nome de exibição').fill('Saved Player')
    await page.getByLabel('Nome de usuário').fill('saved.player')
    await page.getByLabel('Celular com DDD').fill('+5551999009633')
    await page.getByRole('button', { name: 'Salvar perfil' }).click()
    await page.getByText('Perfil salvo.').waitFor()
    await page.getByText('Aceite dos documentos pendente').waitFor()
    await captureBrowserCoverage(page, 'google-onboarding')
    await page.getByRole('button', { name: 'Sair' }).click()
    await page.getByLabel('E-mail').waitFor()
    await page.getByLabel('E-mail').fill('player@example.com')
    await page.getByRole('button', { name: 'Enviar código' }).click()
    await page.getByLabel('Código de acesso').waitFor()
    await new DispatchOtpOutboxJob().execute()
    const code = String(fake.messages.sent().at(-1)!.toJSON().message.text).match(/\b\d{6}\b/)![0]

    await page.getByLabel('Código de acesso').fill(code)
    await page.getByRole('button', { name: 'Verificar código' }).click()
    await page.getByRole('heading', { name: 'Complete seu perfil' }).waitFor()
    assert.equal(await page.getByText(/^AE-\d+$/).innerText(), arenaId)
    assert.equal(await page.getByLabel('Nome de exibição').inputValue(), 'Saved Player')
    assert.equal(await page.getByLabel('Nome de usuário').inputValue(), 'saved.player')
    assert.equal(await page.getByLabel('Celular com DDD').inputValue(), '+55 (51) 99900-9633')
    await page.getByRole('button', { name: 'Sair' }).click()
    await page.getByLabel('E-mail').waitFor()
    app.container.swap(ConsentPolicy, () => ({ hasCurrentAcceptance: async () => true }))
    cleanup(() => app.container.restore(ConsentPolicy))
    await authorizeGoogle(page)
    await page.getByRole('heading', { name: 'Meu perfil', exact: true }).waitFor()
    assert.equal(new URL(page.url()).search, '')
    assert.equal(await page.getByText(/^AE-\d+$/).innerText(), arenaId)
    assert.equal(await page.getByLabel('Nome de exibição').inputValue(), 'Saved Player')
    assert.equal(await page.getByLabel('Celular com DDD').inputValue(), '+55 (51) 99900-9633')
    await captureBrowserCoverage(page, 'google-eligible-profile')
    await page.goto('/tournaments')
    const publicText = await page.locator('body').innerText()

    for (const value of [
      'player@example.com',
      '+5551999009633',
      'fixture-subject',
      'fixture-access-token',
      'Saved Player',
    ])
      assert.notInclude(publicText, value)

    await captureBrowserCoverage(page, 'google-public-privacy')
    await page.goto('/me')
    await page.getByRole('heading', { name: 'Meu perfil', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Sair' }).click()
    await page.getByRole('heading', { name: 'Entrar na Arena Eleggante' }).waitFor()
    await page.goto('/me')
    await page.getByRole('heading', { name: 'Entrar na Arena Eleggante' }).waitFor()
    const beforeReplay = provider.exchanges

    await page.goto(completedCallback)
    await page
      .getByText(
        'Não foi possível entrar com o Google. Tente novamente ou use o código por e-mail.'
      )
      .waitFor()
    assert.equal(provider.exchanges, beforeReplay)
    assert.equal(new URL(page.url()).search, '')
    await authorizeGoogle(page)
    await page.getByRole('heading', { name: 'Meu perfil', exact: true }).waitFor()
    await db
      .from('sessions')
      .whereNotNull('user_id')
      .update({ expires_at: new Date(0) })
    await page.goto('/me')
    await page.getByRole('heading', { name: 'Entrar na Arena Eleggante' }).waitFor()
    await captureBrowserCoverage(page, 'google-expired-session')
  })

  for (const outcome of ['canceled', 'unverified', 'failed']) {
    test(`${outcome} Google sign-in shows clean pt-BR recovery and working email fallback`, async ({
      visit,
      assert,
      cleanup,
    }) => {
      const provider = new GoogleProviderFixture()

      cleanup(provider.install())
      const fake = mail.fake()

      cleanup(() => mail.restore())

      if (outcome === 'unverified')
        provider.proof = {
          sub: 'fixture-subject',
          email: 'player@example.com',
          email_verified: 'true',
        }

      if (outcome === 'failed')
        provider.onExchange = async () => {
          throw new Error('Private provider diagnostic')
        }

      const page = await visit('/sign-in')

      await authorizeGoogle(
        page,
        outcome === 'canceled'
          ? 'error=access_denied&error_description=private-provider-detail'
          : 'code=fixture-code'
      )
      const message =
        outcome === 'canceled'
          ? 'A entrada com o Google foi cancelada. Tente novamente ou use o código por e-mail.'
          : 'Não foi possível entrar com o Google. Tente novamente ou use o código por e-mail.'

      await page.getByText(message).waitFor()
      assert.equal(new URL(page.url()).pathname, '/sign-in')
      assert.equal(new URL(page.url()).search, '')
      const body = await page.locator('body').innerText()

      for (const value of [
        'private-provider-detail',
        'Private provider diagnostic',
        'fixture-subject',
        'fixture-access-token',
      ])
        assert.notInclude(body, value)

      await captureBrowserCoverage(page, `google-recovery-${outcome}`)
      await page.getByLabel('E-mail').fill('player@example.com')
      await page.getByRole('button', { name: 'Enviar código' }).click()
      await page.getByLabel('Código de acesso').waitFor()
      await new DispatchOtpOutboxJob().execute()
      const code = String(fake.messages.sent().at(-1)!.toJSON().message.text).match(/\b\d{6}\b/)![0]

      await page.getByLabel('Código de acesso').fill(code)
      await page.getByRole('button', { name: 'Verificar código' }).click()
      await page.getByRole('heading', { name: 'Complete seu perfil' }).waitFor()
      const users = await db.from('users').count('* as count')

      assert.equal(users[0].count, '1')
      await captureBrowserCoverage(page, `google-otp-fallback-${outcome}`)
    })
  }
})

test('Google sign-in is a keyboard-accessible full-page action beside email sign-in', async ({
  visit,
  assert,
}) => {
  const page = await visit('/sign-in')
  const google = page.getByRole('link', { name: 'Entrar com Google' })

  await google.waitFor({ timeout: 5000 })
  assert.equal(await google.getAttribute('href'), '/auth/google')
  await google.focus()
  assert.equal(await page.evaluate('document.activeElement.getAttribute("href")'), '/auth/google')
  assert.isTrue(await page.getByLabel('E-mail').isVisible())
  assert.isTrue(await page.getByRole('button', { name: 'Enviar código' }).isVisible())
  await captureBrowserCoverage(page, 'google-action')
})
