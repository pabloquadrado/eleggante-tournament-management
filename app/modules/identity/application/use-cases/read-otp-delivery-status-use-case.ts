import { IdentityError } from '../../domain/identity-error.ts'
import { isIdentifier } from '../../domain/identifier.ts'
import type { IdentitySecrets } from '../ports/identity-adapters.ts'
import type { IdentityQueries } from '../ports/identity-repositories.ts'

export class ReadOtpDeliveryStatusUseCase {
  constructor(
    private queries: IdentityQueries,
    private secrets: IdentitySecrets
  ) {}

  async execute(input: { challengeId: unknown; browserId: string }) {
    const { challengeId: id, browserId } = input

    if (!isIdentifier(id)) throw new IdentityError('Solicitação não encontrada.', 404)

    const state = await this.queries.deliveryStatus(id, this.secrets.key('browser', browserId))

    if (!state) throw new IdentityError('Solicitação não encontrada.', 404)

    return state === 'failed'
      ? {
          state: 'failed',
          message:
            'Não foi possível entregar o código. Confira o e-mail informado e tente novamente.',
        }
      : {
          state: 'pending',
          message:
            'Confira sua caixa de entrada e a pasta de spam. Se o código não chegar, confira o e-mail informado.',
        }
  }
}
