export const SUPABASE_MAX_PASSWORD_LENGTH = 72

const textEncoder = new TextEncoder()

export interface PasswordPolicyRules {
  min_length?: number
  require_uppercase?: boolean
  require_number?: boolean
  require_special?: boolean
}

export function getPasswordUtf8ByteLength(password: string) {
  return textEncoder.encode(password).length
}

export function getEffectivePasswordMinLength(minLength?: number) {
  const normalizedMinLength = Number.isFinite(minLength) ? Math.ceil(minLength!) : 6
  return Math.min(Math.max(normalizedMinLength, 6), SUPABASE_MAX_PASSWORD_LENGTH)
}

export function getPasswordPolicyValidationErrors(password: string, policy: PasswordPolicyRules) {
  const errors: string[] = []
  const effectiveMinLength = getEffectivePasswordMinLength(policy.min_length)

  if (getPasswordUtf8ByteLength(password) > SUPABASE_MAX_PASSWORD_LENGTH) {
    errors.push(`Password cannot be longer than ${SUPABASE_MAX_PASSWORD_LENGTH} UTF-8 bytes`)
  }

  if (password.length < effectiveMinLength) {
    errors.push(`Password must be at least ${effectiveMinLength} characters`)
  }

  if (policy.require_uppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter')
  }

  if (policy.require_number && !/\d/.test(password)) {
    errors.push('Password must contain at least one number')
  }

  if (policy.require_special && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    errors.push('Password must contain at least one special character')
  }

  return errors
}
