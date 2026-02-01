import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../src/types/supabase.types'
import { env } from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { Pool } from 'pg'

export const POSTGRES_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

// Determine which backend to use based on environment variable
const USE_CLOUDFLARE = env.USE_CLOUDFLARE_WORKERS === 'true'

// For Cloudflare Workers, we need to determine the correct URL based on the endpoint
// API endpoints go to CLOUDFLARE_API_URL, plugin endpoints go to CLOUDFLARE_PLUGIN_URL
export const CLOUDFLARE_API_URL = env.CLOUDFLARE_API_URL ?? 'http://127.0.0.1:8787'
export const CLOUDFLARE_PLUGIN_URL = env.CLOUDFLARE_PLUGIN_URL ?? 'http://127.0.0.1:8788'
export const CLOUDFLARE_FILES_URL = env.CLOUDFLARE_FILES_URL ?? 'http://127.0.0.1:8789'

// Default to Supabase Edge Functions for backward compatibility
export const BASE_URL = USE_CLOUDFLARE ? CLOUDFLARE_API_URL : `${env.SUPABASE_URL}/functions/v1`
export const PLUGIN_BASE_URL = USE_CLOUDFLARE ? CLOUDFLARE_PLUGIN_URL : `${env.SUPABASE_URL}/functions/v1`
export const API_SECRET = 'testsecret'

/**
 * Get the correct base URL for an endpoint based on whether it's a plugin endpoint or API endpoint
 * Plugin endpoints: /updates, /channel_self, /stats, /ok, /latency
 * All other endpoints go to the API worker
 */
