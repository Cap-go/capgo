import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, createAppVersions, getSupabaseClient, headers, resetAndSeedAppData, resetAppData, resetAppDataStats } from './test-utils.ts'

const APPNAME = 'com.demo.app.deploy_history'

beforeAll(async () => {
  await resetAndSeedAppData(APPNAME)
})

afterAll(async () => {
  await resetAppData(APPNAME)
  await resetAppDataStats(APPNAME)
})

describe('Deploy History Operations', () => {
  it('should record deployment history when channel version changes', async () => {
    // Create test versions
    const version1 = await createAppVersions('1.0.0-history-test', APPNAME, {
      link: 'https://example.com/v1',
      comment: 'Initial version'
    })
    
    const version2 = await createAppVersions('1.0.1-history-test', APPNAME, {
      link: 'https://example.com/v2',
      comment: 'Updated version'
    })
    
    // Create a channel with version1
    const createChannelResponse = await fetch(`${BASE_URL}/channel`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        app_id: APPNAME,
        name: 'history-test-channel',
        version: version1.id
      }),
    })
    
    const channelData = await createChannelResponse.json()
    expect(createChannelResponse.status).toBe(200)
    const channelId = channelData.id
    
    // Update channel to version2
    const updateChannelResponse = await fetch(`${BASE_URL}/channel`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        id: channelId,
        app_id: APPNAME,
        version: version2.id
      }),
    })
    
    expect(updateChannelResponse.status).toBe(200)
    
    // Get deploy history
    const supabase = getSupabaseClient()
    const { data: historyData, error } = await supabase
      .from('deploy_history')
      .select('*')
      .eq('channel_id', channelId)
      .eq('app_id', APPNAME)
    
    expect(error).toBeNull()
    expect(historyData).toBeTruthy()
    expect(historyData.length).toBe(2)
    
    // Check that the latest record has is_current = true
    const latestRecord = historyData.find(record => record.version_id === version2.id)
    expect(latestRecord).toBeTruthy()
    expect(latestRecord.is_current).toBe(true)
    
    // Check that the previous record has is_current = false
    const previousRecord = historyData.find(record => record.version_id === version1.id)
    expect(previousRecord).toBeTruthy()
    expect(previousRecord.is_current).toBe(false)
  })
})
