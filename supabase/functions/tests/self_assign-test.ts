import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const BASE_URL = 'http://localhost:54321/functions/v1/'
const headers = {
  'Content-Type': 'application/json',
  'Authorization': 'ae6e7458-c46d-4c00-aa3b-153b0b8520ea',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_KEY') ?? ''
const supabase = createClient(supabaseUrl, supabaseServiceKey)

const baseData = {
  channel: 'production',
  platform: 'android',
  device_id: '00009a6b-eefe-490a-9c60-8e965132ae51',
  app_id: 'com.demo.app',
  custom_id: '',
  version_build: '1.0',
  version_code: '1',
  version_os: '13',
  version_name: '1.0.0',
  plugin_version: '5.2.1',
  is_emulator: false,
  is_prod: true,
}

function getBaseData(): Partial<typeof baseData> {
  return structuredClone(baseData)
}

type HttpMethod = 'POST' | 'PUT' | 'DELETE'

async function resetAndSeedData() {
  const { error } = await supabase.rpc('reset_and_seed_data')
  if (error)
    throw error
}

function getEndpointUrl() {
  const url = new URL('channel_self', BASE_URL)
  return url
}

async function fetchEndpoint(method: HttpMethod, body: object) {
  const url = getEndpointUrl()

  // DELETE has the body in the url
  if (method === 'DELETE') {
    for (const [key, value] of Object.entries(body))
      url.searchParams.append(key, value.toString())
  }

  const response = await fetch(url, {
    method,
    headers,
    body: method !== 'DELETE' ? JSON.stringify(body) : undefined,
  })

  return response
}

async function getResponseError(response: Response) {
  const json = await response.json()
  return json.error
}
await resetAndSeedData()

Deno.test({
  name: 'Invalids /channel_self tests',
  async fn(t) {
    await Promise.all([
      t.step({
        name: 'POST invalid json',
        fn: async () => {
          const response = await fetch(getEndpointUrl(), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: 'invalid json ;-)',
          })

          assertEquals(response.ok, false)
          await response.arrayBuffer()
        },
        sanitizeOps: false,
        sanitizeResources: false,
        sanitizeExit: false,
      }),

      t.step({
        name: 'POST empty json',
        fn: async () => {
          const response = await fetchEndpoint('POST', {})
          const error = await getResponseError(response)

          assert(error.includes('Cannot parse json'))
        },
        sanitizeOps: false,
        sanitizeResources: false,
        sanitizeExit: false,
      }),

      t.step({
        name: 'POST invalid semver',
        fn: async () => {
          const data = getBaseData()
          data.version_build = 'invalid semver'

          const response = await fetchEndpoint('POST', data)
          const error = await getResponseError(response)

          assertEquals(error, 'semver_error')
        },
        sanitizeOps: false,
        sanitizeResources: false,
        sanitizeExit: false,
      }),

      t.step({
        name: 'POST without field (device_id)',
        fn: async () => {
          const data = getBaseData()
          delete data.device_id

          const response = await fetchEndpoint('POST', data)
          assertEquals(response.status, 400)

          const error = await getResponseError(response)
          assert(error.includes('Cannot parse json') || error.includes('missing_info'))
        },
        sanitizeOps: false,
        sanitizeResources: false,
        sanitizeExit: false,
      }),

      t.step({
        name: 'POST without field (app_id)',
        fn: async () => {
          const data = getBaseData()
          delete data.app_id

          const response = await fetchEndpoint('POST', data)
          assertEquals(response.status, 400)

          const error = await getResponseError(response)
          assert(error.includes('Cannot parse json') || error.includes('missing_info'))
        },
        sanitizeOps: false,
        sanitizeResources: false,
        sanitizeExit: false,
      }),

      t.step({
        name: 'POST with a version that does not exist',
        fn: async () => {
          const data = getBaseData()
          data.version_name = `1.0.350`

          const response = await fetchEndpoint('POST', data)
          assertEquals(response.status, 400)

          const responseError = await getResponseError(response)
          assertEquals(responseError, 'version_error')
        },
        sanitizeOps: false,
        sanitizeResources: false,
        sanitizeExit: false,
      }),

      t.step({
        name: 'POST without channel',
        fn: async () => {
          const data = getBaseData()
          delete data.channel

          const response = await fetchEndpoint('POST', data)
          assertEquals(response.status, 400)

          const error = await getResponseError(response)
          assertEquals(error, 'cannot_override')
        },
        sanitizeOps: false,
        sanitizeResources: false,
        sanitizeExit: false,
      }),

      t.step({
        name: 'POST with a channel that does not exist',
        fn: async () => {
          const data = getBaseData()
          data.channel = 'unexisting_channel'

          const response = await fetchEndpoint('POST', data)
          assertEquals(response.status, 400)

          const error = await getResponseError(response)
          assertEquals(error, 'channel_not_found')
        },
        sanitizeOps: false,
        sanitizeResources: false,
        sanitizeExit: false,
      }),

      t.step({
        name: 'POST with a channel that does not allow self assign',
        fn: async () => {
          const data = getBaseData()

          const { error } = await supabase.from('channels')
            .update({ allow_device_self_set: false })
            .eq('name', data.channel)
            .select('id')
            .single()

          assertEquals(error, null)

          try {
            const response = await fetchEndpoint('POST', data)
            assertEquals(response.status, 400)

            const responseError = await getResponseError(response)
            assertEquals(responseError, 'channel_set_from_plugin_not_allowed')
          }
          finally {
            const { error } = await supabase.from('channels')
              .update({ allow_device_self_set: true })
              .eq('name', data.channel)
              .select('id')
              .single()

            assertEquals(error, null)
          }
        },
        sanitizeOps: false,
        sanitizeResources: false,
        sanitizeExit: false,
      }),
      t.step({
        name: 'PUT invalid semver',
        fn: async () => {
          const data = getBaseData()
          data.version_build = 'invalid semver'

          const response = await fetchEndpoint('PUT', data)
          const error = await getResponseError(response)

          assertEquals(error, 'semver_error')
        },
        sanitizeOps: false,
        sanitizeResources: false,
        sanitizeExit: false,
      }),

      t.step({
        name: 'PUT post without field (device_id)',
        fn: async () => {
          const data = getBaseData()
          delete data.device_id

          const response = await fetchEndpoint('PUT', data)
          assertEquals(response.status, 400)

          const error = await getResponseError(response)
          assert(error.includes('Cannot parse json') || error.includes('missing_info'))
        },
        sanitizeOps: false,
        sanitizeResources: false,
        sanitizeExit: false,
      }),

      t.step({
        name: 'PUT post without field (app_id)',
        fn: async () => {
          const data = getBaseData()
          delete data.app_id

          const response = await fetchEndpoint('PUT', data)
          assertEquals(response.status, 400)

          const error = await getResponseError(response)
          assert(error.includes('Cannot parse json') || error.includes('missing_info'))
        },
        sanitizeOps: false,
        sanitizeResources: false,
        sanitizeExit: false,
      }),

      t.step({
        name: 'PUT with a version that does not exist',
        fn: async () => {
          const data = getBaseData()
          data.version_name = `1.0.${Math.floor(Math.random() * 10000000)}`

          const { error } = await supabase.from('app_versions')
            .update({ name: 'build_not_in' })
            .eq('name', 'builtin')
            .select('id')
            .single()

          assertEquals(error, null)

          try {
            const response = await fetchEndpoint('PUT', data)
            assertEquals(response.status, 400)

            const responseError = await getResponseError(response)
            assertEquals(responseError, 'version_error')
          }
          finally {
            const { error } = await supabase.from('app_versions')
              .update({ name: 'builtin' })
              .eq('name', 'build_not_in')
              .select('id')
              .single()

            assertEquals(error, null)
          }
        },
        sanitizeOps: false,
        sanitizeResources: false,
        sanitizeExit: false,
      }),

      t.step({
        name: 'DELETE invalid semver',
        fn: async () => {
          const data = getBaseData()
          data.version_build = 'invalid semver'

          const response = await fetchEndpoint('DELETE', data)
          const error = await getResponseError(response)

          assertEquals(error, 'semver_error')
        },
        sanitizeOps: false,
        sanitizeResources: false,
        sanitizeExit: false,
      }),

      t.step({
        name: 'DELETE post without field (device_id)',
        fn: async () => {
          const data = getBaseData()
          delete data.device_id

          const response = await fetchEndpoint('DELETE', data)
          assertEquals(response.status, 400)

          const error = await getResponseError(response)
          assert(error.includes('Cannot parse json') || error.includes('missing_info'))
        },
        sanitizeOps: false,
        sanitizeResources: false,
        sanitizeExit: false,
      }),

      t.step({
        name: 'DELETE post without field (app_id)',
        fn: async () => {
          const data = getBaseData()
          delete data.app_id

          const response = await fetchEndpoint('DELETE', data)
          assertEquals(response.status, 400)

          const error = await getResponseError(response)
          assert(error.includes('Cannot parse json') || error.includes('missing_info'))
        },
        sanitizeOps: false,
        sanitizeResources: false,
        sanitizeExit: false,
      }),
    ])
  },
})

