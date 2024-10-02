import { type RunnableTest, type SupabaseType, assert, getResponseError, getUpdateBaseData, responseOk, responseStatusCode } from '../../utils.ts'

const baseData = {
  channel: 'production',
  ...getUpdateBaseData(),
}

const getBaseData = (): typeof baseData => structuredClone(baseData)

type HttpMethod = 'POST' | 'PUT' | 'DELETE'

export function getTest(): RunnableTest {
  return {
    fullName: 'Test self assign endpoint',
    tests: [
      {
        name: 'Test POST invalid json',
        timesToExecute: 1,
        test: testPostInvalidJson,
      },
      {
        name: 'Test empty POST empty json',
        timesToExecute: 1,
        test: testEmptyJson,
      },
      {
        name: 'Test invalid semver (post)',
        timesToExecute: 1,
        test: async (backendBaseUrl, supabase) => await testInvalidSemver(backendBaseUrl, supabase, 'POST'),
      },
      {
        name: 'Test post without field (device_id) (post)',
        timesToExecute: 1,
        test: async (backendBaseUrl, supabase) => await testPostWithoutField(backendBaseUrl, supabase, 'device_id', 'POST'),
      },
      {
        name: 'Test post without field (app_id) (post)',
        timesToExecute: 1,
        test: async (backendBaseUrl, supabase) => await testPostWithoutField(backendBaseUrl, supabase, 'app_id', 'POST'),
      },
      {
        name: 'Test with a version that does not exist (post)',
        timesToExecute: 1,
        test: async (backendBaseUrl, supabase) => await testWithNotExistingVersion(backendBaseUrl, supabase, 'POST'),
      },
      {
        name: 'Test without channel (post)',
        timesToExecute: 1,
        test: testNoChannel,
      },
      {
        name: 'Test with a channel that does not exist (post)',
        timesToExecute: 1,
        test: testUnexistingChannel,
      },
      {
        name: 'Test with a channel that does not allow self assign (post)',
        timesToExecute: 1,
        test: testPostWithChannelDisabledUpdate,
      },
      {
        name: 'Test ok post',
        timesToExecute: 1,
        test: testOkPost,
      },
      {
        name: 'Test post with default channel',
        timesToExecute: 1,
        test: testPostWithDefaultChannel,
      },
      // Put from this point on
      {
        name: 'Test invalid semver (put)',
        timesToExecute: 1,
        test: async (backendBaseUrl, supabase) => await testInvalidSemver(backendBaseUrl, supabase, 'PUT'),
      },
      {
        name: 'Test post without field (device_id) (put)',
        timesToExecute: 1,
        test: async (backendBaseUrl, supabase) => await testPostWithoutField(backendBaseUrl, supabase, 'device_id', 'PUT'),
      },
      {
        name: 'Test post without field (app_id) (put)',
        timesToExecute: 1,
        test: async (backendBaseUrl, supabase) => await testPostWithoutField(backendBaseUrl, supabase, 'app_id', 'PUT'),
      },
      {
        name: 'Test with a version that does not exist (put)',
        timesToExecute: 1,
        test: async (backendBaseUrl, supabase) => await testWithNotExistingVersion(backendBaseUrl, supabase, 'PUT'),
      },
      {
        name: 'Test without overwrite (put)',
        timesToExecute: 1,
        test: testPutNoOverwrite,
      },
      {
        name: 'Test with overwrite (put)',
        timesToExecute: 1,
        test: testPutWithOverwrite,
      },
      // Delete from this point on
      {
        name: 'Test invalid semver (delete)',
        timesToExecute: 1,
        test: async (backendBaseUrl, supabase) => await testInvalidSemver(backendBaseUrl, supabase, 'DELETE'),
      },
      {
        name: 'Test post without field (device_id) (delete)',
        timesToExecute: 1,
        test: async (backendBaseUrl, supabase) => await testPostWithoutField(backendBaseUrl, supabase, 'device_id', 'DELETE'),
      },
      {
        name: 'Test post without field (app_id) (delete)',
        timesToExecute: 1,
        test: async (backendBaseUrl, supabase) => await testPostWithoutField(backendBaseUrl, supabase, 'app_id', 'DELETE'),
      },
      {
        name: 'Test delete with an overwrite that does not exist',
        timesToExecute: 1,
        test: testDeleteNoOverwrite,
      },
      {
        name: 'Test delete with an overwrite',
        timesToExecute: 1,
        test: testDeleteWithOverwrite,
      },
    ],
  }
}

function getEndpointUrl(backendBaseUrl: URL) {
  return new URL('channel_self', backendBaseUrl)
}

