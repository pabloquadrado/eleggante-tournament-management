import env from '#start/env'

/** Real HTTP cookies and PostgreSQL sessions, rather than Japa's memory-session shortcuts. */
export class IdentityBrowser {
  cookies = new Map<string, string>()
  extraHeaders: Record<string, string> = {}

  async request(path: string, method = 'GET', body?: unknown, idempotencyKey?: string) {
    const xsrf = this.cookies.get('XSRF-TOKEN')
    const response = await fetch(`http://${env.get('HOST')}:${env.get('PORT')}${path}`, {
      method,
      redirect: 'manual',
      headers: {
        ...this.extraHeaders,
        'accept': 'application/json',
        'content-type': 'application/json',
        'cookie': [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; '),
        ...(xsrf ? { 'x-xsrf-token': decodeURIComponent(xsrf) } : {}),
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(';')
      const separator = pair.indexOf('=')
      this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1))
    }
    return response
  }

  async start() {
    await this.request('/api/v1/tournaments')
    return this
  }
}
