import { randomBytes } from 'node:crypto'
import type { HttpContext } from '@adonisjs/core/http'
import { GoogleAuthorization } from '../application/ports/identity-adapters.ts'
import { isGoogleState, type GoogleAttemptMaterial } from '../domain/google-auth-attempt.ts'
import { GoogleIdentityEvidence } from '../domain/google-identity-evidence.ts'
import { AttemptBoundGoogleDriver } from './attempt-bound-google-driver.ts'
import { googleUserInfoUrl, type GoogleFetch } from './google-http-client.ts'

export interface GoogleClientSettings {
  clientId: string
  clientSecret: string
  callbackUrl: string
}

export function googleDiagnosticsAreSafe(setting = process.env.NODE_DEBUG ?? ''): boolean {
  return !/(\*|oauth_client|adonisjs:ally)/i.test(setting)
}

export class AllyGoogleAuthorization extends GoogleAuthorization {
  constructor(
    private context: HttpContext,
    private settings: GoogleClientSettings | null,
    private transport: GoogleFetch = fetch
  ) {
    super()
  }

  async prepare() {
    if (!this.settings || !googleDiagnosticsAreSafe()) return null

    try {
      const material = {
        state: randomBytes(32).toString('base64url'),
        verifier: randomBytes(32).toString('base64url'),
      }
      const driver = this.driver(material)
      const url = await driver.getRedirectUrl((builder) => {
        builder.param('state', material.state)
        builder.param('hl', 'pt-BR')
      })

      return { ...material, url }
    } catch {
      return null
    }
  }

  async exchange(input: GoogleAttemptMaterial & { code: string }) {
    if (!this.settings || !googleDiagnosticsAreSafe() || !isGoogleState(input.state)) return null

    try {
      const driver = this.driver(input)
      const token = await driver.getAccessToken((builder) => builder.field('code', input.code))

      if (
        typeof token.token !== 'string' ||
        !/^[\x21-\x7e]{1,4096}$/.test(token.token) ||
        typeof token.type !== 'string' ||
        token.type.toLowerCase() !== 'bearer'
      )
        return null

      const user = await driver.userFromToken(token.token)
      const identity = GoogleIdentityEvidence.parse({
        subject: user.original.sub,
        email: user.original.email,
        emailVerified: user.original.email_verified,
        hostedDomain: user.original.hd,
      })

      return identity
        ? {
            subject: identity.subject,
            email: identity.email,
            emailVerified: true,
            hostedDomain: user.original.hd,
          }
        : null
    } catch {
      return null
    }
  }

  private driver(material: GoogleAttemptMaterial) {
    return new AttemptBoundGoogleDriver(
      this.context,
      {
        ...this.settings!,
        scopes: ['openid', 'email'],
        accessType: 'online',
        userInfoUrl: googleUserInfoUrl,
      },
      material,
      this.transport
    )
  }
}