function fetchEndpoint(backendBaseUrl: URL, method: HttpMethod, body: object) {
  const url = getEndpointUrl(backendBaseUrl)

  // DELETE has the body in the url
  if (method === 'DELETE') {
    for (const [key, value] of Object.entries(body))
      url.searchParams.append(key, value.toString())
  }

  return fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: method !== 'DELETE' ? JSON.stringify(body) : undefined,
  })
}

async function testPostInvalidJson(backendBaseUrl: URL, _supabase: SupabaseType) {
  const response = await fetch(getEndpointUrl(backendBaseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: 'invalid json ;-)',
  })

  assert(response.ok === false, `The response should not be ok, response: ${response}`)
}

async function testEmptyJson(backendBaseUrl: URL, _supabase: SupabaseType) {
  // This is a simple test, for more please take a look at zod.ts
  const response = await fetchEndpoint(backendBaseUrl, 'POST', {})
  const error = await getResponseError(response)

  assert(error.includes('Cannot parse json'), `Error ${error} does not inclue 'Cannot parse json'`)
}

async function testInvalidSemver(backendBaseUrl: URL, _supabase: SupabaseType, method: HttpMethod) {
  const baseData = getBaseData()
  baseData.version_build = 'invalid semver'

  const response = await fetchEndpoint(backendBaseUrl, method, baseData)
  // responseOk(response, 'Test invalid semver')

  const error = await getResponseError(response)
  assert(error === 'semver_error', `Response error ${error} is not equal to semver_error`)
}

async function testPostWithoutField(backendBaseUrl: URL, _supabase: SupabaseType, field: string, method: HttpMethod) {
  // Dirty, tho should work
  const baseData = getBaseData() as any
  delete baseData[field]

  const response = await fetchEndpoint(backendBaseUrl, method, baseData)
  await responseStatusCode(response, 400, `Test post without field ${field}`)

  // ZOD is used for post, but put has a custom validation. We test both here
  const error = await getResponseError(response)
  assert(error.includes('Cannot parse json') || error.includes('missing_info'), `Response error ${error} is not equal to missing_info`)
}

// Enough for JSON tests, let's move on
async function testWithNotExistingVersion(backendBaseUrl: URL, supabase: SupabaseType, method: HttpMethod) {
  const baseData = getBaseData()
  baseData.version_name = `1.0.${Math.floor(Math.random() * 10000000)}`

  // We rename the 'buildin' version for a sec, this is to test the "no version" case
  const { error, data } = await supabase.from('app_versions')
    .update({ name: 'build_not_in' })
    .eq('name', 'builtin')
    .select('id')
    .single()

  assert (error === null && !!data, `Error while updating version: ${JSON.stringify(error)}`)

  try {
    const response = await fetchEndpoint(backendBaseUrl, method, baseData)
    responseStatusCode(response, 400, 'Test with not existing version')

    const responseRrror = await getResponseError(response)
    assert(responseRrror === 'version_error', `Response error ${error} is not equal to version_error`)
  }
  finally {
    // We rename the 'build_not_in' version back to 'buildin'
    const { error } = await supabase.from('app_versions')
      .update({ name: 'builtin' })
      .eq('id', data!.id)
      .select('id')
      .single()

    assert (error === null, `Error while updating version: ${error}`)
  }
}

async function testNoChannel(backendBaseUrl: URL, _supabase: SupabaseType) {
  // Dirty, tho should work
  const baseData = getBaseData() as any
  delete baseData.channel

  const response = await fetchEndpoint(backendBaseUrl, 'POST', baseData)
  responseStatusCode(response, 400, 'Test post without field channel')

  const error = await getResponseError(response)
  assert(error === 'cannot_override', `Response error ${error} is not equal to cannot_override`)
}

async function testUnexistingChannel(backendBaseUrl: URL, _supabase: SupabaseType) {
  const baseData = getBaseData()
  baseData.channel = 'unexisting_channel'

  const response = await fetchEndpoint(backendBaseUrl, 'POST', baseData)
  responseStatusCode(response, 400, 'Test post with unexisting channel')

  const error = await getResponseError(response)
  assert(error === 'channel_not_found', `Response error ${error} is not equal to channel_not_found`)
}

async function testPostWithChannelDisabledUpdate(backendBaseUrl: URL, supabase: SupabaseType) {
  const baseData = getBaseData()

  const { error } = await supabase.from('channels')
    .update({ allow_device_self_set: false })
    .eq('name', baseData.channel)
    .select('id')
    .single()

  assert (error === null, `Error while updating channel: ${error}`)

  try {
    const response = await fetchEndpoint(backendBaseUrl, 'POST', baseData)
    responseStatusCode(response, 400, 'Test post with channel disabled update')

    const error = await getResponseError(response)
    assert(error === 'channel_not_found', `Response error ${error} is not equal to channel_not_found`)
  }
  finally {
    const { error } = await supabase.from('channels')
      .update({ allow_device_self_set: true })
      .eq('name', baseData.channel)
      .select('id')
      .single()

    assert (error === null, `Error while updating channel (undo changes): ${error}`)
  }
}

