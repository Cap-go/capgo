import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestSDK } from './cli-sdk-utils'
import { getSupabaseClient, ORG_ID, resetAndSeedAppData, resetAppData, USER_ID } from './test-utils'

// Helper to generate unique channel names for concurrent tests
const generateChannelName = () => `test-channel-${randomUUID().slice(0, 8)}`

// Cache version ID per app to avoid repeated queries
const versionCache = new Map<string, number>()

// Helper to create channel directly in database for faster test setup
async function createChannel(channelName: string, appId: string) {
  let versionId = versionCache.get(appId)

  if (!versionId) {
    // Only query once per app
    const { data: versionData } = await getSupabaseClient()
      .from('app_versions')
      .select('id')
      .eq('app_id', appId)
      .limit(1)
      .single()

    versionId = versionData?.id || 1
    versionCache.set(appId, versionId)
  }

  const { error } = await getSupabaseClient()
    .from('channels')
    .insert({
      name: channelName,
      app_id: appId,
      version: versionId,
      owner_org: ORG_ID,
      created_by: USER_ID,
      public: false,
      disable_auto_update_under_native: true,
      disable_auto_update: 'major' as const,
      allow_device_self_set: false,
      allow_emulator: false,
      allow_device: false,
      allow_dev: false,
      allow_prod: false,
      ios: false,
      android: false,
    })
  if (error)
    throw error
}

