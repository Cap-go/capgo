import { beforeAll, describe, expect, it } from 'vitest'
import { getAuthHeaders, getEndpointUrl, getSupabaseClient, USER_EMAIL, USER_ID } from './test-utils.ts'

const OTP_ENDPOINT = '/private/verify_email_otp'
const OTHER_USER_EMAIL = 'test2@capgo.app'

async function generateEmailOtp(email: string): Promise<{ token: string, tokenHash: string }> {
  const { data, error } = await getSupabaseClient().auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (error || !data?.properties?.email_otp || !data?.properties?.hashed_token) {
    throw error ?? new Error('Failed to generate email OTP')
  }
  return {
    token: data.properties.email_otp,
    tokenHash: data.properties.hashed_token,
  }
}

describe('[POST] /private/verify_email_otp', () => {
  let authHeaders: Record<string, string>

  beforeAll(async () => {
    authHeaders = await getAuthHeaders()
  })

  it('verifies OTP and records verification timestamp', async () => {
    const { tokenHash } = await generateEmailOtp(USER_EMAIL)

    const response = await fetch(getEndpointUrl(OTP_ENDPOINT), {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ token_hash: tokenHash, type: 'magiclink' }),
    })

    expect(response.status).toBe(200)
    const data = await response.json() as { verified_at?: string }
    expect(data.verified_at).toBeTruthy()

    const { data: securityRow, error } = await getSupabaseClient()
      .from('user_security')
      .select('email_otp_verified_at')
      .eq('user_id', USER_ID)
      .single()

    // Use the email match to locate the user record (auth headers already tied to USER_EMAIL)
    if (error) {
      throw error
    }
    expect(securityRow?.email_otp_verified_at).toBeTruthy()
  })

  it.concurrent('returns 400 for invalid token format', async () => {
    const response = await fetch(getEndpointUrl(OTP_ENDPOINT), {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ token: '123', type: 'magiclink' }),
    })

    expect(response.status).toBe(400)
    const data = await response.json() as { error?: string }
    expect(data.error).toBe('invalid_body')
  })

  it.concurrent('returns 401 when authorization header is missing', async () => {
    const response = await fetch(getEndpointUrl(OTP_ENDPOINT), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: '123456' }),
    })

    expect(response.status).toBe(401)
    const data = await response.json() as { error?: string }
    expect(data.error).toBe('no_jwt_apikey_or_subkey')
  })

  it.concurrent('returns 401 for invalid or expired OTP', async () => {
    const response = await fetch(getEndpointUrl(OTP_ENDPOINT), {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ token: '000000', type: 'magiclink' }),
    })

    expect(response.status).toBe(401)
    const data = await response.json() as { error?: string }
    expect(data.error).toBe('invalid_otp')
  })

  it.concurrent('returns 403 when OTP user mismatches JWT user', async () => {
    const { tokenHash } = await generateEmailOtp(OTHER_USER_EMAIL)

    const response = await fetch(getEndpointUrl(OTP_ENDPOINT), {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ token_hash: tokenHash, type: 'magiclink' }),
    })

    expect(response.status).toBe(403)
    const data = await response.json() as { error?: string }
    expect(data.error).toBe('otp_user_mismatch')
  })
})
