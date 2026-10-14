import app from '@adonisjs/core/services/app'
import { HttpContext } from '@adonisjs/core/http'
import { AllyGoogleAuthorization } from '../../app/modules/identity/infrastructure/ally-google-authorization.ts'
import { GoogleAuthorization } from '../../app/modules/identity/application/ports/identity-adapters.ts'
import {
  googleTokenUrl,
  googleUserInfoUrl,
  type GoogleFetch,
} from '../../app/modules/identity/infrastructure/google-http-client.ts'
import { type IdentityBrowser } from './identity-browser.ts'

/** Controls only the external provider's transport, retaining the production Ally driver. */
export class GoogleProviderFixture {
  proof: unknown = {
    sub: 'fixture-subject',
    email: 'PLAYER@example.com',
    email_verified: true,
    hd: 'example.com',
    name: 'Ignored Google Name',
    picture: 'https://example.com/ignored',
  }
  exchanges = 0
  onExchange?: () => Promise<void>
  requests: { url: string; init: RequestInit }[] = []

  transport: GoogleFetch = async (url, init) => {
    this.requests.push({ url, init })

    if (url === googleTokenUrl) {
      this.exchanges++
      await this.onExchange?.()

      return Response.json({
        access_token: 'fixture-access-token',
        token_type: 'Bearer',
        id_token: 'ignored-untrusted-id-token',
        refresh_token: 'ignored-refresh-token',
      })
    }

    if (url !== googleUserInfoUrl) throw new Error('Unexpected fixture endpoint')

    return Response.json(this.proof)
  }

  install() {
    app.container.swap(
      GoogleAuthorization,
      async (resolver) =>
        new AllyGoogleAuthorization(
          await resolver.make(HttpContext),
          {
            clientId: 'fixture-client',
            clientSecret: 'fixture-secret',
            callbackUrl: 'http://localhost:3333/auth/google/callback',
          },
          this.transport
        )
    )

    return () => app.container.restore(GoogleAuthorization)
  }
}

export async function beginGoogle(browser: IdentityBrowser) {
  const response = await browser.request('/auth/google')
  const target = new URL(response.headers.get('location')!)

  return { state: target.searchParams.get('state')!, target }
}

export function googleCallback(state: string, extra = 'code=fixture-code') {
  return `/auth/google/callback?state=${encodeURIComponent(state)}&${extra}`
}