export function getEndpointUrl(path: string): string {
  if (!USE_CLOUDFLARE) {
    return `${env.SUPABASE_URL}/functions/v1${path}`
  }

  // Plugin endpoints
  const pluginEndpoints = ['/updates', '/channel_self', '/stats', '/ok', '/latency', '/plugin/']
  const isPluginEndpoint = pluginEndpoints.some(endpoint => path.startsWith(endpoint))

  return isPluginEndpoint ? `${CLOUDFLARE_PLUGIN_URL}${path}` : `${CLOUDFLARE_API_URL}${path}`
}
export const APIKEY_TEST_ALL = 'ae6e7458-c46d-4c00-aa3b-153b0b8520ea' // all key
export const APIKEY_TEST_UPLOAD = 'c591b04e-cf29-4945-b9a0-776d0672061b' // upload key
export const APIKEY_TEST2_ALL = 'ac4d9a98-ec25-4af8-933c-2aae4aa52b85' // test2 all key (dedicated for statistics)
export const APIKEY_TEST_HASHED = 'test-hashed-apikey-for-auth-test' // hashed key (plain value, stored as SHA-256 hash in DB)
export const ORG_ID = '046a36ac-e03c-4590-9257-bd6c9dba9ee8'
export const STRIPE_INFO_CUSTOMER_ID = 'cus_Q38uE91NP8Ufqc' // Customer ID for ORG_ID
export const NON_OWNER_ORG_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
export const USER_ID = '6aa76066-55ef-4238-ade6-0b32334a4097'
export const USER_ID_2 = '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5'
export const ORG_ID_2 = '34a8c55d-2d0f-4652-a43f-684c7a9403ac' // Test2 org owned by USER_ID_2
export const STRIPE_INFO_CUSTOMER_ID_2 = 'cus_Pa0f3M6UCQ8g5Q' // Customer ID for ORG_ID_2
// Dedicated data for email preference tests (isolated to prevent interference)
export const USER_ID_EMAIL_PREFS = '9f1a2b3c-4d5e-4f60-8a7b-1c2d3e4f5061'
export const USER_EMAIL_EMAIL_PREFS = 'emailprefs@capgo.app'
export const USER_ID_DELETE_USER_STALE = 'b7a1d9f4-7b8f-4e3c-8f2b-1a2b3c4d5e6f'
export const USER_EMAIL_DELETE_USER_STALE = 'delete-user-stale@capgo.app'
export const USER_ID_DELETE_USER_FRESH = 'c8b2e0f5-8c90-4f4d-9f3c-2b3c4d5e6f70'
export const USER_EMAIL_DELETE_USER_FRESH = 'delete-user-fresh@capgo.app'
export const ORG_ID_EMAIL_PREFS = 'aa1b2c3d-4e5f-4a60-9b7c-1d2e3f4a5061'
export const STRIPE_CUSTOMER_ID_EMAIL_PREFS = 'cus_email_prefs_test_123'
// Dedicated data for cron/queue tests (isolated per file)
export const ORG_ID_CRON_APP = 'b1c2d3e4-f5a6-4b70-8c9d-0e1f2a3b4c5d'
export const STRIPE_CUSTOMER_ID_CRON_APP = 'cus_cron_app_test_123'
export const ORG_ID_CRON_INTEGRATION = 'c2d3e4f5-a6b7-4c80-9d0e-1f2a3b4c5d6e'
export const STRIPE_CUSTOMER_ID_CRON_INTEGRATION = 'cus_cron_integration_test_123'
export const ORG_ID_CRON_QUEUE = 'd3e4f5a6-b7c8-4d90-8e1f-2a3b4c5d6e7f'
export const STRIPE_CUSTOMER_ID_CRON_QUEUE = 'cus_cron_queue_test_123'
// Dedicated data for overage tracking tests (isolated)
export const ORG_ID_OVERAGE = 'e4f5a6b7-c8d9-4ea0-9f1a-2b3c4d5e6f70'
export const STRIPE_CUSTOMER_ID_OVERAGE = 'cus_overage_test_123'
export const USER_ID_STATS = '7a1b2c3d-4e5f-4a6b-7c8d-9e0f1a2b3c4d' // Dedicated user for statistics tests
export const ORG_ID_STATS = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e' // Dedicated org for statistics tests
export const APIKEY_STATS = '8b2c3d4e-5f6a-4c7b-8d9e-0f1a2b3c4d5e' // Dedicated API key for statistics tests
export const APP_NAME_STATS = 'com.stats.app' // Dedicated app for statistics tests
// Dedicated data for hashed-apikey-rls tests (isolated to prevent interference with API key tests)
export const USER_ID_RLS = '8b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e'
export const ORG_ID_RLS = 'c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f'
export const APIKEY_RLS_ALL = '9c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f'
export const APP_NAME_RLS = 'com.rls.app'
// Dedicated org for 2FA enforcement toggles in hashed-apikey-rls tests
export const ORG_ID_2FA_TEST = 'd5e6f7a8-b9c0-4d1e-8f2a-3b4c5d6e7f80'
export const STRIPE_CUSTOMER_ID_2FA_TEST = 'cus_2fa_rls_test_123'
export const PLAN_ORG_ID = '0f2f8c2a-6a1d-4a6c-a9a8-b1b2c3d4e5f6'
export const PLAN_STRIPE_CUSTOMER_ID = 'cus_plan_test_123456'
// Dedicated data for build_time_tracking tests (isolated to prevent interference)
// Note: UUIDs must be valid RFC 4122 (version 4 has variant bits 8-b at position 19)
export const BUILD_TIME_ORG_ID = 'c3d4e5f6-a7b8-4c9d-8e1f-2a3b4c5d6e7f'
export const BUILD_TIME_STRIPE_CUSTOMER_ID = 'cus_build_time_test_123'
// Dedicated data for bundle-semver-validation tests (isolated to prevent interference)
export const SEMVER_ORG_ID = 'd4e5f6a7-b8c9-4d0e-9f2a-3b4c5d6e7f80'
export const SEMVER_STRIPE_CUSTOMER_ID = 'cus_semver_test_123'
// Dedicated data for private-error-cases tests (isolated to prevent interference)
// This org intentionally has NO customer_id to test error cases
export const PRIVATE_ERROR_ORG_ID = 'e5f6a7b8-c9d0-4e1f-9a2b-3c4d5e6f7a82'
// Dedicated data for cli-hashed-apikey tests (isolated to prevent interference)
export const CLI_HASHED_USER_ID = 'e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a81'
export const CLI_HASHED_ORG_ID = 'f6a7b8c9-d0e1-4f2a-9b3c-4d5e6f7a8b92'
export const CLI_HASHED_APIKEY = 'a7b8c9d0-e1f2-4a3b-8c4d-5e6f7a8b9c03'
export const CLI_HASHED_STRIPE_CUSTOMER_ID = 'cus_cli_hashed_test_123'
// Dedicated data for encrypted bundles tests (isolated to prevent interference)
export const USER_ID_ENCRYPTED = 'f6a7b8c9-d0e1-4f2a-9b3c-4d5e6f708193'
export const ORG_ID_ENCRYPTED = 'a7b8c9d0-e1f2-4a3b-9c4d-5e6f7a8b9ca4'
export const APIKEY_ENCRYPTED = 'b8c9d0e1-f2a3-4b4c-9d5e-6f7a8b9c0d14'
export const APP_NAME_ENCRYPTED = 'com.encrypted.app'
export const STRIPE_CUSTOMER_ID_ENCRYPTED = 'cus_encrypted_test_123'
export const USER_EMAIL = 'test@capgo.app'
export const USER_PASSWORD = 'testtest'
export const TEST_EMAIL = 'test@test.com'
export const USER_ID_NONMEMBER = '11111111-1111-4111-8111-111111111110'
export const USER_EMAIL_NONMEMBER = 'nonmember@capgo.app'
export const USER_PASSWORD_NONMEMBER = 'testtest'
export const PRODUCT_ID = 'prod_LQIregjtNduh4q'
export const USER_ADMIN_EMAIL = 'admin@capgo.app'
export const APP_NAME = 'com.demo'
export const NON_ACCESS_APP_NAME = 'com.demoadmin.app'
export const headers = {
  'Content-Type': 'application/json',
  'Authorization': APIKEY_TEST_ALL,
}
export const headersStats = {
  'Content-Type': 'application/json',
  'Authorization': APIKEY_STATS,
}
export const headersInternal = {
  'Content-Type': 'application/json',
  'apisecret': API_SECRET,
}

