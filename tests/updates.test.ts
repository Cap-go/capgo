import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { APP_NAME, createAppVersions, getBaseData, getSupabaseClient, getVersionFromAction, ORG_ID, postUpdate, resetAndSeedAppData, resetAppData, resetAppDataStats } from './test-utils.ts'

const id = randomUUID()
const APP_NAME_UPDATE = `${APP_NAME}.${id}`

interface UpdateRes {
  error?: string
  url?: string
  checksum?: string
  version?: string
  message?: string
  manifest?: { file_name: string | null, file_hash?: string | null, download_url?: string | null }[]
}

const updateNewScheme = z.object({
  url: z.string(),
  version: z.string(),
})

beforeAll(async () => {
  await resetAndSeedAppData(APP_NAME_UPDATE)
})
afterAll(async () => {
  await resetAppData(APP_NAME_UPDATE)
  await resetAppDataStats(APP_NAME_UPDATE)
})

describe('[POST] /updates', () => {
  it('no new version available', async () => {
    const baseData = getBaseData(APP_NAME_UPDATE)
    const response = await postUpdate(baseData)

    expect(response.status).toBe(200)
    const json = await response.json<UpdateRes>()
    expect(json.error).toEqual('no_new_version_available')
  })

  it('new version available', async () => {
    const baseData = getBaseData(APP_NAME_UPDATE)
    baseData.version_name = '1.1.0'

    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)

    const json = await response.json<UpdateRes>()
    expect(() => updateNewScheme.parse(json)).not.toThrow()
    expect(json.version).toBe('1.0.0')
  })
})

describe('channel device count gating', () => {
  const supabase = getSupabaseClient()
  let betaChannelId: number

  beforeAll(async () => {
    const { data, error } = await supabase
      .from('channels')
      .select('id')
      .eq('app_id', APP_NAME_UPDATE)
      .eq('name', 'beta')
      .single()
    if (error || !data)
      throw error ?? new Error('Missing beta channel')
    betaChannelId = data.id
  })

  async function processChannelDeviceQueue(batchSize = 25) {
    const { error } = await supabase.rpc('process_channel_device_counts_queue' as any, { batch_size: batchSize })
    if (error)
      throw error
  }

  async function cleanupDevice(deviceId: string) {
    await supabase.from('channel_devices').delete().eq('app_id', APP_NAME_UPDATE).eq('device_id', deviceId)
    await processChannelDeviceQueue()
    await supabase.from('apps').update({ channel_device_count: 0 }).eq('app_id', APP_NAME_UPDATE)
  }

  it('uses device overrides when count is positive', async () => {
    const deviceId = randomUUID().toLowerCase()
    await supabase.from('channel_devices').insert({
      channel_id: betaChannelId,
      app_id: APP_NAME_UPDATE,
      device_id: deviceId,
      owner_org: ORG_ID,
    })
    await processChannelDeviceQueue()

    const baseData = getBaseData(APP_NAME_UPDATE)
    baseData.device_id = deviceId
    baseData.version_name = '0.0.0'
    baseData.version_build = '0.0.0'

    try {
      const response = await postUpdate(baseData)
      expect(response.status).toBe(200)
      const json = await response.json<UpdateRes>()
      expect(json.version).toBe('1.361.0')
    }
    finally {
      await cleanupDevice(deviceId)
    }
  })

  it('ignores overrides when count forced to zero', async () => {
    const deviceId = randomUUID().toLowerCase()
    await supabase.from('channel_devices').insert({
      channel_id: betaChannelId,
      app_id: APP_NAME_UPDATE,
      device_id: deviceId,
      owner_org: ORG_ID,
    })
    await processChannelDeviceQueue()
    await supabase.from('apps').update({ channel_device_count: 0 }).eq('app_id', APP_NAME_UPDATE)

    const baseData = getBaseData(APP_NAME_UPDATE)
    baseData.device_id = deviceId
    baseData.version_name = '0.0.0'
    baseData.version_build = '0.0.0'

    try {
      const response = await postUpdate(baseData)
      expect(response.status).toBe(200)
      const json = await response.json<UpdateRes>()
      expect(json.version).toBe('1.0.0')
    }
    finally {
      await cleanupDevice(deviceId)
    }
  })
})

