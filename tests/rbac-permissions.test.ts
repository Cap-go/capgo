import type { PoolClient } from 'pg'
/**
 * RBAC Permission System Tests
 *
 * Tests the checkPermission function with both legacy and RBAC modes
 * to ensure feature flag routing works correctly.
 */
import { Pool } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { APIKEY_TEST_ALL, ORG_ID, POSTGRES_URL, USER_ID } from './test-utils'

// Test constants
const TEST_APP_ID = 'com.demo.app'

describe('rBAC Permission System', () => {
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
    describe('legacy mode (use_new_rbac = false)', () => {
      beforeEach(async () => {
        await query(`SELECT set_config('capgo.rbac_enabled', 'false', true)`)
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

      describe('rBAC mode (use_new_rbac = true)', () => {
      beforeEach(async () => {
        // Enable RBAC globally for tests
        await query(`SELECT set_config('capgo.rbac_enabled', 'true', true)`)
      })

      afterEach(async () => {
        // Reset to legacy mode
        await query(`SELECT set_config('capgo.rbac_enabled', 'false', true)`)
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

      it('should keep org-scoped app permissions for a new app id before the app row exists', async () => {
        const newAppId = 'com.demo.precreate'
        const result = await query(`
          SELECT
            NOT EXISTS (
              SELECT 1
              FROM public.apps
              WHERE app_id = $3
            ) AS app_missing,
            public.rbac_has_permission(
              public.rbac_principal_user(),
              $1::uuid,
              'app.update_settings',
              $2::uuid,
              $3,
              NULL::bigint
            ) AS app_permission_allowed,
            public.check_min_rights(
              'write'::public.user_min_right,
              $1::uuid,
              $2::uuid,
              $3,
              NULL::bigint
            ) AS write_allowed
        `, [USER_ID, ORG_ID, newAppId])

        expect(result.rows[0].app_missing).toBe(true)
        expect(result.rows[0].app_permission_allowed).toBe(true)
        expect(result.rows[0].write_allowed).toBe(true)
      })

      it('should derive coarse app permission from RBAC when legacy org_users.user_right is null', async () => {
        await query(`
          UPDATE public.org_users
          SET user_right = NULL
          WHERE user_id = $1::uuid
            AND org_id = $2::uuid
        `, [USER_ID, ORG_ID])

        const result = await query(`
          SELECT public.get_org_perm_for_apikey($1, $2) AS perm
        `, [APIKEY_TEST_ALL, TEST_APP_ID])

        expect(result.rows[0].perm).toBe('perm_owner')
      })
    })

    describe('feature flag routing', () => {
      it('should use legacy for orgs without RBAC flag', async () => {
        await query(`UPDATE public.orgs SET use_new_rbac = false WHERE id = $1`, [ORG_ID])
        await query(`SELECT set_config('capgo.rbac_enabled', 'false', true)`)

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
        await query(`SELECT set_config('capgo.rbac_enabled', 'true', true)`)

        const result = await query(`
          SELECT public.rbac_is_enabled_for_org($1::uuid) as enabled
        `, [ORG_ID])

        await query(`SELECT set_config('capgo.rbac_enabled', 'false', true)`)

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
        await query(`SELECT set_config('capgo.rbac_enabled', 'false', true)`)
        await query(`UPDATE public.orgs SET use_new_rbac = false WHERE id = $1`, [ORG_ID])

        const result = await query(`
          SELECT public.rbac_is_enabled_for_org($1::uuid) as enabled
        `, [ORG_ID])

        expect(result.rows[0].enabled).toBe(false)
      })
    })
  })
})
