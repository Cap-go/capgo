import { describe, test } from 'vitest'
import {
  getEffectivePasswordMinLength,
  getPasswordPolicyValidationErrors,
  getPasswordUtf8ByteLength,
} from '../supabase/functions/_backend/utils/password_policy.ts'

describe('getPasswordUtf8ByteLength', () => {
  test('ascii password', async ({ bench }) => {
    await bench('ascii password', () => {
      getPasswordUtf8ByteLength('MyP@ssw0rd!2024')
    }).run()
  })

  test('multibyte password (emoji + accented)', async ({ bench }) => {
    await bench('multibyte password (emoji + accented)', () => {
      getPasswordUtf8ByteLength('Pässwörd🔑✨SecüreKey!')
    }).run()
  })

  test('long ASCII password (72 bytes)', async ({ bench }) => {
    await bench('long ASCII password (72 bytes)', () => {
      getPasswordUtf8ByteLength('A'.repeat(72))
    }).run()
  })
})

describe('getEffectivePasswordMinLength', () => {
  test('with valid min length', async ({ bench }) => {
    await bench('with valid min length', () => {
      getEffectivePasswordMinLength(10)
    }).run()
  })

  test('with undefined', async ({ bench }) => {
    await bench('with undefined', () => {
      getEffectivePasswordMinLength(undefined)
    }).run()
  })

  test('with edge values', async ({ bench }) => {
    await bench('with edge values', () => {
      getEffectivePasswordMinLength(3)
      getEffectivePasswordMinLength(100)
      getEffectivePasswordMinLength(Number.NaN)
    }).run()
  })
})

describe('getPasswordPolicyValidationErrors', () => {
  const strictPolicy = {
    min_length: 12,
    require_uppercase: true,
    require_number: true,
    require_special: true,
  }

  test('valid password against strict policy', async ({ bench }) => {
    await bench('valid password against strict policy', () => {
      getPasswordPolicyValidationErrors('MyStr0ng!Pass', strictPolicy)
    }).run()
  })

  test('invalid password (all rules fail)', async ({ bench }) => {
    await bench('invalid password (all rules fail)', () => {
      getPasswordPolicyValidationErrors('abc', strictPolicy)
    }).run()
  })

  test('empty policy', async ({ bench }) => {
    await bench('empty policy', () => {
      getPasswordPolicyValidationErrors('simplepassword', {})
    }).run()
  })

  test('multibyte password validation', async ({ bench }) => {
    await bench('multibyte password validation', () => {
      getPasswordPolicyValidationErrors('Pässwörd🔑1!', strictPolicy)
    }).run()
  })
})
