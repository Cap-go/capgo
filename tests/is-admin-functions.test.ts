import type { PoolClient } from 'pg'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { POSTGRES_URL } from './test-utils.ts'

describe('is_admin / is_platform_admin SQL functions', () => {
  let pool: Pool
  let client: PoolClient

  const query = (text: string, values: Array<string | boolean> = []) => {
    return client.query(text, values)
  }

  beforeAll(() => {
    pool = new Pool({ connectionString: POSTGRES_URL })
  })

  beforeEach(async () => {
    client = await pool.connect()
    await query('BEGIN')
  })

  afterEach(async () => {
    if (!client)
      return

    try {
      await query('ROLLBACK')
    }
    catch {
      // Ignore rollback failures to keep test teardown resilient.
    }
    finally {
      client.release()
      client = null as any
    }
  })

  afterAll(async () => {
    await pool.end()
  }, 30000)

  it('is_platform_admin remains vault-based while is_admin is RBAC-only', async () => {
    const legacyAdmin = 'c591b04e-cf29-4945-b9a0-776d0672061a'
    const nonAdmin = randomUUID()

    await query(`
      UPDATE public.rbac_settings
      SET use_new_rbac = false
      WHERE id = 1;
    `)

    const legacy = await query(
      'SELECT public.is_admin($1::uuid) as is_admin, public.is_platform_admin($1::uuid) as is_platform_admin',
      [legacyAdmin],
    )

    const regular = await query(
      'SELECT public.is_admin($1::uuid) as is_admin, public.is_platform_admin($1::uuid) as is_platform_admin',
      [nonAdmin],
    )

    expect(legacy.rows[0].is_admin).toBe(false)
    expect(legacy.rows[0].is_platform_admin).toBe(true)
    expect(regular.rows[0].is_admin).toBe(false)
    expect(regular.rows[0].is_platform_admin).toBe(false)
  })

  it('keeps is_platform_admin tied to admin_users (no RBAC role check)', async () => {
    const rbacUserId = randomUUID()
    const normalUserId = randomUUID()

    await query(`
      UPDATE public.rbac_settings
      SET use_new_rbac = true
      WHERE id = 1;
    `)

    await query(`
      INSERT INTO public.role_bindings (
        principal_type,
        principal_id,
        role_id,
        scope_type,
        granted_by
      ) VALUES (
        public.rbac_principal_user(),
        $1::uuid,
        (SELECT id FROM public.roles WHERE name = public.rbac_role_platform_super_admin()),
        public.rbac_scope_platform(),
        $1::uuid
      );
    `, [rbacUserId])

    const rbacUserResults = await query(
      'SELECT public.is_admin($1::uuid) as is_admin, public.is_platform_admin($1::uuid) as is_platform_admin',
      [rbacUserId],
    )

    const regularUserResults = await query(
      'SELECT public.is_admin($1::uuid) as is_admin, public.is_platform_admin($1::uuid) as is_platform_admin',
      [normalUserId],
    )

    expect(rbacUserResults.rows[0].is_admin).toBe(true)
    expect(rbacUserResults.rows[0].is_platform_admin).toBe(false)
    expect(regularUserResults.rows[0].is_admin).toBe(false)
    expect(regularUserResults.rows[0].is_platform_admin).toBe(false)
  })
})
