import type { PoolClient } from 'pg'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { POSTGRES_URL } from './test-utils.ts'

describe('is_platform_admin SQL function', () => {
  let pool: Pool

  beforeAll(() => {
    pool = new Pool({ connectionString: POSTGRES_URL })
  })

  const withTransaction = async <T>(
    callback: (query: (text: string, values?: Array<unknown>) => Promise<{
      rows: Array<{ is_platform_admin: boolean }>
    }>) => Promise<T>,
  ): Promise<T> => {
    let client: PoolClient | null = await pool.connect()
    try {
      await client.query('BEGIN')
      return await callback((text, values = []) => client!.query(text, values))
    }
    finally {
      try {
        await client?.query('ROLLBACK')
      }
      catch {
        // Ignore rollback failures to keep tests deterministic.
      }
      finally {
        client?.release()
        client = null
      }
    }
  }

  afterAll(async () => {
    await pool.end()
  })

  it.concurrent('returns platform admin based on admin_users', async () => {
    const legacyAdmin = 'c591b04e-cf29-4945-b9a0-776d0672061a'
    const nonAdmin = randomUUID()

    await withTransaction(async (query) => {
      const legacy = await query(
        'SELECT public.is_platform_admin($1::uuid) as is_platform_admin',
        [legacyAdmin],
      )

      const regular = await query(
        'SELECT public.is_platform_admin($1::uuid) as is_platform_admin',
        [nonAdmin],
      )

      expect(legacy.rows[0].is_platform_admin).toBe(true)
      expect(regular.rows[0].is_platform_admin).toBe(false)
    })
  })

  it.concurrent('keeps is_platform_admin tied to admin_users (no RBAC role check)', async () => {
    const rbacUserId = randomUUID()
    const normalUserId = randomUUID()

    await withTransaction(async (query) => {
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
        'SELECT public.is_platform_admin($1::uuid) as is_platform_admin',
        [rbacUserId],
      )

      const regularUserResults = await query(
        'SELECT public.is_platform_admin($1::uuid) as is_platform_admin',
        [normalUserId],
      )

      expect(rbacUserResults.rows[0].is_platform_admin).toBe(false)
      expect(regularUserResults.rows[0].is_platform_admin).toBe(false)
    })
  })
})
