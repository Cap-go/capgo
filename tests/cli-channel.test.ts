import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runCli } from './cli-utils'
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
      allow_dev: false,
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
      const output = await runCli(['channel', 'add', channelName, APPNAME], APPNAME, false, undefined, true, true)
      expect(output).toContain(`Create channel`)
      expect(output).toContain(`Done ✅`)

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
      const output = await runCli(['channel', 'add', testChannelName, invalidAppName], APPNAME, false, undefined, true, true)
      expect(output).toContain('does not exist')

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

      const output = await runCli(['channel', 'add', channelName, APPNAME], APPNAME, false, undefined, true, true)
      expect(output).toContain('Cannot create Channel 🙀')
      expect(output).not.toContain(`Done ✅`)
    })
  })

  describe.concurrent('channel listing', () => {
    it.concurrent('should list channels', async () => {
      const channelName = generateChannelName()
      await createChannel(channelName, APPNAME)

      const output = await runCli(['channel', 'list', APPNAME], APPNAME, false, undefined, true, true)
      expect(output).toContain(channelName)
      expect(output).toContain(`Done ✅`)
    })

    it.concurrent('should show empty list for invalid app ID', async () => {
      const testInvalidApp = `invalid-app-${randomUUID().slice(0, 8)}`
      await runCli(['channel', 'list', testInvalidApp], APPNAME, false, undefined, true, true)

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

      const bundle = '1.0.0'
      const output = await runCli(['channel', 'set', channelName, APPNAME, '--bundle', bundle], APPNAME, false, undefined, true, true)
      expect(output).toContain(`channel: ${channelName} to @${bundle}`)
      expect(output).toContain(`Done ✅`)

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
      const output = await runCli(['channel', 'set', testInvalidChannel, APPNAME, '--bundle', bundle], APPNAME, false, undefined, true, true)
      expect(output).toContain('Cannot find channel')
      expect(output).not.toContain(`Done ✅`)
    })

    it.concurrent('should fail to set invalid bundle version', async () => {
      const invalidBundle = 'not-a-version'
      const testChannelName = generateChannelName()
      await createChannel(testChannelName, APPNAME)

      const output = await runCli(['channel', 'set', testChannelName, APPNAME, '--bundle', invalidBundle], APPNAME, false, undefined, true, true)
      expect(output).toContain('Cannot find version')
      expect(output).not.toContain(`Done ✅`)
    })
  })

  describe.concurrent('channel state operations', () => {
    it.concurrent('should set channel state to default', async () => {
      const channelName = generateChannelName()
      await createChannel(channelName, APPNAME)

      const output = await runCli(['channel', 'set', channelName, APPNAME, '--state', 'default'], APPNAME, false, undefined, true, true)
      expect(output).toContain(`channel: ${channelName} to default`)
      expect(output).toContain(`Done ✅`)

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

      const output = await runCli(['channel', 'set', channelName, APPNAME, '--state', 'normal'], APPNAME, false, undefined, true, true)
      expect(output).toContain(`channel: ${channelName} to normal`)
      expect(output).toContain(`Done ✅`)

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
      const output = await runCli(['channel', 'set', testChannelName, APPNAME, '--state', invalidState], APPNAME, false, undefined, true, true)
      expect(output).toContain('State invalid-state is not known. The possible values are: normal, default.')
      expect(output).not.toContain(`Done ✅`)
    })
  })

  describe.concurrent('channel policy operations', () => {
    it.concurrent('should set channel downgrade policy', async () => {
      const testChannelName = generateChannelName()
      await createChannel(testChannelName, APPNAME)

      const output = await runCli(['channel', 'set', testChannelName, APPNAME, '--downgrade'], APPNAME, false, undefined, true, true)
      expect(output).toContain(`channel: ${testChannelName} to allow downgrade`)
      expect(output).toContain(`Done ✅`)

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

      const output = await runCli(['channel', 'set', testChannelName, APPNAME, '--ios'], APPNAME, false, undefined, true, true)
      expect(output).toContain(`channel: ${testChannelName} to allow ios update`)
      expect(output).toContain(`Done ✅`)

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

      const output = await runCli(['channel', 'set', testChannelName, APPNAME, '--android'], APPNAME, false, undefined, true, true)
      expect(output).toContain(`channel: ${testChannelName} to allow android update`)
      expect(output).toContain(`Done ✅`)

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

      const output = await runCli(['channel', 'set', testChannelName, APPNAME, '--ios', '--android'], APPNAME, false, undefined, true, true)
      expect(output).toContain(`channel: ${testChannelName} to allow ios update`)
      expect(output).toContain(`channel: ${testChannelName} to allow android update`)
      expect(output).toContain(`Done ✅`)

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

      const output = await runCli(['channel', 'set', testChannelName, APPNAME, '--self-assign'], APPNAME, false, undefined, true, true)
      expect(output).toContain(`channel: ${testChannelName} to allow self assign`)
      expect(output).toContain(`Done ✅`)

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

    const output = await runCli(['channel', 'set', testChannelName, APPNAME, '--disable-auto-update', 'major'], APPNAME, false, undefined, true, true)
    expect(output).toContain(`channel: ${testChannelName} to major disable update strategy to this channel`)
    expect(output).toContain(`Done ✅`)
    // Verify in databases
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

    const output = await runCli(['channel', 'set', testChannelName, APPNAME, '--dev'], APPNAME, false, undefined, true, true)
    expect(output).toContain(`channel: ${testChannelName} to allow dev devices`)
    expect(output).toContain(`Done ✅`)

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

    const output = await runCli(['channel', 'set', testChannelName, APPNAME, '--emulator'], APPNAME, false, undefined, true, true)
    expect(output).toContain(`channel: ${testChannelName} to allow emulator devices`)
    expect(output).toContain(`Done ✅`)

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

      const output = await runCli(['channel', 'currentBundle', channelName, APPNAME], APPNAME, false, undefined, true, true)
      expect(output).toContain(`Current bundle for channel ${channelName}`)

      // Verify in database
      const { data, error } = await getSupabaseClient()
        .from('channels')
        .select('version (name)')
        .eq('name', channelName)
        .eq('app_id', APPNAME)
        .single()
        .throwOnError()
      expect(error).toBeNull()
      expect(output).toContain(data?.version?.name)
    })

    it.concurrent('should fail to get bundle for non-existent channel', async () => {
      const testInvalidChannel = generateChannelName()
      const output = await runCli(['channel', 'currentBundle', testInvalidChannel, APPNAME], APPNAME, false, undefined, true, true)
      expect(output).toContain('Error')
      expect(output).not.toContain(`Done ✅`)
    })
  })

  describe.concurrent('combined operations', () => {
    it.concurrent('should set multiple properties in a single command', async () => {
      const testChannelName = generateChannelName()
      await createChannel(testChannelName, APPNAME)

      const output = await runCli(['channel', 'set', testChannelName, APPNAME, '--state', 'default', '--downgrade', '--ios'], APPNAME, false, undefined, true, true)
      expect(output).toContain(`channel: ${testChannelName} to default`)
      expect(output).toContain(`channel: ${testChannelName} to allow downgrade`)
      expect(output).toContain(`channel: ${testChannelName} to allow ios update`)
      expect(output).toContain(`Done ✅`)

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

      const output = await runCli(['channel', 'delete', channelName, APPNAME], APPNAME, false, undefined, true, true)
      expect(output).toContain(`Deleting channel ${APPNAME}#${channelName} from Capgo`)
      expect(output).toContain(`Done ✅`)

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

    it.concurrent('should fail to delete non-existent channel', async () => {
      const testInvalidChannel = generateChannelName()
      const output = await runCli(['channel', 'delete', testInvalidChannel, APPNAME], APPNAME, false, undefined, true, true)
      expect(output).toContain(`Channel ${testInvalidChannel} not found`)
      expect(output).not.toContain(`Done ✅`)
    })

    it.concurrent('should fail to delete channel with invalid app ID', async () => {
      const testChannelName = generateChannelName()
      const testInvalidApp = `invalid-app-${randomUUID().slice(0, 8)}`
      const output = await runCli(['channel', 'delete', testChannelName, testInvalidApp], APPNAME, false, undefined, true, true)
      expect(output).toContain(`App ${testInvalidApp} does not exist`)
      expect(output).not.toContain(`Done ✅`)
    })
  })
})