/**
 * Fetch with automatic retry for transient network failures.
 * Useful for tests that may fail due to edge function cold starts or connection issues.
 */
export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  maxRetries = 3,
  delayMs = 500,
): Promise<Response> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options)
      // Only retry on 503 (service unavailable) or network errors
      if (response.status === 503 && attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)))
        continue
      }
      return response
    }
    catch (error) {
      lastError = error as Error
      // Retry on network errors (fetch failed, socket closed, etc.)
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)))
        continue
      }
    }
  }

  throw lastError || new Error(`Failed after ${maxRetries} retries`)
}

// Cache for prepared apps to avoid repeated seeding
const seededApps = new Map<string, Set<string>>()
const seedPromises = new Map<string, Promise<void>>()

export interface SeedAppOptions {
  orgId?: string
  userId?: string
  adminUserId?: string
  stripeCustomerId?: string
  planProductId?: string
}

function getSeedOptionKey(options?: SeedAppOptions): string {
  if (!options)
    return '__default__'
  return JSON.stringify({
    orgId: options.orgId ?? null,
    userId: options.userId ?? null,
    adminUserId: options.adminUserId ?? null,
    stripeCustomerId: options.stripeCustomerId ?? null,
    planProductId: options.planProductId ?? null,
  })
}

// Connection pool to reduce database connection overhead
let supabaseClient: SupabaseClient<Database> | null = null

export interface BaseTestData {
  channel: string
  platform: string
  device_id: string
  app_id: string
  custom_id: string
  version_build: string
  version_code: string
  version_os: string
  version_name: string
  plugin_version: string
  is_emulator: boolean
  is_prod: boolean
  defaultChannel?: string
}

export function makeBaseData(appId: string): BaseTestData {
  return {
    channel: 'production',
    platform: 'android',
    device_id: '00009a6b-eefe-490a-9c60-8e965132ae51',
    app_id: appId,
    custom_id: '',
    version_build: '1.0.0',
    version_code: '1',
    version_os: '13',
    version_name: '1.0.0',
    plugin_version: '7.0.0',
    is_emulator: false,
    is_prod: true,
  }
}

export function getVersionFromAction(action: string): string {
  const sanitizedAction = action.replace(/[^0-9a-z-]/gi, '-')
  return `1.0.0-${sanitizedAction}.1`
}

export async function createAppVersions(version: string, appId: string) {
  const supabase = getSupabaseClient()
  const { error, data } = await supabase.from('app_versions').upsert({
    app_id: appId,
    name: version,
    owner_org: ORG_ID,
  }, {
    onConflict: 'app_id,name',
  }).select('id,name').single()
  if (error) {
    console.error(`Error creating app_version for ${version}:`, error)
  }
  if (!data) {
    throw new Error(`Error creating app_version for ${version}: no data`)
  }
  return data
}

export function getBaseData(appId: string): Partial<ReturnType<typeof makeBaseData>> {
  return structuredClone(makeBaseData(appId))
}
export type HttpMethod = 'POST' | 'PUT' | 'DELETE'

export async function fetchBundle(appId: string) {
  const params = new URLSearchParams({ app_id: appId })
  const response = await fetch(`${getEndpointUrl('/bundle')}?${params.toString()}`, {
    method: 'GET',
    headers,
  })
  return { response, data: await response.json() }
}

