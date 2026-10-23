import type { PoolClient } from 'pg'
/**
 * Default API keys provisioned by createApiKey() must never hold more rights
 * than their owner in any organization or app.
 */
import { Pool } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { CREATE_DEFAULT_API_KEYS_SQL } from '../supabase/functions/_backend/utils/default_apikeys.ts'
import { ORG_ID, ORG_ID_2, POSTGRES_URL, USER_ID, USER_ID_2 } from './test-utils'

// Seed: ORG_ID owns com.demo.app; USER_ID_2 is org_super_admin of ORG_ID_2
// and only org_member of ORG_ID.
const MEMBER_ORG_APP_ID = 'com.demo.app'

interface KeyBinding {
  name: string
  role_name: string
  scope_type: string
  org_id: string
  app_id: string | null
}

describe('default API keys are capped at the owner rights', () => {
  let pool: Pool
  let client: PoolClient

  const query = (text: string, params?: unknown[]) => client.query(text, params)

  const bindUser = async (userId: string, roleName: string, orgId: string, appId?: string) => {
    const result = await query(`
      INSERT INTO public.role_bindings (principal_type, principal_id, role_id, scope_type, org_id, app_id, granted_by, reason, is_direct)
      SELECT
        public.rbac_principal_user(),
        $1::uuid,
        roles.id,
        roles.scope_type,
        $3::uuid,
        (SELECT apps.id FROM public.apps WHERE apps.app_id = $4::varchar),
        $5::uuid,
        'default apikey owner cap test',
        true
      FROM public.roles
      WHERE roles.name = $2
      RETURNING id
    `, [userId, roleName, orgId, appId ?? null, USER_ID])
    expect(result.rowCount).toBe(1)
  }

  // Only inspect keys created by this provisioning run; seeded keys are left
  // untouched so concurrent tests sharing these users are not blocked.
  let preexistingKeyIds: string[] = []

  const provisionDefaultKeys = async (userId: string) => {
    const before = await query('SELECT id::text AS id FROM public.apikeys WHERE user_id = $1::uuid', [userId])
    preexistingKeyIds = before.rows.map(row => row.id as string)
    await query(CREATE_DEFAULT_API_KEYS_SQL, [userId])
  }

  const keyBindings = async (userId: string, orgId: string) => {
    const result = await query(`
      SELECT apikeys.name, roles.name AS role_name, rb.scope_type, rb.org_id::text AS org_id, apps.app_id
      FROM public.apikeys
      JOIN public.role_bindings rb
        ON rb.principal_type = public.rbac_principal_apikey()
        AND rb.principal_id = apikeys.rbac_id
      JOIN public.roles ON roles.id = rb.role_id
      LEFT JOIN public.apps ON apps.id = rb.app_id
      WHERE apikeys.user_id = $1::uuid
        AND NOT (apikeys.id = ANY($3::bigint[]))
        AND rb.org_id = $2::uuid
      ORDER BY apikeys.name, roles.name, apps.app_id
    `, [userId, orgId, preexistingKeyIds])
    return result.rows as KeyBinding[]
  }

  const keyHasPermission = async (userId: string, keyName: string, permission: string, orgId: string, appId: string | null = null) => {
    const result = await query(`
      SELECT public.rbac_has_permission(
        public.rbac_principal_apikey(),
        apikeys.rbac_id,
        $3,
        $4::uuid,
        $5::varchar,
        NULL::bigint
      ) AS allowed
      FROM public.apikeys
      WHERE apikeys.user_id = $1::uuid
        AND NOT (apikeys.id = ANY($6::bigint[]))
        AND apikeys.name = $2
    `, [userId, keyName, permission, orgId, appId, preexistingKeyIds])
    expect(result.rowCount).toBe(1)
    return result.rows[0].allowed as boolean
  }

  beforeAll(() => {
    pool = new Pool({ connectionString: POSTGRES_URL })
  })

  beforeEach(async () => {
    client = await pool.connect()
    await client.query('BEGIN')
  })

  afterEach(async () => {
    if (!client)
      return
    await client.query('ROLLBACK')
    client.release()
  })

  afterAll(async () => {
    await pool.end()
  })

  it('does not grant org_admin or app rights in an org where the owner is only org_member', async () => {
    await provisionDefaultKeys(USER_ID_2)

    const memberOrgBindings = await keyBindings(USER_ID_2, ORG_ID)
    expect(memberOrgBindings.some(binding => binding.role_name === 'org_admin' || binding.role_name === 'org_super_admin')).toBe(false)
    expect(memberOrgBindings.filter(binding => binding.scope_type === 'app')).toEqual([])
    expect(memberOrgBindings).toEqual([
      { name: 'default app reader', role_name: 'org_member', scope_type: 'org', org_id: ORG_ID, app_id: null },
      { name: 'default app uploader', role_name: 'org_member', scope_type: 'org', org_id: ORG_ID, app_id: null },
      { name: 'default org admin', role_name: 'org_member', scope_type: 'org', org_id: ORG_ID, app_id: null },
    ])

    expect(await keyHasPermission(USER_ID_2, 'default org admin', 'org.update_user_roles', ORG_ID)).toBe(false)
    expect(await keyHasPermission(USER_ID_2, 'default org admin', 'org.manage_apikeys', ORG_ID)).toBe(false)
    expect(await keyHasPermission(USER_ID_2, 'default app uploader', 'app.upload_bundle', ORG_ID, MEMBER_ORG_APP_ID)).toBe(false)
    expect(await keyHasPermission(USER_ID_2, 'default app reader', 'app.read', ORG_ID, MEMBER_ORG_APP_ID)).toBe(false)

    // The org the user administers keeps the expected default admin binding.
    const ownedOrgBindings = await keyBindings(USER_ID_2, ORG_ID_2)
    expect(ownedOrgBindings).toContainEqual({ name: 'default org admin', role_name: 'org_admin', scope_type: 'org', org_id: ORG_ID_2, app_id: null })
    expect(await keyHasPermission(USER_ID_2, 'default org admin', 'org.update_user_roles', ORG_ID_2)).toBe(true)
  })

  it('grants app roles only on apps where the owner already has those rights', async () => {
    await bindUser(USER_ID_2, 'app_developer', ORG_ID, MEMBER_ORG_APP_ID)

    await provisionDefaultKeys(USER_ID_2)

    const appBindings = (await keyBindings(USER_ID_2, ORG_ID)).filter(binding => binding.scope_type === 'app')
    expect(appBindings).toEqual([
      { name: 'default app reader', role_name: 'app_reader', scope_type: 'app', org_id: ORG_ID, app_id: MEMBER_ORG_APP_ID },
      { name: 'default app uploader', role_name: 'app_uploader', scope_type: 'app', org_id: ORG_ID, app_id: MEMBER_ORG_APP_ID },
    ])
    expect(await keyHasPermission(USER_ID_2, 'default app uploader', 'app.upload_bundle', ORG_ID, MEMBER_ORG_APP_ID)).toBe(true)
    expect(await keyHasPermission(USER_ID_2, 'default org admin', 'org.update_user_roles', ORG_ID)).toBe(false)
  })

  it('keeps org_admin default bindings for org super admins', async () => {
    await provisionDefaultKeys(USER_ID)

    const bindings = await keyBindings(USER_ID, ORG_ID)
    expect(bindings).toContainEqual({ name: 'default org admin', role_name: 'org_admin', scope_type: 'org', org_id: ORG_ID, app_id: null })
    expect(bindings).toContainEqual({ name: 'default app uploader', role_name: 'app_uploader', scope_type: 'app', org_id: ORG_ID, app_id: MEMBER_ORG_APP_ID })
    expect(bindings).toContainEqual({ name: 'default app reader', role_name: 'app_reader', scope_type: 'app', org_id: ORG_ID, app_id: MEMBER_ORG_APP_ID })
  })
})
