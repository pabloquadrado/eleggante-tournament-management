import { type IdentityUnitOfWork } from './ports/identity-repositories.ts'

export class IdentitySessions {
  constructor(private work: IdentityUnitOfWork) {}

  async revoke(id: string) {
    await this.work.write(({ sessions }) => sessions.revoke(id))
  }
}
