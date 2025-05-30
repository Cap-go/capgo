import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runCli } from './cli-utils'
import { getSupabaseClient, resetAndSeedAppData, resetAppData } from './test-utils'

describe('tests CLI channel commands', () => {
  const id = randomUUID()
  const APPNAME = `com.cli_channel_${id}`
  const channelName = `test-channel-${Math.floor(Math.random() * 10000)}`
  const invalidAppName = `invalid-app-${Math.floor(Math.random() * 10000)}`
  const invalidChannelName = `invalid-channel-${Math.floor(Math.random() * 10000)}`

  beforeAll(async () => {
    await resetAndSeedAppData(APPNAME)
  })

  afterAll(async () => {
    await resetAppData(APPNAME)
  })

  describe('channel creation', () => {
    it('should create a channel', async () => {
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

    it('should fail to create a channel with invalid app ID', async () => {
      const output = await runCli(['channel', 'add', channelName, invalidAppName], APPNAME, false, undefined, true, true)
      expect(output).toContain('does not exist')

      // Verify channel wasn't created
      const { data } = await getSupabaseClient()
        .from('channels')
        .select('*')
        .eq('name', channelName)
        .eq('app_id', invalidAppName)
      expect(data).toHaveLength(0)
    })

    it('should fail to create a duplicate channel', async () => {
      const output = await runCli(['channel', 'add', channelName, APPNAME], APPNAME, false, undefined, true, true)
      expect(output).toContain('Cannot create Channel 🙀')
      expect(output).not.toContain(`Done ✅`)
    })
  })

  describe('channel listing', () => {
    it('should list channels', async () => {
      const output = await runCli(['channel', 'list', APPNAME], APPNAME, false, undefined, true, true)
      expect(output).toContain(channelName)
      expect(output).toContain(`Done ✅`)

      // Verify in database
      const { data, error } = await getSupabaseClient()
        .from('channels')
        .select('*')
        .eq('app_id', APPNAME)
      expect(error).toBeNull()
      expect(data?.some(channel => channel.name === channelName)).toBe(true)
    })

    it('should show empty list for invalid app ID', async () => {
      const output = await runCli(['channel', 'list', invalidAppName], APPNAME, false, undefined, true, true)
      expect(output).not.toContain(channelName)

      // Optional: verify no channels exist for invalid app
      const { data } = await getSupabaseClient()
        .from('channels')
        .select('*')
        .eq('app_id', invalidAppName)
      expect(data).toHaveLength(0)
    })
  })

  describe('channel bundle operations', () => {
    it('should set channel bundle', async () => {
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

    it('should fail to set bundle for invalid channel name', async () => {
      const bundle = '1.0.0'
      const output = await runCli(['channel', 'set', invalidChannelName, APPNAME, '--bundle', bundle], APPNAME, false, undefined, true, true)
      expect(output).toContain('Cannot find channel')
      expect(output).not.toContain(`Done ✅`)
    })

    it('should fail to set invalid bundle version', async () => {
      const invalidBundle = 'not-a-version'
      const output = await runCli(['channel', 'set', channelName, APPNAME, '--bundle', invalidBundle], APPNAME, false, undefined, true, true)
      expect(output).toContain('Cannot find version')
      expect(output).not.toContain(`Done ✅`)

      // Verify bundle wasn't changed to invalid value
      const { data } = await getSupabaseClient()
        .from('channels')
        .select('id, version (id, name)')
        .eq('name', channelName)
        .eq('app_id', APPNAME)
        .single()
      expect(data?.version.name).not.toBe(invalidBundle)
    })
  })

  describe('channel state operations', () => {
    it('should set channel state to default', async () => {
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

    it('should set channel state to public', async () => {
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

    it('should fail to set invalid state', async () => {
      const invalidState = 'invalid-state'
      const output = await runCli(['channel', 'set', channelName, APPNAME, '--state', invalidState], APPNAME, false, undefined, true, true)
      expect(output).toContain('State invalid-state is not known. The possible values are: normal, default.')
      expect(output).not.toContain(`Done ✅`)
    })
  })

  describe('channel policy operations', () => {
    it('should set channel downgrade policy', async () => {
      const output = await runCli(['channel', 'set', channelName, APPNAME, '--downgrade'], APPNAME, false, undefined, true, true)
      expect(output).toContain(`channel: ${channelName} to allow downgrade`)
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
      expect(data?.disable_auto_update_under_native).toBe(false)
    })
  })

  describe('channel platform operations', () => {
    it('should set channel platform to ios', async () => {
      const output = await runCli(['channel', 'set', channelName, APPNAME, '--ios'], APPNAME, false, undefined, true, true)
      expect(output).toContain(`channel: ${channelName} to allow ios update`)
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
      expect(data?.ios).toBe(true)
    })

    it('should set channel platform to android', async () => {
      const output = await runCli(['channel', 'set', channelName, APPNAME, '--android'], APPNAME, false, undefined, true, true)
      expect(output).toContain(`channel: ${channelName} to allow android update`)
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
      expect(data?.android).toBe(true)
    })

    it('should set both platforms simultaneously', async () => {
      const output = await runCli(['channel', 'set', channelName, APPNAME, '--ios', '--android'], APPNAME, false, undefined, true, true)
      expect(output).toContain(`channel: ${channelName} to allow ios update`)
      expect(output).toContain(`channel: ${channelName} to allow android update`)
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
      expect(data?.ios).toBe(true)
      expect(data?.android).toBe(true)
    })
  })

  describe('channel self-assign operations', () => {
    it('should set channel self-assign', async () => {
      const output = await runCli(['channel', 'set', channelName, APPNAME, '--self-assign'], APPNAME, false, undefined, true, true)
      expect(output).toContain(`channel: ${channelName} to allow self assign`)
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
      expect(data?.allow_device_self_set).toBe(true)
    })
  })

  it('should disable auto update for channel', async () => {
    const output = await runCli(['channel', 'set', channelName, APPNAME, '--disable-auto-update', 'major'], APPNAME, false, undefined, true, true)
    expect(output).toContain(`channel: ${channelName} to major disable update strategy to this channel`)
    expect(output).toContain(`Done ✅`)
    // Verify in databases
    const { data, error } = await getSupabaseClient()
      .from('channels')
      .select('*')
      .eq('name', channelName)
      .eq('app_id', APPNAME)
      .single()
      .throwOnError()
    expect(error).toBeNull()
    expect(data?.disable_auto_update).toBe('major')
  })

  it('should set channel for dev environment', async () => {
    const output = await runCli(['channel', 'set', channelName, APPNAME, '--dev'], APPNAME, false, undefined, true, true)
    expect(output).toContain(`channel: ${channelName} to allow dev devices`)
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
    expect(data?.allow_dev).toBe(true)
  })

  it('should set channel for emulator environment', async () => {
    const output = await runCli(['channel', 'set', channelName, APPNAME, '--emulator'], APPNAME, false, undefined, true, true)
    expect(output).toContain(`channel: ${channelName} to allow emulator devices`)
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
    expect(data?.allow_emulator).toBe(true)
  })

  describe('channel info operations', () => {
    it('should get current bundle of channel', async () => {
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

    it('should fail to get bundle for non-existent channel', async () => {
      const output = await runCli(['channel', 'currentBundle', invalidChannelName, APPNAME], APPNAME, false, undefined, true, true)
      expect(output).toContain('Error')
      expect(output).not.toContain(`Done ✅`)
    })
  })

  describe('combined operations', () => {
    it('should set multiple properties in a single command', async () => {
      const output = await runCli(['channel', 'set', channelName, APPNAME, '--state', 'default', '--downgrade', '--ios'], APPNAME, false, undefined, true, true)
      expect(output).toContain(`channel: ${channelName} to default`)
      expect(output).toContain(`channel: ${channelName} to allow downgrade`)
      expect(output).toContain(`channel: ${channelName} to allow ios update`)
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
      expect(data?.disable_auto_update_under_native).toBe(false)
      expect(data?.ios).toBe(true)
    })
  })

  describe('channel deletion', () => {
    it('should delete a channel', async () => {
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

    it('should fail to delete non-existent channel', async () => {
      const output = await runCli(['channel', 'delete', invalidChannelName, APPNAME], APPNAME, false, undefined, true, true)
      expect(output).toContain('Cannot delete Channel')
      expect(output).not.toContain(`Done ✅`)
    })

    it('should fail to delete channel with invalid app ID', async () => {
      const output = await runCli(['channel', 'delete', channelName, invalidAppName], APPNAME, false, undefined, true, true)
      expect(output).toContain(`App ${invalidAppName} does not exist`)
      expect(output).not.toContain(`Done ✅`)
    })
  })
})
