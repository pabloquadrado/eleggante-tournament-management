import { HttpClient } from '@poppinss/oauth-client'

export const googleTokenUrl = 'https://oauth2.googleapis.com/token'
export const googleUserInfoUrl = 'https://openidconnect.googleapis.com/v1/userinfo'
export type GoogleFetch = (url: string, init: RequestInit) => Promise<Response>

/** Retains Ally's request builder while bounding transport and omitting debug diagnostics. */
export class GoogleHttpClient extends HttpClient {
  constructor(
    private endpoint: string,
    private transport: GoogleFetch
  ) {
    super(endpoint)
  }

  async post() {
    return this.send('POST', googleTokenUrl)
  }
  async get() {
    return this.send('GET', googleUserInfoUrl)
  }

  private async send(method: 'POST' | 'GET', allowed: string): Promise<Record<string, unknown>> {
    if (this.endpoint !== allowed) throw new Error('Google transport unavailable')

    const headers = new Headers(this.getHeaders())

    headers.set('accept', 'application/json')
    let body: string | undefined

    if (method === 'POST') {
      headers.set('content-type', 'application/x-www-form-urlencoded')
      body = new URLSearchParams(this.getFields()).toString()
    }

    const response = await this.transport(allowed, {
      method,
      headers,
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok || (response.url && response.url !== allowed))
      throw new Error('Google transport unavailable')

    const data: unknown = await response.json()

    if (typeof data !== 'object' || data === null || Array.isArray(data) || 'error' in data)
      throw new Error('Google transport unavailable')

    return data as Record<string, unknown>
  }
}
