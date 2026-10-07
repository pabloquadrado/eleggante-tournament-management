import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import type { IdentityActor } from '../modules/identity/domain/identity-actor.ts'
import { RequestSignInCodeUseCase } from '../modules/identity/application/use-cases/request-sign-in-code-use-case.ts'
import { ReadOtpDeliveryStatusUseCase } from '../modules/identity/application/use-cases/read-otp-delivery-status-use-case.ts'
import { VerifySignInCodeUseCase } from '../modules/identity/application/use-cases/verify-sign-in-code-use-case.ts'
import { RevokeIdentitySessionUseCase } from '../modules/identity/application/use-cases/revoke-identity-session-use-case.ts'
import { ReadOnboardingProfileUseCase } from '../modules/identity/application/use-cases/read-onboarding-profile-use-case.ts'
import { UpdateOnboardingProfileUseCase } from '../modules/identity/application/use-cases/update-onboarding-profile-use-case.ts'
import { ConfirmOnboardingPhoneUseCase } from '../modules/identity/application/use-cases/confirm-onboarding-phone-use-case.ts'
import { CancelOnboardingPhoneUseCase } from '../modules/identity/application/use-cases/cancel-onboarding-phone-use-case.ts'
import { ReadPlayerProfileUseCase } from '../modules/identity/application/use-cases/read-player-profile-use-case.ts'
import { UpdatePlayerProfileUseCase } from '../modules/identity/application/use-cases/update-player-profile-use-case.ts'
import { ConfirmPlayerPhoneUseCase } from '../modules/identity/application/use-cases/confirm-player-phone-use-case.ts'
import { CancelPlayerPhoneUseCase } from '../modules/identity/application/use-cases/cancel-player-phone-use-case.ts'

@inject()
export default class IdentityController {
  constructor(
    private requestCode: RequestSignInCodeUseCase,
    private readDeliveryStatus: ReadOtpDeliveryStatusUseCase,
    private verifyCode: VerifySignInCodeUseCase,
    private revokeSession: RevokeIdentitySessionUseCase,
    private readOnboardingProfile: ReadOnboardingProfileUseCase,
    private updateOnboardingProfileUseCase: UpdateOnboardingProfileUseCase,
    private confirmOnboardingPhoneUseCase: ConfirmOnboardingPhoneUseCase,
    private cancelOnboardingPhoneUseCase: CancelOnboardingPhoneUseCase,
    private readPlayerProfile: ReadPlayerProfileUseCase,
    private updatePlayerProfile: UpdatePlayerProfileUseCase,
    private confirmPlayerPhone: ConfirmPlayerPhoneUseCase,
    private cancelPlayerPhone: CancelPlayerPhoneUseCase
  ) {}

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
    const useCase =
      context.request.url() === '/me' ? this.readPlayerProfile : this.readOnboardingProfile
    const result = await useCase.execute({ actor: await this.actor(context) })

    context.response.header('cache-control', 'no-store')

    return context.inertia.render('identity/profile', {
      profile: result.data,
      access: result.access,
    })
  }

  async logout({ session, response }: HttpContext) {
    await this.revokeSession.execute({ sessionId: session.sessionId })
    session.clear()
    session.regenerate()

    return response.noContent()
  }

  async verify({ request, session }: HttpContext) {
    const result = await this.verifyCode.execute({
      challengeId: request.input('challengeId'),
      code: request.input('code'),
      browserId: session.sessionId,
      requestId: request.id()!,
    })

    return { ...result, next: result.access === 'player' ? '/me' : '/onboarding' }
  }

  private async actor({ auth, session }: HttpContext): Promise<IdentityActor | null> {
    if (!(await auth.check())) return null

    return {
      userId: auth.user!.id,
      status: auth.user!.status,
      access: session.get('identityAccess') === 'player' ? 'player' : 'onboarding',
    }
  }

  private async profileInput(context: HttpContext) {
    return {
      actor: await this.actor(context),
      data: context.request.all(),
      key: context.request.header('idempotency-key'),
      browserId: context.session.sessionId,
      clientAddress: context.request.request.socket.remoteAddress,
      requestId: context.request.id()!,
    }
  }

  private async phoneInput(context: HttpContext) {
    return {
      actor: await this.actor(context),
      challengeId: context.request.input('challengeId'),
      code: context.request.input('code'),
      browserId: context.session.sessionId,
      requestId: context.request.id()!,
    }
  }

  async onboardingProfile(context: HttpContext) {
    const result = await this.readOnboardingProfile.execute({ actor: await this.actor(context) })

    context.response.header('cache-control', 'no-store')

    return { data: result.data }
  }

  async profile(context: HttpContext) {
    const result = await this.readPlayerProfile.execute({ actor: await this.actor(context) })

    context.response.header('cache-control', 'no-store')

    return { data: result.data }
  }

  async updateOnboardingProfile(context: HttpContext) {
    const result = await this.updateOnboardingProfileUseCase.execute(
      await this.profileInput(context)
    )

    return context.response.status('phoneVerificationRequired' in result ? 202 : 200).send(result)
  }

  async updateProfile(context: HttpContext) {
    const result = await this.updatePlayerProfile.execute(await this.profileInput(context))

    context.response.header('cache-control', 'no-store')

    return context.response.status('phoneVerificationRequired' in result ? 202 : 200).send(result)
  }

  async confirmOnboardingPhone(context: HttpContext) {
    return this.confirmOnboardingPhoneUseCase.execute(await this.phoneInput(context))
  }

  async confirmPhone(context: HttpContext) {
    context.response.header('cache-control', 'no-store')

    return this.confirmPlayerPhone.execute(await this.phoneInput(context))
  }

  async cancelOnboardingPhone(context: HttpContext) {
    await this.cancelOnboardingPhoneUseCase.execute(await this.phoneInput(context))

    return context.response.noContent()
  }

  async cancelPhone(context: HttpContext) {
    await this.cancelPlayerPhone.execute(await this.phoneInput(context))
    context.response.header('cache-control', 'no-store')

    return context.response.noContent()
  }

  async status({ params, session, response }: HttpContext) {
    response.header('cache-control', 'no-store')

    return this.readDeliveryStatus.execute({ challengeId: params.id, browserId: session.sessionId })
  }

  async request({ request, session, response }: HttpContext) {
    const result = await this.requestCode.execute({
      email: request.input('email'),
      browserId: session.sessionId,
      clientAddress: request.request.socket.remoteAddress,
      key: request.header('idempotency-key'),
      requestId: request.id()!,
    })

    session.put('pendingOtp', { ...result.receipt, email: result.email })

    return response.accepted(result.receipt)
  }
}