describe('manifest bundle count gating', () => {
  const supabase = getSupabaseClient()
  const insertedManifestIds: number[] = []
  let baseVersionId: number

  beforeAll(async () => {
    const { data, error } = await supabase
      .from('app_versions')
      .select('id')
      .eq('app_id', APP_NAME_UPDATE)
      .eq('name', '1.0.0')
      .single()
    if (error || !data)
      throw error ?? new Error('Missing base version for manifest tests')
    baseVersionId = data.id
  })

  afterEach(async () => {
    if (insertedManifestIds.length > 0) {
      await supabase.from('manifest').delete().in('id', insertedManifestIds)
      insertedManifestIds.length = 0
    }
    await supabase.from('apps').update({ manifest_bundle_count: 0 }).eq('app_id', APP_NAME_UPDATE)
  })

  async function seedManifestEntry() {
    const suffix = randomUUID().slice(0, 8)
    const fileName = `manifest-test-${suffix}.js`
    const { data, error } = await supabase
      .from('manifest')
      .insert({
        app_version_id: baseVersionId,
        file_name: fileName,
        s3_path: `tests/${fileName}`,
        file_hash: `hash-${suffix}`,
      })
      .select('id')
      .single()
    if (error || !data)
      throw error ?? new Error('Failed to seed manifest entry')
    insertedManifestIds.push(data.id)
    return fileName
  }

  function makeUpdatePayload() {
    const baseData = getBaseData(APP_NAME_UPDATE)
    baseData.version_name = '1.1.0'
    // Use a version that supports manifest fetching (>= 7.0.35)
    baseData.plugin_version = '7.0.35'
    return baseData
  }

  it('returns manifest entries when manifest bundles exist', async () => {
    const fileName = await seedManifestEntry()
    const { error } = await supabase.from('apps').update({ manifest_bundle_count: 1 }).eq('app_id', APP_NAME_UPDATE)
    if (error)
      throw error

    const response = await postUpdate(makeUpdatePayload())
    expect(response.status).toBe(200)
    const json = await response.json<UpdateRes>()
    expect(json.manifest).toBeDefined()
    expect(json.manifest?.some(entry => entry?.file_name === fileName)).toBe(true)
  })

  it('skips manifest query when manifest bundle count is zero', async () => {
    await seedManifestEntry()
    const response = await postUpdate(makeUpdatePayload())
    expect(response.status).toBe(200)
    const json = await response.json<UpdateRes>()
    expect(json.manifest).toBeUndefined()
  })
})

