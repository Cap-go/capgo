/**
 * Tests for hashed API key support in RLS functions (get_identity, etc.)
 *
 * These tests verify that the PostgreSQL RLS identity functions properly
 * support both plain and hashed API keys. This is critical for CLI usage
 * where the Supabase SDK is used directly with the capgkey header.
 *
 * IMPORTANT: This test uses a completely isolated user (USER_ID_RLS) with its own
 * org and API key to prevent interference with other tests that create/delete API keys.
 */
import type { PoolClient } from 'pg'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  APP_NAME_RLS,
  ORG_ID_2,
  ORG_ID_2FA_TEST,
  ORG_ID_RLS,
  POSTGRES_URL,
  USER_ID_2,
  USER_ID_RLS,
} from './test-utils.ts'

// Use dedicated RLS test user for complete isolation
const RLS_TEST_USER_ID = USER_ID_RLS

// Direct PostgreSQL connection for testing SQL functions
let pool: Pool
let originalEnforcing2fa: boolean | null = null

// Helper to execute SQL with capgkey header set
async function execWithCapgkey(sql: string, capgkey: string): Promise<any> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    try {
      // Set the capgkey header in request.headers (how Supabase passes it to RLS)
      await client.query(
        'SELECT set_config(\'request.headers\', $1, true)',
        [JSON.stringify({ capgkey })],
      )
      const result = await client.query(sql)
      await client.query('COMMIT')
      return result.rows
    }
    catch (error) {
      try {
        await client.query('ROLLBACK')
      }
      catch {
        // Ignore rollback failures for clearer root error handling.
      }
      throw error
    }
  }
  finally {
    client.release(true)
  }
}

type RequestRole = 'anon' | 'authenticated'

async function execWithRoleClaims(
  sql: string,
  {
    role,
    claims,
    headers,
    params = [],
  }: {
    role: RequestRole
    claims: Record<string, string>
    headers: Record<string, string>
    params?: unknown[]
  },
): Promise<{ rows: any[], rowCount: number }> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    try {
      await client.query(`SET LOCAL ROLE ${role}`)
      if (claims.sub) {
        await client.query('SELECT set_config(\'request.jwt.claim.sub\', $1, true)', [claims.sub])
      }
      await client.query(
        'SELECT set_config(\'request.jwt.claims\', $1, true)',
        [JSON.stringify(claims)],
      )
      await client.query(
        'SELECT set_config(\'request.headers\', $1, true)',
        [JSON.stringify(headers)],
      )

      const result = await client.query(sql, params)
      await client.query('COMMIT')
      return { rows: result.rows, rowCount: result.rowCount ?? 0 }
    }
    catch (error) {
      try {
        await client.query('ROLLBACK')
      }
      catch {
        // Ignore rollback failures for clearer root error handling.
      }
      throw error
    }
  }
  finally {
    client.release(true)
  }
}

async function execAsRoleWithCapgkey(
  sql: string,
  role: 'anon' | 'authenticated',
  capgkey: string,
  params: unknown[] = [],
): Promise<{ rows: any[], rowCount: number }> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    try {
      await client.query(`SET LOCAL ROLE ${role}`)
      await client.query(
        'SELECT set_config(\'request.headers\', $1, true)',
        [JSON.stringify({ capgkey })],
      )

      const result = await client.query(sql, params)
      await client.query('COMMIT')
      return { rows: result.rows, rowCount: result.rowCount ?? 0 }
    }
    catch (error) {
      try {
        await client.query('ROLLBACK')
      }
      catch {
        // Ignore rollback failures for clearer root error handling.
      }
      throw error
    }
  }
  finally {
    client.release(true)
  }
}

async function insertRlsAppVersion({
  appId,
  name,
  orgId,
  userId,
}: {
  appId: string
  name: string
  orgId: string
  userId: string
}) {
  const result = await pool.query(
    `INSERT INTO public.app_versions (app_id, name, owner_org, user_id, checksum, storage_provider, r2_path, deleted)
     VALUES ($1, $2, $3, $4, $5, $6, $7, false)
     RETURNING id`,
    [
      appId,
      name,
      orgId,
      userId,
      `checksum-${name}`,
      'r2',
      `orgs/${orgId}/apps/${appId}/${name}.zip`,
    ],
  )
  return Number(result.rows[0].id)
}

interface ApiKeyAccessOptions {
  orgId?: string
  orgRoleName?: 'org_admin' | 'org_member'
  appId?: string
  appRoleName?: 'app_admin' | 'app_developer' | 'app_reader' | 'app_uploader'
}

async function bindApiKeyRole(
  client: PoolClient,
  rbacId: string,
  userId: string,
  roleName: string,
  scopeType: 'app' | 'org',
  orgId: string,
  appUuid: string | null = null,
) {
  await client.query(
    `INSERT INTO public.role_bindings (principal_type, principal_id, role_id, scope_type, org_id, app_id, granted_by, reason, is_direct)
     SELECT 'apikey', $1::uuid, roles.id, $2, $3::uuid, $4::uuid, $5::uuid, $6, true
     FROM public.roles
     WHERE roles.name = $7`,
    [rbacId, scopeType, orgId, appUuid, userId, 'Hashed API key RLS test binding', roleName],
  )
}

async function bindApiKeyAccess(client: PoolClient, rbacId: string, userId: string, options: ApiKeyAccessOptions = {}) {
  const orgId = options.orgId ?? ORG_ID_RLS
  await bindApiKeyRole(client, rbacId, userId, options.orgRoleName ?? 'org_admin', 'org', orgId)

  if (!options.appId)
    return

  const appResult = await client.query(
    'SELECT id, owner_org FROM public.apps WHERE app_id = $1 LIMIT 1',
    [options.appId],
  )
  const app = appResult.rows[0]
  if (!app?.id || !app.owner_org)
    throw new Error(`Unable to resolve app ${options.appId}`)

  await bindApiKeyRole(
    client,
    rbacId,
    userId,
    options.appRoleName ?? 'app_admin',
    'app',
    app.owner_org,
    app.id,
  )
}