Deno.test('POST /channel_self with default channel', async () => {
  await resetAndSeedData()

  const data = getBaseData()
  data.device_id = crypto.randomUUID().toLocaleLowerCase()

  const { error: channelUpdateError, data: noAccessData } = await supabase.from('channels')
    .update({ allow_device_self_set: true })
    .eq('name', 'no_access')
    .eq('app_id', data.app_id)
    .select('id, owner_org')
    .single()

  assertEquals(channelUpdateError, null)
  assert(noAccessData)

  try {
    const { error: overwriteUpsertError } = await supabase.from('channel_devices')
      .upsert({
        app_id: data.app_id,
        channel_id: noAccessData.id,
        device_id: data.device_id,
        owner_org: noAccessData.owner_org,
      })

    assertEquals(overwriteUpsertError, null)

    data.channel = 'production'
    const response = await fetchEndpoint('POST', data)
    assertEquals(response.ok, true)
    assertEquals(await response.json(), { status: 'ok' })

    const { data: channelDevice, error: channelDeviceError } = await supabase.from('channel_devices')
      .select('*')
      .eq('device_id', data.device_id)
      .eq('app_id', data.app_id)

    assertEquals(channelDeviceError, null)
    assert(channelDevice)
    assertEquals(channelDevice.length, 0)
  }
  finally {
    const { error: channelUpdateError } = await supabase.from('channels')
      .update({ allow_device_self_set: false })
      .eq('name', 'no_access')

    assertEquals(channelUpdateError, null)
  }
})

