import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getSupabaseClient, ORG_ID, resetAndSeedAppData, resetAppData, USER_ID } from 'tests/test-utils'

const testAppId = `com.test.channel.deletion.${Date.now()}`

beforeAll(async () => {
  await resetAndSeedAppData(testAppId)
})

afterAll(async () => {
  await resetAppData(testAppId)
})

// Test to ensure that deleting a channel_devices entry doesn't delete the associated channel
describe('channel Devices Constraint Tests', () => {
  it('should not delete channel when channel_devices entry is deleted', async () => {
    // Create a valid UUID for device_id
    const testDeviceId = randomUUID()
    const supabase = getSupabaseClient()

    // Get an existing version for this app (created by seed)
    const { data: existingVersion, error: versionQueryError } = await supabase
      .from('app_versions')
      .select('id')
      .eq('app_id', testAppId)
      .limit(1)
      .single()

    expect(versionQueryError).toBeNull()
    expect(existingVersion).not.toBeNull()

    // Create a test channel using the existing version
    const { data: channelData, error: channelError } = await supabase
      .from('channels')
      .insert({
        app_id: testAppId,
        name: `test-channel-${Date.now()}`,
        version: existingVersion!.id,
        created_by: USER_ID,
        owner_org: ORG_ID,
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

    // Delete the channel_devices entry
    const { error: deleteError } = await supabase
      .from('channel_devices')
      .delete()
      .eq('app_id', testAppId)
      .eq('device_id', testDeviceId)

    expect(deleteError).toBeNull()

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
