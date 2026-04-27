import type { PoolClient } from 'pg'
import { randomUUID } from 'node:crypto'
/**
 * RBAC Permission System Tests
 *
 * Tests the checkPermission function with both legacy and RBAC modes
 * to ensure feature flag routing works correctly.
 */
import { Pool } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { APIKEY_TEST_ALL, ORG_ID, POSTGRES_URL, USER_ID, USER_ID_2 } from './test-utils'

// Test constants
const TEST_APP_ID = 'com.demo.app'

describe('rbac permission system', () => {
  let pool: Pool
  let client: PoolClient

  const query = (text: string, params?: Array<string | number | null>) => {
    return client.query(text, params)
  }

  const withAuthClaim = async (userId: string) => {
    await query(`SELECT set_config($1, $2, true)`, [
      'request.jwt.claim.sub',
      userId,
    ])
    await query(`SELECT set_config($1, $2, true)`, [
      'request.jwt.claims',
      JSON.stringify({
        sub: userId,
        role: 'authenticated',
        aud: 'authenticated',
      }),
    ])
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

      it('should deny org permissions outside limited_to_orgs for scoped api keys', async () => {
        const allowedOrgId = randomUUID()
        const targetOrgId = randomUUID()
        const scopedKey = `legacy-scope-${randomUUID()}`

        await query(`
          INSERT INTO public.orgs (id, name, management_email, created_by, use_new_rbac)
          VALUES
            ($1::uuid, $3, $5, $6::uuid, false),
            ($2::uuid, $4, $5, $6::uuid, false)
        `, [allowedOrgId, targetOrgId, `Legacy Allowed ${allowedOrgId}`, `Legacy Target ${targetOrgId}`, `legacy-scope-${randomUUID()}@capgo.app`, USER_ID])

        await query(`
          INSERT INTO public.org_users (org_id, user_id, user_right)
          VALUES
            ($1::uuid, $3::uuid, 'super_admin'),
            ($2::uuid, $3::uuid, 'super_admin')
        `, [allowedOrgId, targetOrgId, USER_ID])

        await query(`
          INSERT INTO public.apikeys (user_id, key, key_hash, mode, name, limited_to_orgs, limited_to_apps)
          VALUES ($1::uuid, $2, NULL, 'write', $3, ARRAY[$4::uuid], ARRAY[]::text[])
        `, [USER_ID, scopedKey, `Legacy scoped ${allowedOrgId}`, allowedOrgId])

        const deniedResult = await query(`
          SELECT public.rbac_check_permission_direct(
            'org.delete',
            $1::uuid,
            $2::uuid,
            NULL::text,
            NULL::bigint,
            $3
          ) AS allowed
        `, [USER_ID, targetOrgId, scopedKey])

        const allowedResult = await query(`
          SELECT public.rbac_check_permission_direct(
            'org.delete',
            $1::uuid,
            $2::uuid,
            NULL::text,
            NULL::bigint,
            $3
          ) AS allowed
        `, [USER_ID, allowedOrgId, scopedKey])

        expect(deniedResult.rows[0].allowed).toBe(false)
        expect(allowedResult.rows[0].allowed).toBe(true)
      })
    })

    describe('rbac mode (use_new_rbac = true)', () => {
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

      it('should ignore forged app-scoped bindings whose org_id does not match the target app owner', async () => {
        const victimOrgId = randomUUID()
        const victimAppUuid = randomUUID()
        const victimAppId = `com.rbac.forged.${randomUUID()}`

        await query(`
          INSERT INTO public.orgs (
            id,
            created_by,
            name,
            management_email,
            use_new_rbac
          ) VALUES ($1::uuid, $2::uuid, $3, $4, true)
        `, [
          victimOrgId,
          USER_ID_2,
          `RBAC Victim Org ${victimOrgId}`,
          `rbac-victim-${victimOrgId}@capgo.app`,
        ])

        await query(`
          INSERT INTO public.apps (
            id,
            app_id,
            icon_url,
            owner_org,
            name
          ) VALUES ($1::uuid, $2, $3, $4::uuid, $5)
        `, [
          victimAppUuid,
          victimAppId,
          'rbac-forged-binding-icon',
          victimOrgId,
          `RBAC Victim App ${victimAppId}`,
        ])

        const roleResult = await query(`
          SELECT id
          FROM public.roles
          WHERE name = 'app_admin'
          LIMIT 1
        `)
        const roleId = roleResult.rows[0]?.id
        expect(roleId).toBeTruthy()

        await query(`
          INSERT INTO public.role_bindings (
            principal_type,
            principal_id,
            role_id,
            scope_type,
            org_id,
            app_id,
            granted_by,
            is_direct
          ) VALUES (
            public.rbac_principal_user(),
            $1::uuid,
            $2::uuid,
            public.rbac_scope_app(),
            $3::uuid,
            $4::uuid,
            $1::uuid,
            true
          )
        `, [
          USER_ID,
          roleId,
          ORG_ID,
          victimAppUuid,
        ])

        const result = await query(`
          SELECT public.rbac_has_permission(
            public.rbac_principal_user(),
            $1::uuid,
            'app.update_settings',
            $2::uuid,
            $3,
            NULL::bigint
          ) AS allowed
        `, [
          USER_ID,
          ORG_ID,
          victimAppId,
        ])

        expect(result.rows[0].allowed).toBe(false)
      })

      it('should ignore forged channel-scoped bindings whose org_id and app_id do not match the target channel owner', async () => {
        const victimOrgId = randomUUID()
        const victimAppUuid = randomUUID()
        const victimAppId = `com.rbac.channel.${randomUUID()}`
        const victimVersionName = `rbac-channel-version-${randomUUID().slice(0, 8)}`
        const victimChannelName = `rbac-channel-${randomUUID().slice(0, 8)}`

        const attackerAppResult = await query(`
          SELECT id
          FROM public.apps
          WHERE app_id = $1
          LIMIT 1
        `, [TEST_APP_ID])
        const attackerAppUuid = attackerAppResult.rows[0]?.id
        expect(attackerAppUuid).toBeTruthy()

        await query(`
          INSERT INTO public.orgs (
            id,
            created_by,
            name,
            management_email,
            use_new_rbac
          ) VALUES ($1::uuid, $2::uuid, $3, $4, true)
        `, [
          victimOrgId,
          USER_ID_2,
          `RBAC Channel Victim Org ${victimOrgId}`,
          `rbac-channel-victim-${victimOrgId}@capgo.app`,
        ])

        await query(`
          INSERT INTO public.apps (
            id,
            app_id,
            icon_url,
            owner_org,
            name
          ) VALUES ($1::uuid, $2, $3, $4::uuid, $5)
        `, [
          victimAppUuid,
          victimAppId,
          'rbac-forged-channel-icon',
          victimOrgId,
          `RBAC Channel Victim App ${victimAppId}`,
        ])

        const versionResult = await query(`
          INSERT INTO public.app_versions (
            app_id,
            name,
            owner_org,
            user_id,
            checksum,
            storage_provider,
            r2_path,
            deleted
          ) VALUES (
            $1,
            $2,
            $3::uuid,
            $4::uuid,
            $5,
            'r2',
            $6,
            false
          )
          RETURNING id
        `, [
          victimAppId,
          victimVersionName,
          victimOrgId,
          USER_ID_2,
          `checksum-${victimVersionName}`,
          `orgs/${victimOrgId}/apps/${victimAppId}/${victimVersionName}.zip`,
        ])
        const victimVersionId = versionResult.rows[0]?.id
        expect(victimVersionId).toBeTruthy()

        const channelResult = await query(`
          INSERT INTO public.channels (
            app_id,
            name,
            version,
            owner_org,
            created_by,
            public,
            allow_emulator
          ) VALUES (
            $1,
            $2,
            $3::bigint,
            $4::uuid,
            $5::uuid,
            false,
            false
          )
          RETURNING id, rbac_id
        `, [
          victimAppId,
          victimChannelName,
          victimVersionId,
          victimOrgId,
          USER_ID_2,
        ])
        const victimChannelId = channelResult.rows[0]?.id
        const victimChannelRbacId = channelResult.rows[0]?.rbac_id
        expect(victimChannelId).toBeTruthy()
        expect(victimChannelRbacId).toBeTruthy()

        const roleResult = await query(`
          SELECT id
          FROM public.roles
          WHERE name = public.rbac_role_channel_admin()
          LIMIT 1
        `)
        const roleId = roleResult.rows[0]?.id
        expect(roleId).toBeTruthy()

        await query(`
          INSERT INTO public.role_bindings (
            principal_type,
            principal_id,
            role_id,
            scope_type,
            org_id,
            app_id,
            channel_id,
            granted_by,
            is_direct
          ) VALUES (
            public.rbac_principal_user(),
            $1::uuid,
            $2::uuid,
            public.rbac_scope_channel(),
            $3::uuid,
            $4::uuid,
            $5::uuid,
            $1::uuid,
            true
          )
        `, [
          USER_ID,
          roleId,
          ORG_ID,
          attackerAppUuid,
          victimChannelRbacId,
        ])

        const result = await query(`
          SELECT public.rbac_has_permission(
            public.rbac_principal_user(),
            $1::uuid,
            public.rbac_perm_channel_update_settings(),
            $2::uuid,
            $3,
            $4::bigint
          ) AS allowed
        `, [
          USER_ID,
          ORG_ID,
          TEST_APP_ID,
          victimChannelId,
        ])

        expect(result.rows[0].allowed).toBe(false)
      })

      it('should deny org permissions outside limited_to_orgs for scoped api keys', async () => {
        const allowedOrgId = randomUUID()
        const targetOrgId = randomUUID()
        const scopedKey = `rbac-scope-${randomUUID()}`

        await query(`
          INSERT INTO public.orgs (id, name, management_email, created_by, use_new_rbac)
          VALUES
            ($1::uuid, $3, $5, $6::uuid, true),
            ($2::uuid, $4, $5, $6::uuid, true)
        `, [allowedOrgId, targetOrgId, `RBAC Allowed ${allowedOrgId}`, `RBAC Target ${targetOrgId}`, `rbac-scope-${randomUUID()}@capgo.app`, USER_ID])

        await query(`
          INSERT INTO public.apikeys (user_id, key, key_hash, mode, name, limited_to_orgs, limited_to_apps)
          VALUES ($1::uuid, $2, NULL, 'write', $3, ARRAY[$4::uuid], ARRAY[]::text[])
        `, [USER_ID, scopedKey, `RBAC scoped ${allowedOrgId}`, allowedOrgId])

        const apiKeyResult = await query(`
          SELECT rbac_id
          FROM public.apikeys
          WHERE key = $1
          LIMIT 1
        `, [scopedKey])
        const apiKeyRbacId = apiKeyResult.rows[0]?.rbac_id
        expect(apiKeyRbacId).toBeTruthy()

        await query(`
          INSERT INTO public.role_bindings (principal_type, principal_id, role_id, scope_type, org_id, granted_by)
          SELECT
            'apikey',
            $1::uuid,
            r.id,
            'org',
            $2::uuid,
            $3::uuid
          FROM public.roles r
          WHERE r.name = 'org_super_admin'
          LIMIT 1
        `, [apiKeyRbacId, allowedOrgId, USER_ID])

        const deniedResult = await query(`
          SELECT public.rbac_check_permission_direct(
            'org.delete',
            $1::uuid,
            $2::uuid,
            NULL::text,
            NULL::bigint,
            $3
          ) AS allowed
        `, [USER_ID, targetOrgId, scopedKey])

        const allowedResult = await query(`
          SELECT public.rbac_check_permission_direct(
            'org.delete',
            $1::uuid,
            $2::uuid,
            NULL::text,
            NULL::bigint,
            $3
          ) AS allowed
        `, [USER_ID, allowedOrgId, scopedKey])

        expect(deniedResult.rows[0].allowed).toBe(false)
        expect(allowedResult.rows[0].allowed).toBe(true)
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

    it('should reject unauthenticated access to get_org_user_access_rbac', async () => {
      let caught: unknown
      try {
        await query(`
          SELECT * FROM public.get_org_user_access_rbac($1::uuid, $2::uuid)
        `, [USER_ID, ORG_ID])
      }
      catch (error) {
        caught = error
      }

      expect(caught).toBeTruthy()
      expect((caught as { message?: string })?.message).toContain('NO_PERMISSION_TO_VIEW_BINDINGS')
    })

    it('should allow authenticated user when requesting their own bindings', async () => {
      await withAuthClaim(USER_ID)

      const result = await query(`
        SELECT * FROM public.get_org_user_access_rbac($1::uuid, $2::uuid)
      `, [USER_ID, ORG_ID])

      expect(Array.isArray(result.rows)).toBe(true)
    })
  })
})
