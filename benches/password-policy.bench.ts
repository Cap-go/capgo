import { bench, describe } from 'vitest'
import {
  getEffectivePasswordMinLength,
  getPasswordPolicyValidationErrors,
  getPasswordUtf8ByteLength,
} from '../supabase/functions/_backend/utils/password_policy.ts'

describe('getPasswordUtf8ByteLength', () => {
  bench('ASCII password', () => {
    getPasswordUtf8ByteLength('MyP@ssw0rd!2024')
  })

  bench('multibyte password (emoji + accented)', () => {
    getPasswordUtf8ByteLength('Pässwörd🔑✨SecüreKey!')
  })

  bench('long ASCII password (72 bytes)', () => {
    getPasswordUtf8ByteLength('A'.repeat(72))
  })
})

describe('getEffectivePasswordMinLength', () => {
  bench('with valid min length', () => {
    getEffectivePasswordMinLength(10)
  })

  bench('with undefined', () => {
    getEffectivePasswordMinLength(undefined)
  })

  bench('with edge values', () => {
    getEffectivePasswordMinLength(3)
    getEffectivePasswordMinLength(100)
    getEffectivePasswordMinLength(Number.NaN)
  })
})

describe('getPasswordPolicyValidationErrors', () => {
  const strictPolicy = {
    min_length: 12,
    require_uppercase: true,
    require_number: true,
    require_special: true,
  }

  bench('valid password against strict policy', () => {
    getPasswordPolicyValidationErrors('MyStr0ng!Pass', strictPolicy)
  })

  bench('invalid password (all rules fail)', () => {
    getPasswordPolicyValidationErrors('abc', strictPolicy)
  })

  bench('empty policy', () => {
    getPasswordPolicyValidationErrors('simplepassword', {})
  })

  bench('multibyte password validation', () => {
    getPasswordPolicyValidationErrors('Pässwörd🔑1!', strictPolicy)
  })
})