describe('tests CLI channel commands', () => {
  const id = randomUUID()
  const APPNAME = `com.cli_channel_${id}`
  const invalidAppName = `invalid-app-${randomUUID().slice(0, 8)}`

  beforeAll(async () => {
    await resetAndSeedAppData(APPNAME)
  })

  afterAll(async () => {
    await resetAppData(APPNAME)
  })

  describe.concurrent('channel creation', () => {
    it('should create a channel', async () => {
      const channelName = generateChannelName()
      const result = await createTestSDK().addChannel({ channelId: channelName, appId: APPNAME })
      expect(result.success).toBe(true)

      // Verify in database
      const { data, error } = await getSupabaseClient()
        .from('channels')
        .select('*')
        .eq('name', channelName)
        .eq('app_id', APPNAME)
      expect(error).toBeNull()
      expect(data).toHaveLength(1)
    })

    it.concurrent('should fail to create a channel with invalid app ID', async () => {
      const testChannelName = generateChannelName()
      const result = await createTestSDK().addChannel({ channelId: testChannelName, appId: invalidAppName })
      expect(result.success).toBe(false)
      expect(result.error).toContain('does not exist')

      // Verify channel wasn't created
      const { data } = await getSupabaseClient()
        .from('channels')
        .select('*')
        .eq('name', testChannelName)
        .eq('app_id', invalidAppName)
      expect(data).toHaveLength(0)
    })

    it.concurrent('should fail to create a duplicate channel', async () => {
      const channelName = generateChannelName()
      // Create the channel first
      await createChannel(channelName, APPNAME)

      const result = await createTestSDK().addChannel({ channelId: channelName, appId: APPNAME })
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe.concurrent('channel listing', () => {
    it.concurrent('should list channels', async () => {
      const channelName = generateChannelName()
      await createChannel(channelName, APPNAME)

      const result = await createTestSDK().listChannels(APPNAME)
      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()

      const channel = result.data!.find(c => c.name === channelName)
      expect(channel).toBeDefined()
    })

    it.concurrent('should show empty list for invalid app ID', async () => {
      const testInvalidApp = `invalid-app-${randomUUID().slice(0, 8)}`
      const result = await createTestSDK().listChannels(testInvalidApp)

      // SDK will fail for non-existent app
      expect(result.success).toBe(false)

      // Optional: verify no channels exist for invalid app
      const { data } = await getSupabaseClient()
        .from('channels')
        .select('*')
        .eq('app_id', testInvalidApp)
      expect(data).toHaveLength(0)
    })
  })

  describe.concurrent('channel bundle operations', () => {
    it.concurrent('should set channel bundle', async () => {
      const channelName = generateChannelName()
      await createChannel(channelName, APPNAME)

      // Upload bundle first
      const bundle = '1.0.0'
      const { uploadBundleSDK, prepareCli } = await import('./cli-sdk-utils')
      await prepareCli(APPNAME)
      await uploadBundleSDK(APPNAME, bundle)

      const result = await createTestSDK().updateChannel({ channelId: channelName, appId: APPNAME, bundle })
      expect(result.success).toBe(true)

      // Verify in database
      const { data, error } = await getSupabaseClient()
        .from('channels')
        .select('id, version (id, name)')
        .eq('name', channelName)
        .eq('app_id', APPNAME)
        .single()
        .throwOnError()
      expect(error).toBeNull()
      expect(data?.version.name).toBe(bundle)
    })

    it.concurrent('should fail to set bundle for invalid channel name', async () => {
      const bundle = '1.0.0'
      const testInvalidChannel = generateChannelName()
      const result = await createTestSDK().updateChannel({ channelId: testInvalidChannel, appId: APPNAME, bundle })
      expect(result.success).toBe(false)
      expect(result.error).toContain('Cannot find channel')
    })

    it.concurrent('should fail to set invalid bundle version', async () => {
      const invalidBundle = 'not-a-version'
      const testChannelName = generateChannelName()
      await createChannel(testChannelName, APPNAME)

      const result = await createTestSDK().updateChannel({ channelId: testChannelName, appId: APPNAME, bundle: invalidBundle })
      expect(result.success).toBe(false)
      expect(result.error).toContain('Cannot find version')
    })
  })

  describe.concurrent('channel state operations', () => {
    it.concurrent('should set channel state to default', async () => {
      const channelName = generateChannelName()
      await createChannel(channelName, APPNAME)

      const result = await createTestSDK().updateChannel({ channelId: channelName, appId: APPNAME, bundle: undefined, ...{ state: 'default' } })
      expect(result.success).toBe(true)

      // Verify in database
      const { data, error } = await getSupabaseClient()
        .from('channels')
        .select('*')
        .eq('name', channelName)
        .eq('app_id', APPNAME)
        .single()
        .throwOnError()
      expect(error).toBeNull()
      expect(data?.public).toBe(true)
    })

    it.concurrent('should set channel state to public', async () => {
      const channelName = generateChannelName()
      await createChannel(channelName, APPNAME)

      const result = await createTestSDK().updateChannel({ channelId: channelName, appId: APPNAME, bundle: undefined, ...{ state: 'normal' } })
      expect(result.success).toBe(true)

      // Verify in database
      const { data, error } = await getSupabaseClient()
        .from('channels')
        .select('*')
        .eq('name', channelName)
        .eq('app_id', APPNAME)
        .single()
        .throwOnError()
      expect(error).toBeNull()
      expect(data?.public).toBe(false)
    })

    it.concurrent('should fail to set invalid state', async () => {
      const invalidState = 'invalid-state'
      const testChannelName = generateChannelName()
      await createChannel(testChannelName, APPNAME)
      const result = await createTestSDK().updateChannel({ channelId: testChannelName, appId: APPNAME, bundle: undefined, ...{ state: invalidState } })
      expect(result.success).toBe(false)
      expect(result.error).toContain('Unknown state')
    })
  })

  describe.concurrent('channel policy operations', () => {
    it.concurrent('should set channel downgrade policy', async () => {
      const testChannelName = generateChannelName()
      await createChannel(testChannelName, APPNAME)

      const result = await createTestSDK().updateChannel({ channelId: testChannelName, appId: APPNAME, bundle: undefined, ...{ downgrade: true } })
      expect(result.success).toBe(true)

      // Verify in database
      const { data, error } = await getSupabaseClient()
        .from('channels')
        .select('*')
        .eq('name', testChannelName)
        .eq('app_id', APPNAME)
        .single()
        .throwOnError()
      expect(error).toBeNull()
      expect(data?.disable_auto_update_under_native).toBe(false)
    })
  })

  describe.concurrent('channel platform operations', () => {
    it.concurrent('should set channel platform to ios', async () => {
      const testChannelName = generateChannelName()
      await createChannel(testChannelName, APPNAME)

      const result = await createTestSDK().updateChannel({ channelId: testChannelName, appId: APPNAME, bundle: undefined, ...{ ios: true } })
      expect(result.success).toBe(true)

      // Verify in database
      const { data, error } = await getSupabaseClient()
        .from('channels')
        .select('*')
        .eq('name', testChannelName)
        .eq('app_id', APPNAME)
        .single()
        .throwOnError()
      expect(error).toBeNull()
      expect(data?.ios).toBe(true)
    })

    it.concurrent('should set channel platform to android', async () => {
      const testChannelName = generateChannelName()
      await createChannel(testChannelName, APPNAME)

      const result = await createTestSDK().updateChannel({ channelId: testChannelName, appId: APPNAME, bundle: undefined, ...{ android: true } })
      expect(result.success).toBe(true)

      // Verify in database
      const { data, error } = await getSupabaseClient()
        .from('channels')
        .select('*')
        .eq('name', testChannelName)
        .eq('app_id', APPNAME)
        .single()
        .throwOnError()
      expect(error).toBeNull()
      expect(data?.android).toBe(true)
    })

    it.concurrent('should set both platforms simultaneously', async () => {
      const testChannelName = generateChannelName()
      await createChannel(testChannelName, APPNAME)

      const result = await createTestSDK().updateChannel({ channelId: testChannelName, appId: APPNAME, bundle: undefined, ...{ ios: true, android: true } })
      expect(result.success).toBe(true)

      // Verify in database
      const { data, error } = await getSupabaseClient()
        .from('channels')
        .select('*')
        .eq('name', testChannelName)
        .eq('app_id', APPNAME)
        .single()
        .throwOnError()
      expect(error).toBeNull()
      expect(data?.ios).toBe(true)
      expect(data?.android).toBe(true)
    })
  })

  describe.concurrent('channel self-assign operations', () => {
    it.concurrent('should set channel self-assign', async () => {
      const testChannelName = generateChannelName()
      await createChannel(testChannelName, APPNAME)

      const result = await createTestSDK().updateChannel({ channelId: testChannelName, appId: APPNAME, bundle: undefined, ...{ selfAssign: true } })
      expect(result.success).toBe(true)

      // Verify in database
      const { data, error } = await getSupabaseClient()
        .from('channels')
        .select('*')
        .eq('name', testChannelName)
        .eq('app_id', APPNAME)
        .single()
        .throwOnError()
      expect(error).toBeNull()
      expect(data?.allow_device_self_set).toBe(true)
    })
  })

  it.concurrent('should disable auto update for channel', async () => {
    const testChannelName = generateChannelName()
    await createChannel(testChannelName, APPNAME)

    const result = await createTestSDK().updateChannel({ channelId: testChannelName, appId: APPNAME, bundle: undefined, ...{ disableAutoUpdate: 'major' } })
    expect(result.success).toBe(true)

    // Verify in database
    const { data, error } = await getSupabaseClient()
      .from('channels')
      .select('*')
      .eq('name', testChannelName)
      .eq('app_id', APPNAME)
      .single()
      .throwOnError()
    expect(error).toBeNull()
    expect(data?.disable_auto_update).toBe('major')
  })

  it.concurrent('should set channel for dev environment', async () => {
    const testChannelName = generateChannelName()
    await createChannel(testChannelName, APPNAME)

    const result = await createTestSDK().updateChannel({ channelId: testChannelName, appId: APPNAME, bundle: undefined, ...{ dev: true } })
    expect(result.success).toBe(true)

    // Verify in database
    const { data, error } = await getSupabaseClient()
      .from('channels')
      .select('*')
      .eq('name', testChannelName)
      .eq('app_id', APPNAME)
      .single()
      .throwOnError()
    expect(error).toBeNull()
    expect(data?.allow_dev).toBe(true)
  })

  it.concurrent('should set channel for emulator environment', async () => {
    const testChannelName = generateChannelName()
    await createChannel(testChannelName, APPNAME)

    const result = await createTestSDK().updateChannel({ channelId: testChannelName, appId: APPNAME, bundle: undefined, ...{ emulator: true } })
    expect(result.success).toBe(true)

    // Verify in database
    const { data, error } = await getSupabaseClient()
      .from('channels')
      .select('*')
      .eq('name', testChannelName)
      .eq('app_id', APPNAME)
      .single()
      .throwOnError()
    expect(error).toBeNull()
    expect(data?.allow_emulator).toBe(true)
  })

  describe.concurrent('channel info operations', () => {
    it.concurrent('should get current bundle of channel', async () => {
      const channelName = generateChannelName()
      await createChannel(channelName, APPNAME)

      const sdk = createTestSDK()
      const result = await sdk.getCurrentBundle(APPNAME, channelName)

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()

      // Verify in database
      const { data, error } = await getSupabaseClient()
        .from('channels')
        .select('version (name)')
        .eq('name', channelName)
        .eq('app_id', APPNAME)
        .single()
        .throwOnError()
      expect(error).toBeNull()
      expect(result.data).toBe(data?.version?.name)
    })

    it.concurrent('should fail to get bundle for non-existent channel', async () => {
      const testInvalidChannel = generateChannelName()

      const sdk = createTestSDK()
      const result = await sdk.getCurrentBundle(APPNAME, testInvalidChannel)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe.concurrent('combined operations', () => {
    it.concurrent('should set multiple properties in a single command', async () => {
      const testChannelName = generateChannelName()
      await createChannel(testChannelName, APPNAME)

      const result = await createTestSDK().updateChannel({
        channelId: testChannelName,
        appId: APPNAME,
        state: 'default',
        downgrade: true,
        ios: true,
      })
      expect(result.success).toBe(true)

      // Verify in database
      const { data, error } = await getSupabaseClient()
        .from('channels')
        .select('*')
        .eq('name', testChannelName)
        .eq('app_id', APPNAME)
        .single()
        .throwOnError()
      expect(error).toBeNull()
      expect(data?.public).toBe(true)
      expect(data?.disable_auto_update_under_native).toBe(false)
      expect(data?.ios).toBe(true)
    })
  })

  describe.concurrent('channel deletion', () => {
    it.concurrent('should delete a channel', async () => {
      const channelName = generateChannelName()
      await createChannel(channelName, APPNAME)

      const result = await createTestSDK().deleteChannel(channelName, APPNAME, false)
      expect(result.success).toBe(true)

      // Verify in database
      const { data, error } = await getSupabaseClient()
        .from('channels')
        .select('*')
        .eq('name', channelName)
        .eq('app_id', APPNAME)
        .single()
      expect(error).toBeDefined()
      expect(data).toBeNull()
    })

    it.concurrent('should delete channel and associated channel_devices', async () => {
      const channelName = generateChannelName()
      await createChannel(channelName, APPNAME)

      // Get the channel ID
      const { data: channelData } = await getSupabaseClient()
        .from('channels')
        .select('id')
        .eq('name', channelName)
        .eq('app_id', APPNAME)
        .single()
        .throwOnError()

      const channelId = channelData!.id

      // Create some channel_devices
      const deviceIds = [randomUUID(), randomUUID(), randomUUID()]
      for (const deviceId of deviceIds) {
        await getSupabaseClient()
          .from('channel_devices')
          .insert({
            channel_id: channelId,
            device_id: deviceId,
            app_id: APPNAME,
            owner_org: ORG_ID,
          })
          .throwOnError()
      }

      // Verify channel_devices were created
      const { data: devicesBefore } = await getSupabaseClient()
        .from('channel_devices')
        .select('*')
        .eq('channel_id', channelId)
      expect(devicesBefore).toHaveLength(3)

      // Delete the channel
      const result = await createTestSDK().deleteChannel(channelName, APPNAME, false)
      expect(result.success).toBe(true)

      // Verify channel is deleted
      const { data: channelAfter, error: channelError } = await getSupabaseClient()
        .from('channels')
        .select('*')
        .eq('name', channelName)
        .eq('app_id', APPNAME)
        .single()
      expect(channelError).toBeDefined()
      expect(channelAfter).toBeNull()

      // Verify channel_devices are also deleted
      const { data: devicesAfter } = await getSupabaseClient()
        .from('channel_devices')
        .select('*')
        .eq('channel_id', channelId)
      expect(devicesAfter).toHaveLength(0)
    })

    it.concurrent('should fail to delete non-existent channel', async () => {
      const testInvalidChannel = generateChannelName()
      const result = await createTestSDK().deleteChannel(testInvalidChannel, APPNAME, false)
      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })

    it.concurrent('should fail to delete channel with invalid app ID', async () => {
      const testChannelName = generateChannelName()
      const testInvalidApp = `invalid-app-${randomUUID().slice(0, 8)}`
      const result = await createTestSDK().deleteChannel(testChannelName, testInvalidApp, false)
      expect(result.success).toBe(false)
      expect(result.error).toContain('does not exist')
    })
  })
})
