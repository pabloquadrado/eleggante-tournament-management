import type { HttpContext } from '@adonisjs/core/http'
import { GoogleDriver } from '@adonisjs/ally/drivers/google'
import type { GoogleDriverConfig } from '@adonisjs/ally/types'
import type { GoogleAttemptMaterial } from '../domain/google-auth-attempt.ts'
import { GoogleHttpClient, type GoogleFetch } from './google-http-client.ts'

/** Internal driver: the application owns durable state, expiry, browser binding and consumption. */
export class AttemptBoundGoogleDriver extends GoogleDriver {
  constructor(
    context: HttpContext,
    config: GoogleDriverConfig,
    private material: GoogleAttemptMaterial,
    private transport: GoogleFetch
  ) {
    super(context, config)
  }

  protected loadState() {
    /* No independent cookie lifecycle. */
  }

  protected getPkceCodeVerifierForRedirect() {
    return this.verifier()
  }
  protected getPkceCodeVerifierForAccessToken() {
    return this.verifier()
  }
  protected httpClient(url: string) {
    return new GoogleHttpClient(url, this.transport)
  }

  private verifier(): string {
    if (!/^[A-Za-z0-9._~-]{43,128}$/.test(this.material.verifier))
      throw new Error('Google attempt unavailable')

    return this.material.verifier
  }
}
