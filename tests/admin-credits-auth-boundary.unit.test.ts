import { describe, expect, it } from 'vitest'
import { app as adminCreditsApp } from '../supabase/functions/_backend/private/admin_credits.ts'

describe('admin credits auth boundary', () => {
  it('does not allow platform-admin JWTs to reach credit grants', async () => {
    const response = await adminCreditsApp.request(new Request('http://localhost/grant', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer test.jwt.value',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        org_id: '550e8400-e29b-41d4-a716-446655440000',
        amount: 25,
      }),
    }))

    expect(response.status).toBe(400)
    await expect(response.text()).resolves.toContain('Cannot find authorization')
  })
})
