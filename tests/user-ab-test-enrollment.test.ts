import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getAuthHeadersForCredentials, getSupabaseClient, SUPABASE_ANON_KEY, SUPABASE_BASE_URL } from './test-utils.ts'

const email = `ab-enrollment-${randomUUID()}@example.com`
const password = `AbEnrollment!${randomUUID()}`
const createdAt = '2026-10-18T00:00:00+00:00'
const managed = {
  abtests: { new_emails_v2: { branch: 'A', assigned_at: createdAt } },
  abtests_enrolled: ['new_emails_v2'],
  abtests_bento_sync: { pending: false },
}
let userId: string
let headers: Record<string, string>

beforeAll(async () => {
  const service = getSupabaseClient()
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (error)
    throw error
  userId = data.user.id
  const { error: profileError } = await service.from('users').upsert({
    id: userId,
    email,
    created_at: createdAt,
    onboarding: { ...managed, intent: 'ota' },
  })
  if (profileError)
    throw profileError
  headers = await getAuthHeadersForCredentials(email, password)
})

afterAll(async () => {
  if (!userId)
    return
  await getSupabaseClient().from('users').delete().eq('id', userId)
  await getSupabaseClient().auth.admin.deleteUser(userId)
})

describe('user A/B enrollment through PostgREST', () => {
  it('allows intent edits while preserving backend assignments, enrollment and creation time', async () => {
    for (const onboarding of [
      { intent: 'builder', abtests: {}, abtests_enrolled: ['forged'], abtests_bento_sync: { pending: true } },
      { intent: 'exploring' },
    ]) {
      const response = await fetch(`${SUPABASE_BASE_URL}/rest/v1/users?id=eq.${userId}&select=onboarding,created_at`, {
        method: 'PATCH',
        headers: { ...headers, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify({ onboarding, created_at: '2030-01-01T00:00:00Z' }),
      })
      expect(response.status, await response.clone().text()).toBe(200)
      const rows = await response.json() as { onboarding: unknown, created_at: string }[]
      expect(rows).toHaveLength(1)
      expect(rows[0].onboarding).toEqual({ ...managed, intent: onboarding.intent })
      expect(new Date(rows[0].created_at).toISOString()).toBe(new Date(createdAt).toISOString())
    }
    const { data, error } = await getSupabaseClient().from('users').update({
      onboarding: { ...managed, abtests_enrolled: ['backend-edit'], intent: 'ota' },
    }).eq('id', userId).select('onboarding').single()
    expect(error).toBeNull()
    expect(data?.onboarding).toEqual({ ...managed, abtests_enrolled: ['backend-edit'], intent: 'ota' })
  })
})