// Helper to create a hashed API key via the database
async function createHashedApiKey(
  name: string,
  options: ApiKeyAccessOptions = {},
): Promise<{ id: number, key: string, key_hash: string }> {
  const client = await pool.connect()
  const plainKey = randomUUID()
  try {
    const { rows } = await client.query(
      `INSERT INTO public.apikeys (user_id, key, key_hash, name)
       VALUES ($1, NULL, encode(extensions.digest($2, 'sha256'), 'hex'), $3)
       RETURNING id, key_hash, rbac_id`,
      [RLS_TEST_USER_ID, plainKey, name],
    )
    await bindApiKeyAccess(client, rows[0].rbac_id, RLS_TEST_USER_ID, options)
    return { id: Number(rows[0].id), key: plainKey, key_hash: rows[0].key_hash }
  }
  finally {
    client.release()
  }
}

// Helper to create a plain API key via the database
async function createPlainApiKey(
  name: string,
  options: ApiKeyAccessOptions = {},
): Promise<{ id: number, key: string }> {
  const client = await pool.connect()
  const plainKey = randomUUID()
  try {
    const { rows } = await client.query(
      `INSERT INTO public.apikeys (user_id, key, name)
       VALUES ($1, $2, $3)
       RETURNING id, key, rbac_id`,
      [RLS_TEST_USER_ID, plainKey, name],
    )
    await bindApiKeyAccess(client, rows[0].rbac_id, RLS_TEST_USER_ID, options)
    return { id: Number(rows[0].id), key: rows[0].key }
  }
  finally {
    client.release()
  }
}

// Helper to delete an API key
async function deleteApiKey(id: number): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('DELETE FROM public.apikeys WHERE id = $1', [id])
  }
  finally {
    client.release()
  }
}

// Helper to set API key expiration directly in DB
async function setApiKeyExpiration(id: number, expiresAt: Date | null): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query(
      'UPDATE apikeys SET expires_at = $1 WHERE id = $2',
      [expiresAt?.toISOString() ?? null, id],
    )
  }
  finally {
    client.release()
  }
}

async function setOrgHashedApiKeyEnforcement(orgId: string, enforce: boolean): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query(
      'UPDATE orgs SET enforce_hashed_api_keys = $1 WHERE id = $2',
      [enforce, orgId],
    )
  }
  finally {
    client.release()
  }
}

async function createEnforcedMemberOrgForUser(userId: string, enforceHashedApiKeys = true): Promise<string> {
  const client = await pool.connect()
  const orgId = randomUUID()
  try {
    await client.query(
      `INSERT INTO public.orgs (id, created_by, name, management_email, enforce_hashed_api_keys)
       VALUES ($1, $2, $3, $4, $5)`,
      [orgId, USER_ID_2, `hashed-enforcement-org-${orgId}`, `hashed-enforcement-${orgId}@capgo.test`, enforceHashedApiKeys],
    )
    await client.query(
      `INSERT INTO public.org_users (org_id, user_id, user_right)
       VALUES ($1, $2, 'super_admin')`,
      [orgId, userId],
    )
    return orgId
  }
  finally {
    client.release()
  }
}

async function deleteEnforcedMemberOrgForUser(orgId: string, userId: string): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('DELETE FROM public.org_users WHERE org_id = $1 AND user_id = $2', [orgId, userId])
    await client.query('DELETE FROM public.orgs WHERE id = $1', [orgId])
  }
  finally {
    client.release()
  }
}

async function createPendingInviteOrgForUser(userId: string): Promise<string> {
  const client = await pool.connect()
  const orgId = randomUUID()
  try {
    await client.query(
      `INSERT INTO public.orgs (id, created_by, name, management_email, enforce_hashed_api_keys)
       VALUES ($1, $2, $3, $4, true)`,
      [orgId, USER_ID_2, `pending-invite-org-${orgId}`, `pending-invite-${orgId}@capgo.test`],
    )
    await client.query(
      `INSERT INTO public.org_users (org_id, user_id, user_right)
       VALUES ($1, $2, 'invite_read')`,
      [orgId, userId],
    )
    return orgId
  }
  finally {
    client.release()
  }
}

async function deletePendingInviteOrgForUser(orgId: string, userId: string): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('DELETE FROM public.org_users WHERE org_id = $1 AND user_id = $2', [orgId, userId])
    await client.query('DELETE FROM public.orgs WHERE id = $1', [orgId])
  }
  finally {
    client.release()
  }
}

async function createEnforcedRbacOnlyOrgForUser(userId: string): Promise<string> {
  const client = await pool.connect()
  const orgId = randomUUID()
  try {
    await client.query(
      `INSERT INTO public.orgs (id, created_by, name, management_email, enforce_hashed_api_keys)
       VALUES ($1, $2, $3, $4, true)`,
      [orgId, USER_ID_2, `rbac-only-org-${orgId}`, `rbac-only-${orgId}@capgo.test`],
    )
    await client.query(
      `INSERT INTO public.role_bindings (
        principal_type, principal_id, role_id, scope_type, org_id, granted_by, reason, is_direct
      ) VALUES (
        public.rbac_principal_user(),
        $1,
        (SELECT id FROM public.roles WHERE name = public.rbac_role_org_member()),
        public.rbac_scope_org(),
        $2,
        $3,
        'hashed-apikey-rls test',
        true
      )`,
      [userId, orgId, USER_ID_2],
    )
    return orgId
  }
  finally {
    client.release()
  }
}

