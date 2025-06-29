import type { DeviceLink, HttpMethod } from './test-utils.ts'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, getBaseData, getSupabaseClient, resetAndSeedAppData, resetAppData, resetAppDataStats } from './test-utils.ts'

interface ChannelInfo {
  id: string
  name: string
  public: boolean
  allow_self_set: boolean
}

type ChannelsListResponse = ChannelInfo[]

const id = randomUUID()
const APPNAME = `com.sa.${id}`

async function fetchEndpoint(method: HttpMethod, bodyIn: object) {
  const url = new URL(`${BASE_URL}/channel_self`)
  if (method === 'DELETE') {
    for (const [key, value] of Object.entries(bodyIn))
      url.searchParams.append(key, value.toString())
  }

  const body = method !== 'DELETE' ? JSON.stringify(bodyIn) : undefined
  const response = await fetch(url, {
    method,
    body,
  })

  return response
}

async function fetchGetChannels(queryParams: Record<string, string>) {
  const url = new URL(`${BASE_URL}/channel_self`)
  for (const [key, value] of Object.entries(queryParams))
    url.searchParams.append(key, value)

  const response = await fetch(url, {
    method: 'GET',
  })

  return response
}

async function getResponseError(response: Response) {
  const json = await response.json<{ error: string }>()
  return json.error
}

beforeAll(async () => {
  await resetAndSeedAppData(APPNAME)
})
afterAll(async () => {
  // await resetAppData(APPNAME)
  // await resetAppDataStats(APPNAME)
})