async function testOkPost(backendBaseUrl: URL, supabase: SupabaseType) {
  const baseData = getBaseData()
  basedata.device_id = crypto.randomUUID().toLocaleLowerCase()
  baseData.channel = 'no_access'

  const { error: channelUpdateError } = await supabase.from('channels')
    .update({ allow_device_self_set: true })
    .eq('name', 'no_access')

  assert (channelUpdateError === null, `Error while updating no_access channel: ${JSON.stringify(channelUpdateError)}`)

  try {
    const response = await fetchEndpoint(backendBaseUrl, 'POST', baseData)
    responseOk(response, 'Test ok post')

    const { error, data } = await supabase.from('channel_devices')
      .select('*')
      .eq('device_id', baseData.device_id)
      .eq('app_id', baseData.app_id)
      .single()

    assert(!!data && !error, `Error while fetching channel_devices: ${error}`)

    const { error: error2, data: prodChannelData } = await supabase.from('channels')
      .select('*')
      .eq('name', baseData.channel)
      .eq('app_id', baseData.app_id)
      .single()

    assert (!!prodChannelData && !error2, `Error while fetching channel: ${error2}`)

    assert(data?.channel_id === prodChannelData?.id, `Channel id ${data?.channel_id} is not equal to ${prodChannelData?.id}`)
  }
  finally {
    const { error: channelUpdateError } = await supabase.from('channels')
      .update({ allow_device_self_set: false })
      .eq('name', 'no_access')

    assert (channelUpdateError === null, `Error while updating (revert) no_access channel: ${channelUpdateError}`)
  }
}

// PUT = GET
// Do not ask me why whe fuck is the PUT request here to retrive the current overwrite
async function testPutNoOverwrite(backendBaseUrl: URL, _supabase: SupabaseType) {
  const baseData = getBaseData()
  basedata.device_id = crypto.randomUUID().toLocaleLowerCase()

  const response = await fetchEndpoint(backendBaseUrl, 'PUT', baseData)
  responseOk(response, 'Test PUT (no overwrite)')

  const responseJSON = await response.json()
  const channel = responseJSON.channel
  const status = responseJSON.status

  assert(!!channel, `Channel is not defined (${channel})`)
  assert(!!status, `Channel is not defined (${status})`)

  assert(status === 'default', `Status is not equal to default (status = ${status})`)
  assert(channel === baseData.channel, `Channel is not equal to ${baseData.channel} (Channel = ${channel})`)
}

async function testPutWithOverwrite(backendBaseUrl: URL, supabase: SupabaseType) {
  const baseData = getBaseData()
  basedata.device_id = crypto.randomUUID().toLocaleLowerCase()

  const { data: noAccessChannel, error: noAccessChannelError } = await supabase.from('channels')
    .select('id, owner_org')
    .eq('name', 'no_access')
    .single()

  assert (!!noAccessChannel && !noAccessChannelError, `Error while fetching no_access channel: ${noAccessChannelError}`)

  const noAccessId = noAccessChannel!.id
  const ownerOrg = noAccessChannel!.owner_org

  const { error } = await supabase.from('channel_devices')
    .upsert({
      app_id: baseData.app_id,
      channel_id: noAccessId,
      device_id: baseData.device_id,
      owner_org: ownerOrg,
    }, { onConflict: 'app_id,device_id' })

  assert (error === null, `Error while inserting channel_device: ${error}`)

  try {
    const response = await fetchEndpoint(backendBaseUrl, 'PUT', baseData)
    responseOk(response, 'Test PUT (with overwrite)')

    const responseJSON = await response.json()
    const channel = responseJSON.channel
    const status = responseJSON.status

    assert(!!channel, `Channel is not defined (${channel})`)
    assert(!!status, `Channel is not defined (${status})`)

    assert(status === 'override', `Status is not equal to override (status = ${status})`)
    assert(channel === 'no_access', `Channel is not equal to no_access (Channel = ${channel})`)
  }
  finally {
    const { error } = await supabase.from('channel_devices')
      .delete()
      .eq('device_id', baseData.device_id)
      .eq('app_id', baseData.app_id)
      .eq('owner_org', ownerOrg)
      .eq('channel_id', noAccessId)
      .single()

    assert (error === null, `Error while deleting channel_device: ${error}`)
  }
}