Deno.test('PUT /channel_self (no overwrite)', async () => {
  await resetAndSeedData()

  const data = getBaseData()
  data.device_id = crypto.randomUUID().toLocaleLowerCase()

  const response = await fetchEndpoint('PUT', data)
  assertEquals(response.ok, true)

  const responseJSON = await response.json()
  const channel = responseJSON.channel
  const status = responseJSON.status

  assert(channel)
  assert(status)

  assertEquals(status, 'default')
  assertEquals(channel, data.channel)
})

Deno.test('PUT /channel_self (with overwrite)', async () => {
  await resetAndSeedData()

  const data = getBaseData()
  data.device_id = crypto.randomUUID().toLocaleLowerCase()

  const { data: noAccessChannel, error: noAccessChannelError } = await supabase.from('channels')
    .select('id, owner_org')
    .eq('name', 'no_access')
    .single()

  assertEquals(noAccessChannelError, null)
  assert(noAccessChannel)

  const noAccessId = noAccessChannel.id
  const ownerOrg = noAccessChannel.owner_org

  const { error } = await supabase.from('channel_devices')
    .upsert({
      app_id: data.app_id,
      channel_id: noAccessId,
      device_id: data.device_id,
      owner_org: ownerOrg,
    })

  assertEquals(error, null)

  try {
    const response = await fetchEndpoint('PUT', data)
    assertEquals(response.ok, true)

    const responseJSON = await response.json()
    const channel = responseJSON.channel
    const status = responseJSON.status

    assert(channel)
    assert(status)

    assertEquals(status, 'override')
    assertEquals(channel, 'no_access')
  }
  finally {
    const { error } = await supabase.from('channel_devices')
      .delete()
      .eq('device_id', data.device_id)
      .eq('app_id', data.app_id)
      .eq('owner_org', ownerOrg)
      .eq('channel_id', noAccessId)
      .single()

    assertEquals(error, null)
  }
})

