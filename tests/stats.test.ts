import type { Database } from '../src/types/supabase.types.ts'
import { randomUUID } from 'node:crypto'
import { env } from 'node:process'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ALLOWED_STATS_ACTIONS } from '../supabase/functions/_backend/plugins/stats_actions.ts'
import { APP_NAME, createAppVersions, getBaseData, getSupabaseClient, getVersionFromAction, headers, PLUGIN_BASE_URL, resetAndSeedAppData, resetAndSeedAppDataStats, resetAppData, resetAppDataStats, triggerD1Sync } from './test-utils.ts'

const id = randomUUID()
const APP_NAME_STATS = `${APP_NAME}.${id}`

// Check if we're using Cloudflare Workers (which requires sequential tests due to D1 sync)
const USE_CLOUDFLARE = env.USE_CLOUDFLARE_WORKERS === 'true'

interface StatsRes {
  error?: string
  message?: string
  status?: string
}

type StatsAction = Database['public']['Enums']['stats_action']

interface StatsPayload extends ReturnType<typeof getBaseData> {
  action: StatsAction
}

async function postStats(data: object) {
  const response = await fetch(`${PLUGIN_BASE_URL}/stats`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  })
  return response
}

beforeAll(async () => {
  await resetAndSeedAppData(APP_NAME_STATS)
  await resetAndSeedAppDataStats(APP_NAME_STATS)
})

afterAll(async () => {
  await resetAppData(APP_NAME_STATS)
  await resetAppDataStats(APP_NAME_STATS)
})

describe('stats Action Types', () => {
  it('test ALL_STATS_ACTIONS should contain all possible stats actions', () => {
    // Verify each action is unique
    const uniqueActions = new Set(ALLOWED_STATS_ACTIONS)
    expect(uniqueActions.size).toBe(ALLOWED_STATS_ACTIONS.length)

    // Verify version generation is unique and valid semver
    const versions = ALLOWED_STATS_ACTIONS.map(action => getVersionFromAction(action))
    const uniqueVersions = new Set(versions)
    expect(uniqueVersions.size).toBe(ALLOWED_STATS_ACTIONS.length)
    // Verify all versions match semver pattern
    expect(versions.every(_v => /^\d+\.\d+\.\d+(-[0-9A-Z-]+)?$/i)).toBe(true)
    type StatsActionEnum = Database['public']['Enums']['stats_action']
    const assertEqual = <T extends readonly StatsActionEnum[]>(value: T) => value
    assertEqual(ALLOWED_STATS_ACTIONS)
  })
})
describe('test valid and invalid cases of version_build', () => {
  it('test valid and invalid cases of version_build', async () => {
    const uuid = randomUUID().toLowerCase()
    const baseData = getBaseData(APP_NAME_STATS) as StatsPayload
    baseData.device_id = uuid
    baseData.action = 'set'

    // Test valid version_build
    baseData.version_build = getVersionFromAction('set')
    const version = await createAppVersions(baseData.version_build, APP_NAME_STATS)
    baseData.version_name = version.name
    await triggerD1Sync() // Sync the newly created version to D1

    let response = await postStats(baseData)
    expect(response.status).toBe(200)
    let responseData = await response.json<StatsRes>()
    expect(responseData.status).toBe('ok')

    // Check version_build
    const { error: deviceError, data: deviceData } = await getSupabaseClient().from('devices').select().eq('device_id', uuid).eq('app_id', APP_NAME_STATS).single()
    expect(deviceError).toBeNull()
    expect(deviceData).toBeTruthy()
    expect(deviceData?.version_build).toBe(baseData.version_build)

    // Test invalid version_build
    baseData.version_build = 'invalid_version'

    //  count devices
    const deviceCountData = await getSupabaseClient()
      .from('devices')
      .select('*', { count: 'exact' })
      .eq('app_id', APP_NAME_STATS)
      .then((v) => {
        // console.log({ v })
        return v.count
      })
    baseData.device_id = randomUUID().toLowerCase()
    response = await postStats(baseData)
    expect(response.status).toBe(400)
    responseData = await response.json<StatsRes>()
    expect(responseData.error).toBe('semver_error')
    const deviceCountData2 = await getSupabaseClient()
      .from('devices')
      .select('*', { count: 'exact' })
      .eq('app_id', APP_NAME_STATS)
      .then((v) => {
        // console.log({ v })
        return v.count
      })
    expect(deviceCountData2).toBe(deviceCountData)

    // Clean up
    await getSupabaseClient().from('devices').delete().eq('device_id', uuid).eq('app_id', APP_NAME_STATS)
  })
})

