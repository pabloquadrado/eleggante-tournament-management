import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { identityRequest } from './identity-http'

export type OtpChallenge = {
  challengeId: string
  message: string
  resendAt: string
  expiresAt: string
}

export function useOtpChallenge(
  challenge: OtpChallenge | null,
  onStatus: Dispatch<SetStateAction<string>>
) {
  const [time, setTime] = useState(() => Date.now())
  useEffect(() => {
    if (!challenge) return
    let active = true
    const clock = window.setInterval(() => setTime(Date.now()), 1000)
    const poll = window.setInterval(async () => {
      try {
        const result = await identityRequest<{ message: string }>(
          `/api/v1/auth/otp/${challenge.challengeId}`
        )
        if (active) onStatus(result.message)
      } catch (error) {
        if (active) onStatus((error as Error).message)
      }
    }, 5000)
    return () => {
      active = false
      window.clearInterval(clock)
      window.clearInterval(poll)
    }
  }, [challenge, onStatus])

  return challenge !== null && time >= new Date(challenge.resendAt).getTime()
}
