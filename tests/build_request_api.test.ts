import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { BASE_URL, getSupabaseClient, ORG_ID, PRODUCT_ID, resetAndSeedAppData, resetAppData, STRIPE_INFO_CUSTOMER_ID, TEST_EMAIL, USER_ID } from './test-utils.ts'

const id = randomUUID()
const APPNAME = `com.cp.${id}`

const headers = {
  'Content-Type': 'application/json',
  'authorization': 'ae6e7458-c46d-4c00-aa3b-153b0b8520ea', // test user 'all' mode API key
}

beforeEach(async () => {
  await resetAndSeedAppData(APPNAME)
  const supabase = getSupabaseClient()

  const { error } = await supabase
    .from('stripe_info')
    .upsert([
      {
        subscription_id: 'sub_2',
        customer_id: STRIPE_INFO_CUSTOMER_ID,
        status: 'succeeded' as const,
        product_id: PRODUCT_ID,
        trial_at: new Date(0).toISOString(),
        is_good_plan: true,
        plan_usage: 2,
        subscription_metered: {},
        subscription_anchor_start: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        subscription_anchor_end: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ], { onConflict: 'customer_id' })
  expect(error).toBeFalsy()

  const { error: orgError } = await supabase.from('orgs').upsert([
    {
      id: ORG_ID,
      customer_id: STRIPE_INFO_CUSTOMER_ID,
      name: 'Test Org Build',
      created_by: USER_ID,
      management_email: TEST_EMAIL,
    },
  ], { onConflict: 'id' })
  expect(orgError).toBeFalsy()

  const { error: appError } = await supabase.from('apps').upsert([
    {
      owner_org: ORG_ID,
      name: 'Test App Build',
      app_id: APPNAME,
      icon_url: 'https://example.com/icon.png',
    },
  ], { onConflict: 'app_id' })
  expect(appError).toBeFalsy()

  // Add org_users entry so the user has write access
  // First delete any existing entries to avoid duplicates
  await supabase.from('org_users')
    .delete()
    .eq('org_id', ORG_ID)
    .eq('user_id', USER_ID)

  const { error: orgUserError } = await supabase.from('org_users').insert([
    {
      org_id: ORG_ID,
      user_id: USER_ID,
      user_right: 'super_admin' as const,
    },
  ])
  expect(orgUserError).toBeFalsy()
})

afterAll(async () => {
  await resetAppData(APPNAME)
  const supabase = getSupabaseClient()

  // Clean up build requests
  await supabase
    .from('build_requests')
    .delete()
    .eq('app_id', APPNAME)
})

describe('Build Request API', () => {
  it('should successfully request a build', async () => {
    const response = await fetch(`${BASE_URL}/build`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: APPNAME,
        platform: 'ios',
        build_mode: 'release',
      }),
    })

    expect(response.status).toBe(200)
    const result = await response.json()

    expect(result).toHaveProperty('build_request_id')
    expect(result).toHaveProperty('upload_session_key')
    expect(result).toHaveProperty('upload_path')
    expect(result).toHaveProperty('upload_url')
    expect(result).toHaveProperty('upload_expires_at')
    expect(result).toHaveProperty('status')
    expect(result.status).toBe('pending')

    // Verify build request was created in database
    const supabase = getSupabaseClient()
    const { data: buildRequest, error } = await supabase
      .from('build_requests')
      .select('*')
      .eq('id', result.build_request_id)
      .single()

    expect(error).toBeFalsy()
    expect(buildRequest).toBeTruthy()
    expect(buildRequest?.app_id).toBe(APPNAME)
    expect(buildRequest?.platform).toBe('ios')
    expect(buildRequest?.build_mode).toBe('release')
    expect(buildRequest?.status).toBe('pending')
  })

  it('should support "both" platform', async () => {
    const response = await fetch(`${BASE_URL}/build`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: APPNAME,
        platform: 'both',
        build_mode: 'debug',
      }),
    })

    expect(response.status).toBe(200)
    const result = await response.json()

    const supabase = getSupabaseClient()
    const { data: buildRequest } = await supabase
      .from('build_requests')
      .select('*')
      .eq('id', result.build_request_id)
      .single()

    expect(buildRequest?.platform).toBe('both')
    expect(buildRequest?.build_mode).toBe('debug')
  })

  it('should support build_config parameter', async () => {
    const buildConfig = {
      envVars: { API_URL: 'https://api.example.com' },
      buildNumber: 123,
    }

    const response = await fetch(`${BASE_URL}/build`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: APPNAME,
        platform: 'android',
        build_mode: 'release',
        build_config: buildConfig,
      }),
    })

    expect(response.status).toBe(200)
    const result = await response.json()

    const supabase = getSupabaseClient()
    const { data: buildRequest } = await supabase
      .from('build_requests')
      .select('*')
      .eq('id', result.build_request_id)
      .single()

    expect(buildRequest?.build_config).toEqual(buildConfig)
  })

  it('should reject invalid platform', async () => {
    const response = await fetch(`${BASE_URL}/build`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: APPNAME,
        platform: 'windows',
      }),
    })

    expect(response.status).toBe(400)
  })

  it('should reject missing app_id', async () => {
    const response = await fetch(`${BASE_URL}/build`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        platform: 'ios',
      }),
    })

    expect(response.status).toBe(400)
  })

  it('should reject missing platform', async () => {
    const response = await fetch(`${BASE_URL}/build`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: APPNAME,
      }),
    })

    expect(response.status).toBe(400)
  })

  it('should reject unauthorized access', async () => {
    const response = await fetch(`${BASE_URL}/build`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authorization': 'invalid-key',
      },
      body: JSON.stringify({
        app_id: APPNAME,
        platform: 'ios',
      }),
    })

    expect(response.status).toBe(401)
  })

  it('should generate unique upload session keys', async () => {
    const response1 = await fetch(`${BASE_URL}/build`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: APPNAME,
        platform: 'ios',
      }),
    })

    const response2 = await fetch(`${BASE_URL}/build`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: APPNAME,
        platform: 'android',
      }),
    })

    const result1 = await response1.json()
    const result2 = await response2.json()

    expect(result1.upload_session_key).not.toBe(result2.upload_session_key)
    expect(result1.build_request_id).not.toBe(result2.build_request_id)
  })

  it('should set expiration time for upload', async () => {
    const beforeRequest = new Date()

    const response = await fetch(`${BASE_URL}/build`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: APPNAME,
        platform: 'ios',
      }),
    })

    const result = await response.json()
    const expiresAt = new Date(result.upload_expires_at)

    // Should expire in approximately 1 hour
    const timeDiffMinutes = (expiresAt.getTime() - beforeRequest.getTime()) / 1000 / 60
    expect(timeDiffMinutes).toBeGreaterThan(55) // Allow some tolerance
    expect(timeDiffMinutes).toBeLessThan(65)
  })
})
