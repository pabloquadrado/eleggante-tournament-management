import type { HttpContext } from '@adonisjs/core/http'
import { MessageBuilder } from '@adonisjs/core/helpers'
import { Session } from '@adonisjs/session'
import emitter from '@adonisjs/core/services/emitter'
import { configProvider } from '@adonisjs/core'
import app from '@adonisjs/core/services/app'
import sessionConfig from '#config/session'
import type { ResolvedSessionConfig } from '@adonisjs/session/types'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { sessionPolicy, type IdentityAccess } from '../domain/session-policy.js'

export class PostgresIdentitySession {
  private pendingSession!: Session

  constructor(private context: HttpContext) {}

  async establish(userId: string, access: IdentityAccess, transaction: TransactionClientContract) {
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
    await transaction.table('sessions').insert({
      id: session.sessionId,
      user_id: userId,
      data: new MessageBuilder().build(session.all(), undefined, session.sessionId),
      expires_at: new Date(Date.now() + sessionPolicy.inactivitySeconds * 1000),
    })
    await transaction.from('sessions').where('id', oldId).delete()
    this.pendingSession = session
  }

  activate() {
    // Keep the requesting browser's session intact until the transaction commits.
    this.context.session = this.pendingSession
  }
}
