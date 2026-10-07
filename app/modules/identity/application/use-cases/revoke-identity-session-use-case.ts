import type { IdentityUnitOfWork } from '../ports/identity-repositories.ts'

export class RevokeIdentitySessionUseCase {
  constructor(private work: IdentityUnitOfWork) {}

  async execute(input: { sessionId: string }): Promise<void> {
    await this.work.write(({ sessions }) => sessions.revoke(input.sessionId))
  }
}
