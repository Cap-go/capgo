import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { getBaseData, getSupabaseClient, resetAndSeedAppData } from './test-utils.ts'

const APPNAME = 'com.demo.app.channel_deletion'
const FUNCTIONS_URL = process.env.FUNCTIONS_URL ?? 'http://127.0.0.1:54321/functions/v1'

async function setupChannel(channelName: string, allowSelfSet: boolean) {
  const { error } = await getSupabaseClient()
    .from('channels')
    .update({ allow_device_self_set: allowSelfSet })
    .eq('name', channelName)
    .eq('app_id', APPNAME)
  
  if (error) {
    throw new Error(`Failed to setup channel: ${error.message}`)
  }
}

interface ChannelResponse {
  channel?: string;
  status?: string;
  error?: string;
  message?: string;
}

async function fetchEndpoint(method: string, bodyIn: object) {
  const url = new URL(`${FUNCTIONS_URL}/channel_self`)
  if (method === 'DELETE') {
    for (const [key, value] of Object.entries(bodyIn))
      url.searchParams.append(key, value.toString())
  }

  const body = method !== 'DELETE' ? JSON.stringify(bodyIn) : undefined
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0`,
    },
    body,
  })

  if (!response.ok) {
    const errorData = await response.json() as ChannelResponse
    console.error('Request failed:', {
      status: response.status,
      error: errorData.error,
      message: errorData.message
    })
  }

  return response
}

let productionChannelId: number

beforeAll(async () => {
  // Set up environment variables for local testing
  process.env.SUPABASE_URL = 'http://127.0.0.1:54321'
  process.env.SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

  await resetAndSeedAppData(APPNAME)
  
  const { data: channels, error: findError } = await getSupabaseClient()
    .from('channels')
    .select('*')
    .eq('name', 'production')
    .eq('app_id', APPNAME)
    .eq('owner_org', '046a36ac-e03c-4590-9257-bd6c9dba9ee8')
    .limit(1)
  
  if (findError || !channels || channels.length === 0) {
    throw new Error(`Failed to find production channel: ${findError?.message || 'Channel not found'}`)
  }
  
  productionChannelId = channels[0].id

  const { error: updateError } = await getSupabaseClient()
    .from('channels')
    .update({ allow_device_self_set: true })
    .eq('id', productionChannelId)

  if (updateError) {
    throw new Error(`Failed to update channel: ${updateError.message}`)
  }
})

describe('channel deletion tests', () => {
  it('should not delete channel when setting and unsetting device channel', async () => {
    await resetAndSeedAppData(APPNAME)
    const deviceId = randomUUID().toLowerCase()
    const data = {
      ...getBaseData(APPNAME),
      device_id: deviceId,
      platform: 'ios',
      channel: 'production'
    }

    await setupChannel('production', true)
    try {
      // Initial channel verification
      const { data: initialChannel, error: initialError } = await getSupabaseClient()
        .from('channels')
        .select('id, name, allow_device_self_set')
        .eq('id', productionChannelId)
        .eq('owner_org', '046a36ac-e03c-4590-9257-bd6c9dba9ee8')
        .single()
      
      expect(initialError).toBeNull()
      expect(initialChannel).toBeTruthy()
      expect(initialChannel!.allow_device_self_set).toBe(true)

      // Set channel
      const setResponse = await fetchEndpoint('POST', data)
      expect(setResponse.ok).toBe(true)
      expect(await setResponse.json()).toEqual({ status: 'ok' })

      // Verify channel assignment
      const { data: channelDevice, error: channelDeviceError } = await getSupabaseClient()
        .from('channel_devices')
        .select('channel_id, device_id')
        .eq('device_id', deviceId)
        .eq('app_id', APPNAME)
        .single()

      expect(channelDeviceError).toBeNull()
      expect(channelDevice).toBeTruthy()
      expect(channelDevice!.channel_id).toBe(productionChannelId)

      // Unset channel
      const unsetResponse = await fetchEndpoint('DELETE', data)
      expect(unsetResponse.ok).toBe(true)
      expect(await unsetResponse.json()).toEqual({ status: 'ok' })

      // Verify channel still exists after unset
      const { data: channelAfterUnset, error: channelAfterUnsetError } = await getSupabaseClient()
        .from('channels')
        .select('id, name, allow_device_self_set')
        .eq('id', productionChannelId)
        .single()

      expect(channelAfterUnsetError).toBeNull()
      expect(channelAfterUnset).toBeTruthy()
      expect(channelAfterUnset!.name).toBe('production')
      expect(channelAfterUnset!.id).toBe(initialChannel!.id)
      expect(channelAfterUnset!.allow_device_self_set).toBe(true)

      // Verify device assignment is removed
      const { data: deviceAssignments, error: deviceAssignmentsError } = await getSupabaseClient()
        .from('channel_devices')
        .select('channel_id, device_id')
        .eq('device_id', deviceId)
        .eq('app_id', APPNAME)

      expect(deviceAssignmentsError).toBeNull()
      expect(deviceAssignments).toBeDefined()
      expect(deviceAssignments!.length).toBe(0)
    } finally {
      await setupChannel('production', false)
    }
  })

  it('should not delete channel when multiple devices set and unset channel simultaneously', async () => {
    await resetAndSeedAppData(APPNAME)
    const deviceCount = 3
    const devices = Array.from({ length: deviceCount }, () => ({
      ...getBaseData(APPNAME),
      device_id: randomUUID().toLowerCase(),
      platform: 'ios',
      channel: 'production'
    }))

    await setupChannel('production', true)
    try {
      const { data: initialChannel, error: initialError } = await getSupabaseClient()
        .from('channels')
        .select('id, name, allow_device_self_set')
        .eq('id', productionChannelId)
        .eq('owner_org', '046a36ac-e03c-4590-9257-bd6c9dba9ee8')
        .single()

      expect(initialError).toBeNull()
      expect(initialChannel).toBeTruthy()
      expect(initialChannel!.allow_device_self_set).toBe(true)

      const setResponses = await Promise.all(devices.map(device => 
        fetchEndpoint('POST', device)
      ))
      
      setResponses.forEach(response => {
        expect(response.ok).toBe(true)
      })

      const unsetResponses = await Promise.all(devices.map(device =>
        fetchEndpoint('DELETE', device)
      ))

      unsetResponses.forEach(response => {
        expect(response.ok).toBe(true)
      })

      const { data: channelAfterUnset, error: channelAfterUnsetError } = await getSupabaseClient()
        .from('channels')
        .select('id, name, allow_device_self_set')
        .eq('id', productionChannelId)
        .eq('owner_org', '046a36ac-e03c-4590-9257-bd6c9dba9ee8')
        .single()

      expect(channelAfterUnsetError).toBeNull()
      expect(channelAfterUnset).toBeTruthy()
      expect(channelAfterUnset!.name).toBe('production')
      expect(channelAfterUnset!.id).toBe(initialChannel!.id)
      expect(channelAfterUnset!.allow_device_self_set).toBe(true)

      const { data: deviceAssignments, error: deviceAssignmentsError } = await getSupabaseClient()
        .from('channel_devices')
        .select('channel_id, device_id')
        .eq('app_id', APPNAME)
        .in('device_id', devices.map(d => d.device_id))

      expect(deviceAssignmentsError).toBeNull()
      expect(deviceAssignments).toBeDefined()
      expect(deviceAssignments!.length).toBe(0)
    } finally {
      await setupChannel('production', false)
    }
  })
})