describe('[POST] /updates parallel tests', () => {
  it('with new device', async () => {
    const uuid = randomUUID().toLowerCase()

    const baseData = getBaseData(APP_NAME_UPDATE)
    baseData.version_build = getVersionFromAction('get')
    const version = await createAppVersions(baseData.version_build, APP_NAME_UPDATE)
    baseData.version_name = version.name
    baseData.device_id = uuid

    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)
    const jsonResponse = await response.json<UpdateRes>()
    expect(jsonResponse.checksum).toBe('3885ee49')

    const { error, data } = await getSupabaseClient().from('devices').select().eq('device_id', uuid).eq('app_id', APP_NAME_UPDATE).single()
    expect(error).toBeNull()
    expect(data).toBeTruthy()
    expect(data?.app_id).toBe(baseData.app_id)

    const response2 = await postUpdate(getBaseData(APP_NAME_UPDATE))
    expect(response2.status).toBe(200)
    const json = await response2.json<UpdateRes>()
    expect(json.error).toEqual('no_new_version_available')

    // Clean up
    await getSupabaseClient().from('devices').delete().eq('device_id', uuid).eq('app_id', APP_NAME_UPDATE)
  })

  it('disable auto update to major', async () => {
    const baseData = getBaseData(APP_NAME_UPDATE)
    baseData.version_build = '0.0.0'
    baseData.version_name = '0.0.0'

    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)
    const json = await response.json<UpdateRes>()
    expect(json.error).toBe('disable_auto_update_to_major')
  })

  it('app that does not exist', async () => {
    const baseData = getBaseData(APP_NAME_UPDATE)
    baseData.app_id = 'does.not.exist'

    const response = await postUpdate(baseData)
    expect(response.status).toBe(429)
    const json = await response.json<UpdateRes>()
    expect(json.error).toBe('on_premise_app')
  })

  it('direct channel overwrite', async () => {
    const uuid = randomUUID().toLowerCase()

    const baseData = getBaseData(APP_NAME_UPDATE)
    baseData.device_id = uuid;
    (baseData as any).defaultChannel = 'beta'

    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)

    const json = await response.json<UpdateRes>()
    expect(() => updateNewScheme.parse(json)).not.toThrow()
    expect(json.version).toBe('1.361.0')
  })
})

describe('[POST] /updates invalid data', () => {
  it('unsupported platform', async () => {
    const baseData = getBaseData(APP_NAME_UPDATE)
    baseData.platform = 'unsupported_platform'
    baseData.version_name = '1.1.0'

    const response = await postUpdate(baseData)
    expect(response.status).toBe(400)

    const json = await response.json<UpdateRes>()
    expect(json.error).toBe('invalid_json_body')
  })

  it('invalid device_id', async () => {
    const invalidUUID = 'invalid-uuid'

    const baseData = getBaseData(APP_NAME_UPDATE)
    baseData.device_id = invalidUUID
    baseData.version_name = '1.1.0'

    const response = await postUpdate(baseData)
    expect(response.status).toBe(400)

    const json = await response.json<UpdateRes>()
    expect(json.error).toBe('invalid_json_body')
  })

  it('invalid plugin_version', async () => {
    const baseData = getBaseData(APP_NAME_UPDATE)
    baseData.plugin_version = 'invalid_version'

    const response = await postUpdate(baseData)
    expect(response.status).toBe(400)

    const json = await response.json<UpdateRes>()
    expect(json.error).toBe('invalid_json_body')
  })

  it('missing fields', async () => {
    const baseData = {} as any

    const response = await postUpdate(baseData)
    expect(response.status).toBe(400)

    const json = await response.json<UpdateRes>()
    expect(json.error).toBe('invalid_json_body')
  })

  it('only platform field', async () => {
    const baseData = { platform: 'android' } as any

    const response = await postUpdate(baseData)
    expect(response.status).toBe(400)

    const json = await response.json<UpdateRes>()
    expect(json.error).toBe('missing_device_id')
  })

  it('device_id and app_id combination not found', async () => {
    const baseData = getBaseData(APP_NAME_UPDATE)
    baseData.device_id = '00000000-0000-0000-1234-000000000000'
    baseData.app_id = 'non.existent.app'

    const response = await postUpdate(baseData)
    expect(response.status).toBe(429)

    const json = await response.json<UpdateRes>()
    expect(json.error).toBe('on_premise_app')
  })
})

