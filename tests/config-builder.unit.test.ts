import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../supabase/functions/_backend/private/config_builder.ts'

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

describe('get /private/config/builder', () => {
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

  it('returns enabled:false with no other fields when neither required env var is set', async () => {
    const response = await get({})

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ enabled: false })
  })

  it('returns enabled:false when only GOOGLE_OAUTH_CLIENT_ID is set', async () => {
    const response = await get({
      GOOGLE_OAUTH_CLIENT_ID: '1234.apps.googleusercontent.com',
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ enabled: false })
  })

  it('returns enabled:false when only GOOGLE_OAUTH_CLIENT_SECRET is set', async () => {
    const response = await get({
      GOOGLE_OAUTH_CLIENT_SECRET: 'GOCSPX-abc',
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ enabled: false })
  })

  it('treats whitespace-only env vars the same as missing (returns enabled:false)', async () => {
    const response = await get({
      GOOGLE_OAUTH_CLIENT_ID: '   ',
      GOOGLE_OAUTH_CLIENT_SECRET: '\t\n',
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ enabled: false })
  })

  it('returns a custom single scope when GOOGLE_OAUTH_SCOPES is set to one value', async () => {
    const response = await get({
      GOOGLE_OAUTH_CLIENT_ID: 'cid',
      GOOGLE_OAUTH_CLIENT_SECRET: 'csec',
      GOOGLE_OAUTH_SCOPES: 'https://www.googleapis.com/auth/cloud-platform',
    })

    expect(response.status).toBe(200)
    const body = await response.json() as { scopes: string[] }
    expect(body.scopes).toEqual(['https://www.googleapis.com/auth/cloud-platform'])
  })

  it('parses comma-separated scopes and trims whitespace around each entry', async () => {
    const response = await get({
      GOOGLE_OAUTH_CLIENT_ID: 'cid',
      GOOGLE_OAUTH_CLIENT_SECRET: 'csec',
      GOOGLE_OAUTH_SCOPES: ' https://www.googleapis.com/auth/androidpublisher , https://www.googleapis.com/auth/cloud-platform ',
    })

    expect(response.status).toBe(200)
    const body = await response.json() as { scopes: string[] }
    expect(body.scopes).toEqual([
      'https://www.googleapis.com/auth/androidpublisher',
      'https://www.googleapis.com/auth/cloud-platform',
    ])
  })

  it('falls back to the default scope when GOOGLE_OAUTH_SCOPES is set but yields zero non-empty entries', async () => {
    const response = await get({
      GOOGLE_OAUTH_CLIENT_ID: 'cid',
      GOOGLE_OAUTH_CLIENT_SECRET: 'csec',
      GOOGLE_OAUTH_SCOPES: ' , , ',
    })

    expect(response.status).toBe(200)
    const body = await response.json() as { scopes: string[] }
    expect(body.scopes).toEqual(['https://www.googleapis.com/auth/androidpublisher'])
  })
})
