import { describe, expect, it } from 'vitest'

import { getEffectivePasswordMinLength, getPasswordPolicyValidationErrors, getPasswordUtf8ByteLength } from '../supabase/functions/_backend/utils/password_policy.ts'

describe('password policy utils', () => {
  it.concurrent('measures UTF-8 password length in bytes', () => {
    expect(getPasswordUtf8ByteLength('Password123!')).toBe(12)
    expect(getPasswordUtf8ByteLength('é')).toBe(2)
    expect(getPasswordUtf8ByteLength('😀')).toBe(4)
  })

  it.concurrent('rejects passwords that exceed Supabase UTF-8 byte limits even if JS length is below 72', () => {
    const multibytePassword = '😀'.repeat(20)
    const errors = getPasswordPolicyValidationErrors(multibytePassword, {
      min_length: 10,
      require_uppercase: false,
      require_number: false,
      require_special: false,
    })

    expect(errors).toContain('Password cannot be longer than 72 UTF-8 bytes')
  })

  it.concurrent('clamps min length to the supported range', () => {
    expect(getEffectivePasswordMinLength(undefined)).toBe(6)
    expect(getEffectivePasswordMinLength(3)).toBe(6)
    expect(getEffectivePasswordMinLength(100)).toBe(72)
    expect(getEffectivePasswordMinLength(20)).toBe(20)
    expect(getEffectivePasswordMinLength(Number.NaN)).toBe(6)
    expect(getEffectivePasswordMinLength(10.5)).toBe(11)
  })
})
