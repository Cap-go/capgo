import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, USER_ID_2, getSupabaseClient, resetAndSeedAppData, resetAppData } from './test-utils.ts'

describe('Build Endpoints Job/App Binding', () => {
  const id = randomUUID()
  const appA = `com.test.buildscope.a.${id}`
  const appB = `com.test.buildscope.b.${id}`
  const jobIdB = `job_${id.replaceAll('-', '')}`

  // Dedicated org/user to avoid parallel test files resetting shared seed data.
  const orgId = randomUUID()
  const userId = USER_ID_2
  const stripeCustomerId = `cus_buildscope_${id.replaceAll('-', '').slice(0, 16)}`

  let readKey = ''
  let writeKey = ''
  let apikeyIds: number[] = []

  let buildRequestId: string | null = null

  beforeAll(async () => {
    await Promise.all([
      resetAndSeedAppData(appA, { orgId, userId, stripeCustomerId }),
      resetAndSeedAppData(appB, { orgId, userId, stripeCustomerId }),
    ])

    const supabase = getSupabaseClient()

    const { data: buildRequest, error: buildRequestError } = await supabase
      .from('build_requests')
      .insert({
        app_id: appB,
        owner_org: orgId,
        requested_by: userId,
        platform: 'android',
        build_mode: 'release',
        build_config: {},
        status: 'pending',
        builder_job_id: jobIdB,
        upload_session_key: `test-upload-session-${id}`,
        upload_path: `/tmp/test-buildscope-${id}`,
        upload_url: 'https://example.com/upload',
        upload_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single()

    if (buildRequestError || !buildRequest) {
      throw buildRequestError ?? new Error('Failed to create build_request for test')
    }

    buildRequestId = buildRequest.id

    const { error: keyInsertError } = await supabase
      .from('apikeys')
      .insert([
        {
          user_id: userId,
          key: null,
          mode: 'read',
          name: `test-build-job-scope-read-${id}`,
          limited_to_orgs: [orgId],
          limited_to_apps: [appA],
        },
        {
          user_id: userId,
          key: null,
          mode: 'write',
          name: `test-build-job-scope-write-${id}`,
          limited_to_orgs: [orgId],
          limited_to_apps: [appA],
        },
      ])
      .select('id, key, mode')

    if (keyInsertError) {
      throw keyInsertError
    }

    // The DB forces server-side key generation; we must use the returned keys.
    // See supabase/migrations/20260206120000_apikey_server_generation.sql
    const { data: insertedKeys, error: keyFetchError } = await supabase
      .from('apikeys')
      .select('id, key, mode')
      .eq('user_id', userId)
      .in('name', [`test-build-job-scope-read-${id}`, `test-build-job-scope-write-${id}`])

    if (keyFetchError || !insertedKeys?.length) {
      throw keyFetchError ?? new Error('Failed to fetch generated API keys for build job scope test')
    }

    const readRow = insertedKeys.find(k => k.mode === 'read')
    const writeRow = insertedKeys.find(k => k.mode === 'write')
    if (!readRow?.key || !writeRow?.key) {
      throw new Error('Seeded API keys missing generated key values')
    }

    readKey = readRow.key
    writeKey = writeRow.key
    apikeyIds = insertedKeys.map(k => k.id)
  })

  afterAll(async () => {
    const supabase = getSupabaseClient()

    if (buildRequestId) {
      await supabase.from('build_requests').delete().eq('id', buildRequestId)
    }

    if (apikeyIds.length) {
      await supabase.from('apikeys').delete().in('id', apikeyIds)
    }

    await Promise.all([
      resetAppData(appA),
      resetAppData(appB),
    ])
  })

  it.concurrent('GET /build/status denies cross-app job_id with allowed app_id', async () => {
    const url = new URL(`${BASE_URL}/build/status`)
    url.searchParams.set('job_id', jobIdB)
    url.searchParams.set('app_id', appA)
    url.searchParams.set('platform', 'android')

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: readKey,
        'Content-Type': 'application/json',
      },
    })

    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data).toHaveProperty('error', 'unauthorized')
  })

  it.concurrent('GET /build/logs/:jobId denies cross-app jobId with allowed app_id', async () => {
    const url = new URL(`${BASE_URL}/build/logs/${jobIdB}`)
    url.searchParams.set('app_id', appA)

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: readKey,
        'Content-Type': 'application/json',
      },
    })

    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data).toHaveProperty('error', 'unauthorized')
  })

  it.concurrent('POST /build/cancel/:jobId denies cross-app jobId with allowed app_id', async () => {
    const response = await fetch(`${BASE_URL}/build/cancel/${jobIdB}`, {
      method: 'POST',
      headers: {
        Authorization: writeKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ app_id: appA }),
    })

    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data).toHaveProperty('error', 'unauthorized')
  })

  it.concurrent('POST /build/start/:jobId denies cross-app jobId with allowed app_id', async () => {
    const response = await fetch(`${BASE_URL}/build/start/${jobIdB}`, {
      method: 'POST',
      headers: {
        Authorization: writeKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ app_id: appA }),
    })

    expect(response.status).toBe(400)
    const data = await response.json() as { error: string }
    expect(data).toHaveProperty('error', 'unauthorized')
  })
})