async function deleteEnforcedRbacOnlyOrgForUser(orgId: string, userId: string): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query(
      `DELETE FROM public.role_bindings
       WHERE principal_type = public.rbac_principal_user()
         AND principal_id = $1
         AND org_id = $2`,
      [userId, orgId],
    )
    await client.query('DELETE FROM public.orgs WHERE id = $1', [orgId])
  }
  finally {
    client.release()
  }
}

async function createEnforcedApikeyPrincipalOrgForKey(apikeyId: number): Promise<string> {
  const client = await pool.connect()
  const orgId = randomUUID()
  try {
    await client.query(
      `INSERT INTO public.orgs (id, created_by, name, management_email, enforce_hashed_api_keys)
       VALUES ($1, $2, $3, $4, true)`,
      [orgId, USER_ID_2, `apikey-rbac-org-${orgId}`, `apikey-rbac-${orgId}@capgo.test`],
    )
    await client.query(
      `INSERT INTO public.role_bindings (
        principal_type, principal_id, role_id, scope_type, org_id, granted_by, reason, is_direct
      ) VALUES (
        public.rbac_principal_apikey(),
        (SELECT rbac_id FROM public.apikeys WHERE id = $1),
        (SELECT id FROM public.roles WHERE name = public.rbac_role_org_member()),
        public.rbac_scope_org(),
        $2,
        $3,
        'hashed-apikey-rls test',
        true
      )`,
      [apikeyId, orgId, USER_ID_2],
    )
    return orgId
  }
  finally {
    client.release()
  }
}

async function deleteEnforcedApikeyPrincipalOrgForKey(orgId: string, apikeyId: number): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query(
      `DELETE FROM public.role_bindings
       WHERE principal_type = public.rbac_principal_apikey()
         AND principal_id = (SELECT rbac_id FROM public.apikeys WHERE id = $1)
         AND org_id = $2`,
      [apikeyId, orgId],
    )
    await client.query('DELETE FROM public.orgs WHERE id = $1', [orgId])
  }
  finally {
    client.release()
  }
}

async function createStandaloneOrg(enforceHashedApiKeys = true): Promise<string> {
  const client = await pool.connect()
  const orgId = randomUUID()
  try {
    await client.query(
      `INSERT INTO public.orgs (id, created_by, name, management_email, enforce_hashed_api_keys)
       VALUES ($1, $2, $3, $4, $5)`,
      [orgId, USER_ID_2, `standalone-org-${orgId}`, `standalone-${orgId}@capgo.test`, enforceHashedApiKeys],
    )
    return orgId
  }
  finally {
    client.release()
  }
}

async function deleteStandaloneOrg(orgId: string): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('DELETE FROM public.orgs WHERE id = $1', [orgId])
  }
  finally {
    client.release()
  }
}

async function createStaleAppScopedBindingForUser(userId: string, staleOrgId: string): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query(
      `INSERT INTO public.role_bindings (
        principal_type, principal_id, role_id, scope_type, org_id, app_id, granted_by, reason, is_direct
      ) VALUES (
        public.rbac_principal_user(),
        $1,
        (SELECT id FROM public.roles WHERE name = public.rbac_role_app_reader()),
        public.rbac_scope_app(),
        $2,
        (SELECT id FROM public.apps WHERE app_id = $3),
        $4,
        'hashed-apikey-rls stale app scope test',
        true
      )`,
      [userId, staleOrgId, APP_NAME_RLS, USER_ID_2],
    )
  }
  finally {
    client.release()
  }
}

async function deleteStaleAppScopedBindingForUser(userId: string, staleOrgId: string): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query(
      `DELETE FROM public.role_bindings
       WHERE principal_type = public.rbac_principal_user()
         AND principal_id = $1
         AND scope_type = public.rbac_scope_app()
         AND org_id = $2
         AND app_id = (SELECT id FROM public.apps WHERE app_id = $3)`,
      [userId, staleOrgId, APP_NAME_RLS],
    )
  }
  finally {
    client.release()
  }
}

async function createStaleAppScopedOrgUserForUser(userId: string, staleOrgId: string): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query(
      `INSERT INTO public.org_users (org_id, user_id, user_right, app_id)
       VALUES ($1, $2, 'read', $3)`,
      [staleOrgId, userId, APP_NAME_RLS],
    )
  }
  finally {
    client.release()
  }
}

async function deleteStaleAppScopedOrgUserForUser(userId: string, staleOrgId: string): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query(
      `DELETE FROM public.org_users
       WHERE org_id = $1
         AND user_id = $2
         AND app_id = $3`,
      [staleOrgId, userId, APP_NAME_RLS],
    )
  }
  finally {
    client.release()
  }
}

beforeAll(async () => {
  pool = new Pool({ connectionString: POSTGRES_URL })
  const client = await pool.connect()
  try {
    const { rows } = await client.query(
      'SELECT enforcing_2fa FROM orgs WHERE id = $1',
      [ORG_ID_2FA_TEST],
    )
    originalEnforcing2fa = rows[0]?.enforcing_2fa ?? null
    await client.query(
      'UPDATE orgs SET enforcing_2fa = false WHERE id = $1',
      [ORG_ID_2FA_TEST],
    )
  }
  finally {
    client.release()
  }
})

afterAll(async () => {
  if (originalEnforcing2fa !== null) {
    const client = await pool.connect()
    try {
      await client.query(
        'UPDATE orgs SET enforcing_2fa = $1 WHERE id = $2',
        [originalEnforcing2fa, ORG_ID_2FA_TEST],
      )
    }
    finally {
      client.release()
    }
  }
  await pool.end()
})

