import { createClient } from '@supabase/supabase-js'
import { base64url } from 'jose'
import { afterAll, describe, expect, it } from 'vitest'
import { SUPABASE_ANON_KEY, SUPABASE_BASE_URL } from './test-utils'

const options = { auth: { persistSession: false } }
const admin = createClient(SUPABASE_BASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '', options)
const anon = createClient(SUPABASE_BASE_URL, SUPABASE_ANON_KEY, options)
const state = base64url.encode(crypto.getRandomValues(new Uint8Array(32)))
const otherState = base64url.encode(crypto.getRandomValues(new Uint8Array(32)))
afterAll(async () => {
  await admin.from('google_auth_attempts').delete().in('state_hash', [state, otherState])
  await admin.from('google_auth_token_uses').delete().eq('token_hash', state)
})
describe('google auth server storage', () => {
  it('enforces expiring, unique, bounded attempts and completion bindings', async () => {
    const attempt = { state_hash: state, nonce: 'n'.repeat(43), redirect_uri: 'https://console.example.com/login', code_challenge: 'c'.repeat(43), client_state: 's'.repeat(43), provider_verifier: 'v'.repeat(43) }
    const inserted = await admin.from('google_auth_attempts').insert(attempt).select('expires_at').single()
    expect(inserted.error).toBeNull()
    expect(Date.parse(inserted.data!.expires_at)).toBeGreaterThan(Date.now())
    expect((await admin.from('google_auth_attempts').insert(attempt)).error?.code).toBe('23505')
    expect((await admin.from('google_auth_attempts').insert({ ...attempt, state_hash: otherState, nonce: 'short' })).error?.code).toBe('23514')
    expect((await admin.from('google_auth_attempts').insert({ ...attempt, state_hash: otherState, registration_metadata: [] })).error?.code).toBe('23514')
    expect((await admin.from('google_auth_attempts').update({ exchange_hash: state, callback_claimed: true }).eq('state_hash', state)).error).toBeNull()
    expect((await admin.from('google_auth_attempts').insert({ ...attempt, state_hash: otherState, exchange_hash: state })).error?.code).toBe('23505')
    expect((await admin.from('google_auth_token_uses').insert({ token_hash: state }).select('expires_at').single()).error).toBeNull()
    expect((await admin.from('google_auth_token_uses').insert({ token_hash: state })).error?.code).toBe('23505')
  })
  it('denies anonymous reads and writes on both credential tables', async () => {
    for (const table of ['google_auth_attempts', 'google_auth_token_uses']) {
      expect((await anon.from(table).select('*')).error?.code).toBe('42501')
      expect((await anon.from(table).insert(table.endsWith('attempts')
        ? { state_hash: state, nonce: 'n'.repeat(43), redirect_uri: 'https://console.example.com/login', code_challenge: 'c'.repeat(43), client_state: 's'.repeat(43), provider_verifier: 'v'.repeat(43) }
        : { token_hash: state })).error?.code).toBe('42501')
      expect((await anon.from(table).delete().eq(table.endsWith('attempts') ? 'state_hash' : 'token_hash', state)).error?.code).toBe('42501')
    }
  })
})
