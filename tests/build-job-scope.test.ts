import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, createDirectApiKeyWithBindings, getSupabaseClient, resetAndSeedAppData, resetAppData, USER_ID_2 } from './test-utils.ts'

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
    // Seed sequentially to avoid unique constraint races (orgs/stripe_info share IDs).
    await resetAndSeedAppData(appA, { orgId, userId, stripeCustomerId })
    await resetAndSeedAppData(appB, { orgId, userId, stripeCustomerId })

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

    const readRow = await createDirectApiKeyWithBindings({
      userId,
      key: randomUUID(),
      name: `test-build-job-scope-read-${id}`,
      orgId,
      roleName: 'org_member',
      appId: appA,
      appRoleName: 'app_reader',
    })
    const writeRow = await createDirectApiKeyWithBindings({
      userId,
      key: randomUUID(),
      name: `test-build-job-scope-write-${id}`,
      orgId,
      roleName: 'org_member',
      appId: appA,
      appRoleName: 'app_developer',
    })
    if (!readRow?.key || !writeRow?.key) {
      throw new Error('Seeded API keys missing generated key values')
    }

    readKey = readRow.key
    writeKey = writeRow.key
    apikeyIds = [readRow.id, writeRow.id]
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
