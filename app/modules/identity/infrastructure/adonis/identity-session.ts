import type { HttpContext } from '@adonisjs/core/http'
import { MessageBuilder } from '@adonisjs/core/helpers'
import { Session } from '@adonisjs/session'
import emitter from '@adonisjs/core/services/emitter'
import { configProvider } from '@adonisjs/core'
import app from '@adonisjs/core/services/app'
import sessionConfig from '#config/session'
import type { ResolvedSessionConfig } from '@adonisjs/session/types'
import { IdentitySession } from '../../application/ports/identity-adapters.ts'
import type { IdentitySessionRepository } from '../../application/ports/identity-repositories.ts'
import { sessionPolicy, type IdentityAccess } from '../../domain/session-policy.ts'

export class AdonisIdentitySession extends IdentitySession {
  private pendingSession!: Session

  constructor(private context: HttpContext) {
    super()
  }

  async establish(userId: string, access: IdentityAccess, repository: IdentitySessionRepository) {
    const { auth } = this.context
    const original = this.context.session
    const config = (await configProvider.resolve<ResolvedSessionConfig>(app, sessionConfig))!
    const session = new Session(config, config.stores[config.store], emitter, this.context)

    await session.initiate(false)
    const oldId = original.sessionId

    session.regenerate()
    session.clear()
    // Shield already issued this request's XSRF cookie using the same browser secret.
    session.put('csrf-secret', original.get('csrf-secret'))
    // Use the guard's public key contract while persisting session and identity in one transaction.
    // Guard.login would tag via a separate connection before the new user commits.
    session.put(auth.use('web').sessionKeyName, userId)
    session.put('identityAccess', access)
    await repository.replace({
      id: session.sessionId,
      userId,
      oldId,
      data: new MessageBuilder().build(session.all(), undefined, session.sessionId),
      expiresAt: new Date(Date.now() + sessionPolicy.inactivitySeconds * 1000),
    })
    this.pendingSession = session
  }

  activate() {
    // Keep the requesting browser's session intact until the transaction commits.
    this.context.session = this.pendingSession
  }
}
