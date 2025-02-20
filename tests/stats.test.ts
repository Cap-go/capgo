import type { Database } from '../src/types/supabase.types.ts'
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { APP_NAME, BASE_URL, createAppVersions, getBaseData, getSupabaseClient, getVersionFromAction, headers, resetAndSeedAppData, resetAndSeedAppDataStats, resetAppData, resetAppDataStats } from './test-utils.ts'

const id = randomUUID()
const APP_NAME_STATS = `${APP_NAME}.${id}`

interface StatsRes {
  error?: string
  message?: string
  status?: string
}

type StatsAction = Database['public']['Enums']['stats_action']

interface StatsPayload extends ReturnType<typeof getBaseData> {
  action: StatsAction
}

// Get all possible values from the StatsAction type
const POSSIBLE_STATS_ACTIONS = [
  'delete',
  'reset',
  'set',
  'get',
  'set_fail',
  'update_fail',
  'download_fail',
  'windows_path_fail',
  'canonical_path_fail',
  'directory_path_fail',
  'unzip_fail',
  'low_mem_fail',
  'download_10',
  'download_20',
  'download_30',
  'download_40',
  'download_50',
  'download_60',
  'download_70',
  'download_80',
  'download_90',
  'download_complete',
  'decrypt_fail',
  'app_moved_to_foreground',
  'app_moved_to_background',
  'uninstall',
  'needPlanUpgrade',
  'missingBundle',
  'noNew',
  'disablePlatformIos',
  'disablePlatformAndroid',
  'disableAutoUpdateToMajor',
  'cannotUpdateViaPrivateChannel',
  'disableAutoUpdateToMinor',
  'disableAutoUpdateToPatch',
  'channelMisconfigured',
  'disableAutoUpdateMetadata',
  'disableAutoUpdateUnderNative',
  'disableDevBuild',
  'disableEmulator',
  'cannotGetBundle',
  'checksum_fail',
  'NoChannelOrOverride',
  'setChannel',
  'getChannel',
  'rateLimited',
] as const satisfies readonly StatsAction[]

const ALL_STATS_ACTIONS = [...POSSIBLE_STATS_ACTIONS]

async function postStats(data: object) {
  const response = await fetch(`${BASE_URL}/stats`, {
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
    const uniqueActions = new Set(ALL_STATS_ACTIONS)
    expect(uniqueActions.size).toBe(ALL_STATS_ACTIONS.length)

    // Verify version generation is unique and valid semver
    const versions = ALL_STATS_ACTIONS.map(action => getVersionFromAction(action))
    const uniqueVersions = new Set(versions)
    expect(uniqueVersions.size).toBe(ALL_STATS_ACTIONS.length)
    // Verify all versions match semver pattern
    expect(versions.every(_v => /^\d+\.\d+\.\d+(-[0-9A-Z-]+)?$/i)).toBe(true)
    type StatsActionEnum = Database['public']['Enums']['stats_action']
    const assertEqual = <T extends readonly StatsActionEnum[]>(value: T) => value
    assertEqual(POSSIBLE_STATS_ACTIONS)
    assertEqual(ALL_STATS_ACTIONS)
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
    const { data: deviceCountData } = await getSupabaseClient()
      .from('devices')
      .select('*', { count: 'exact' })
      .eq('app_id', APP_NAME_STATS)
      .single()
    const total = deviceCountData?.count ?? 0
    baseData.device_id = randomUUID().toLowerCase()
    response = await postStats(baseData)
    expect(response.status).toBe(200)
    responseData = await response.json<StatsRes>()
    expect(responseData.status).toBe('ok')

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
    const response = await postStats(baseData)
    expect(response.status).toBe(200)
    expect(await response.json<StatsRes>()).toEqual({ status: 'ok' })

    // Check device creation
    const { error: deviceError, data: deviceData } = await getSupabaseClient().from('devices').select().eq('device_id', uuid).eq('app_id', APP_NAME_STATS).single()
    expect(deviceError).toBeNull()
    expect(deviceData).toBeTruthy()
    expect(deviceData?.app_id).toBe(baseData.app_id)
    expect(deviceData?.version).toBe(version.id)

    // Check stats log
    const { error: statsError, data: statsData } = await getSupabaseClient().from('stats').select().eq('device_id', uuid).eq('app_id', APP_NAME_STATS).single()
    expect(statsError).toBeNull()
    expect(statsData).toBeTruthy()
    expect(statsData?.action).toBe('set')
    expect(statsData?.device_id).toBe(uuid)

    // Clean up
    await getSupabaseClient().from('devices').delete().eq('device_id', uuid).eq('app_id', APP_NAME_STATS)
  })

  it('test all possible stats actions', async () => {
    const uuid = randomUUID().toLowerCase()
    const baseData = getBaseData(APP_NAME_STATS) as StatsPayload
    baseData.device_id = uuid

    // Test all possible actions
    let versionId = 0
    for (const action of ALL_STATS_ACTIONS) {
      baseData.action = action
      baseData.version_build = getVersionFromAction(action)
      const version = await createAppVersions(baseData.version_build, APP_NAME_STATS)
      baseData.version_name = version.name
      versionId = version.id

      baseData.version_code = '2'
      baseData.version_os = '16.1'
      baseData.custom_id = 'test2'

      const response = await postStats(baseData)
      expect(response.status).toBe(200)
      expect(await response.json<StatsRes>()).toEqual({ status: 'ok' })

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
    }

    console.log({ versionId, uuid })
    // Verify final device state
    const lastAction = ALL_STATS_ACTIONS[ALL_STATS_ACTIONS.length - 1]
    const { error: deviceError, data: deviceData } = await getSupabaseClient().from('devices').select().eq('device_id', uuid).eq('app_id', APP_NAME_STATS).single()
    expect(deviceError).toBeNull()
    expect(deviceData).toBeTruthy()
    expect(deviceData?.version_build).toBe(getVersionFromAction(lastAction))
    expect(deviceData?.version).toBe(versionId)
    expect(deviceData?.os_version).toBe('16.1')
    expect(deviceData?.plugin_version).toBe('7.0.0')
    expect(deviceData?.custom_id).toBe('test2')

    // Clean up
    await getSupabaseClient().from('devices').delete().eq('device_id', uuid).eq('app_id', APP_NAME_STATS)
  })

  it('app that does not exist', async () => {
    const baseData = getBaseData(APP_NAME_STATS) as StatsPayload
    baseData.app_id = 'does.not.exist'
    baseData.action = 'get'
    baseData.version_build = getVersionFromAction('get')
    const version = await createAppVersions(baseData.version_build, APP_NAME_STATS)
    baseData.version_name = version.name

    const response = await postStats(baseData)
    expect(response.status).toBe(400)
    const json = await response.json<StatsRes>()
    console.log({ json })
    expect(json.error).toBe('app_not_found')
  })

  // TODO: fix this test
  // it.only('invalid action should fail', async () => {
  //   const baseData = getBaseData(APP_NAME_STATS) as StatsPayload
  //   baseData.action = 'invalid_action' as StatsAction
  //   baseData.version_build = getVersionFromAction('invalid_action')
  //   const version = await createAppVersions(baseData.version_build, APP_NAME_STATS)
  //   baseData.version_name = version.name

  //   const response = await postStats(baseData)
  //   expect(response.status).toBe(400)
  //   const json = await response.json<StatsRes>()
  //   console.log({ json })
  //   expect(json.error).toBeTruthy()
  // })
})
