import type { PoolClient } from 'pg'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { validatePrincipalAccess, validateRoleScope } from '../supabase/functions/_backend/private/role_bindings.ts'
import { getDrizzleClient } from '../supabase/functions/_backend/utils/pg.ts'
import { POSTGRES_URL, USER_ID, USER_ID_2 } from './test-utils.ts'

describe('private role bindings helpers', () => {
  let pool: Pool
  let client: PoolClient

  const query = (text: string, params?: Array<string | boolean | number | null>) => {
    return client.query(text, params)
  }

  async function createFixture(targetUserRight: 'admin' | 'invite_read') {
    const id = randomUUID()
    const orgId = randomUUID()
    const managementEmail = `role-binding-${id}@capgo.app`

    await query(`
      INSERT INTO public.orgs (id, name, management_email, created_by, use_new_rbac)
      VALUES ($1::uuid, $2, $3, $4::uuid, true)
    `, [orgId, `Role Binding Test Org ${id}`, managementEmail, USER_ID])

    await query(`
      INSERT INTO public.org_users (org_id, user_id, user_right)
      VALUES ($1::uuid, $2::uuid, $3::public.user_min_right)
    `, [orgId, USER_ID_2, targetUserRight])

    return { orgId }
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: POSTGRES_URL })
  })

  beforeEach(async () => {
    client = await pool.connect()
    await client.query('BEGIN')
  })

  afterEach(async () => {
    if (!client)
      return
    try {
      await client.query('ROLLBACK')
    }
    finally {
      client.release()
    }
  })

  afterAll(async () => {
    await pool.end()
  })

  it('accepts active org members as assignment targets', async () => {
    const fixture = await createFixture('admin')
    const drizzle = getDrizzleClient(client as any)

    const result = await validatePrincipalAccess(drizzle, 'user', USER_ID_2, fixture.orgId)

    expect(result).toEqual({ ok: true, data: null })
  })

  it('rejects pending invitees as assignment targets', async () => {
    const fixture = await createFixture('invite_read')
    const drizzle = getDrizzleClient(client as any)

    const result = await validatePrincipalAccess(drizzle, 'user', USER_ID_2, fixture.orgId)

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: 'User has not accepted the org invitation yet',
    })
  })

  it('requires the role family to match the requested binding scope', () => {
    expect(validateRoleScope('app', 'app')).toEqual({ ok: true, data: null })
    expect(validateRoleScope('org', 'app')).toEqual({
      ok: false,
      status: 400,
      error: 'Role scope_type does not match binding scope',
    })
  })
})