describe('get_identity() with hashed API keys', () => {
  let hashedKey: { id: number, key: string, key_hash: string }
  let plainKey: { id: number, key: string }

  beforeAll(async () => {
    hashedKey = await createHashedApiKey('test-hashed-rls-identity')
    plainKey = await createPlainApiKey('test-plain-rls-identity')
  }, 60000) // Increase timeout for CI/parallel test runs

  afterAll(async () => {
    await deleteApiKey(hashedKey.id)
    await deleteApiKey(plainKey.id)
  })

  it('returns user_id for plain API key', async () => {
    const rows = await execWithCapgkey(
      `SELECT get_identity('{all,write,read,upload}'::key_mode[]) as user_id`,
      plainKey.key,
    )
    expect(rows[0].user_id).toBe(RLS_TEST_USER_ID)
  })

  it('returns user_id for hashed API key', async () => {
    const rows = await execWithCapgkey(
      `SELECT get_identity('{all,write,read,upload}'::key_mode[]) as user_id`,
      hashedKey.key, // The plain key value - DB should hash and match
    )
    expect(rows[0].user_id).toBe(RLS_TEST_USER_ID)
  })

  it('returns NULL for invalid API key', async () => {
    const rows = await execWithCapgkey(
      `SELECT get_identity('{all,write,read,upload}'::key_mode[]) as user_id`,
      'invalid-key-that-does-not-exist',
    )
    expect(rows[0].user_id).toBeNull()
  })

  it('returns NULL for expired hashed API key', async () => {
    const expiredKey = await createHashedApiKey('test-expired-hashed')
    // Set expiration to yesterday
    await setApiKeyExpiration(expiredKey.id, new Date(Date.now() - 24 * 60 * 60 * 1000))

    const rows = await execWithCapgkey(
      `SELECT get_identity('{all,write,read,upload}'::key_mode[]) as user_id`,
      expiredKey.key,
    )
    expect(rows[0].user_id).toBeNull()

    await deleteApiKey(expiredKey.id)
  })

  it('returns user_id for non-expired hashed API key', async () => {
    const futureKey = await createHashedApiKey('test-future-hashed')
    // Set expiration to tomorrow
    await setApiKeyExpiration(futureKey.id, new Date(Date.now() + 24 * 60 * 60 * 1000))

    const rows = await execWithCapgkey(
      `SELECT get_identity('{all,write,read,upload}'::key_mode[]) as user_id`,
      futureKey.key,
    )
    expect(rows[0].user_id).toBe(RLS_TEST_USER_ID)

    await deleteApiKey(futureKey.id)
  })
})

