import type { HttpContext } from '@adonisjs/core/http'
import { EmailAddress } from '../modules/identity/domain/email-address.js'
import { PostgresOtpRequests } from '../modules/identity/infrastructure/postgres-otp-requests.js'
import { PostgresOtpVerification } from '../modules/identity/infrastructure/postgres-otp-verification.js'
import { PostgresIdentitySession } from '../modules/identity/infrastructure/postgres-identity-session.js'
import { PostgresPlayerProfile } from '../modules/identity/infrastructure/postgres-player-profile.js'
import { IdentityError } from '../modules/identity/domain/identity-error.js'
import db from '@adonisjs/lucid/services/db'
import { requestClientAddress } from '../modules/identity/domain/request-client-address.js'

export default class IdentityController {
  async signIn({ inertia, response }: HttpContext) {
    response.header('cache-control', 'no-store')
    return inertia.render('identity/sign-in', { pending: null })
  }

  async codePage({ session, inertia, response }: HttpContext) {
    response.header('cache-control', 'no-store')
    const pending = session.get('pendingOtp')
    if (!pending) return response.redirect('/sign-in')
    return inertia.render('identity/sign-in', { pending })
  }

  async profilePage(context: HttpContext) {
    if (!(await context.auth.check()) || context.auth.user!.status !== 'active')
      return context.response.redirect('/sign-in')
    const access = context.session.get('identityAccess') === 'player' ? 'player' : 'onboarding'
    if (context.request.url() === '/me' && access !== 'player')
      return context.response.redirect('/onboarding')
    context.response.header('cache-control', 'no-store')
    return context.inertia.render('identity/profile', {
      profile: await new PostgresPlayerProfile().read(context.auth.user!.id),
      access,
    })
  }

  async logout({ session, response }: HttpContext) {
    await db.from('sessions').where('id', session.sessionId).delete()
    session.clear()
    session.regenerate()
    return response.noContent()
  }

  async verify(context: HttpContext) {
    const { request, session } = context
    const result = await new PostgresOtpVerification().verify(
      request.input('challengeId'),
      request.input('code'),
      session.sessionId,
      new PostgresIdentitySession(context),
      request.id()!
    )
    return { ...result, next: result.access === 'player' ? '/me' : '/onboarding' }
  }

  private async actor({ auth }: HttpContext) {
    if (!(await auth.check()) || auth.user!.status !== 'active')
      throw new IdentityError('Entre para continuar.', 401)
    return auth.user!
  }

  async onboardingProfile(context: HttpContext) {
    const user = await this.actor(context)
    context.response.header('cache-control', 'no-store')
    return { data: await new PostgresPlayerProfile().read(user.id) }
  }

  async profile(context: HttpContext) {
    const user = await this.actor(context)
    if (context.session.get('identityAccess') !== 'player')
      throw new IdentityError('Conclua seu perfil e aceite os documentos para continuar.', 403)
    context.response.header('cache-control', 'no-store')
    return { data: await new PostgresPlayerProfile().read(user.id) }
  }

  async updateOnboardingProfile(context: HttpContext) {
    const user = await this.actor(context)
    const result = await new PostgresPlayerProfile().update(
      user.id,
      context.request.all(),
      context.request.header('idempotency-key'),
      {
        browserId: context.session.sessionId,
        ip: requestClientAddress(context.request.request.socket.remoteAddress),
        requestId: context.request.id()!,
      }
    )
    return context.response.status('phoneVerificationRequired' in result ? 202 : 200).send(result)
  }

  async confirmOnboardingPhone(context: HttpContext) {
    const user = await this.actor(context)
    return new PostgresOtpVerification().confirmPhone(
      context.request.input('challengeId'),
      context.request.input('code'),
      context.session.sessionId,
      user.id,
      context.request.id()!
    )
  }

  async confirmPhone(context: HttpContext) {
    await this.profile(context)
    return this.confirmOnboardingPhone(context)
  }

  async cancelOnboardingPhone(context: HttpContext) {
    const user = await this.actor(context)
    await new PostgresOtpRequests().cancelPhone(
      context.request.input('challengeId'),
      context.session.sessionId,
      user.id
    )
    return context.response.noContent()
  }

  async cancelPhone(context: HttpContext) {
    await this.profile(context)
    return this.cancelOnboardingPhone(context)
  }

  async updateProfile(context: HttpContext) {
    await this.profile(context)
    return this.updateOnboardingProfile(context)
  }

  async status({ params, session, response }: HttpContext) {
    response.header('cache-control', 'no-store')
    return new PostgresOtpRequests().status(params.id, session.sessionId)
  }

  async request({ request, session, response }: HttpContext) {
    const email = EmailAddress.parse(request.input('email'))
    const result = await new PostgresOtpRequests().request(
      email,
      session.sessionId,
      requestClientAddress(request.request.socket.remoteAddress),
      request.header('idempotency-key'),
      request.id()!
    )
    session.put('pendingOtp', { ...result, email: email.value })
    return response.accepted(result)
  }
}
