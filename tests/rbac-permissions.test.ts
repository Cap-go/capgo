/**
 * RBAC Permission System Tests
 *
 * Tests the checkPermission function with both legacy and RBAC modes
 * to ensure feature flag routing works correctly.
 */
import { Pool, type PoolClient } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ORG_ID, POSTGRES_URL, USER_ID } from './test-utils'

// Test constants
const TEST_APP_ID = 'com.demo.app'

describe('RBAC Permission System', () => {
  let pool: Pool
  let client: PoolClient

  const query = (text: string, params?: Array<string | number | null>) => {
    return client.query(text, params)
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

  describe('rbac_check_permission_direct SQL function', () => {
    describe('Legacy mode (use_new_rbac = false)', () => {
      beforeEach(async () => {
        await query(`UPDATE public.rbac_settings SET use_new_rbac = false WHERE id = 1`)
        await query(`UPDATE public.orgs SET use_new_rbac = false WHERE id = $1`, [ORG_ID])
      })

      it('should allow read permission for user with read right', async () => {
        const result = await query(`
          SELECT public.rbac_check_permission_direct(
            'app.read',
            $1::uuid,
            $2::uuid,
            $3,
            NULL::bigint,
            NULL
          ) as allowed
        `, [USER_ID, ORG_ID, TEST_APP_ID])

        expect(result.rows[0].allowed).toBe(true)
      })

      it('should allow upload permission for user with upload right', async () => {
        const result = await query(`
          SELECT public.rbac_check_permission_direct(
            'app.upload_bundle',
            $1::uuid,
            $2::uuid,
            $3,
            NULL::bigint,
            NULL
          ) as allowed
        `, [USER_ID, ORG_ID, TEST_APP_ID])

        expect(result.rows[0].allowed).toBe(true)
      })

      it('should deny permission for non-existent user', async () => {
        const fakeUserId = '00000000-0000-0000-0000-000000000000'
        const result = await query(`
          SELECT public.rbac_check_permission_direct(
            'app.read',
            $1::uuid,
            $2::uuid,
            $3,
            NULL::bigint,
            NULL
          ) as allowed
        `, [fakeUserId, ORG_ID, TEST_APP_ID])

        expect(result.rows[0].allowed).toBe(false)
      })

      it('should deny unknown permission', async () => {
        const result = await query(`
          SELECT public.rbac_check_permission_direct(
            'unknown.permission',
            $1::uuid,
            $2::uuid,
            $3,
            NULL::bigint,
            NULL
          ) as allowed
        `, [USER_ID, ORG_ID, TEST_APP_ID])

        expect(result.rows[0].allowed).toBe(false)
      })
    })

    describe('RBAC mode (use_new_rbac = true)', () => {
      beforeEach(async () => {
        // Enable RBAC globally for tests
        await query(`
          UPDATE public.rbac_settings SET use_new_rbac = true WHERE id = 1;
        `)
      })

      afterEach(async () => {
        // Reset to legacy mode
        await query(`
          UPDATE public.rbac_settings SET use_new_rbac = false WHERE id = 1;
        `)
      })

      it('should check permissions via RBAC system when enabled', async () => {
        // The user should have permissions via role_bindings
        const result = await query(`
          SELECT public.rbac_check_permission_direct(
            'app.read',
            $1::uuid,
            $2::uuid,
            $3,
            NULL::bigint,
            NULL
          ) as allowed
        `, [USER_ID, ORG_ID, TEST_APP_ID])

        // Should be allowed because user has role_bindings for this org
        expect(result.rows[0].allowed).toBe(true)
      })
    })

    describe('Feature flag routing', () => {
      it('should use legacy for orgs without RBAC flag', async () => {
        await query(`UPDATE public.orgs SET use_new_rbac = false WHERE id = $1`, [ORG_ID])
        await query(`UPDATE public.rbac_settings SET use_new_rbac = false WHERE id = 1`)

        const result = await query(`
          SELECT public.rbac_check_permission_direct(
            'app.read',
            $1::uuid,
            $2::uuid,
            $3,
            NULL::bigint,
            NULL
          ) as allowed
        `, [USER_ID, ORG_ID, TEST_APP_ID])

        expect(result.rows[0].allowed).toBe(true)
      })

      it('should use RBAC for orgs with RBAC flag enabled', async () => {
        // Enable RBAC for the org
        await query(`
          UPDATE public.orgs SET use_new_rbac = true WHERE id = $1;
        `, [ORG_ID])

        const result = await query(`
          SELECT public.rbac_check_permission_direct(
            'app.read',
            $1::uuid,
            $2::uuid,
            $3,
            NULL::bigint,
            NULL
          ) as allowed
        `, [USER_ID, ORG_ID, TEST_APP_ID])

        // Reset
        await query(`
          UPDATE public.orgs SET use_new_rbac = false WHERE id = $1;
        `, [ORG_ID])

        expect(result.rows[0].allowed).toBe(true)
      })
    })

    describe('rbac_legacy_right_for_permission mapping', () => {
      const permissionMappings = [
        // Read permissions
        { permission: 'org.read', expectedRight: 'read' },
        { permission: 'app.read', expectedRight: 'read' },
        { permission: 'channel.read', expectedRight: 'read' },
        // Upload permissions
        { permission: 'app.upload_bundle', expectedRight: 'upload' },
        // Write permissions
        { permission: 'app.update_settings', expectedRight: 'write' },
        { permission: 'channel.promote_bundle', expectedRight: 'write' },
        // Admin permissions
        { permission: 'org.invite_user', expectedRight: 'admin' },
        { permission: 'app.delete', expectedRight: 'admin' },
        // Super admin permissions
        { permission: 'org.update_billing', expectedRight: 'super_admin' },
      ]

      for (const { permission, expectedRight } of permissionMappings) {
        it(`should map ${permission} to ${expectedRight}`, async () => {
          const result = await query(`
            SELECT public.rbac_legacy_right_for_permission($1) as legacy_right
          `, [permission])

          expect(result.rows[0].legacy_right).toBe(expectedRight)
        })
      }

      it('should return NULL for unknown permission', async () => {
        const result = await query(`
          SELECT public.rbac_legacy_right_for_permission('unknown.permission') as legacy_right
        `)

        expect(result.rows[0].legacy_right).toBeNull()
      })
    })

    describe('rbac_is_enabled_for_org', () => {
      it('should return true when global flag is enabled', async () => {
        await query(`UPDATE public.rbac_settings SET use_new_rbac = true WHERE id = 1`)

        const result = await query(`
          SELECT public.rbac_is_enabled_for_org($1::uuid) as enabled
        `, [ORG_ID])

        await query(`UPDATE public.rbac_settings SET use_new_rbac = false WHERE id = 1`)

        expect(result.rows[0].enabled).toBe(true)
      })

      it('should return true when org flag is enabled', async () => {
        await query(`UPDATE public.orgs SET use_new_rbac = true WHERE id = $1`, [ORG_ID])

        const result = await query(`
          SELECT public.rbac_is_enabled_for_org($1::uuid) as enabled
        `, [ORG_ID])

        await query(`UPDATE public.orgs SET use_new_rbac = false WHERE id = $1`, [ORG_ID])

        expect(result.rows[0].enabled).toBe(true)
      })

      it('should return false when both flags are disabled', async () => {
        await query(`UPDATE public.rbac_settings SET use_new_rbac = false WHERE id = 1`)
        await query(`UPDATE public.orgs SET use_new_rbac = false WHERE id = $1`, [ORG_ID])

        const result = await query(`
          SELECT public.rbac_is_enabled_for_org($1::uuid) as enabled
        `, [ORG_ID])

        expect(result.rows[0].enabled).toBe(false)
      })
    })
  })
})