describe('enforce_hashed_api_keys blocks plaintext capgkey auth on the RLS plane', () => {
  let hashedKey: { id: number, key: string, key_hash: string }
  let plainKey: { id: number, key: string }
  let suiteOrgId: string

  beforeAll(async () => {
    suiteOrgId = await createEnforcedMemberOrgForUser(RLS_TEST_USER_ID, true)
    hashedKey = await createHashedApiKey('test-hashed-enforced-rls', { orgId: suiteOrgId })
    plainKey = await createPlainApiKey('test-plain-enforced-rls', { orgId: suiteOrgId })
  }, 60000)

  afterAll(async () => {
    await deleteApiKey(hashedKey.id)
    await deleteApiKey(plainKey.id)
    await deleteEnforcedMemberOrgForUser(suiteOrgId, RLS_TEST_USER_ID)
  })

  it('find_apikey_by_value returns empty for a plain API key after hashed enforcement is enabled', async () => {
    const client = await pool.connect()
    try {
      const result = await client.query(
        'SELECT id FROM find_apikey_by_value($1)',
        [plainKey.key],
      )
      expect(result.rows).toEqual([])
    }
    finally {
      client.release()
    }
  })

  it('get_identity rejects a plain API key after hashed enforcement is enabled', async () => {
    const rows = await execWithCapgkey(
      `SELECT get_identity('{all,write,read,upload}'::key_mode[]) AS user_id`,
      plainKey.key,
    )
    expect(rows[0].user_id).toBeNull()
  })

  it('get_identity still accepts a hashed API key after hashed enforcement is enabled', async () => {
    const rows = await execWithCapgkey(
      `SELECT get_identity('{all,write,read,upload}'::key_mode[]) AS user_id`,
      hashedKey.key,
    )
    expect(rows[0].user_id).toBe(RLS_TEST_USER_ID)
  })

  it('does not reject a plain API key for users with only a pending invite to an enforced org', async () => {
    const pendingInviteOrgId = await createPendingInviteOrgForUser(RLS_TEST_USER_ID)

    try {
      await setOrgHashedApiKeyEnforcement(suiteOrgId, false)

      const rows = await execWithCapgkey(
        `SELECT get_identity('{all,write,read,upload}'::key_mode[]) AS user_id`,
        plainKey.key,
      )
      expect(rows[0].user_id).toBe(RLS_TEST_USER_ID)
    }
    finally {
      await setOrgHashedApiKeyEnforcement(suiteOrgId, true)
      await deletePendingInviteOrgForUser(pendingInviteOrgId, RLS_TEST_USER_ID)
    }
  })

  it('does not reject a plain API key for an enforced org that is only bound to the user', async () => {
    const rbacOnlyOrgId = await createEnforcedRbacOnlyOrgForUser(RLS_TEST_USER_ID)

    try {
      await setOrgHashedApiKeyEnforcement(suiteOrgId, false)

      const rows = await execWithCapgkey(
        `SELECT get_identity('{all,write,read,upload}'::key_mode[]) AS user_id`,
        plainKey.key,
      )
      expect(rows[0].user_id).toBe(RLS_TEST_USER_ID)
    }
    finally {
      await setOrgHashedApiKeyEnforcement(suiteOrgId, true)
      await deleteEnforcedRbacOnlyOrgForUser(rbacOnlyOrgId, RLS_TEST_USER_ID)
    }
  })

  it('rejects a plain API key when hashed enforcement is reached through RBAC API-key bindings', async () => {
    const apikeyPrincipalOrgId = await createEnforcedApikeyPrincipalOrgForKey(plainKey.id)

    try {
      await setOrgHashedApiKeyEnforcement(suiteOrgId, false)

      const rows = await execWithCapgkey(
        `SELECT get_identity('{all,write,read,upload}'::key_mode[]) AS user_id`,
        plainKey.key,
      )
      expect(rows[0].user_id).toBeNull()
    }
    finally {
      await setOrgHashedApiKeyEnforcement(suiteOrgId, true)
      await deleteEnforcedApikeyPrincipalOrgForKey(apikeyPrincipalOrgId, plainKey.id)
    }
  })

  it('ignores stale org_id values on app-scoped RBAC bindings when deriving org enforcement', async () => {
    const staleEnforcedOrgId = await createStandaloneOrg(true)

    try {
      await setOrgHashedApiKeyEnforcement(suiteOrgId, false)
      await createStaleAppScopedBindingForUser(RLS_TEST_USER_ID, staleEnforcedOrgId)

      const rows = await execWithCapgkey(
        `SELECT get_identity('{all,write,read,upload}'::key_mode[]) AS user_id`,
        plainKey.key,
      )
      expect(rows[0].user_id).toBe(RLS_TEST_USER_ID)
    }
    finally {
      await deleteStaleAppScopedBindingForUser(RLS_TEST_USER_ID, staleEnforcedOrgId)
      await setOrgHashedApiKeyEnforcement(suiteOrgId, true)
      await deleteStandaloneOrg(staleEnforcedOrgId)
    }
  })

  it('ignores stale org_id values on app-scoped legacy org_users rows when deriving org enforcement', async () => {
    const staleEnforcedOrgId = await createStandaloneOrg(true)

    try {
      await setOrgHashedApiKeyEnforcement(suiteOrgId, false)
      await createStaleAppScopedOrgUserForUser(RLS_TEST_USER_ID, staleEnforcedOrgId)

      const rows = await execWithCapgkey(
        `SELECT get_identity('{all,write,read,upload}'::key_mode[]) AS user_id`,
        plainKey.key,
      )
      expect(rows[0].user_id).toBe(RLS_TEST_USER_ID)
    }
    finally {
      await deleteStaleAppScopedOrgUserForUser(RLS_TEST_USER_ID, staleEnforcedOrgId)
      await setOrgHashedApiKeyEnforcement(suiteOrgId, true)
      await deleteStandaloneOrg(staleEnforcedOrgId)
    }
  })

  it('blocks direct anon RLS reads from the apikeys table for plain API keys', async () => {
    const { rows } = await execAsRoleWithCapgkey(
      'SELECT id, name FROM public.apikeys ORDER BY id DESC LIMIT 1',
      'anon',
      plainKey.key,
    )

    expect(rows).toEqual([])
  })

  it('rejects get_orgs_v7 over the anon RPC path for plain API keys', async () => {
    await expect(execAsRoleWithCapgkey(
      'SELECT * FROM public.get_orgs_v7()',
      'anon',
      plainKey.key,
    )).rejects.toThrow('Invalid API key provided')
  })
})

describe('get_identity_apikey_only() with hashed API keys', () => {
  let hashedKey: { id: number, key: string, key_hash: string }

  beforeAll(async () => {
    hashedKey = await createHashedApiKey('test-hashed-apikey-only')
  }, 60000)

  afterAll(async () => {
    await deleteApiKey(hashedKey.id)
  })

  it('returns user_id for hashed API key', async () => {
    const rows = await execWithCapgkey(
      `SELECT get_identity_apikey_only('{all,write,read,upload}'::key_mode[]) as user_id`,
      hashedKey.key,
    )
    expect(rows[0].user_id).toBe(RLS_TEST_USER_ID)
  })

  it('returns NULL for invalid API key', async () => {
    const rows = await execWithCapgkey(
      `SELECT get_identity_apikey_only('{all,write,read,upload}'::key_mode[]) as user_id`,
      'invalid-key',
    )
    expect(rows[0].user_id).toBeNull()
  })
})

describe('get_identity_org_allowed() with hashed API keys', () => {
  let hashedKey: { id: number, key: string, key_hash: string }
  let otherOrgKey: { id: number, key: string, key_hash: string }

  beforeAll(async () => {
    hashedKey = await createHashedApiKey('test-hashed-org-allowed')
    otherOrgKey = await createHashedApiKey('test-other-org', { orgId: ORG_ID_2 })
  }, 60000)

  afterAll(async () => {
    await deleteApiKey(hashedKey.id)
    await deleteApiKey(otherOrgKey.id)
  }, 60000)

  it('returns user_id for hashed API key with matching org', async () => {
    const rows = await execWithCapgkey(
      `SELECT get_identity_org_allowed('{all,write,read,upload}'::key_mode[], '${ORG_ID_RLS}'::uuid) as user_id`,
      hashedKey.key,
    )
    expect(rows[0].user_id).toBe(RLS_TEST_USER_ID)
  })

  it('returns NULL for hashed API key bound to different org', async () => {
    const rows = await execWithCapgkey(
      `SELECT get_identity_org_allowed('{all,write,read,upload}'::key_mode[], '${ORG_ID_RLS}'::uuid) as user_id`,
      otherOrgKey.key,
    )
    expect(rows[0].user_id).toBeNull()
  })

  it('returns NULL for invalid API key', async () => {
    const rows = await execWithCapgkey(
      `SELECT get_identity_org_allowed('{all,write,read,upload}'::key_mode[], '${ORG_ID_RLS}'::uuid) as user_id`,
      'invalid-key',
    )
    expect(rows[0].user_id).toBeNull()
  })
})

