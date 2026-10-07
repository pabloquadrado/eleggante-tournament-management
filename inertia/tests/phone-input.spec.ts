import assert from 'node:assert/strict'
import { test } from '@japa/runner'
import { maskPhoneInput } from '../lib/phone-input.ts'

test('the phone input displays the Brazilian mobile mask for partial, typed, and pasted numbers', () => {
  for (const [input, expected] of [
    ['', ''],
    ['abc+', ''],
    ['5', '+55 (5'],
    ['51', '+55 (51'],
    ['519', '+55 (51) 9'],
    ['5199900', '+55 (51) 99900'],
    ['51999009', '+55 (51) 99900-9'],
    ['51999009633', '+55 (51) 99900-9633'],
    ['(55) 99900-9633', '+55 (55) 99900-9633'],
    ['5551999009633', '+55 (51) 99900-9633'],
    ['  +55 (51) 99900-9633', '+55 (51) 99900-9633'],
    ['++55a51b99900-9633', '+55 (51) 99900-9633'],
    ['+555199900963312345', '+55 (51) 99900-9633'],
  ]) {
    assert.equal(maskPhoneInput(input), expected)
  }

  let typed = '+55'

  for (const digit of '51999009633') typed = maskPhoneInput(typed + digit)

  assert.equal(typed, '+55 (51) 99900-9633')

  for (let remaining = 11; remaining > 0; remaining--) typed = maskPhoneInput(typed.slice(0, -1))

  assert.equal(typed, '')
})
