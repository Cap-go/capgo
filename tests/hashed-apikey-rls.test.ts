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
import { createClient } from '@supabase/supabase-js'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { APIKEY_RLS_ALL, APP_NAME_RLS, BASE_URL, ORG_ID_2FA_TEST, ORG_ID_RLS, POSTGRES_URL, USER_ID_RLS } from './test-utils.ts'

// Use dedicated RLS test user's API key to avoid conflicts with other tests
const headersRLS = {
  'Content-Type': 'application/json',
  'Authorization': APIKEY_RLS_ALL,
}

// Use dedicated RLS test user for complete isolation
const RLS_TEST_USER_ID = USER_ID_RLS

// Direct PostgreSQL connection for testing SQL functions
let pool: Pool
let originalEnforcing2fa: boolean | null = null

// Helper to execute SQL with capgkey header set
async function execWithCapgkey(sql: string, capgkey: string): Promise<any> {
  const client = await pool.connect()
  try {
    // Set the capgkey header in request.headers (how Supabase passes it to RLS)
    await client.query(`SET request.headers = '{"capgkey": "${capgkey}"}'`)
    const result = await client.query(sql)
    return result.rows
  }
  finally {
    client.release()
  }
}

// Helper to create a hashed API key via the API
async function createHashedApiKey(name: string): Promise<{ id: number, key: string, key_hash: string }> {
  const response = await fetch(`${BASE_URL}/apikey`, {
    method: 'POST',
    headers: headersRLS,
    body: JSON.stringify({ name, hashed: true }),
  })
  if (response.status !== 200) {
    const error = await response.text()
    throw new Error(`Failed to create hashed API key: ${error}`)
  }
  return response.json()
}

// Helper to create a plain API key via the API
async function createPlainApiKey(name: string): Promise<{ id: number, key: string }> {
  const response = await fetch(`${BASE_URL}/apikey`, {
    method: 'POST',
    headers: headersRLS,
    body: JSON.stringify({ name, hashed: false }),
  })
  if (response.status !== 200) {
    const error = await response.text()
    throw new Error(`Failed to create plain API key: ${error}`)
  }
  return response.json()
}

// Helper to delete an API key
async function deleteApiKey(id: number): Promise<void> {
  await fetch(`${BASE_URL}/apikey/${id}`, {
    method: 'DELETE',
    headers: headersRLS,
  })
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

  it('returns NULL when key mode does not match', async () => {
    // Create a read-only key
    const readOnlyKey = await createHashedApiKey('test-readonly-key')
    // Update it to read mode
    const client = await pool.connect()
    try {
      await client.query('UPDATE apikeys SET mode = $1 WHERE id = $2', ['read', readOnlyKey.id])
    }
    finally {
      client.release()
    }

    // Try to use it with write mode requirement
    const rows = await execWithCapgkey(
      `SELECT get_identity('{write}'::key_mode[]) as user_id`,
      readOnlyKey.key,
    )
    expect(rows[0].user_id).toBeNull()

    await deleteApiKey(readOnlyKey.id)
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
  let limitedKey: { id: number, key: string, key_hash: string }

  beforeAll(async () => {
    hashedKey = await createHashedApiKey('test-hashed-org-allowed')
    limitedKey = await createHashedApiKey('test-limited-org')

    // Limit the second key to a different org
    const client = await pool.connect()
    try {
      await client.query(
        `UPDATE apikeys SET limited_to_orgs = $1 WHERE id = $2`,
        [['00000000-0000-0000-0000-000000000000'], limitedKey.id], // Non-existent org
      )
    }
    finally {
      client.release()
    }
  }, 60000)

  afterAll(async () => {
    await deleteApiKey(hashedKey.id)
    await deleteApiKey(limitedKey.id)
  })

  it('returns user_id for hashed API key with matching org', async () => {
    const rows = await execWithCapgkey(
      `SELECT get_identity_org_allowed('{all,write,read,upload}'::key_mode[], '${ORG_ID_RLS}'::uuid) as user_id`,
      hashedKey.key,
    )
    expect(rows[0].user_id).toBe(RLS_TEST_USER_ID)
  })

  it('returns NULL for hashed API key limited to different org', async () => {
    const rows = await execWithCapgkey(
      `SELECT get_identity_org_allowed('{all,write,read,upload}'::key_mode[], '${ORG_ID_RLS}'::uuid) as user_id`,
      limitedKey.key,
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
  let appLimitedKey: { id: number, key: string, key_hash: string }

  beforeAll(async () => {
    hashedKey = await createHashedApiKey('test-hashed-org-appid')
    appLimitedKey = await createHashedApiKey('test-limited-app')

    // Limit the second key to a different app
    const client = await pool.connect()
    try {
      await client.query(
        `UPDATE apikeys SET limited_to_apps = $1 WHERE id = $2`,
        [['com.nonexistent.app'], appLimitedKey.id],
      )
    }
    finally {
      client.release()
    }
  }, 60000)

  afterAll(async () => {
    await deleteApiKey(hashedKey.id)
    await deleteApiKey(appLimitedKey.id)
  })

  it('returns user_id for hashed API key with matching app', async () => {
    const rows = await execWithCapgkey(
      `SELECT get_identity_org_appid('{all,write,read,upload}'::key_mode[], '${ORG_ID_RLS}'::uuid, '${APP_NAME_RLS}') as user_id`,
      hashedKey.key,
    )
    expect(rows[0].user_id).toBe(RLS_TEST_USER_ID)
  })

  it('returns NULL for hashed API key limited to different app', async () => {
    const rows = await execWithCapgkey(
      `SELECT get_identity_org_appid('{all,write,read,upload}'::key_mode[], '${ORG_ID_RLS}'::uuid, '${APP_NAME_RLS}') as user_id`,
      appLimitedKey.key,
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

describe('RLS policies with hashed API keys (via Supabase SDK)', () => {
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