describe('get_identity_org_appid() with hashed API keys', () => {
  let hashedKey: { id: number, key: string, key_hash: string }
  let otherOrgKey: { id: number, key: string, key_hash: string }

  beforeAll(async () => {
    hashedKey = await createHashedApiKey('test-hashed-org-appid')
    otherOrgKey = await createHashedApiKey('test-other-org-app', { orgId: ORG_ID_2 })
  }, 60000)

  afterAll(async () => {
    await deleteApiKey(hashedKey.id)
    await deleteApiKey(otherOrgKey.id)
  })

  it('returns user_id for hashed API key with matching app', async () => {
    const rows = await execWithCapgkey(
      `SELECT get_identity_org_appid('{all,write,read,upload}'::key_mode[], '${ORG_ID_RLS}'::uuid, '${APP_NAME_RLS}') as user_id`,
      hashedKey.key,
    )
    expect(rows[0].user_id).toBe(RLS_TEST_USER_ID)
  })

  it('returns NULL for hashed API key without requested app permission', async () => {
    const rows = await execWithCapgkey(
      `SELECT get_identity_org_appid('{all,write,read,upload}'::key_mode[], '${ORG_ID_RLS}'::uuid, '${APP_NAME_RLS}') as user_id`,
      otherOrgKey.key,
    )
    expect(rows[0].user_id).toBeNull()
  })

  it('returns NULL for invalid API key', async () => {
    const rows = await execWithCapgkey(
      `SELECT get_identity_org_appid('{all,write,read,upload}'::key_mode[], '${ORG_ID_RLS}'::uuid, '${APP_NAME_RLS}') as user_id`,
      'invalid-key',
    )
    expect(rows[0].user_id).toBeNull()
  })
})

describe('find_apikey_by_value() function', () => {
  let hashedKey: { id: number, key: string, key_hash: string }
  let plainKey: { id: number, key: string }

  beforeAll(async () => {
    hashedKey = await createHashedApiKey('test-find-hashed')
    plainKey = await createPlainApiKey('test-find-plain')
  }, 60000)

  afterAll(async () => {
    await deleteApiKey(hashedKey.id)
    await deleteApiKey(plainKey.id)
  })

  it('finds plain API key by value', async () => {
    const client = await pool.connect()
    try {
      const result = await client.query(
        `SELECT id, key, key_hash FROM find_apikey_by_value($1)`,
        [plainKey.key],
      )
      expect(result.rows.length).toBe(1)
      expect(Number(result.rows[0].id)).toBe(plainKey.id)
      expect(result.rows[0].key).toBe(plainKey.key)
      expect(result.rows[0].key_hash).toBeNull()
    }
    finally {
      client.release()
    }
  })

  it('finds hashed API key by plain value (hashes and matches)', async () => {
    const client = await pool.connect()
    try {
      const result = await client.query(
        `SELECT id, key, key_hash FROM find_apikey_by_value($1)`,
        [hashedKey.key], // Plain key - function should hash it
      )
      expect(result.rows.length).toBe(1)
      expect(Number(result.rows[0].id)).toBe(hashedKey.id)
      expect(result.rows[0].key).toBeNull() // Hashed keys have NULL key
      expect(result.rows[0].key_hash).toBe(hashedKey.key_hash)
    }
    finally {
      client.release()
    }
  })

  it('returns empty for non-existent key', async () => {
    const client = await pool.connect()
    try {
      const result = await client.query(
        `SELECT id FROM find_apikey_by_value($1)`,
        ['non-existent-key-12345'],
      )
      expect(result.rows.length).toBe(0)
    }
    finally {
      client.release()
    }
  })
})

describe('rls policies with hashed api keys (via supabase sdk)', () => {
  let hashedKey: { id: number, key: string, key_hash: string }

  beforeAll(async () => {
    hashedKey = await createHashedApiKey('test-rls-sdk-hashed')
  }, 60000)

  afterAll(async () => {
    await deleteApiKey(hashedKey.id)
  })

  it('can query apps table with hashed API key via SDK', async () => {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { capgkey: hashedKey.key },
        },
      },
    )

    const { data, error } = await supabase
      .from('apps')
      .select('app_id, name')
      .limit(5)

    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('can query channels table with hashed API key via SDK', async () => {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { capgkey: hashedKey.key },
        },
      },
    )

    const { data, error } = await supabase
      .from('channels')
      .select('id, name, app_id')
      .limit(5)

    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('can call get_orgs_v7 RPC with hashed API key', async () => {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { capgkey: hashedKey.key },
        },
      },
    )

    const { data, error } = await supabase.rpc('get_orgs_v7')

    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
  })

  it('cannot access data with invalid API key', async () => {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { capgkey: 'invalid-key-12345' },
        },
      },
    )

    const { data, error } = await supabase
      .from('apps')
      .select('app_id, name')
      .limit(5)

    // Should return empty array (RLS blocks access)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})