// Optimized app seeding with caching and deduplication
export async function resetAndSeedAppData(appId: string, options?: SeedAppOptions): Promise<void> {
  const optionKey = getSeedOptionKey(options)
  const seededForApp = seededApps.get(appId)
  if (seededForApp?.has(optionKey)) {
    return
  }

  const promiseKey = `${appId}::${optionKey}`
  if (seedPromises.has(promiseKey)) {
    return await seedPromises.get(promiseKey)!
  }

  // Start seeding process
  const seedPromise = (async () => {
    try {
      const supabase = getSupabaseClient()

      // Use a single transaction with retry logic and proper isolation
      let retries = 3
      while (retries > 0) {
        try {
          // Execute in a transaction with repeatable read isolation
          const rpcParams: Record<string, unknown> = { p_app_id: appId }
          if (options?.orgId)
            rpcParams.p_org_id = options.orgId
          if (options?.userId)
            rpcParams.p_user_id = options.userId
          if (options?.adminUserId)
            rpcParams.p_admin_user_id = options.adminUserId
          if (options?.stripeCustomerId)
            rpcParams.p_stripe_customer_id = options.stripeCustomerId
          if (options?.planProductId)
            rpcParams.p_plan_product_id = options.planProductId

          const { error } = await supabase.rpc('reset_and_seed_app_data' as any, rpcParams)
          if (error) {
            throw error
          }
          const updatedSet = seededApps.get(appId) ?? new Set<string>()
          updatedSet.add(optionKey)
          seededApps.set(appId, updatedSet)

          // Trigger D1 sync for Cloudflare Workers tests
          break
        }
        catch (error: any) {
          retries--
          if (retries === 0) {
            throw error
          }
          // Wait before retry to avoid deadlock with exponential backoff
          await new Promise(resolve => setTimeout(resolve, 100 * (4 - retries) + Math.random() * 200))
        }
      }
    }
    finally {
      seedPromises.delete(promiseKey)
    }
  })()

  seedPromises.set(promiseKey, seedPromise)
  return await seedPromise
}

export async function resetAppData(appId: string): Promise<void> {
  try {
    const supabase = getSupabaseClient()

    // Use retry logic for cleanup
    let retries = 3
    while (retries > 0) {
      try {
        const { error } = await supabase.rpc('reset_app_data' as any, { p_app_id: appId })
        if (error) {
          throw error
        }
        seededApps.delete(appId)
        for (const key of Array.from(seedPromises.keys())) {
          if (key.startsWith(`${appId}::`))
            seedPromises.delete(key)
        }
        break
      }
      catch (error: any) {
        retries--
        if (retries === 0) {
          throw error
        }
        await new Promise(resolve => setTimeout(resolve, 50 * (4 - retries) + Math.random() * 100))
      }
    }
  }
  catch (error) {
    console.warn(`Failed to reset app data for ${appId}:`, error)
    // Don't throw to avoid test failures during cleanup
  }
}

export async function resetAndSeedAppDataStats(appId: string): Promise<void> {
  try {
    const supabase = getSupabaseClient()

    let retries = 3
    while (retries > 0) {
      try {
        const { error } = await supabase.rpc('reset_and_seed_app_stats_data' as any, { p_app_id: appId })
        if (error) {
          throw error
        }

        // Trigger D1 sync for Cloudflare Workers tests
        break
      }
      catch (error: any) {
        retries--
        if (retries === 0) {
          throw error
        }
        await new Promise(resolve => setTimeout(resolve, 50 * (4 - retries) + Math.random() * 100))
      }
    }
  }
  catch (error) {
    console.warn(`Failed to reset app stats data for ${appId}:`, error)
  }
}

export async function resetAppDataStats(appId: string): Promise<void> {
  try {
    const supabase = getSupabaseClient()

    let retries = 3
    while (retries > 0) {
      try {
        const { error } = await supabase.rpc('reset_app_stats_data' as any, { p_app_id: appId })
        if (error) {
          throw error
        }
        break
      }
      catch (error: any) {
        retries--
        if (retries === 0) {
          throw error
        }
        await new Promise(resolve => setTimeout(resolve, 50 * (4 - retries) + Math.random() * 100))
      }
    }
  }
  catch (error) {
    console.warn(`Failed to reset app stats data for ${appId}:`, error)
  }
}

