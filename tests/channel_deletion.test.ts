// Test script to verify the fix for channel deletion issue
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, getBaseData, getSupabaseClient, headers, resetAndSeedAppData, resetAppData, resetAppDataStats } from './test-utils.ts'

const APPNAME = 'com.test.channel.deletion'

// Helper function to create a test channel
async function createTestChannel(channelName: string) {
  const { data, error } = await getSupabaseClient().from('channels').insert({
    name: channelName,
    app_id: APPNAME,
    public: false,
    allow_device_self_set: true,
  }).select('id, owner_org').single()
  
  expect(error).toBeNull()
  return data
}

// Helper function to create a device override for a channel
async function createDeviceOverride(deviceId: string, channelId: string, ownerOrg: string) {
  const { error } = await getSupabaseClient().from('channel_devices').insert({
    app_id: APPNAME,
    device_id: deviceId,
    channel_id: channelId,
    owner_org: ownerOrg,
  })
  
  expect(error).toBeNull()
}

// Helper function to check if a channel exists
async function channelExists(channelId: string) {
  const { data, error } = await getSupabaseClient().from('channels')
    .select('id')
    .eq('id', channelId)
    .single()
  
  expect(error).toBeNull()
  return !!data
}

describe('Channel deletion prevention tests', () => {
  beforeAll(async () => {
    await resetAndSeedAppData(APPNAME)
  })
  
  afterAll(async () => {
    await resetAppData(APPNAME)
    await resetAppDataStats(APPNAME)
  })
  
  it('should not delete channel when removing device override', async () => {
    // Create a test channel
    const channelName = `test_channel_${randomUUID().substring(0, 8)}`
    const channelData = await createTestChannel(channelName)
    
    // Create a device ID
    const deviceId = randomUUID().toLowerCase()
    
    // Create a device override for the channel
    await createDeviceOverride(deviceId, channelData.id, channelData.owner_org)
    
    // Verify the channel exists
    expect(await channelExists(channelData.id)).toBe(true)
    
    // Delete the device override using the API
    const data = getBaseData(APPNAME)
    data.device_id = deviceId
    
    const response = await fetch(`${BASE_URL}/channel_self`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify(data)
    })
    
    expect(response.ok).toBe(true)
    
    // Verify the channel still exists after deletion
    expect(await channelExists(channelData.id)).toBe(true)
  })
})
