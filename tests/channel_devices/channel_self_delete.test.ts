import { describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../supabase/functions/_backend/utils/supabase.types'

// Test to ensure that the deleteOverride function in channel_self.ts doesn't delete channels
describe('Channel Self Delete Tests', () => {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL || 'http://127.0.0.1:54321',
    process.env.SUPABASE_SERVICE_KEY || 'service_role_key_placeholder'
  )

  it('should not delete channel when channel_self deleteOverride is called', async () => {
    // Create a test app
    const testAppId = `test-app-${Date.now()}`
    const { data: appData, error: appError } = await supabase
      .from('apps')
      .insert([{
        app_id: testAppId,
        name: 'Test App',
        user_id: '00000000-0000-0000-0000-000000000000',
        owner_org: '00000000-0000-0000-0000-000000000000',
      }])
      .select()
    
    expect(appError).toBeNull()
    
    // Create a test version
    const { data: versionData, error: versionError } = await supabase
      .from('app_versions')
      .insert([{
        app_id: testAppId,
        name: 'test-version',
        storage_provider: 'r2',
        owner_org: '00000000-0000-0000-0000-000000000000',
      }])
      .select()
    
    expect(versionError).toBeNull()
    expect(versionData).not.toBeNull()
    
    // Create a test channel with allow_device_self_set=true
    const { data: channelData, error: channelError } = await supabase
      .from('channels')
      .insert([{
        app_id: testAppId,
        name: 'test-channel',
        version: versionData![0].id,
        created_by: '00000000-0000-0000-0000-000000000000',
        owner_org: '00000000-0000-0000-0000-000000000000',
        allow_device_self_set: true,
      }])
      .select()
    
    expect(channelError).toBeNull()
    expect(channelData).not.toBeNull()
    
    // Create a channel_devices entry
    const testDeviceId = `test-device-${Date.now()}`
    const { error: channelDeviceError } = await supabase
      .from('channel_devices')
      .insert([{
        app_id: testAppId,
        device_id: testDeviceId,
        channel_id: channelData![0].id,
        owner_org: '00000000-0000-0000-0000-000000000000',
      }])
    
    expect(channelDeviceError).toBeNull()
    
    // Call the channel_self deleteOverride endpoint
    const response = await fetch('http://127.0.0.1:54321/functions/v1/channel_self', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY || 'service_role_key_placeholder'}`,
      },
      body: JSON.stringify({
        app_id: testAppId,
        device_id: testDeviceId,
        version_build: '1.0.0',
      }),
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
    
    // Clean up
    await supabase.from('channels').delete().eq('id', channelData![0].id)
    await supabase.from('app_versions').delete().eq('id', versionData![0].id)
    await supabase.from('apps').delete().eq('app_id', testAppId)
  })
})
