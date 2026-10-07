export class IdentityHttpError extends Error {}

export async function identityRequest<Result>(
  url: string,
  method = 'GET',
  body?: unknown
): Promise<Result> {
  try {
    const token = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]+)/)?.[1] ?? ''
    const response = await fetch(url, {
      method,
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'x-xsrf-token': decodeURIComponent(token),
        'idempotency-key': crypto.randomUUID(),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })

    if (response.status === 204) return undefined as Result

    const result = await response.json()

    if (!response.ok) throw new IdentityHttpError(Object.values(result.errors).join(' '))

    return result
  } catch (error) {
    if (error instanceof IdentityHttpError) throw error

    throw new IdentityHttpError('Não foi possível conectar. Tente novamente.')
  }
}
