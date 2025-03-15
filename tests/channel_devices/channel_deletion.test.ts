import { describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../supabase/functions/_backend/utils/supabase.types'

// Test to ensure that deleting a channel_devices entry doesn't delete the associated channel
describe('Channel Devices Constraint Tests', () => {
  const supabase = createClient<Database>(
    'http://127.0.0.1:54321',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
  )

  it('should not delete channel when channel_devices entry is deleted', async () => {
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
    
    // Create a test channel
    const { data: channelData, error: channelError } = await supabase
      .from('channels')
      .insert([{
        app_id: testAppId,
        name: 'test-channel',
        version: versionData![0].id,
        created_by: '00000000-0000-0000-0000-000000000000',
        owner_org: '00000000-0000-0000-0000-000000000000',
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
    
    // Clean up
    await supabase.from('channels').delete().eq('id', channelData![0].id)
    await supabase.from('app_versions').delete().eq('id', versionData![0].id)
    await supabase.from('apps').delete().eq('app_id', testAppId)
  })
})