describe('channels rls blocks direct api-key updates', () => {
  let allKey: { id: number, key: string, key_hash: string, rbac_id?: string } | null = null
  let writeKey: { id: number, key: string, key_hash: string } | null = null
  let versionId: number | null = null
  let otherAppVersionId: number | null = null
  let deletedAppVersionId: number | null = null
  let channelId: number | null = null
  let appRbacId: string | null = null
  const otherAppId = `com.rls.rollout.other.${randomUUID().slice(0, 8)}`
  const versionName = `rls-direct-version-${randomUUID().slice(0, 8)}`
  const channelName = `rls-direct-channel-${randomUUID().slice(0, 8)}`

  beforeAll(async () => {
    allKey = await createHashedApiKey('test-channel-direct-admin-key', {
      orgId: ORG_ID_RLS,
      orgRoleName: 'org_admin',
      appId: APP_NAME_RLS,
      appRoleName: 'app_admin',
    })
    writeKey = await createHashedApiKey('test-channel-direct-developer-key', {
      orgId: ORG_ID_RLS,
      orgRoleName: 'org_member',
      appId: APP_NAME_RLS,
      appRoleName: 'app_developer',
    })
    const apiKeyResult = await pool.query('SELECT rbac_id FROM public.apikeys WHERE id = $1', [allKey.id])
    allKey.rbac_id = apiKeyResult.rows[0].rbac_id
    const appResult = await pool.query('SELECT id FROM public.apps WHERE app_id = $1', [APP_NAME_RLS])
    appRbacId = appResult.rows[0].id

    versionId = await insertRlsAppVersion({
      appId: APP_NAME_RLS,
      name: versionName,
      orgId: ORG_ID_RLS,
      userId: USER_ID_RLS,
    })

    await pool.query(
      `INSERT INTO public.apps (app_id, owner_org, name, icon_url)
       VALUES ($1, $2, $3, $4)`,
      [
        otherAppId,
        ORG_ID_RLS,
        `RLS Rollout Other ${versionName}`,
        'role-binding-test-icon',
      ],
    )

    otherAppVersionId = await insertRlsAppVersion({
      appId: otherAppId,
      name: `${versionName}-other-app`,
      orgId: ORG_ID_RLS,
      userId: USER_ID_RLS,
    })

    const channelResult = await pool.query(
      `INSERT INTO public.channels (app_id, name, version, owner_org, created_by, public, allow_emulator)
       VALUES ($1, $2, $3, $4, $5, false, false)
       RETURNING id`,
      [
        APP_NAME_RLS,
        channelName,
        versionId,
        ORG_ID_RLS,
        USER_ID_RLS,
      ],
    )
    channelId = Number(channelResult.rows[0].id)
  }, 60000)

  afterAll(async () => {
    if (channelId) {
      await pool.query('DELETE FROM public.channels WHERE id = $1', [channelId])
    }

    if (versionId) {
      await pool.query('DELETE FROM public.app_versions WHERE id = $1', [versionId])
    }

    if (otherAppVersionId) {
      await pool.query('DELETE FROM public.app_versions WHERE id = $1', [otherAppVersionId])
    }

    if (deletedAppVersionId) {
      await pool.query('DELETE FROM public.app_versions WHERE id = $1', [deletedAppVersionId])
    }

    await pool.query('DELETE FROM public.apps WHERE app_id = $1', [otherAppId])

    if (allKey)
      await deleteApiKey(allKey.id)

    if (writeKey)
      await deleteApiKey(writeKey.id)
  })

  it('does not let a developer API key mutate protected channel fields via anon role access', async () => {
    if (!writeKey || !channelId)
      throw new Error('RLS channel test setup did not complete')

    const result = await execWithRoleClaims(
      'UPDATE public.channels SET allow_emulator = true WHERE id = $1 RETURNING id, allow_emulator',
      {
        role: 'anon',
        claims: {
          role: 'anon',
          aud: 'anon',
        },
        headers: { capgkey: writeKey.key },
        params: [channelId],
      },
    )

    expect(result.rowCount).toBe(0)

    const { rows } = await pool.query(
      'SELECT allow_emulator FROM public.channels WHERE id = $1',
      [channelId],
    )

    expect(rows[0].allow_emulator).toBe(false)
  })

  it('still lets an admin API key mutate supported channel fields via anon role access', async () => {
    if (!allKey || !channelId)
      throw new Error('RLS channel test setup did not complete')

    const result = await execWithRoleClaims(
      'UPDATE public.channels SET allow_emulator = true WHERE id = $1 RETURNING id, allow_emulator',
      {
        role: 'anon',
        claims: {
          role: 'anon',
          aud: 'anon',
        },
        headers: { capgkey: allKey.key },
        params: [channelId],
      },
    )

    expect(result.rowCount).toBe(1)
    expect(result.rows[0].allow_emulator).toBe(true)

    await pool.query(
      'UPDATE public.channels SET allow_emulator = false WHERE id = $1',
      [channelId],
    )
  })

  it('requires channel promote permission for direct rollout target changes', async () => {
    if (!allKey || !allKey.rbac_id || !appRbacId || !channelId || !versionId)
      throw new Error('RLS channel test setup did not complete')

    const orgResult = await pool.query('SELECT use_new_rbac FROM public.orgs WHERE id = $1', [ORG_ID_RLS])
    const previousUseNewRbac = orgResult.rows[0]?.use_new_rbac ?? false
    await pool.query('UPDATE public.orgs SET use_new_rbac = true WHERE id = $1', [ORG_ID_RLS])
    await pool.query(
      `INSERT INTO public.channel_permission_overrides (
        principal_type, principal_id, channel_id, permission_key, is_allowed
      ) VALUES (
        public.rbac_principal_apikey(),
        $1,
        $2,
        public.rbac_perm_channel_promote_bundle(),
        false
      )
      ON CONFLICT (principal_type, principal_id, channel_id, permission_key)
      DO UPDATE SET is_allowed = excluded.is_allowed`,
      [allKey.rbac_id, channelId],
    )

    try {
      await expect(execWithRoleClaims(
        'UPDATE public.channels SET rollout_version = $1 WHERE id = $2 RETURNING id, rollout_version',
        {
          role: 'anon',
          claims: {
            role: 'anon',
            aud: 'anon',
          },
          headers: { capgkey: allKey.key },
          params: [versionId, channelId],
        },
      )).rejects.toThrow(/NO_RIGHTS/)

      const result = await execWithRoleClaims(
        'UPDATE public.channels SET allow_emulator = true WHERE id = $1 RETURNING id, allow_emulator',
        {
          role: 'anon',
          claims: {
            role: 'anon',
            aud: 'anon',
          },
          headers: { capgkey: allKey.key },
          params: [channelId],
        },
      )

      expect(result.rowCount).toBe(1)
      expect(result.rows[0].allow_emulator).toBe(true)
    }
    finally {
      await pool.query(
        `DELETE FROM public.channel_permission_overrides
         WHERE principal_type = public.rbac_principal_apikey()
           AND principal_id = $1
           AND channel_id = $2
           AND permission_key = public.rbac_perm_channel_promote_bundle()`,
        [allKey.rbac_id, channelId],
      )
      await pool.query(
        `DELETE FROM public.role_bindings
         WHERE principal_type = public.rbac_principal_apikey()
           AND principal_id = $1
           AND app_id = $2
           AND scope_type = public.rbac_scope_app()`,
        [allKey.rbac_id, appRbacId],
      )
      await pool.query('UPDATE public.orgs SET use_new_rbac = $1 WHERE id = $2', [previousUseNewRbac, ORG_ID_RLS])
      await pool.query(
        'UPDATE public.channels SET allow_emulator = false, rollout_version = NULL WHERE id = $1',
        [channelId],
      )
    }
  })

  it('rejects rollout targets from another app', async () => {
    if (!channelId || !otherAppVersionId)
      throw new Error('RLS channel test setup did not complete')

    await expect(pool.query(
      'UPDATE public.channels SET rollout_version = $1 WHERE id = $2 RETURNING id, rollout_version',
      [otherAppVersionId, channelId],
    )).rejects.toThrow(/INVALID_ROLLOUT_VERSION/)
  })

  it('rejects deleted rollout targets', async () => {
    if (!channelId)
      throw new Error('RLS channel test setup did not complete')

    deletedAppVersionId = await insertRlsAppVersion({
      appId: APP_NAME_RLS,
      name: `deleted-rollout-${Date.now()}`,
      orgId: ORG_ID_RLS,
      userId: USER_ID_RLS,
    })
    await pool.query('UPDATE public.app_versions SET deleted = true WHERE id = $1', [deletedAppVersionId])

    await expect(pool.query(
      'UPDATE public.channels SET rollout_version = $1 WHERE id = $2 RETURNING id, rollout_version',
      [deletedAppVersionId, channelId],
    )).rejects.toThrow(/INVALID_ROLLOUT_VERSION/)
  })
})

