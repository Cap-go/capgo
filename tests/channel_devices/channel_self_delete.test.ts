import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getSupabaseClient, ORG_ID, PLUGIN_BASE_URL, resetAndSeedAppData, resetAppData, USER_ID } from 'tests/test-utils'

const testAppId = `com.test.channel.delete.${Date.now()}`

beforeAll(async () => {
  await resetAndSeedAppData(testAppId)
})

afterAll(async () => {
  await resetAppData(testAppId)
})

// Test to ensure that the deleteOverride function in channel_self.ts doesn't delete channels
describe('channel Self Delete Tests', () => {
  it('should not delete channel when channel_self deleteOverride is called', async () => {
    const supabase = getSupabaseClient()
    const testDeviceId = randomUUID()

    // Get an existing version for this app (created by seed)
    const { data: existingVersion, error: versionQueryError } = await supabase
      .from('app_versions')
      .select('id')
      .eq('app_id', testAppId)
      .limit(1)
      .single()

    expect(versionQueryError).toBeNull()
    expect(existingVersion).not.toBeNull()

    // Create a test channel with allow_device_self_set=true
    const { data: channelData, error: channelError } = await supabase
      .from('channels')
      .insert({
        app_id: testAppId,
        name: `test-channel-${Date.now()}`,
        version: existingVersion!.id,
        created_by: USER_ID,
        owner_org: ORG_ID,
        allow_device_self_set: true,
      })
      .select()

    expect(channelError).toBeNull()
    expect(channelData).not.toBeNull()

    // Create a channel_devices entry
    const { error: channelDeviceError } = await supabase
      .from('channel_devices')
      .insert({
        app_id: testAppId,
        device_id: testDeviceId,
        channel_id: channelData![0].id,
        owner_org: ORG_ID,
      })

    expect(channelDeviceError).toBeNull()

    // Call the channel_self deleteOverride endpoint using query params (not body)
    // Must include all required params: app_id, device_id, version_build, version_name, is_emulator, is_prod, platform
    const url = new URL(`${PLUGIN_BASE_URL}/channel_self`)
    url.searchParams.append('app_id', testAppId)
    url.searchParams.append('device_id', testDeviceId)
    url.searchParams.append('version_build', '1.0.0')
    url.searchParams.append('version_name', '1.0.0')
    url.searchParams.append('is_emulator', 'false')
    url.searchParams.append('is_prod', 'true')
    url.searchParams.append('platform', 'android')

    const response = await fetch(url, {
      method: 'DELETE',
    })

    expect(response.status).toBe(200)

    // Verify the channel still exists
    const { data: verifyChannelData, error: verifyChannelError } = await supabase
      .from('channels')
      .select()
      .eq('id', channelData![0].id)

    expect(verifyChannelError).toBeNull()
    expect(verifyChannelData).not.toBeNull()
    expect(verifyChannelData!.length).toBe(1)

    // Clean up channel created in this test
    await supabase.from('channels').delete().eq('id', channelData![0].id)
  })
})