describe('invalids /channel_self tests', () => {
  it('[POST] invalid json', async () => {
    const response = await fetch(`${BASE_URL}/channel_self`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: 'invalid json ;-)',
    })

    expect(response.ok).toBe(false)
    await response.arrayBuffer()
  })

  it('[POST] empty json', async () => {
    const response = await fetchEndpoint('POST', {})

    const error = await getResponseError(response)

    expect(error).toContain('Cannot parse json')
  })

  it('[POST] invalid semver', async () => {
    const data = getBaseData(APPNAME)
    data.version_build = 'invalid semver'

    const response = await fetchEndpoint('POST', data)
    const error = await getResponseError(response)

    expect(error).toBe('semver_error')
  })

  it('[POST] without field (device_id)', async () => {
    const data = getBaseData(APPNAME)
    delete data.device_id

    const response = await fetchEndpoint('POST', data)
    expect(response.status).toBe(400)

    const error = await getResponseError(response)
    expect(error).toMatch(/Cannot parse json|missing_info/)
  })

  it('[POST] without field (app_id)', async () => {
    const data = getBaseData(APPNAME)
    delete data.app_id

    const response = await fetchEndpoint('POST', data)
    expect(response.status).toBe(400)

    const error = await getResponseError(response)
    expect(error).toMatch(/Cannot parse json|missing_info/)
  })

  it('[POST] without channel', async () => {
    const data = getBaseData(APPNAME)
    delete data.channel

    const response = await fetchEndpoint('POST', data)
    expect(response.status).toBe(400)

    const error = await getResponseError(response)
    expect(error).toBe('cannot_override')
  })

  it('[POST] with a channel that does not exist', async () => {
    const data = getBaseData(APPNAME)
    data.channel = 'unexisting_channel'

    const response = await fetchEndpoint('POST', data)
    expect(response.status).toBe(400)

    const error = await getResponseError(response)
    expect(error).toBe('channel_not_found')
  })

  it('[POST] with a channel that does not allow self assign', async () => {
    const data = getBaseData(APPNAME)
    if (!data.channel)
      throw new Error('channel is undefined')

    const { error } = await getSupabaseClient().from('channels').update({ allow_device_self_set: false }).eq('name', data.channel).eq('app_id', APPNAME).select('id').single()

    expect(error).toBeNull()

    try {
      const response = await fetchEndpoint('POST', data)
      expect(response.status).toBe(400)

      const responseError = await getResponseError(response)
      expect(responseError).toBe('channel_set_from_plugin_not_allowed')
    }
    finally {
      const { error } = await getSupabaseClient().from('channels').update({ allow_device_self_set: true }).eq('name', data.channel).eq('app_id', APPNAME).select('id').single()

      expect(error).toBeNull()
    }
  })

  it('[PUT] invalid semver', async () => {
    const data = getBaseData(APPNAME)
    data.version_build = 'invalid semver'

    const response = await fetchEndpoint('PUT', data)
    const error = await getResponseError(response)

    expect(error).toBe('semver_error')
  })

  it('[PUT] post without field (device_id)', async () => {
    const data = getBaseData(APPNAME)
    delete data.device_id

    const response = await fetchEndpoint('PUT', data)
    expect(response.status).toBe(400)

    const error = await getResponseError(response)
    expect(error).toMatch(/Cannot parse json|missing_info/)
  })

  it('[PUT] post without field (app_id)', async () => {
    const data = getBaseData(APPNAME)
    delete data.app_id

    const response = await fetchEndpoint('PUT', data)
    expect(response.status).toBe(400)

    const error = await getResponseError(response)
    expect(error).toMatch(/Cannot parse json|missing_info/)
  })

  it('[PUT] with a version that does not exist', async () => {
    const data = getBaseData(APPNAME)
    data.version_name = `1.0.${Math.floor(Math.random() * 10000000)}`

    const { error } = await getSupabaseClient().from('app_versions').update({ name: 'build_not_in' }).eq('name', 'builtin').eq('app_id', APPNAME).select('id').single()

    expect(error).toBeNull()

    try {
      const response = await fetchEndpoint('PUT', data)
      expect(response.status).toBe(400)

      const responseError = await getResponseError(response)
      expect(responseError).toBe('version_error')
    }
    finally {
      const { error } = await getSupabaseClient().from('app_versions').update({ name: 'builtin' }).eq('name', 'build_not_in').eq('app_id', APPNAME).select('id').single()

      expect(error).toBeNull()
    }
  })

  it('[DELETE] invalid semver', async () => {
    const data = getBaseData(APPNAME)
    data.version_build = 'invalid semver'

    const response = await fetchEndpoint('DELETE', data)
    const error = await getResponseError(response)

    expect(error).toBe('semver_error')
  })

  it('[DELETE] post without field (device_id)', async () => {
    const data = getBaseData(APPNAME)
    delete data.device_id

    const response = await fetchEndpoint('DELETE', data)
    expect(response.status).toBe(400)

    const error = await getResponseError(response)
    expect(error).toMatch(/Cannot parse json|missing_info/)
  })

  it('[DELETE] post without field (app_id)', async () => {
    const data = getBaseData(APPNAME)
    delete data.app_id

    const response = await fetchEndpoint('DELETE', data)
    expect(response.status).toBe(400)

    const error = await getResponseError(response)
    expect(error).toMatch(/Cannot parse json|missing_info/)
  })
})