export function getSupabaseClient(): SupabaseClient<Database> {
  if (!supabaseClient) {
    const supabaseUrl = env.SUPABASE_URL ?? ''
    const supabaseServiceKey = env.SUPABASE_SERVICE_KEY ?? ''
    const supabaseFetch = async (url: RequestInfo | URL, options?: RequestInit) => {
      const maxRetries = 3
      let lastError: unknown
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const response = await fetch(url, options)
          if (response.status === 503 && attempt < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)))
            continue
          }
          return response
        }
        catch (error) {
          lastError = error
          if (attempt < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)))
            continue
          }
        }
      }
      throw lastError ?? new Error('Supabase fetch failed')
    }
    supabaseClient = createClient<Database>(supabaseUrl, supabaseServiceKey, {
      db: {
        schema: 'public',
      },
      global: {
        fetch: supabaseFetch,
      },
      auth: {
        persistSession: false,
      },
      realtime: {
        params: {
          eventsPerSecond: 2,
        },
      },
    })
  }
  return supabaseClient
}

// Batch operations to reduce database load
export async function batchResetAndSeedApps(appIds: string[]): Promise<void> {
  // Process in smaller batches to avoid overwhelming the database
  const batchSize = 3
  for (let i = 0; i < appIds.length; i += batchSize) {
    const batch = appIds.slice(i, i + batchSize)
    await Promise.all(batch.map(appId => resetAndSeedAppData(appId)))
  }
}

export async function seedTestData(supabase: SupabaseClient, appId: string) {
  const { error } = await supabase.rpc('seed_test_data', { p_app_id: appId })
  if (error)
    throw error
}

export async function createDemoApp(supabase: SupabaseClient, appId: string) {
  const { error } = await supabase.from('apps').insert({ id: appId })
  if (error)
    throw error
}

export function generateUniqueAppId(testName: string): string {
  return `com.demo.${testName.toLowerCase().replace(/\s/g, '_')}_${Date.now()}`
}

export async function cleanupDemoApp(supabase: SupabaseClient, appId: string) {
  const { error } = await supabase.from('apps').delete().eq('id', appId)
  if (error)
    throw error
}

export function updateAndroidBaseData(appId: string) {
  return {
    platform: 'android',
    device_id: '00009a6b-eefe-490a-9c60-8e965132ae51',
    app_id: appId,
    custom_id: '',
    version_build: '1.0',
    version_code: '1',
    version_os: '13',
    version_name: '1.0.0',
    plugin_version: '5.2.1',
    is_emulator: false,
    is_prod: true,
  }
}

export async function responseOk(response: Response, requestName: string): Promise<void> {
  const cloneResponse = response.clone()
  if (!cloneResponse.ok) {
    throw new Error(`${requestName} response not ok: ${cloneResponse.status} ${cloneResponse.statusText} ${await cloneResponse.text()}`)
  }
}

export async function getUpdate(data: ReturnType<typeof updateAndroidBaseData>): Promise<Response> {
  return await fetch(getEndpointUrl('/updates'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })
}

export function getUpdateBaseData(appId: string): ReturnType<typeof updateAndroidBaseData> {
  return JSON.parse(JSON.stringify(updateAndroidBaseData(appId)))
}

export async function postUpdate(data: object) {
  const response = await fetch(getEndpointUrl('/updates'), {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  })
  return response
}

export interface DeviceLink {
  channel?: string
  platform?: string
  device_id?: string
  app_id?: string
  custom_id?: string
  version_build?: string
  version_code?: string
  version_os?: string
  version_name?: string
  plugin_version?: string
  is_emulator?: boolean
  is_prod?: boolean
  defaultChannel?: string
}

// Cleanup function for tests
export async function cleanup(): Promise<void> {
  seededApps.clear()
  seedPromises.clear()
  if (supabaseClient) {
    // Close connections if needed
    supabaseClient = null
  }
}

// PostgreSQL direct connection helpers
let pool: Pool | null = null

export async function getPostgresClient(): Promise<Pool> {
  if (!pool) {
    pool = new Pool({
      connectionString: POSTGRES_URL,
      max: 1,
      idleTimeoutMillis: 2000,
    })
  }
  return pool
}

export async function executeSQL(query: string, params?: any[]): Promise<any> {
  const client = await getPostgresClient()
  const result = await client.query(query, params || [])
  return result.rows
}

export async function getCronPlanQueueCount(): Promise<number> {
  const result = await executeSQL('SELECT COUNT(*) as count FROM pgmq.q_cron_stat_org')
  return Number.parseInt(result[0]?.count || '0')
}

export async function getLatestCronPlanMessage(): Promise<any> {
  const result = await executeSQL('SELECT message FROM pgmq.q_cron_stat_org ORDER BY msg_id DESC LIMIT 1')
  return result[0]?.message
}

export async function cleanupPostgresClient(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}
