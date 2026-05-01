import { describe, expect, it } from 'vitest'
import { app as groupsApp } from '../supabase/functions/_backend/private/groups.ts'
import { app as roleBindingsApp } from '../supabase/functions/_backend/private/role_bindings.ts'
import { app as rolesApp } from '../supabase/functions/_backend/private/roles.ts'

describe('private RBAC auth ordering', () => {
  it.concurrent('returns 401 before validating invalid group params', async () => {
    const response = await groupsApp.request('http://localhost/not-a-uuid')
    expect(response.status).toBe(401)
  })

  it.concurrent('returns 401 before validating invalid group-member bodies', async () => {
    const response = await groupsApp.request(new Request('http://localhost/550e8400-e29b-41d4-a716-446655440000/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: 'not-a-uuid' }),
    }))

    expect(response.status).toBe(401)
  })

  it.concurrent('returns 401 before validating invalid role binding params', async () => {
    const response = await roleBindingsApp.request('http://localhost/not-a-uuid')
    expect(response.status).toBe(401)
  })

  it.concurrent('returns 401 before validating invalid role binding bodies', async () => {
    const response = await roleBindingsApp.request(new Request('http://localhost/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        principal_type: 'device',
        principal_id: 'not-a-uuid',
        role_name: '',
        scope_type: 'invalid',
        org_id: 'not-a-uuid',
      }),
    }))

    expect(response.status).toBe(401)
  })

  it.concurrent('returns 401 before validating invalid role scope params', async () => {
    const response = await rolesApp.request('http://localhost/not-a-scope')
    expect(response.status).toBe(401)
  })
})
