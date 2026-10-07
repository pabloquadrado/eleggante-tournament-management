import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import mail from '@adonisjs/mail/services/main'
import DispatchOtpOutboxJob from '../../app/jobs/dispatch-otp-outbox-job.ts'
import { captureBrowserCoverage } from '../support/browser-coverage.ts'
import type { FakeMailer } from '@adonisjs/mail'
import db from '@adonisjs/lucid/services/db'
import app from '@adonisjs/core/services/app'
import { ConsentPolicy } from '../../app/modules/identity/domain/consent-policy.ts'
import type { Page, Route } from 'playwright'

test.group('Player email sign-in', (group) => {
  let fake: FakeMailer

  group.each.setup(() => testUtils.db().truncate())
  group.each.setup(() => {
    fake = mail.fake()

    return () => mail.restore()
  })

  function lastCode() {
    return String(fake.messages.sent().at(-1)!.toJSON().message.text).match(/\b\d{6}\b/)![0]
  }

  async function enterEmail(page: Page, email = 'player@example.com') {
    await page.getByLabel('E-mail').fill(email)
    await page.getByRole('button', { name: 'Enviar código' }).click()
    await page.getByLabel('Código de acesso').waitFor()
    await new DispatchOtpOutboxJob().execute()
  }

  async function verifyEmail(page: Page) {
    await page.getByLabel('Código de acesso').fill(lastCode())
    await page.getByRole('button', { name: 'Verificar código' }).click()
  }

  test('a new player verifies email, completes a profile, and sees consent pending', async ({
    visit,
    assert,
  }) => {
    const page = await visit('/sign-in')

    await page.getByRole('heading', { name: 'Entrar na Arena Eleggante' }).waitFor()
    await page.getByLabel('E-mail').fill('player@example.com')
    await page.getByRole('button', { name: 'Enviar código' }).click()
    await page.getByLabel('Código de acesso').waitFor()
    await new DispatchOtpOutboxJob().execute()
    await captureBrowserCoverage(page, 'email-request')
    const code = String(fake.messages.sent()[0].toJSON().message.text).match(/\b\d{6}\b/)![0]

    await page.getByLabel('Código de acesso').fill(code)
    await page.getByRole('button', { name: 'Verificar código' }).click()
    await page.getByRole('heading', { name: 'Complete seu perfil' }).waitFor()
    await page.getByRole('button', { name: 'Salvar perfil' }).click()
    await page.getByText('Informe um nome entre 2 e 100 caracteres.').waitFor()
    await page.getByLabel('Nome de exibição').fill('Pablo')
    await page.getByLabel('Nome de usuário').fill('pablo.fc')
    const phone = page.getByLabel('Celular com DDD')

    assert.equal(await phone.inputValue(), '')
    assert.equal(await phone.getAttribute('placeholder'), '+55 (00) 00000-0000')
    await phone.pressSequentially('51abc99900963312345')
    assert.equal(await phone.inputValue(), '+55 (51) 99900-9633')
    await phone.press('Backspace')
    assert.equal(await phone.inputValue(), '+55 (51) 99900-963')
    await phone.press('3')
    assert.equal(await phone.inputValue(), '+55 (51) 99900-9633')

    for (const [input, expected] of [
      ['', ''],
      ['abc+', ''],
      ['5', '+55 (5'],
      ['51', '+55 (51'],
      ['519', '+55 (51) 9'],
      ['5199900', '+55 (51) 99900'],
      ['51999009', '+55 (51) 99900-9'],
      ['51999009633', '+55 (51) 99900-9633'],
      ['(55) 99900-9633', '+55 (55) 99900-9633'],
      ['5551999009633', '+55 (51) 99900-9633'],
      ['  +55 (51) 99900-9633', '+55 (51) 99900-9633'],
      ['++55a51b99900-9633', '+55 (51) 99900-9633'],
      ['+555199900963312345', '+55 (51) 99900-9633'],
    ]) {
      await phone.fill(input)
      assert.equal(await phone.inputValue(), expected)
    }

    await page.getByRole('button', { name: 'Salvar perfil' }).click()
    await page.getByText('Perfil salvo.').waitFor()
    await page.getByText('Aceite dos documentos pendente').waitFor()
    await db.from('otp_request_events').delete()
    await page.getByLabel('Celular com DDD').fill('+5551999009634')
    await page.getByRole('button', { name: 'Salvar perfil' }).click()
    await page.getByLabel('Código para alterar o celular').waitFor()
    assert.isTrue(await page.getByLabel('Celular com DDD').isDisabled())
    await new DispatchOtpOutboxJob().execute()
    const phoneCode = String(fake.messages.sent().at(-1)!.toJSON().message.text).match(
      /\b\d{6}\b/
    )![0]

    await db
      .from('otp_challenges')
      .where('purpose', 'phone_change')
      .update({ expires_at: new Date(0) })
    await page.getByLabel('Código para alterar o celular').fill(phoneCode)
    await page.getByRole('button', { name: 'Confirmar celular' }).click()
    await page.getByText('Código inválido ou expirado. Solicite um novo código.').waitFor()
    await page.route('**/api/v1/onboarding/profile/phone/cancel', (route) => route.abort())
    await page.getByRole('button', { name: 'Cancelar alteração' }).click()
    await page.getByText('Não foi possível conectar. Tente novamente.').waitFor()
    assert.isTrue(await page.getByLabel('Código para alterar o celular').isVisible())
    await page.unroute('**/api/v1/onboarding/profile/phone/cancel')
    await page.getByRole('button', { name: 'Cancelar alteração' }).click()
    await page.getByText('Alteração cancelada. Seu celular atual foi mantido.').waitFor()
    await page.getByRole('button', { name: 'Salvar perfil' }).click()
    await page.getByText('Aguarde um pouco antes de solicitar outro código.').waitFor()
    await db.from('otp_request_events').delete()
    await page.getByRole('button', { name: 'Salvar perfil' }).click()
    await page.getByLabel('Código para alterar o celular').waitFor()
    await new DispatchOtpOutboxJob().execute()
    await page.getByLabel('Código para alterar o celular').fill(lastCode())
    await page.getByRole('button', { name: 'Confirmar celular' }).click()
    await page.getByText('Perfil salvo.').waitFor()
    await page.getByLabel('Código para alterar o celular').waitFor({ state: 'hidden' })
    await captureBrowserCoverage(page, 'onboarding-profile')
    await page.route('**/api/v1/auth/logout', (route) => route.abort())
    await page.getByRole('button', { name: 'Sair' }).click()
    await page.getByText('Não foi possível conectar. Tente novamente.').waitFor()
    await page.unroute('**/api/v1/auth/logout')
    await page.getByRole('button', { name: 'Sair' }).click()
    await page.getByRole('heading', { name: 'Entrar na Arena Eleggante' }).waitFor()
    await captureBrowserCoverage(page, 'signed-out')
  })

  test('keyboard sign-in handles invalid email, connection errors, expired codes and delivery failure', async ({
    visit,
    assert,
  }) => {
    const page = await visit('/sign-in')

    await page.clock.install()
    await page.getByLabel('E-mail').fill('bad-email')
    await page.getByLabel('E-mail').press('Enter')
    await page.getByText('Informe um e-mail válido.').waitFor()
    await page.route('**/api/v1/auth/otp/request', (route) => route.abort())
    await page.getByLabel('E-mail').fill('player@example.com')
    await page.getByLabel('E-mail').press('Enter')
    await page.getByText('Não foi possível conectar. Tente novamente.').waitFor()
    await page.unroute('**/api/v1/auth/otp/request')
    await enterEmail(page)
    const wrong = lastCode() === '000000' ? '111111' : '000000'

    await page.getByLabel('Código de acesso').fill(wrong)
    await page.getByLabel('Código de acesso').press('Enter')
    await page.getByText('Código inválido ou expirado. Solicite um novo código.').waitFor()
    await page.clock.fastForward(5100)
    await page
      .getByText(
        'Confira sua caixa de entrada e a pasta de spam. Se o código não chegar, confira o e-mail informado.'
      )
      .waitFor()
    await page.route('**/api/v1/auth/otp/*', (route) =>
      route.request().method() === 'GET' ? route.abort() : route.continue()
    )
    await page.clock.fastForward(5100)
    await page.getByText('Não foi possível conectar. Tente novamente.').waitFor()
    await page.unroute('**/api/v1/auth/otp/*')
    await db.from('otp_challenges').update({ expires_at: new Date(0) })
    await page.getByLabel('Código de acesso').fill(lastCode())
    await page.getByLabel('Código de acesso').press('Enter')
    await page.getByText('Código inválido ou expirado. Solicite um novo código.').waitFor()
    assert.isTrue(await page.getByRole('button', { name: 'Reenviar código' }).isDisabled())
    await page.clock.fastForward(61_000)
    await db.from('otp_request_events').delete()
    const resend = page.waitForResponse(
      (reply) =>
        reply.request().method() === 'POST' &&
        new URL(reply.url()).pathname === '/api/v1/auth/otp/request'
    )

    await page.getByRole('button', { name: 'Reenviar código' }).click()
    const resent = await resend

    assert.equal(resent.status(), 202)
    fake.transport.send = async () => {
      throw Object.assign(new Error('Private SMTP failure'), { responseCode: 550 })
    }
    await new DispatchOtpOutboxJob().execute()
    await page.clock.fastForward(5100)
    await page
      .getByText(
        'Não foi possível entregar o código. Confira o e-mail informado e tente novamente.'
      )
      .waitFor()
    await captureBrowserCoverage(page, 'sign-in-recovery')
    await page.getByRole('link', { name: 'Corrigir e-mail' }).click()
    await page.getByLabel('E-mail').waitFor()
    await captureBrowserCoverage(page, 'correct-email')
  })

  test('an eligible returning player edits only their profile and private data stays off public pages', async ({
    visit,
    assert,
    cleanup,
  }) => {
    const page = await visit('/sign-in')

    await enterEmail(page)
    await verifyEmail(page)
    await page.getByLabel('Nome de exibição').fill('Private Player')
    await page.getByLabel('Nome de usuário').fill('private.player')
    await page.getByLabel('Celular com DDD').fill('+5551999009633')
    await page.getByRole('button', { name: 'Salvar perfil' }).click()
    await page.getByText('Perfil salvo.').waitFor()
    await page.getByRole('button', { name: 'Sair' }).click()
    await page.getByLabel('E-mail').waitFor()
    await db.from('otp_request_events').delete()
    app.container.swap(ConsentPolicy, () => ({ hasCurrentAcceptance: async () => true }))
    cleanup(() => app.container.restore(ConsentPolicy))
    await enterEmail(page, 'PLAYER@example.com')
    await verifyEmail(page)
    await page.getByRole('heading', { name: 'Meu perfil', exact: true }).waitFor()
    assert.equal(await page.getByLabel('Nome de exibição').inputValue(), 'Private Player')
    assert.equal(await page.getByLabel('Celular com DDD').inputValue(), '+55 (51) 99900-9633')
    assert.equal(await page.getByText('Aceite dos documentos pendente').count(), 0)
    await page.getByLabel('Nome de exibição').fill('Updated Player')
    await page.getByRole('button', { name: 'Salvar perfil' }).click()
    await page.getByText('Perfil salvo.').waitFor()
    await db.from('users').increment('version', 1)
    await page.getByLabel('Nome de exibição').fill('Stale Player')
    await page.getByRole('button', { name: 'Salvar perfil' }).click()
    await page.getByText('Seu perfil foi alterado. Atualize a página antes de salvar.').waitFor()
    await captureBrowserCoverage(page, 'eligible-profile')
    await page.reload()
    await page.getByRole('heading', { name: 'Meu perfil', exact: true }).waitFor()
    await db.from('otp_request_events').delete()
    await page.getByLabel('Celular com DDD').fill('+5551999009634')
    await page.getByRole('button', { name: 'Salvar perfil' }).click()
    await page.getByLabel('Código para alterar o celular').waitFor()
    await page.getByRole('button', { name: 'Cancelar alteração' }).click()
    await page.getByText('Alteração cancelada. Seu celular atual foi mantido.').waitFor()
    await db.from('otp_request_events').delete()
    await page.getByRole('button', { name: 'Salvar perfil' }).click()
    await page.getByLabel('Código para alterar o celular').waitFor()
    await page.clock.install()
    await page.clock.fastForward(61_000)
    await db.from('otp_request_events').delete()
    const deliveredBeforeResend = fake.messages.sent().length
    const resend = page.waitForResponse(
      (reply) =>
        reply.request().method() === 'PATCH' && new URL(reply.url()).pathname === '/api/v1/me'
    )

    await page.getByRole('button', { name: 'Solicitar novo código' }).click()
    const resent = await resend

    assert.equal(resent.status(), 202)
    await new DispatchOtpOutboxJob().execute()
    fake.messages.assertSentCount(deliveredBeforeResend + 1)
    await page.getByLabel('Código para alterar o celular').fill(lastCode())
    await page.getByRole('button', { name: 'Confirmar celular' }).click()
    await page.getByText('Perfil salvo.').waitFor()
    await page.getByLabel('Código para alterar o celular').waitFor({ state: 'hidden' })
    await captureBrowserCoverage(page, 'eligible-phone')
    await page.goto('/tournaments')
    const publicText = await page.locator('body').innerText()

    for (const privateValue of [
      'player@example.com',
      'Private Player',
      'Updated Player',
      '+5551999009634',
    ])
      assert.notInclude(publicText, privateValue)

    await captureBrowserCoverage(page, 'identity-public-privacy')
  })

  for (const lateStatus of ['success', 'failure']) {
    test(`a canceled phone change ignores a late status ${lateStatus} and missing security cookies have a handled error`, async ({
      visit,
      assert,
    }) => {
      const page = await visit('/sign-in')

      await page.clock.install()
      await page.getByLabel('E-mail').waitFor()
      await page.context().clearCookies({ name: 'XSRF-TOKEN' })
      await page.getByLabel('E-mail').fill('player@example.com')
      await page.getByRole('button', { name: 'Enviar código' }).click()
      await page
        .getByText('Sua sessão de segurança expirou. Atualize a página e tente novamente.')
        .waitFor()
      await captureBrowserCoverage(page, 'missing-security-cookie')
      await page.reload()
      await enterEmail(page)
      await verifyEmail(page)
      await page.getByLabel('Nome de exibição').fill('Pablo')
      await page.getByLabel('Nome de usuário').fill('pablo')
      await page.getByLabel('Celular com DDD').fill('+5551999009633')
      await page.getByRole('button', { name: 'Salvar perfil' }).click()
      await page.getByText('Perfil salvo.').waitFor()
      await db.from('otp_request_events').delete()
      await page.getByLabel('Celular com DDD').fill('+5551999009634')
      await page.getByRole('button', { name: 'Salvar perfil' }).click()
      await page.getByLabel('Código para alterar o celular').waitFor()
      let held!: Route
      let notify!: () => void
      const requested = new Promise<void>((resolve) => {
        notify = resolve
      })

      await page.route('**/api/v1/auth/otp/*', (route) => {
        held = route
        notify()
      })
      await page.clock.fastForward(5100)
      await requested
      await page.getByRole('button', { name: 'Cancelar alteração' }).click()
      await page.getByText('Alteração cancelada. Seu celular atual foi mantido.').waitFor()
      const response =
        lateStatus === 'success'
          ? page.waitForResponse(
              (reply) =>
                reply.request().method() === 'GET' && reply.url().includes('/api/v1/auth/otp/')
            )
          : page.waitForEvent('requestfailed', {
              predicate: (request) =>
                request.method() === 'GET' && request.url().includes('/api/v1/auth/otp/'),
            })

      if (lateStatus === 'success') {
        await held.fulfill({ status: 200, json: { message: 'Late delivery status' } })
      } else {
        await held.abort()
      }

      await response
      await page.evaluate('new Promise(resolve => requestAnimationFrame(resolve))')
      assert.equal(await page.getByText('Late delivery status').count(), 0)
      assert.equal(await page.getByText('Não foi possível conectar. Tente novamente.').count(), 0)
      await page.getByText('Alteração cancelada. Seu celular atual foi mantido.').waitFor()
      await captureBrowserCoverage(page, `canceled-phone-status-${lateStatus}`)
    })
  }
})