Deno.test('POST /channel_self ok', async () => {
  await resetAndSeedData()

  const data = getBaseData()
  data.device_id = crypto.randomUUID().toLocaleLowerCase()
  data.channel = 'no_access'

  const { error: channelUpdateError } = await supabase.from('channels')
    .update({ allow_device_self_set:
      true })
    .eq('name', 'no_access')

  assertEquals(channelUpdateError, null)

  try {
    const response = await fetchEndpoint('POST', data)
    assertEquals(response.ok, true)
    assertEquals(await response.json(), { status: 'ok' })

    const { error, data: channelDeviceData } = await supabase.from('channel_devices')
      .select('*')
      .eq('device_id', data.device_id)
      .eq('app_id', data.app_id)
      .single()

    assertEquals(error, null)
    assert(channelDeviceData)

    const { error: error2, data: prodChannelData } = await supabase.from('channels')
      .select('*')
      .eq('name', data.channel)
      .eq('app_id', data.app_id)
      .single()

    assertEquals(error2, null)
    assert(prodChannelData)

    assertEquals(channelDeviceData.channel_id, prodChannelData.id)
  }
  finally {
    const { error: channelUpdateError } = await supabase.from('channels')
      .update({ allow_device_self_set: false })
      .eq('name', 'no_access')

    assertEquals(channelUpdateError, null)
  }
})

Deno.test('DELETE /channel_self (no overwrite)', async () => {
  await resetAndSeedData()

  const data = getBaseData()
  data.device_id = crypto.randomUUID().toLocaleLowerCase()

  const response = await fetchEndpoint('DELETE', data)
  assertEquals(response.status, 400)

  const error = await getResponseError(response)
  assertEquals(error, 'cannot_override')
})

Deno.test('DELETE /channel_self (with overwrite)', async () => {
  await resetAndSeedData()

  const data = getBaseData()
  data.device_id = crypto.randomUUID().toLocaleLowerCase()

  const { data: productionChannel, error: productionChannelError } = await supabase.from('channels')
    .select('id, owner_org')
    .eq('name', 'production')
    .single()

  assertEquals(productionChannelError, null)
  assert(productionChannel)

  const productionId = productionChannel.id
  const ownerOrg = productionChannel.owner_org

  const { error } = await supabase.from('channel_devices')
    .upsert({
      app_id: data.app_id,
      channel_id: productionId,
      device_id: data.device_id,
      owner_org: ownerOrg,
    })

  assertEquals(error, null)

  try {
    const response = await fetchEndpoint('DELETE', data)
    assertEquals(response.ok, true)
    assertEquals(await response.json(), { status: 'ok' })

    const { data: channelDevice, error: channelDeviceError } = await supabase.from('channel_devices')
      .select('*')
      .eq('device_id', data.device_id)
      .eq('app_id', data.app_id)

    assertEquals(channelDeviceError, null)
    assert(channelDevice)
    assertEquals(channelDevice.length, 0)
  }
  catch (e) {
    const { error } = await supabase.from('channel_devices')
      .delete()
      .eq('device_id', data.device_id)
      .eq('app_id', data.app_id)
      .eq('owner_org', ownerOrg)
      .eq('channel_id', productionId)
      .single()

    assertEquals(error, null)
    throw e
  }
})
