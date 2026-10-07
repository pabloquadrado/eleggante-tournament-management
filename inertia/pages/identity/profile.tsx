import { Head, router } from '@inertiajs/react'
import { useState, type FormEvent } from 'react'
import { identityRequest } from '../../lib/identity-http.ts'
import { useOtpChallenge, type OtpChallenge } from '../../lib/use-otp-challenge.ts'
import { maskPhoneInput } from '../../lib/phone-input.ts'

type Profile = {
  id: string
  arenaId: string
  email: string | null
  name: string | null
  username: string | null
  phone: string | null
  version: number
}

export default function PlayerProfile({
  profile,
  access,
}: {
  profile: Profile
  access: 'onboarding' | 'player'
}) {
  const [current, setCurrent] = useState(profile)
  const [name, setName] = useState(profile.name ?? '')
  const [username, setUsername] = useState(profile.username ?? '')
  const [phone, setPhone] = useState(() => maskPhoneInput(profile.phone ?? ''))
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null)
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [deliveryMessage, setDeliveryMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const canResend = useOtpChallenge(challenge, setDeliveryMessage)
  const endpoint = access === 'player' ? '/api/v1/me' : '/api/v1/onboarding/profile'

  async function save(event: FormEvent) {
    event.preventDefault()
    setBusy(true)

    try {
      const result = await identityRequest<
        { data: Profile } | (OtpChallenge & { phoneVerificationRequired: true })
      >(endpoint, 'PATCH', { name, username, phone, version: current.version })

      if ('phoneVerificationRequired' in result) {
        setChallenge(result)
        setDeliveryMessage('')
        setMessage('Confirme a alteração do celular quando receber o novo código por e-mail.')
      } else {
        setCurrent(result.data)
        setMessage('Perfil salvo.')
      }
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function confirm(event: FormEvent) {
    event.preventDefault()
    setBusy(true)

    try {
      const result = await identityRequest<{ data: Profile }>(`${endpoint}/phone/verify`, 'POST', {
        challengeId: challenge!.challengeId,
        code,
      })

      setCurrent(result.data)
      setChallenge(null)
      setCode('')
      setMessage('Perfil salvo.')
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function logout() {
    try {
      await identityRequest('/api/v1/auth/logout', 'POST')
      router.visit('/sign-in')
    } catch (error) {
      setMessage((error as Error).message)
    }
  }

  async function cancelPhone() {
    setBusy(true)

    try {
      await identityRequest(`${endpoint}/phone/cancel`, 'POST', {
        challengeId: challenge!.challengeId,
      })
      setChallenge(null)
      setCode('')
      setDeliveryMessage('')
      setMessage('Alteração cancelada. Seu celular atual foi mantido.')
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="arena-shell">
      <Head title="Meu perfil" />
      <a href="/tournaments" className="arena-brand">
        Arena Eleggante
      </a>
      <h1>{access === 'onboarding' ? 'Complete seu perfil' : 'Meu perfil'}</h1>
      <dl>
        <dt>Arena Eleggante ID</dt>
        <dd>{current.arenaId}</dd>
        <dt>E-mail verificado</dt>
        <dd>{current.email}</dd>
      </dl>
      <p role="status" aria-live="polite">
        {message}
      </p>
      <form onSubmit={save} className="arena-form" noValidate>
        <label>
          Nome de exibição
          <input
            autoComplete="name"
            disabled={busy || challenge !== null}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </label>
        <label>
          Nome de usuário
          <input
            autoComplete="username"
            disabled={busy || challenge !== null}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </label>
        <label>
          Celular com DDD
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            pattern="\+55 \([0-9]{2}\) [0-9]{5}-[0-9]{4}"
            disabled={busy || challenge !== null}
            placeholder="+55 (00) 00000-0000"
            value={maskPhoneInput(phone)}
            onChange={(event) => setPhone(maskPhoneInput(event.target.value))}
            required
          />
        </label>
        <p>Use um celular brasileiro com DDD. Alterações exigem um novo código por e-mail.</p>
        <button disabled={busy || challenge !== null}>Salvar perfil</button>
      </form>
      {challenge !== null && (
        <section>
          <p role="status" aria-live="polite">
            {deliveryMessage}
          </p>
          <form onSubmit={confirm} className="arena-form" noValidate>
            <label>
              Código para alterar o celular
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </label>
            <button disabled={busy}>Confirmar celular</button>
          </form>
          <form onSubmit={save}>
            <button disabled={busy || !canResend}>Solicitar novo código</button>
          </form>
          <button disabled={busy} onClick={cancelPhone}>
            Cancelar alteração
          </button>
        </section>
      )}
      {access === 'onboarding' && (
        <section>
          <h2>Aceite dos documentos pendente</h2>
          <p>
            O acesso continua limitado até o aceite dos Termos de Uso e do Aviso de Privacidade.
            Essa etapa será disponibilizada em breve.
          </p>
        </section>
      )}
      <button onClick={logout}>Sair</button>
    </main>
  )
}