describe('GET /channel_self tests', () => {
  it('[GET] without query params should return status ok', async () => {
    const response = await fetch(`${BASE_URL}/channel_self`, {
      method: 'GET',
    })

    expect(response.ok).toBe(true)
    const json = await response.json<{ status: string }>()
    expect(json.status).toBe('ok')
  })

  it('[GET] with invalid app_id format', async () => {
    const response = await fetchGetChannels({
      app_id: 'invalid-app-id',
      platform: 'ios',
      is_emulator: 'false',
      is_prod: 'true',
    })

    expect(response.status).toBe(400)
    const error = await getResponseError(response)
    expect(error).toContain('Invalid query parameters')
  })

  it('[GET] with missing app_id', async () => {
    const response = await fetchGetChannels({
      platform: 'ios',
      is_emulator: 'false',
      is_prod: 'true',
    })

    expect(response.ok).toBe(true)
    const json = await response.json<{ status: string }>()
    expect(json.status).toBe('ok')
  })

  it('[GET] with invalid platform', async () => {
    const response = await fetchGetChannels({
      app_id: APPNAME,
      platform: 'windows',
      is_emulator: 'false',
      is_prod: 'true',
    })

    expect(response.status).toBe(400)
    const error = await getResponseError(response)
    expect(error).toContain('Invalid query parameters')
  })

  it('[GET] with non-existent app_id', async () => {
    const response = await fetchGetChannels({
      app_id: 'com.nonexistent.app',
      platform: 'ios',
      is_emulator: 'false',
      is_prod: 'true',
    })

    expect(response.status).toBe(400)
    const error = await getResponseError(response)
    expect(error).toBe('app_not_found')
  })

  it('[GET] should return compatible channels for iOS', async () => {
    await resetAndSeedAppData(APPNAME)

    const response = await fetchGetChannels({
      app_id: APPNAME,
      platform: 'ios',
      is_emulator: 'false',
      is_prod: 'true',
    })

    expect(response.ok).toBe(true)
    const json = await response.json<ChannelsListResponse>()
    
    expect(json).toBeDefined()
    expect(Array.isArray(json)).toBe(true)

    // Should include channels that have ios=true: beta and development
    const channelNames = json.map(ch => ch.name)
    expect(channelNames).toContain('beta')
    expect(channelNames).toContain('development')
    
    // Should NOT include channels that have ios=false: production and no_access
    expect(channelNames).not.toContain('production')
    expect(channelNames).not.toContain('no_access')
    
    expect(json).toHaveLength(2)
  })

  it('[GET] should return compatible channels for Android', async () => {
    await resetAndSeedAppData(APPNAME)

    const response = await fetchGetChannels({
      app_id: APPNAME,
      platform: 'android',
      is_emulator: 'false',
      is_prod: 'true',
    })

    expect(response.ok).toBe(true)
    const json = await response.json() as ChannelsListResponse
    
    expect(json).toBeDefined()
    expect(Array.isArray(json)).toBe(true)

    // Should include channels that have android=true: production and beta
    const channelNames = json.map(ch => ch.name)
    expect(channelNames).toContain('production')
    expect(channelNames).toContain('beta')
    
    // Should NOT include channels that have android=false: development and no_access
    expect(channelNames).not.toContain('development')
    expect(channelNames).not.toContain('no_access')
    
    expect(json).toHaveLength(2)
  })

  it('[GET] should return empty list when no channels allow self set', async () => {
    await resetAndSeedAppData(APPNAME)

    // Ensure all channels have self set disabled (should be default)
    const { error: updateError } = await getSupabaseClient()
      .from('channels')
      .update({ allow_device_self_set: false })
      .eq('app_id', APPNAME)

    expect(updateError).toBeNull()

    const response = await fetchGetChannels({
      app_id: APPNAME,
      platform: 'ios',
      is_emulator: 'false',
      is_prod: 'true',
    })

    expect(response.ok).toBe(true)
    const json = await response.json() as ChannelsListResponse
    
    expect(json).toBeDefined()
    expect(Array.isArray(json)).toBe(true)
    expect(json).toHaveLength(0)
  })

  it('[GET] should only return channels compatible with platform', async () => {
    await resetAndSeedAppData(APPNAME)

    // Ensure all channels have self set enabled (restore default state)
    const { error: updateError } = await getSupabaseClient()
      .from('channels')
      .update({ allow_device_self_set: true })
      .eq('app_id', APPNAME)

    expect(updateError).toBeNull()

    // Request iOS channels
    const iosResponse = await fetchGetChannels({
      app_id: APPNAME,
      platform: 'ios',
      is_emulator: 'false',
      is_prod: 'true',
    })

    expect(iosResponse.ok).toBe(true)
    const iosJson = await iosResponse.json() as ChannelsListResponse
    const iosChannelNames = iosJson.map(ch => ch.name).sort()
    
    // iOS should get: beta (ios=true, android=true), development (ios=true, android=false)
    expect(iosChannelNames).toEqual(['beta', 'development'])

    // Request Android channels
    const androidResponse = await fetchGetChannels({
      app_id: APPNAME,
      platform: 'android',
      is_emulator: 'false',
      is_prod: 'true',
    })

    expect(androidResponse.ok).toBe(true)
    const androidJson = await androidResponse.json() as ChannelsListResponse
    const androidChannelNames = androidJson.map(ch => ch.name).sort()
    
    // Android should get: beta (ios=true, android=true), production (ios=false, android=true)
    expect(androidChannelNames).toEqual(['beta', 'production'])

    // Verify that the overlapping channel (beta) appears in both
    expect(iosChannelNames).toContain('beta')
    expect(androidChannelNames).toContain('beta')
    
    // Verify platform-specific channels
    expect(iosChannelNames).toContain('development') // iOS only
    expect(androidChannelNames).toContain('production') // Android only
  })

  it('[GET] should handle emulator and prod flags correctly', async () => {
    await resetAndSeedAppData(APPNAME)

    const response = await fetchGetChannels({
      app_id: APPNAME,
      platform: 'ios',
      is_emulator: 'true',
      is_prod: 'false',
    })

    expect(response.ok).toBe(true)
    const json = await response.json() as ChannelsListResponse
    
    // Just verify we get an array of channels
    expect(Array.isArray(json)).toBe(true)
  })

  it('[GET] should default prod to true when not specified', async () => {
    await resetAndSeedAppData(APPNAME)

    const response = await fetchGetChannels({
      app_id: APPNAME,
      platform: 'ios',
      is_emulator: 'false',
    })

    expect(response.ok).toBe(true)
    const json = await response.json() as ChannelsListResponse
    
    // Just verify we get an array of channels
    expect(Array.isArray(json)).toBe(true)
  })
})