describe('[POST] /stats', () => {
  it('create new device and log stats action', async () => {
    const uuid = randomUUID().toLowerCase()
    const baseData = getBaseData(APP_NAME_STATS) as StatsPayload
    baseData.device_id = uuid
    baseData.action = 'set'
    baseData.version_build = getVersionFromAction('set')

    const version = await createAppVersions(baseData.version_build, APP_NAME_STATS)
    baseData.version_name = version.name
    await triggerD1Sync() // Sync the newly created version to D1
    const response = await postStats(baseData)
    expect(response.status).toBe(200)
    expect(await response.json<StatsRes>()).toEqual({ status: 'ok' })

    // Check device creation
    const { error: deviceError, data: deviceData } = await getSupabaseClient().from('devices').select().eq('device_id', uuid).eq('app_id', APP_NAME_STATS).single()
    expect(deviceError).toBeNull()
    expect(deviceData).toBeTruthy()
    expect(deviceData?.app_id).toBe(baseData.app_id)
    expect(deviceData?.version_name).toBe(version.name)

    // Check stats log
    const { error: statsError, data: statsData } = await getSupabaseClient().from('stats').select().eq('device_id', uuid).eq('app_id', APP_NAME_STATS).single()
    expect(statsError).toBeNull()
    expect(statsData).toBeTruthy()
    expect(statsData?.action).toBe('set')
    expect(statsData?.device_id).toBe(uuid)

    // Clean up
    await getSupabaseClient().from('devices').delete().eq('device_id', uuid).eq('app_id', APP_NAME_STATS)
  })

  // Test each stats action - concurrent for Supabase, sequential for Cloudflare (due to D1 sync)
  // Cloudflare Workers use D1 which requires sequential sync, Supabase can run concurrently
  const testDescribe = USE_CLOUDFLARE ? describe : describe.concurrent
  const testIt = USE_CLOUDFLARE ? it : it.concurrent

  testDescribe('test all possible stats actions', () => {
    for (const action of ALLOWED_STATS_ACTIONS) {
      testIt(`should handle ${action} action`, async () => {
        const uuid = randomUUID().toLowerCase()
        const baseData = getBaseData(APP_NAME_STATS) as StatsPayload
        baseData.device_id = uuid
        baseData.action = action
        baseData.version_build = getVersionFromAction(action)

        const version = await createAppVersions(baseData.version_build, APP_NAME_STATS)
        baseData.version_name = version.name
        baseData.version_code = '2'
        baseData.version_os = '16.1'
        baseData.custom_id = 'test2'
        await triggerD1Sync() // Sync the newly created version to D1

        const response = await postStats(baseData)
        const responseData = await response.json<StatsRes>()
        expect(response.status).toBe(200)
        expect(responseData.status).toBe('ok')

        // Verify stats entry
        const { error: statsError, data: statsData } = await getSupabaseClient()
          .from('stats')
          .select()
          .eq('device_id', uuid)
          .eq('app_id', APP_NAME_STATS)
          .eq('action', action)
          .single()

        expect(statsError).toBeNull()
        expect(statsData).toBeTruthy()
        expect(statsData?.action).toBe(action)
        expect(statsData?.device_id).toBe(uuid)

        // Verify device state
        const { error: deviceError, data: deviceData } = await getSupabaseClient()
          .from('devices')
          .select()
          .eq('device_id', uuid)
          .eq('app_id', APP_NAME_STATS)
          .single()

        expect(deviceError).toBeNull()
        expect(deviceData).toBeTruthy()
        expect(deviceData?.version_build).toBe(baseData.version_build)
        expect(deviceData?.version_name).toBe(version.name)
        expect(deviceData?.os_version).toBe('16.1')
        expect(deviceData?.plugin_version).toBe('7.0.0')
        expect(deviceData?.custom_id).toBe('test2')

        // Clean up
        await getSupabaseClient().from('devices').delete().eq('device_id', uuid).eq('app_id', APP_NAME_STATS)
      })
    }
  })

  it('app that does not exist', async () => {
    const baseData = getBaseData(APP_NAME_STATS) as StatsPayload
    baseData.app_id = 'does.not.exist'
    baseData.action = 'get'
    baseData.version_build = getVersionFromAction('get')
    const version = await createAppVersions(baseData.version_build, APP_NAME_STATS)
    baseData.version_name = version.name
    await triggerD1Sync() // Sync the newly created version to D1

    const response = await postStats(baseData)
    expect(response.status).toBe(429)
    const json = await response.json<StatsRes>()
    // console.log({ json })
    expect(json.error).toBe('on_premise_app')
  })

  it('invalid action should fail', async () => {
    const baseData = getBaseData(APP_NAME_STATS) as StatsPayload
    baseData.action = 'invalid_action' as StatsAction
    baseData.version_build = getVersionFromAction('invalid_action')
    const version = await createAppVersions(baseData.version_build, APP_NAME_STATS)
    baseData.version_name = version.name
    await triggerD1Sync() // Sync the newly created version to D1

    const response = await postStats(baseData)
    expect(response.status).toBe(400)
    const json = await response.json<StatsRes>()
    expect(json.error).toBeTruthy()
  })

  it('saves default_channel when provided', async () => {
    const uuid = randomUUID().toLowerCase()
    const testDefaultChannel = 'dev'

    const baseData = getBaseData(APP_NAME_STATS) as StatsPayload
    baseData.action = 'set'
    baseData.device_id = uuid
    baseData.defaultChannel = testDefaultChannel
    baseData.version_build = getVersionFromAction('set')
    const version = await createAppVersions(baseData.version_build, APP_NAME_STATS)
    baseData.version_name = version.name
    await triggerD1Sync()

    const response = await postStats(baseData)
    expect(response.status).toBe(200)

    // Wait for data to be written
    await triggerD1Sync()
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Verify default_channel was saved
    const { error, data } = await getSupabaseClient()
      .from('devices')
      .select('default_channel')
      .eq('device_id', uuid)
      .eq('app_id', APP_NAME_STATS)
      .single()

    expect(error).toBeNull()
    expect(data).toBeTruthy()
    expect(data?.default_channel).toBe(testDefaultChannel)

    // Clean up
    await getSupabaseClient().from('devices').delete().eq('device_id', uuid).eq('app_id', APP_NAME_STATS)
  })

  it('updates default_channel when changed', async () => {
    const uuid = randomUUID().toLowerCase()
    const initialChannel = 'staging'
    const updatedChannel = 'production'

    const baseData = getBaseData(APP_NAME_STATS) as StatsPayload
    baseData.action = 'set'
    baseData.device_id = uuid
    baseData.defaultChannel = initialChannel
    baseData.version_build = getVersionFromAction('set')
    const version = await createAppVersions(baseData.version_build, APP_NAME_STATS)
    baseData.version_name = version.name
    await triggerD1Sync()

    // First request with initial channel
    let response = await postStats(baseData)
    expect(response.status).toBe(200)

    await triggerD1Sync()
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Verify initial channel was saved
    let result = await getSupabaseClient()
      .from('devices')
      .select('default_channel')
      .eq('device_id', uuid)
      .eq('app_id', APP_NAME_STATS)
      .single()

    expect(result.error).toBeNull()
    expect(result.data?.default_channel).toBe(initialChannel)

    // Second request with updated channel
    baseData.defaultChannel = updatedChannel
    response = await postStats(baseData)
    expect(response.status).toBe(200)

    await triggerD1Sync()
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Verify channel was updated
    result = await getSupabaseClient()
      .from('devices')
      .select('default_channel')
      .eq('device_id', uuid)
      .eq('app_id', APP_NAME_STATS)
      .single()

    expect(result.error).toBeNull()
    expect(result.data?.default_channel).toBe(updatedChannel)

    // Clean up
    await getSupabaseClient().from('devices').delete().eq('device_id', uuid).eq('app_id', APP_NAME_STATS)
  })

  it('unsets default_channel when not provided', async () => {
    const uuid = randomUUID().toLowerCase()
    const initialChannel = 'beta'

    const baseData = getBaseData(APP_NAME_STATS) as StatsPayload
    baseData.action = 'set'
    baseData.device_id = uuid
    baseData.defaultChannel = initialChannel
    baseData.version_build = getVersionFromAction('set')
    const version = await createAppVersions(baseData.version_build, APP_NAME_STATS)
    baseData.version_name = version.name
    await triggerD1Sync()

    // First request with channel set
    let response = await postStats(baseData)
    expect(response.status).toBe(200)

    await triggerD1Sync()
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Verify channel was saved
    let result = await getSupabaseClient()
      .from('devices')
      .select('default_channel')
      .eq('device_id', uuid)
      .eq('app_id', APP_NAME_STATS)
      .single()

    expect(result.error).toBeNull()
    expect(result.data?.default_channel).toBe(initialChannel)

    // Second request without defaultChannel (undefined)
    delete baseData.defaultChannel
    response = await postStats(baseData)
    expect(response.status).toBe(200)

    await triggerD1Sync()
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Verify channel was unset (should be null)
    result = await getSupabaseClient()
      .from('devices')
      .select('default_channel')
      .eq('device_id', uuid)
      .eq('app_id', APP_NAME_STATS)
      .single()

    expect(result.error).toBeNull()
    expect(result.data?.default_channel).toBeNull()

    // Clean up
    await getSupabaseClient().from('devices').delete().eq('device_id', uuid).eq('app_id', APP_NAME_STATS)
  })
})
