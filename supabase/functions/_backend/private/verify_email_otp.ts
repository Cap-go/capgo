import { z } from 'zod/mini'
import { createHono, getClaimsFromJWT, middlewareAuth, parseBody, quickError, simpleError, useCors } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { emptySupabase, supabaseClient } from '../utils/supabase.ts'
import { version } from '../utils/version.ts'

const bodySchema = z.object({
  token: z.optional(z.string()),
  token_hash: z.optional(z.string()),
  type: z.optional(z.enum(['email', 'magiclink'])),
})

export const app = createHono('', version)

app.use('/', useCors)

app.post('/', middlewareAuth, async (c) => {
  const rawBody = await parseBody<{ token?: string, token_hash?: string, type?: 'email' | 'magiclink' }>(c)
  const token = rawBody.token?.replaceAll(' ', '') ?? ''
  const tokenHash = rawBody.token_hash?.trim() ?? ''

  const validation = bodySchema.safeParse({ token, token_hash: tokenHash, type: rawBody.type })
  if (!validation.success) {
    throw simpleError('invalid_body', 'Invalid request body', { errors: z.prettifyError(validation.error) })
  }
  const otpType = validation.data.type ?? 'email'
  if (!token && !tokenHash) {
    throw simpleError('invalid_body', 'Token or token_hash is required')
  }
  if (token && tokenHash) {
    throw simpleError('invalid_body', 'Provide token or token_hash, not both')
  }
  if (token && token.length !== 6) {
    throw simpleError('invalid_body', 'Token must be 6 characters long')
  }

  const auth = c.get('auth')
  if (!auth?.userId) {
    return quickError(401, 'not_authenticated', 'Not authenticated')
  }
  if (auth.authType !== 'jwt') {
    return quickError(401, 'invalid_auth_type', 'JWT authentication required')
  }

  const authorization = c.get('authorization')
  if (!authorization) {
    return quickError(401, 'no_authorization', 'No authorization header provided')
  }

  const claims = getClaimsFromJWT(authorization)
  const email = claims?.email
  if (!email && token) {
    return quickError(400, 'missing_email', 'Email is required to verify OTP')
  }

  const supabase = emptySupabase(c)
  let verifyData: Awaited<ReturnType<typeof supabase.auth.verifyOtp>>['data']
  let verifyError: Awaited<ReturnType<typeof supabase.auth.verifyOtp>>['error']
  if (tokenHash) {
    ({ data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType,
    }))
  }
  else {
    if (!email) {
      return quickError(400, 'missing_email', 'Email is required to verify OTP')
    }
    ({ data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token,
      type: otpType,
    }))
  }

  if (verifyError || !verifyData?.session?.access_token) {
    cloudlog({ requestId: c.get('requestId'), context: 'verify_email_otp - verifyOtp failed', error: verifyError?.message })
    return quickError(401, 'invalid_otp', 'Invalid or expired OTP')
  }

  if (verifyData.user?.id && verifyData.user.id !== auth.userId) {
    return quickError(403, 'otp_user_mismatch', 'OTP does not match current user')
  }

  const otpSupabase = supabaseClient(c, `Bearer ${verifyData.session.access_token}`)
  const { data: verifiedAt, error: recordError } = await otpSupabase
    .rpc('record_email_otp_verified')

  if (recordError || !verifiedAt) {
    cloudlog({ requestId: c.get('requestId'), context: 'verify_email_otp - record failed', error: recordError?.message })
    return quickError(500, 'record_failed', 'Failed to record OTP verification')
  }

  return c.json({ verified_at: verifiedAt })
})