async function testDeleteNoOverwrite(backendBaseUrl: URL, _supabase: SupabaseType) {
  const baseData = getBaseData()
  basedata.device_id = crypto.randomUUID().toLocaleLowerCase()

  const response = await fetchEndpoint(backendBaseUrl, 'DELETE', baseData)
  await responseStatusCode(response, 400, 'Test DELETE (no overwrite)')

  const error = await getResponseError(response)
  assert(error === 'cannot_override', 'Error is not equal to cannot_override')
}

async function testDeleteWithOverwrite(backendBaseUrl: URL, supabase: SupabaseType) {
  const baseData = getBaseData()
  basedata.device_id = crypto.randomUUID().toLocaleLowerCase()

  const { data: productionChannel, error: productionChannelError } = await supabase.from('channels')
    .select('id, owner_org')
    .eq('name', 'production')
    .single()

  assert (!!productionChannel && !productionChannelError, `Error while fetching no_access channel: ${productionChannelError}`)

  const productionId = productionChannel!.id
  const ownerOrg = productionChannel!.owner_org

  const { error } = await supabase.from('channel_devices')
    .upsert({
      app_id: baseData.app_id,
      channel_id: productionId,
      device_id: baseData.device_id,
      owner_org: ownerOrg,
    }, { onConflict: 'app_id,device_id' })

  assert (error === null, `Error while inserting channel_device: ${error}`)

  try {
    const response = await fetchEndpoint(backendBaseUrl, 'DELETE', baseData)
    responseOk(response, 'Test DELETE (with overwrite)')

    const { data: channelDevice, error: channelDeviceError } = await supabase.from('channel_devices')
      .select('*')
      .eq('device_id', baseData.device_id)
      .eq('app_id', baseData.app_id)

    assert(channelDeviceError === null, `Error while fetching channel_device: ${channelDeviceError}`)
    assert(channelDevice?.length === 0, `Channel device length is not 0 (It is ${channelDevice?.length}). Data: ${JSON.stringify(channelDevice)}`)
  }
  catch (e) {
    const { error } = await supabase.from('channel_devices')
      .delete()
      .eq('device_id', baseData.device_id)
      .eq('app_id', baseData.app_id)
      .eq('owner_org', ownerOrg)
      .eq('channel_id', productionId)
      .single()

    assert (error === null, `Error while deleting channel_device: ${error}, ${e}`)
    throw e
  }
}

async function testPostWithDefaultChannel(backendBaseUrl: URL, supabase: SupabaseType) {
  // Couple of steps:
  // 1. Allow 'no_access' channel to be self assigned
  // 2. Create a device with 'no_access' channel
  // 3. Post to the self_channel with the same device BUT the `production` channel
  // 4. Check if the device was removed from the DB

  const baseData = getBaseData()
  basedata.device_id = crypto.randomUUID().toLocaleLowerCase()

  // Step 1
  const { error: channelUpdateError, data: noAccessData } = await supabase.from('channels')
    .update({ allow_device_self_set: true })
    .eq('name', 'no_access')
    .eq('app_id', baseData.app_id)
    .select('id, owner_org')
    .single()

  assert (channelUpdateError === null, `Error while updating no_access channel: ${channelUpdateError}`)

  try {
    // Step 2
    // We will not bother to revert step 2. It is not needed
    const { error: overwriteUpsertError } = await supabase.from('channel_devices')
      .upsert({
        app_id: baseData.app_id,
        channel_id: noAccessData!.id,
        device_id: baseData.device_id,
        owner_org: noAccessData!.owner_org,
      }, { onConflict: 'app_id,device_id' })

    assert(overwriteUpsertError === null, `Error while inserting channel_device: ${overwriteUpsertError}`)

    // Step 3
    baseData.channel = 'production'
    const response = await fetchEndpoint(backendBaseUrl, 'POST', baseData)
    responseOk(response, 'Test post with default channel')

    // Step 4
    const { data: channelDevice, error: channelDeviceError } = await supabase.from('channel_devices')
      .select('*')
      .eq('device_id', baseData.device_id)
      .eq('app_id', baseData.app_id)

    assert(channelDeviceError === null, `Error while fetching channel_device: ${channelDeviceError}`)
    assert(channelDevice?.length === 0, `Channel device length is not 0 (It is ${channelDevice?.length}). Data: ${JSON.stringify(channelDevice)}`)
  }
  finally {
    // Undo step 1
    const { error: channelUpdateError } = await supabase.from('channels')
      .update({ allow_device_self_set: false })
      .eq('name', 'no_access')

    assert (channelUpdateError === null, `Error while updating no_access channel: ${channelUpdateError}`)
  }
}
