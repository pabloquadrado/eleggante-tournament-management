import { IdentityError } from './identity-error.ts'

export class PlayerProfileInput {
  static parse(input: Record<string, unknown>) {
    if (Object.keys(input).some((key) => !['name', 'username', 'phone', 'version'].includes(key))) {
      throw new IdentityError('Este campo não pode ser alterado.', 422)
    }

    const name = typeof input.name === 'string' ? input.name.trim() : ''

    if (name.length < 2 || name.length > 100)
      throw new IdentityError('Informe um nome entre 2 e 100 caracteres.', 422, 'name')

    const username = typeof input.username === 'string' ? input.username.trim() : ''

    if (!/^[a-z0-9_.]{3,30}$/i.test(username))
      throw new IdentityError(
        'Use de 3 a 30 letras, números, pontos ou sublinhados.',
        422,
        'username'
      )

    const digits = typeof input.phone === 'string' ? input.phone.replace(/[+()\s-]/g, '') : ''
    const phone = `+${digits.length === 11 ? `55${digits}` : digits}`

    if (!/^\+55[1-9]\d9\d{8}$/.test(phone))
      throw new IdentityError(
        'Informe um celular brasileiro com DDD, como +5551999009633.',
        422,
        'phone'
      )

    return { name, username, phone }
  }
}
