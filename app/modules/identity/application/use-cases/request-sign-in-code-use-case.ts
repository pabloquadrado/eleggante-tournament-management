import { EmailAddress } from '../../domain/email-address.ts'
import { requestClientAddress } from '../../domain/request-client-address.ts'
import type { IdentityUnitOfWork } from '../ports/identity-repositories.ts'
import type { OtpRequestService } from '../services/otp-request-service.ts'

export type RequestSignInCodeInput = {
  email: unknown
  browserId: string
  clientAddress: string | undefined
  key: unknown
  requestId: string
}

export class RequestSignInCodeUseCase {
  constructor(
    private work: IdentityUnitOfWork,
    private requests: OtpRequestService
  ) {}

  async execute(input: RequestSignInCodeInput) {
    const email = EmailAddress.parse(input.email)
    const receipt = await this.work.write((repositories) =>
      this.requests.request(
        email,
        input.browserId,
        requestClientAddress(input.clientAddress),
        input.key,
        input.requestId,
        repositories
      )
    )

    return { receipt, email: email.value }
  }
}