describe('webhook and webhook_delivery rls with api-key org bindings', () => {
  let unauthorizedKey: { id: number, key: string, key_hash: string }
  let authorizedKey: { id: number, key: string, key_hash: string }
  let webhookId: string
  let deliveryId: string

  beforeAll(async () => {
    unauthorizedKey = await createHashedApiKey('rls-webhook-other-org-key', { orgId: ORG_ID_2 })
    authorizedKey = await createHashedApiKey('rls-webhook-org-bound-key', { orgId: ORG_ID_RLS })

    webhookId = randomUUID()
    await pool.query(
      `INSERT INTO public.webhooks (id, org_id, name, url, events)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        webhookId,
        ORG_ID_RLS,
        'rls webhook scope test',
        'https://example.com/webhook-scope',
        ['apps'],
      ],
    )

    deliveryId = randomUUID()
    await pool.query(
      `INSERT INTO public.webhook_deliveries (id, org_id, webhook_id, event_type, request_payload, attempt_count, max_attempts, status)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)`,
      [
        deliveryId,
        ORG_ID_RLS,
        webhookId,
        'apps',
        '{"test": true}',
        0,
        3,
        'pending',
      ],
    )
  }, 60000)

  afterAll(async () => {
    await pool.query('DELETE FROM public.webhook_deliveries WHERE id = $1', [deliveryId])
    await pool.query('DELETE FROM public.webhooks WHERE id = $1', [webhookId])
    await deleteApiKey(unauthorizedKey.id)
    await deleteApiKey(authorizedKey.id)
  })

  it('denies direct webhook reads even when API key scope matches', async () => {
    await expect(
      execWithRoleClaims(
        'SELECT id FROM public.webhooks WHERE id = $1',
        {
          role: 'authenticated',
          claims: {
            sub: USER_ID_RLS,
            role: 'authenticated',
            aud: 'authenticated',
          },
          headers: { capgkey: authorizedKey.key },
          params: [webhookId],
        },
      ),
    ).rejects.toMatchObject({ code: '42501' })

    await expect(
      execWithRoleClaims(
        'SELECT id FROM public.webhook_deliveries WHERE id = $1',
        {
          role: 'authenticated',
          claims: {
            sub: USER_ID_RLS,
            role: 'authenticated',
            aud: 'authenticated',
          },
          headers: { capgkey: authorizedKey.key },
          params: [deliveryId],
        },
      ),
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('prevents webhook_delivery org_id changes when update payload org_id is unauthorized', async () => {
    await expect(execWithRoleClaims(
      'UPDATE public.webhook_deliveries SET org_id = $1 WHERE id = $2',
      {
        role: 'authenticated',
        claims: {
          sub: USER_ID_RLS,
          role: 'authenticated',
          aud: 'authenticated',
        },
        headers: { capgkey: authorizedKey.key },
        params: [ORG_ID_2, deliveryId],
      },
    )).rejects.toMatchObject({ code: '42501' })

    const { rows } = await pool.query(
      'SELECT org_id FROM public.webhook_deliveries WHERE id = $1',
      [deliveryId],
    )

    expect(rows[0].org_id).toBe(ORG_ID_RLS)
  })
})
