import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, ORG_ID, USER_ID, getSupabaseClient, resetAndSeedAppData, resetAppData } from './test-utils.ts'

describe('Build Endpoints Job/App Binding', () => {
  const id = randomUUID()
  const appA = `com.test.buildscope.a.${id}`
  const appB = `com.test.buildscope.b.${id}`
  const jobIdB = `job_${id.replaceAll('-', '')}`

  const readKey = randomUUID()
  const writeKey = randomUUID()

  let buildRequestId: string | null = null

  beforeAll(async () => {
    await Promise.all([
      resetAndSeedAppData(appA),
      resetAndSeedAppData(appB),
    ])

    const supabase = getSupabaseClient()

    const { data: buildRequest, error: buildRequestError } = await supabase
      .from('build_requests')
      .insert({
        app_id: appB,
        owner_org: ORG_ID,
        requested_by: USER_ID,
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
          user_id: USER_ID,
          key: readKey,
          mode: 'read',
          name: `test-build-job-scope-read-${id}`,
          limited_to_orgs: [ORG_ID],
          limited_to_apps: [appA],
        },
        {
          user_id: USER_ID,
          key: writeKey,
          mode: 'write',
          name: `test-build-job-scope-write-${id}`,
          limited_to_orgs: [ORG_ID],
          limited_to_apps: [appA],
        },
      ])

    if (keyInsertError) {
      throw keyInsertError
    }
  })

  afterAll(async () => {
    const supabase = getSupabaseClient()

    if (buildRequestId) {
      await supabase.from('build_requests').delete().eq('id', buildRequestId)
    }

    await supabase.from('apikeys').delete().in('key', [readKey, writeKey])

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

