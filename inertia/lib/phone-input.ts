export function maskPhoneInput(value: string) {
  const digits = value.replace(/\D/g, '')
  const hasCountryCode =
    digits.startsWith('55') && (value.trimStart().startsWith('+') || digits.length > 11)
  const nationalDigits = (hasCountryCode ? digits.slice(2) : digits).slice(0, 11)
  if (!nationalDigits) return ''
  const areaCode = nationalDigits.slice(0, 2)
  const subscriberNumber = nationalDigits.slice(2)
  let formatted = `+55 (${areaCode}`
  if (subscriberNumber) formatted += `) ${subscriberNumber.slice(0, 5)}`
  if (subscriberNumber.length > 5) formatted += `-${subscriberNumber.slice(5)}`
  return formatted
}