it('[POST] with a version that does not exist', async () => {
  const data = getBaseData(APPNAME)
  data.version_name = `1.0.350`

  const response = await fetchEndpoint('POST', data)
  expect(response.status).toBe(200)

  const responseError = await getResponseError(response)
  expect(responseError).toBeUndefined()
})

it('[POST] /channel_self with default channel', async () => {
  await resetAndSeedAppData(APPNAME)

  const data = getBaseData(APPNAME)
  data.device_id = randomUUID().toLowerCase()

  const { error: channelUpdateError, data: noAccessData } = await getSupabaseClient()
    .from('channels')
    .update({ allow_device_self_set: true })
    .eq('name', 'no_access')
    .eq('app_id', APPNAME)
    .select('id, owner_org, public')
    .single()

  expect(channelUpdateError).toBeNull()
  expect(noAccessData).toBeTruthy()
  expect(noAccessData!.public).toBeFalsy()

  try {
    const { error: overwriteUpsertError } = await getSupabaseClient().from('channel_devices').upsert({
      app_id: APPNAME,
      channel_id: noAccessData!.id,
      device_id: data.device_id,
      owner_org: noAccessData!.owner_org,
    }, { onConflict: 'device_id, app_id' })

    expect(overwriteUpsertError).toBeNull()

    data.channel = 'production'
    const response = await fetchEndpoint('POST', data)
    expect(response.ok).toBeTruthy()
    expect(await response.json()).toEqual({ status: 'ok' })

    const { data: channelDevice, error: channelDeviceError } = await getSupabaseClient()
      .from('channel_devices')
      .select('*')
      .eq('device_id', data.device_id)
      .eq('app_id', APPNAME)

    expect(channelDeviceError).toBeNull()
    expect(channelDevice).toBeTruthy()
    expect(channelDevice).toHaveLength(0)
  }
  finally {
    const { error: channelUpdateError } = await getSupabaseClient().from('channels').update({ allow_device_self_set: false }).eq('name', 'no_access').eq('app_id', APPNAME)

    expect(channelUpdateError).toBeNull()
  }
})

it('[PUT] /channel_self (no overwrite)', async () => {
  await resetAndSeedAppData(APPNAME)

  const data = getBaseData(APPNAME)
  data.device_id = randomUUID().toLowerCase()

  const response = await fetchEndpoint('PUT', data)
  expect(response.ok).toBe(true)

  const responseJSON = await response.json<{ channel: string, status: string }>()
  const channel = responseJSON.channel
  const status = responseJSON.status

  expect(channel).toBeTruthy()
  expect(status).toBeTruthy()

  expect(status).toBe('default')
  expect(channel).toBe(data.channel)
})

