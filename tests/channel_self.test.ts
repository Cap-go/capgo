import type { DeviceLink, HttpMethod } from './test-utils.ts'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, getBaseData, getSupabaseClient, headers, resetAndSeedAppData, resetAppData, resetAppDataStats } from './test-utils.ts'

const APPNAME = 'com.demo.app.self_assign'

async function fetchEndpoint(method: HttpMethod, bodyIn: object) {
  const url = new URL(`${BASE_URL}/channel_self`)
  if (method === 'DELETE') {
    for (const [key, value] of Object.entries(bodyIn))
      url.searchParams.append(key, value.toString())
  }

  const body = method !== 'DELETE' ? JSON.stringify(bodyIn) : undefined
  const response = await fetch(url, {
    method,
    headers,
    body,
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
  await resetAppData(APPNAME)
  await resetAppDataStats(APPNAME)
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

  const { error: channelUpdateError, data: noAccessData } = await getSupabaseClient().from('channels').update({ allow_device_self_set: true }).eq('name', 'no_access').eq('app_id', APPNAME).select('id, owner_org, public').single()

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

    const { data: channelDevice, error: channelDeviceError } = await getSupabaseClient().from('channel_devices').select('*').eq('device_id', data.device_id).eq('app_id', APPNAME)

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

it('should not delete channel when setting and unsetting channel from device', async () => {
  await resetAndSeedAppData(APPNAME)
  
  // Get owner org for creating a test channel
  const { data: appData, error: appError } = await getSupabaseClient()
    .from('apps')
    .select('owner_org, user_id')
    .eq('app_id', APPNAME)
    .single()
  
  expect(appError).toBeNull()
  expect(appData).toBeTruthy()
  
  const ownerOrg = appData!.owner_org
  const userId = appData!.user_id
  
  // Get production version ID for the test channel
  const { data: versionData, error: versionError } = await getSupabaseClient()
    .from('app_versions')
    .select('id')
    .eq('app_id', APPNAME)
    .eq('name', 'production')
    .single()
  
  expect(versionError).toBeNull()
  expect(versionData).toBeTruthy()
  
  const productionVersionId = versionData!.id
  
  // Create a test channel
  const channelName = `test-channel-${Date.now()}`
  const { data: channel, error: channelError } = await getSupabaseClient()
    .from('channels')
    .insert({
      name: channelName,
      app_id: APPNAME,
      owner_org: ownerOrg,
      created_by: userId,
      allow_device_self_set: true,
      version: productionVersionId,
      ios: true,
      android: true,
      web: true,
    })
    .select()
    .single()
  
  expect(channelError).toBeNull()
  expect(channel).not.toBeNull()
  
  try {
    // Set channel for device
    const deviceId = `test-device-${Date.now()}`
    const response1 = await fetch(`${BASE_URL}/channel_self`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        device_id: deviceId,
        app_id: APPNAME,
        channel: channelName,
        platform: 'ios',
        version_build: '1.0.0',
      }),
    })
    
    expect(response1.status).toBe(200)
    
    // Verify channel is set
    const { data: channelDevice1, error: channelDeviceError1 } = await getSupabaseClient()
      .from('channel_devices')
      .select()
      .eq('device_id', deviceId.toLowerCase())
      .eq('app_id', APPNAME)
    
    expect(channelDeviceError1).toBeNull()
    expect(channelDevice1).toHaveLength(1)
    
    // Unset channel for device
    const response2 = await fetch(`${BASE_URL}/channel_self`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        device_id: deviceId,
        app_id: APPNAME,
        version_build: '1.0.0',
      }),
    })
    
    expect(response2.status).toBe(200)
    
    // Verify channel device is removed
    const { data: channelDevice2, error: channelDeviceError2 } = await getSupabaseClient()
      .from('channel_devices')
      .select()
      .eq('device_id', deviceId.toLowerCase())
      .eq('app_id', APPNAME)
    
    expect(channelDeviceError2).toBeNull()
    expect(channelDevice2).toHaveLength(0)
    
   // Verify channel still exists
    const { data: channelAfter, error: channelAfterError } = await getSupabaseClient()
      .from('channels')
      .select()
      .eq('id', channel!.id)
      .single()
    
    expect(channelAfterError).toBeNull()
    expect(channelAfter).not.toBeNull()
    expect(channelAfter!.name).toBe(channelName)
  } finally {
    // Clean up
    if (channel) {
      await getSupabaseClient()
        .from('channels')
        .delete()
        .eq('id', channel.id)
    }
  }
})
