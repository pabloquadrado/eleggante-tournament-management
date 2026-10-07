import app from '@adonisjs/core/services/app'
import { type HttpContext, ExceptionHandler } from '@adonisjs/core/http'
import type { StatusPageRange, StatusPageRenderer } from '@adonisjs/core/types/http'
import { IdentityError } from '../modules/identity/domain/identity-error.ts'
import { errors as shieldErrors } from '@adonisjs/shield'

export default class HttpExceptionHandler extends ExceptionHandler {
  private isIdentityRequest(ctx: HttpContext) {
    return /^(\/api\/v1\/(auth|me|onboarding)|\/sign-in|\/onboarding|\/me)(\/|$)/.test(
      ctx.request.url()
    )
  }
  /**
   * In debug mode, the exception handler will display verbose errors
   * with pretty printed stack traces.
   */
  protected debug = !app.inProduction

  /**
   * Status pages are used to display a custom HTML pages for certain error
   * codes. You might want to enable them in production only, but feel
   * free to enable them in development as well.
   */
  protected renderStatusPages = process.env.NODE_ENV !== 'development'

  /**
   * Status pages is a collection of error code range and a callback
   * to return the HTML contents to send as a response.
   */
  protected statusPages: Record<StatusPageRange, StatusPageRenderer> = {
    '404': (_, { inertia }) => inertia.render('errors/not-found', {}),
    '500..599': (_, { inertia }) => inertia.render('errors/server-error', {}),
  }

  /**
   * The method is used for handling errors and returning
   * response to the client
   */
  async handle(error: unknown, ctx: HttpContext) {
    if (error instanceof shieldErrors.E_BAD_CSRF_TOKEN) {
      return ctx.response.forbidden({
        errors: {
          general: 'Sua sessão de segurança expirou. Atualize a página e tente novamente.',
        },
      })
    }

    if (error instanceof IdentityError) {
      if (['/onboarding', '/me'].includes(ctx.request.url()))
        return ctx.response.redirect(error.status === 401 ? '/sign-in' : '/onboarding')

      return ctx.response.status(error.status).send({ errors: { [error.field]: error.message } })
    }

    if (this.isIdentityRequest(ctx)) {
      return ctx.response.internalServerError({
        errors: { general: 'Não foi possível concluir a solicitação. Tente novamente.' },
      })
    }

    return super.handle(error, ctx)
  }

  /**
   * The method is used to report error to the logging service or
   * the a third party error monitoring service.
   *
   * @note You should not attempt to send a response from this method.
   */
  async report(error: unknown, ctx: HttpContext) {
    if (this.isIdentityRequest(ctx)) {
      if (!(error instanceof IdentityError) && !(error instanceof shieldErrors.E_BAD_CSRF_TOKEN)) {
        ctx.logger.error('Identity request failed; private diagnostics omitted')
      }

      return
    }

    return super.report(error, ctx)
  }
}