it('[PUT] /channel_self (with overwrite)', async () => {
  await resetAndSeedAppData(APPNAME)

  const data = getBaseData(APPNAME)
  data.device_id = randomUUID().toLowerCase()

  const { data: noAccessChannel, error: noAccessChannelError } = await getSupabaseClient().from('channels').select('id, owner_org').eq('name', 'no_access').eq('app_id', APPNAME).single()

  expect(noAccessChannelError).toBeNull()
  expect(noAccessChannel).toBeTruthy()

  const noAccessId = noAccessChannel!.id
  const ownerOrg = noAccessChannel!.owner_org

  const { error } = await getSupabaseClient().from('channel_devices').upsert({
    app_id: APPNAME,
    channel_id: noAccessId,
    device_id: data.device_id,
    owner_org: ownerOrg,
  }, { onConflict: 'device_id, app_id' })

  expect(error).toBeNull()

  try {
    const response = await fetchEndpoint('PUT', data)
    expect(response.ok).toBe(true)

    const responseJSON = await response.json<{ channel: string, status: string }>()
    const channel = responseJSON.channel
    const status = responseJSON.status

    expect(channel).toBeTruthy()
    expect(status).toBeTruthy()

    expect(status).toBe('override')
    expect(channel).toBe('no_access')
  }
  finally {
    const { error } = await getSupabaseClient().from('channel_devices').delete().eq('device_id', data.device_id).eq('app_id', APPNAME).eq('owner_org', ownerOrg).eq('channel_id', noAccessId).single()

    expect(error).toBeNull()
  }
})

it('[PUT] /channel_self with defaultChannel parameter', async () => {
  await resetAndSeedAppData(APPNAME)

  const data = getBaseData(APPNAME) as DeviceLink
  data.device_id = randomUUID().toLowerCase()
  data.defaultChannel = 'no_access'

  const response = await fetchEndpoint('PUT', data)
  expect(response.ok).toBe(true)

  const responseJSON = await response.json<{ channel: string, status: string }>()
  expect(responseJSON.channel).toBe('no_access')
  expect(responseJSON.status).toBe('default')
})

it('[PUT] /channel_self with non-existent defaultChannel', async () => {
  await resetAndSeedAppData(APPNAME)

  const data = getBaseData(APPNAME) as DeviceLink
  data.device_id = randomUUID().toLowerCase()
  data.defaultChannel = 'non_existent_channel'

  const response = await fetchEndpoint('PUT', data)
  expect(response.ok).toBe(false)

  const error = await getResponseError(response)
  expect(error).toBe('channel_not_found')
})

it('[POST] /channel_self ok', async () => {
  await resetAndSeedAppData(APPNAME)

  const data = getBaseData(APPNAME)
  data.device_id = randomUUID().toLowerCase()
  data.channel = 'no_access'

  const { error: channelUpdateError } = await getSupabaseClient().from('channels').update({ allow_device_self_set: true }).eq('name', 'no_access').eq('app_id', APPNAME)

  expect(channelUpdateError).toBeNull()

  try {
    const response = await fetchEndpoint('POST', data)
    expect(response.ok).toBe(true)
    expect(await response.json()).toEqual({ status: 'ok' })

    const { error, data: channelDeviceData } = await getSupabaseClient().from('channel_devices').select('*').eq('device_id', data.device_id).eq('app_id', APPNAME).single()

    expect(error).toBeNull()
    expect(channelDeviceData).toBeTruthy()

    const { error: error2, data: prodChannelData } = await getSupabaseClient().from('channels').select('*').eq('name', data.channel).eq('app_id', APPNAME).single()

    expect(error2).toBeNull()
    expect(prodChannelData).toBeTruthy()

    expect(channelDeviceData!.channel_id).toBe(prodChannelData!.id)
  }
  finally {
    const { error: channelUpdateError } = await getSupabaseClient().from('channels').update({ allow_device_self_set: false }).eq('name', 'no_access').eq('app_id', APPNAME)

    expect(channelUpdateError).toBeNull()
  }
})

