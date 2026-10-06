export class IdentityError extends Error {
  constructor(
    message: string,
    readonly status = 422,
    readonly field = 'general'
  ) {
    super(message)
  }
}
