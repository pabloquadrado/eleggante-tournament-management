import { Head, router } from '@inertiajs/react'
import { useState, type FormEvent } from 'react'
import { identityRequest } from '../../lib/identity-http.ts'
import { useOtpChallenge, type OtpChallenge } from '../../lib/use-otp-challenge.ts'

export default function SignIn({
  pending,
}: {
  pending: (OtpChallenge & { email: string }) | null
}) {
  const [email, setEmail] = useState(pending?.email ?? '')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(pending?.message ?? '')
  const [deliveryMessage, setDeliveryMessage] = useState('')
  const canResend = useOtpChallenge(pending, setDeliveryMessage)

  async function send(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      await identityRequest<OtpChallenge>('/api/v1/auth/otp/request', 'POST', { email })
      router.visit('/sign-in/code')
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function verify(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const result = await identityRequest<{ next: string }>('/api/v1/auth/otp/verify', 'POST', {
        challengeId: pending!.challengeId,
        code,
      })
      router.visit(result.next)
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="arena-shell">
      <Head title="Entrar" />
      <a href="/tournaments" className="arena-brand">
        Arena Eleggante
      </a>
      <h1>Entrar na Arena Eleggante</h1>
      <p>
        Use seu e-mail para receber um código de acesso. Novos jogadores completam o perfil após a
        verificação.
      </p>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {!pending ? (
        <form onSubmit={send} noValidate className="arena-form">
          <label>
            E-mail
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <button disabled={busy}>Enviar código</button>
        </form>
      ) : (
        <>
          <p>Quando receber o código em {email}, informe-o abaixo.</p>
          <p role="status" aria-live="polite">
            {deliveryMessage}
          </p>
          <form onSubmit={verify} noValidate className="arena-form">
            <label>
              Código de acesso
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
              />
            </label>
            <button disabled={busy}>Verificar código</button>
          </form>
          <form onSubmit={send}>
            <button disabled={busy || !canResend}>Reenviar código</button>
          </form>
          <a href="/sign-in">Corrigir e-mail</a>
        </>
      )}
    </main>
  )
}