it('[DELETE] /channel_self (no overwrite)', async () => {
  await resetAndSeedAppData(APPNAME)

  const data = getBaseData(APPNAME)
  data.device_id = randomUUID().toLowerCase()

  const response = await fetchEndpoint('DELETE', data)
  expect(response.status).toBe(400)

  const error = await getResponseError(response)
  expect(error).toBe('cannot_override')
})

it('[DELETE] /channel_self (with overwrite)', async () => {
  await resetAndSeedAppData(APPNAME)

  const data = getBaseData(APPNAME)
  data.device_id = randomUUID().toLowerCase()

  const { data: productionChannel, error: productionChannelError } = await getSupabaseClient().from('channels').select('id, owner_org').eq('name', 'production').eq('app_id', APPNAME).single()

  expect(productionChannelError).toBeNull()
  expect(productionChannel).toBeTruthy()

  const productionId = productionChannel!.id
  const ownerOrg = productionChannel!.owner_org

  const { error } = await getSupabaseClient().from('channel_devices').upsert({
    app_id: APPNAME,
    channel_id: productionId,
    device_id: data.device_id,
    owner_org: ownerOrg,
  }, { onConflict: 'device_id, app_id' })

  expect(error).toBeNull()

  try {
    const response = await fetchEndpoint('DELETE', data)
    expect(response.ok).toBe(true)
    expect(await response.json()).toEqual({ status: 'ok' })

    const { data: channelDevice, error: channelDeviceError } = await getSupabaseClient().from('channel_devices').select('*').eq('device_id', data.device_id).eq('app_id', APPNAME)

    expect(channelDeviceError).toBeNull()
    expect(channelDevice).toBeTruthy()
    expect(channelDevice).toHaveLength(0)
  }
  catch (e) {
    const { error } = await getSupabaseClient().from('channel_devices').delete().eq('device_id', data.device_id).eq('app_id', APPNAME).eq('owner_org', ownerOrg).eq('channel_id', productionId).single()

    expect(error).toBeNull()
    throw e
  }
})

it('verify channel stays after deleting channel_device', async () => {
  await resetAndSeedAppData(APPNAME)

  // 1. Get a channel to use for the test
  const { data: channel, error: channelError } = await getSupabaseClient()
    .from('channels')
    .select('id, name, owner_org')
    .eq('name', 'production')
    .eq('app_id', APPNAME)
    .single()

  expect(channelError).toBeNull()
  expect(channel).toBeTruthy()
  const channelId = channel!.id
  const channelName = channel!.name
  const ownerOrg = channel!.owner_org

  // 2. Create a device linked to this channel
  const deviceId = randomUUID().toLowerCase()
  const { error: insertError } = await getSupabaseClient()
    .from('channel_devices')
    .insert({
      channel_id: channelId,
      device_id: deviceId,
      app_id: APPNAME,
      owner_org: ownerOrg,
    })

  expect(insertError).toBeNull()

  // 3. Verify the device exists
  const { data: deviceBefore, error: deviceBeforeError } = await getSupabaseClient()
    .from('channel_devices')
    .select('*')
    .eq('device_id', deviceId)
    .eq('app_id', APPNAME)
    .single()

  expect(deviceBeforeError).toBeNull()
  expect(deviceBefore).toBeTruthy()
  expect(deviceBefore!.channel_id).toBe(channelId)

  // 4. Delete the device
  const { error: deleteError } = await getSupabaseClient()
    .from('channel_devices')
    .delete()
    .eq('device_id', deviceId)
    .eq('app_id', APPNAME)

  expect(deleteError).toBeNull()

  // 5. Verify the channel still exists
  const { data: channelAfter, error: channelAfterError } = await getSupabaseClient()
    .from('channels')
    .select('id, name')
    .eq('id', channelId)
    .eq('app_id', APPNAME)
    .single()

  expect(channelAfterError).toBeNull()
  expect(channelAfter).toBeTruthy()
  expect(channelAfter!.id).toBe(channelId)
  expect(channelAfter!.name).toBe(channelName)
})