describe('update scenarios', () => {
  it('disable auto update under native', async () => {
    const baseData = getBaseData(APP_NAME_UPDATE)
    baseData.version_build = '2.0.0'
    baseData.version_name = '2.0.0'

    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)
    const json = await response.json<UpdateRes>()
    expect(json.error).toBe('disable_auto_update_under_native')
  })

  it('disable auto update to minor', async () => {
    const versionId = await getSupabaseClient().from('app_versions').select('id').eq('name', '1.361.0').eq('app_id', APP_NAME_UPDATE).single().throwOnError().then(({ data }) => data?.id)
    const originalVersionId = await getSupabaseClient().from('app_versions').select('id').eq('name', '1.0.0').eq('app_id', APP_NAME_UPDATE).single().throwOnError().then(({ data }) => data?.id)
    await getSupabaseClient().from('channels').update({ disable_auto_update: 'minor', version: versionId }).eq('name', 'production').eq('app_id', APP_NAME_UPDATE).throwOnError()

    try {
      const baseData = getBaseData(APP_NAME_UPDATE)
      baseData.version_name = '1.1.0'

      const response = await postUpdate(baseData)
      expect(response.status).toBe(200)
      const json = await response.json<UpdateRes>()
      expect(json.error).toBe('disable_auto_update_to_minor')
    }
    finally {
      await getSupabaseClient().from('channels').update({ disable_auto_update: 'major', version: originalVersionId }).eq('name', 'production').eq('app_id', APP_NAME_UPDATE)
    }
  })

  it('disable auto update to minor blocks cross-major updates', async () => {
    // Minor strategy: blocks if major OR minor changed
    // This test ensures that updates across major versions are blocked even if minor is the same
    const versionId = await getSupabaseClient().from('app_versions').select('id').eq('name', '1.361.0').eq('app_id', APP_NAME_UPDATE).single().throwOnError().then(({ data }) => data?.id)
    const originalVersionId = await getSupabaseClient().from('app_versions').select('id').eq('name', '1.0.0').eq('app_id', APP_NAME_UPDATE).single().throwOnError().then(({ data }) => data?.id)
    await getSupabaseClient().from('channels').update({ disable_auto_update: 'minor', version: versionId }).eq('name', 'production').eq('app_id', APP_NAME_UPDATE).throwOnError()

    try {
      const baseData = getBaseData(APP_NAME_UPDATE)
      // Device is on 0.361.0, channel has 1.361.0 - same minor, different major
      baseData.version_name = '0.361.0'

      const response = await postUpdate(baseData)
      expect(response.status).toBe(200)
      const json = await response.json<UpdateRes>()
      // Should block because major version changed (0 -> 1)
      expect(json.error).toBe('disable_auto_update_to_minor')
    }
    finally {
      await getSupabaseClient().from('channels').update({ disable_auto_update: 'major', version: originalVersionId }).eq('name', 'production').eq('app_id', APP_NAME_UPDATE)
    }
  })

  it('disable auto update to patch blocks cross-minor updates', async () => {
    // Patch strategy: blocks if major OR minor OR patch changed
    // This test ensures that updates across minor versions are blocked
    const versionId = await getSupabaseClient().from('app_versions').select('id').eq('name', '1.361.0').eq('app_id', APP_NAME_UPDATE).single().throwOnError().then(({ data }) => data?.id)
    const originalVersionId = await getSupabaseClient().from('app_versions').select('id').eq('name', '1.0.0').eq('app_id', APP_NAME_UPDATE).single().throwOnError().then(({ data }) => data?.id)
    await getSupabaseClient().from('channels').update({ disable_auto_update: 'patch', version: versionId }).eq('name', 'production').eq('app_id', APP_NAME_UPDATE).throwOnError()

    try {
      const baseData = getBaseData(APP_NAME_UPDATE)
      // Device is on 1.360.0, channel has 1.361.0 - different minor
      baseData.version_name = '1.360.0'

      const response = await postUpdate(baseData)
      expect(response.status).toBe(200)
      const json = await response.json<UpdateRes>()
      // Should block because minor version changed (360 -> 361)
      expect(json.error).toBe('disable_auto_update_to_patch')
    }
    finally {
      await getSupabaseClient().from('channels').update({ disable_auto_update: 'major', version: originalVersionId }).eq('name', 'production').eq('app_id', APP_NAME_UPDATE)
    }
  })

  it('disable auto update to patch blocks cross-major updates', async () => {
    // Patch strategy: blocks if major OR minor OR patch changed
    // This test ensures that updates across major versions are blocked
    const versionId = await getSupabaseClient().from('app_versions').select('id').eq('name', '1.361.0').eq('app_id', APP_NAME_UPDATE).single().throwOnError().then(({ data }) => data?.id)
    const originalVersionId = await getSupabaseClient().from('app_versions').select('id').eq('name', '1.0.0').eq('app_id', APP_NAME_UPDATE).single().throwOnError().then(({ data }) => data?.id)
    await getSupabaseClient().from('channels').update({ disable_auto_update: 'patch', version: versionId }).eq('name', 'production').eq('app_id', APP_NAME_UPDATE).throwOnError()

    try {
      const baseData = getBaseData(APP_NAME_UPDATE)
      // Device is on 0.361.0, channel has 1.361.0 - different major
      baseData.version_name = '0.361.0'

      const response = await postUpdate(baseData)
      expect(response.status).toBe(200)
      const json = await response.json<UpdateRes>()
      // Should block because major version changed (0 -> 1)
      expect(json.error).toBe('disable_auto_update_to_patch')
    }
    finally {
      await getSupabaseClient().from('channels').update({ disable_auto_update: 'major', version: originalVersionId }).eq('name', 'production').eq('app_id', APP_NAME_UPDATE)
    }
  })

  it('disallow emulator', async () => {
    await getSupabaseClient().from('channels').update({ allow_emulator: false, disable_auto_update: 'major' }).eq('name', 'production').eq('app_id', APP_NAME_UPDATE)

    try {
      const baseData = getBaseData(APP_NAME_UPDATE)
      baseData.version_name = '1.1.0'
      baseData.is_emulator = true

      const response = await postUpdate(baseData)
      expect(response.status).toBe(200)
      const json = await response.json<UpdateRes>()
      expect(json.error).toBe('disable_emulator')
    }
    finally {
      await getSupabaseClient().from('channels').update({ allow_emulator: true }).eq('name', 'production').eq('app_id', APP_NAME_UPDATE)
    }
  })

  it('disallow device', async () => {
    await getSupabaseClient().from('channels').update({ allow_device: false }).eq('name', 'production').eq('app_id', APP_NAME_UPDATE)

    try {
      const baseData = getBaseData(APP_NAME_UPDATE)
      baseData.version_name = '1.1.0'
      baseData.is_emulator = false

      const response = await postUpdate(baseData)
      expect(response.status).toBe(200)
      const json = await response.json<UpdateRes>()
      expect(json.error).toBe('disable_device')
    }
    finally {
      await getSupabaseClient().from('channels').update({ allow_device: true }).eq('name', 'production').eq('app_id', APP_NAME_UPDATE)
    }
  })

  it('development build', async () => {
    await getSupabaseClient().from('channels').update({ allow_dev: false }).eq('name', 'production').eq('app_id', APP_NAME_UPDATE)

    try {
      const baseData = getBaseData(APP_NAME_UPDATE)
      baseData.version_name = '1.1.0'
      baseData.is_prod = false

      const response = await postUpdate(baseData)
      expect(response.status).toBe(200)
      const json = await response.json<UpdateRes>()
      expect(json.error).toBe('disable_dev_build')
    }
    finally {
      await getSupabaseClient().from('channels').update({ allow_dev: true }).eq('name', 'production').eq('app_id', APP_NAME_UPDATE)
    }
  })

  it('production build', async () => {
    await getSupabaseClient().from('channels').update({ allow_prod: false }).eq('name', 'production').eq('app_id', APP_NAME_UPDATE)

    try {
      const baseData = getBaseData(APP_NAME_UPDATE)
      baseData.version_name = '1.1.0'
      baseData.is_prod = true

      const response = await postUpdate(baseData)
      expect(response.status).toBe(200)
      const json = await response.json<UpdateRes>()
      expect(json.error).toBe('disable_prod_build')
    }
    finally {
      await getSupabaseClient().from('channels').update({ allow_prod: true }).eq('name', 'production').eq('app_id', APP_NAME_UPDATE)
    }
  })

  it('channel overwrite', async () => {
    const uuid = randomUUID().toLowerCase()

    // get the channel id
    const { data, error } = await getSupabaseClient().from('channels').select('id').eq('name', 'no_access').eq('app_id', APP_NAME_UPDATE).single()
    expect(error).toBeNull()
    expect(data).toBeTruthy()
    const channelId = data?.id

    const { data: data2 } = await getSupabaseClient().from('channel_devices').insert({
      device_id: uuid,
      channel_id: channelId as number,
      app_id: APP_NAME_UPDATE,
      owner_org: ORG_ID,
    }).select()

    expect(data2?.length).toBe(1)

    // Process the channel device count queue to update the app's channel_device_count
    await getSupabaseClient().rpc('process_channel_device_counts_queue' as any, { batch_size: 10 })

    await getSupabaseClient().from('channels').update({ disable_auto_update: 'none', allow_dev: true, allow_prod: true, allow_emulator: true, allow_device: true, android: true }).eq('name', 'no_access').eq('app_id', APP_NAME_UPDATE)

    const baseData = getBaseData(APP_NAME_UPDATE)
    baseData.device_id = uuid
    baseData.version_name = '0.0.0'

    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)

    const json = await response.json<UpdateRes>()
    expect(() => updateNewScheme.parse(json)).not.toThrow()
    expect(json.version).toBe('1.361.0')

    // Clean up
    await getSupabaseClient().from('channel_devices').delete().eq('device_id', uuid).eq('app_id', APP_NAME_UPDATE)
    await getSupabaseClient().rpc('process_channel_device_counts_queue' as any, { batch_size: 10 })
  })

  it('disallowed public channel update', async () => {
    await getSupabaseClient().from('channels').update({ public: false }).eq('name', 'production').eq('app_id', APP_NAME_UPDATE)

    const baseData = getBaseData(APP_NAME_UPDATE)
    baseData.version_name = '1.1.0'

    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)
    const json = await response.json<UpdateRes>()
    expect(json.error).toBe('no_channel')
  })

  it('cannot update via private channel', async () => {
    // First reset the channel to ensure it's working properly
    await getSupabaseClient().from('channels').update({
      public: true,
      allow_device_self_set: true,
    }).eq('name', 'production').eq('app_id', APP_NAME_UPDATE)

    // Now set both conditions for the error
    await getSupabaseClient().from('channels').update({
      public: false,
      allow_device_self_set: false,
    }).eq('name', 'production').eq('app_id', APP_NAME_UPDATE)

    const baseData = getBaseData(APP_NAME_UPDATE)
    baseData.version_name = '1.1.0';
    // Need to specify defaultChannel so the non-public channel can be found
    (baseData as any).defaultChannel = 'production'

    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)
    const json = await response.json<UpdateRes>()
    expect(json.error).toBe('cannot_update_via_private_channel')
    expect(json.message).toContain('Cannot update via a private channel')

    // Clean up - restore channel to default state
    await getSupabaseClient().from('channels').update({
      public: true,
      allow_device_self_set: true,
    }).eq('name', 'production').eq('app_id', APP_NAME_UPDATE)
  })

  it('private channel with device override should succeed', async () => {
    const uuid = randomUUID().toLowerCase()

    // Reset the production channel to default version first
    const { data: defaultVersion } = await getSupabaseClient()
      .from('app_versions')
      .select('id')
      .eq('name', '1.0.0')
      .eq('app_id', APP_NAME_UPDATE)
      .single()

    // Set up the channel as private and not allowing device self-set
    await getSupabaseClient().from('channels').update({
      public: false,
      allow_device_self_set: false,
      version: defaultVersion?.id,
    }).eq('name', 'production').eq('app_id', APP_NAME_UPDATE)

    // Get the channel id
    const { data: channelData, error: channelError } = await getSupabaseClient()
      .from('channels')
      .select('id')
      .eq('name', 'production')
      .eq('app_id', APP_NAME_UPDATE)
      .single()

    expect(channelError).toBeNull()
    expect(channelData).toBeTruthy()

    // Create a device override
    const { error: overrideError } = await getSupabaseClient()
      .from('channel_devices')
      .insert({
        device_id: uuid,
        channel_id: channelData!.id,
        app_id: APP_NAME_UPDATE,
        owner_org: ORG_ID,
      })

    expect(overrideError).toBeNull()
    await getSupabaseClient().rpc('process_channel_device_counts_queue' as any, { batch_size: 10 })

    // Test that update succeeds with device override
    const baseData = getBaseData(APP_NAME_UPDATE)
    baseData.device_id = uuid
    baseData.version_name = '1.1.0';
    (baseData as any).defaultChannel = 'production'

    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)

    const json = await response.json<UpdateRes>()
    // Should succeed with the new version, not error
    expect(() => updateNewScheme.parse(json)).not.toThrow()
    expect(json.version).toBe('1.0.0')
    expect(json.error).toBeUndefined()

    // Clean up
    await getSupabaseClient().from('channel_devices').delete().eq('device_id', uuid).eq('app_id', APP_NAME_UPDATE)
    await getSupabaseClient().rpc('process_channel_device_counts_queue' as any, { batch_size: 10 })
    await getSupabaseClient().from('channels').update({
      public: true,
      allow_device_self_set: true,
      version: defaultVersion?.id,
    }).eq('name', 'production').eq('app_id', APP_NAME_UPDATE)
  })

  it('saves default_channel when provided', async () => {
    const uuid = randomUUID().toLowerCase()
    const testDefaultChannel = 'staging'

    const baseData = getBaseData(APP_NAME_UPDATE)
    baseData.device_id = uuid
    baseData.defaultChannel = testDefaultChannel

    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)

    // Wait for data to be written
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Verify default_channel was saved in the database
    const { error, data } = await getSupabaseClient()
      .from('devices')
      .select('default_channel')
      .eq('device_id', uuid)
      .eq('app_id', APP_NAME_UPDATE)
      .single()

    expect(error).toBeNull()
    expect(data).toBeTruthy()
    expect(data?.default_channel).toBe(testDefaultChannel)

    // Clean up
    await getSupabaseClient().from('devices').delete().eq('device_id', uuid).eq('app_id', APP_NAME_UPDATE)
  })

  it('overwrites default_channel with null when not provided', async () => {
    const uuid = randomUUID().toLowerCase()
    const testDefaultChannel = 'production'

    // First request with default_channel
    const baseData1 = getBaseData(APP_NAME_UPDATE)
    baseData1.device_id = uuid
    baseData1.defaultChannel = testDefaultChannel

    const response1 = await postUpdate(baseData1)
    expect(response1.status).toBe(200)

    await new Promise(resolve => setTimeout(resolve, 1000))

    // Second request WITHOUT default_channel (should overwrite with null)
    const baseData2 = getBaseData(APP_NAME_UPDATE)
    baseData2.device_id = uuid
    // No defaultChannel field

    const response2 = await postUpdate(baseData2)
    expect(response2.status).toBe(200)

    await new Promise(resolve => setTimeout(resolve, 1000))

    // Verify default_channel was overwritten with null
    const { error, data } = await getSupabaseClient()
      .from('devices')
      .select('default_channel')
      .eq('device_id', uuid)
      .eq('app_id', APP_NAME_UPDATE)
      .single()

    expect(error).toBeNull()
    expect(data).toBeTruthy()
    expect(data?.default_channel).toBeNull()

    // Clean up
    await getSupabaseClient().from('devices').delete().eq('device_id', uuid).eq('app_id', APP_NAME_UPDATE)
  })
})
