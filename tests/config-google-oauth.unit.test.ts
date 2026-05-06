import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../supabase/functions/_backend/private/config_google_oauth.ts'

beforeEach(() => {
  // Establish a clean baseline so tests don't leak state from each other or
  // from an actual GOOGLE_OAUTH_* set in the dev environment.
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', '')
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', '')
  vi.stubEnv('GOOGLE_OAUTH_SCOPES', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function get(env: Record<string, string>) {
  for (const [k, v] of Object.entries(env))
    vi.stubEnv(k, v)
  return app.request('http://local/', { method: 'GET' })
}

describe('GET /private/config/google_oauth', () => {
  it('returns enabled:true with clientId, clientSecret, and default scopes when both required env vars are set', async () => {
    const response = await get({
      GOOGLE_OAUTH_CLIENT_ID: '1234.apps.googleusercontent.com',
      GOOGLE_OAUTH_CLIENT_SECRET: 'GOCSPX-abc',
    })

    expect(response.status).toBe(200)
    const body = await response.json() as Record<string, unknown>
    expect(body).toEqual({
      enabled: true,
      clientId: '1234.apps.googleusercontent.com',
      clientSecret: 'GOCSPX-abc',
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    })
  })
})
