import { type RunnableTest, type SupabaseType, responseOk, assert, getResponseError, getUpdateBaseData, responseStatusCode } from '../../utils.ts'

const baseData = {
  channel: 'production',
  ...getUpdateBaseData()
}

const getBaseData = (): typeof baseData => structuredClone(baseData)

type HttpMethod = 'POST' | 'PUT' | 'DELETE'

export function getTest(): RunnableTest {
  return {
    fullName: 'Test self assign endpoint',
    testWithRedis: true,
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
        test: (backendBaseUrl, supabase) => testInvalidSemver(backendBaseUrl, supabase, 'POST'),
      },
      {
        name: 'Test post without field (device_id) (post)',
        timesToExecute: 1,
        test: (backendBaseUrl, supabase) => testPostWithoutField(backendBaseUrl, supabase, 'device_id', 'POST')
      },
      {
        name: 'Test post without field (app_id) (post)',
        timesToExecute: 1,
        test: (backendBaseUrl, supabase) => testPostWithoutField(backendBaseUrl, supabase, 'app_id', 'POST')
      },
      {
        name: 'Test with a version that does not exist (post)',
        timesToExecute: 1,
        test: testWithNotExistingVersion,
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
      // Put from this point on
      {
        name: 'Test invalid semver (put)',
        timesToExecute: 1,
        test: (backendBaseUrl, supabase) => testInvalidSemver(backendBaseUrl, supabase, 'PUT'),
      },
      {
        name: 'Test post without field (device_id) (put)',
        timesToExecute: 1,
        test: (backendBaseUrl, supabase) => testPostWithoutField(backendBaseUrl, supabase, 'device_id', 'PUT')
      },
      {
        name: 'Test post without field (app_id) (put)',
        timesToExecute: 1,
        test: (backendBaseUrl, supabase) => testPostWithoutField(backendBaseUrl, supabase, 'app_id', 'PUT')
      },
    ],
  }
}

function getEndpointUrl(backendBaseUrl: URL) {
  return new URL('channel_self', backendBaseUrl)
}

function fetchEndpoint(backendBaseUrl: URL, method: HttpMethod, body: object) {
  return fetch(getEndpointUrl(backendBaseUrl), {
    method: method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
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
  //responseOk(response, 'Test invalid semver')
  
  const error = await getResponseError(response)
  assert(error === 'semver_error', `Response error ${error} is not equal to semver_error`)
}

async function testPostWithoutField(backendBaseUrl: URL, _supabase: SupabaseType, field: string, method: HttpMethod) {
  // Dirty, tho should work
  const baseData = getBaseData() as any
  delete baseData[field]

  const response = await fetchEndpoint(backendBaseUrl, method, baseData)
  responseStatusCode(response, 400, `Test post without field ${field}`)

  // ZOD is used for post, but put has a custom validation. We test both here
  const error = await getResponseError(response)
  assert(error.includes('Cannot parse json') || error.includes('missing_info'), `Response error ${error} is not equal to missing_info`)
}

// Enough for JSON tests, let's move on
async function testWithNotExistingVersion(backendBaseUrl: URL, supabase: SupabaseType) {
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
    const response = await fetchEndpoint(backendBaseUrl, 'POST', baseData)
    responseStatusCode(response, 400, 'Test with not existing version')
  
    const responseRrror = await getResponseError(response)
    assert(responseRrror === 'version_error', `Response error ${error} is not equal to version_error`)
  } finally {
      // We rename the 'build_not_in' version back to 'buildin'
      const { error } = await supabase.from('app_versions')
        .update({ name: 'builtin' })
        .eq('id', data!.id)
        .select('id')
        .single()
      
      assert (error === null, `Error while updating version: ${error}`)
  }
}

async function testNoChannel(backendBaseUrl: URL, supabase: SupabaseType) {
  // Dirty, tho should work
  const baseData = getBaseData() as any
  delete baseData['channel']

  const response = await fetchEndpoint(backendBaseUrl, 'POST', baseData)
  responseStatusCode(response, 400, `Test post without field channel`)

  const error = await getResponseError(response)
  assert(error === 'cannot_override', `Response error ${error} is not equal to cannot_override`)
}

async function testUnexistingChannel(backendBaseUrl: URL, supabase: SupabaseType) {
  const baseData = getBaseData()
  baseData.channel = 'unexisting_channel'

  const response = await fetchEndpoint(backendBaseUrl, 'POST', baseData)
  responseStatusCode(response, 400, `Test post with unexisting channel`)

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
    responseStatusCode(response, 400, `Test post with channel disabled update`)

    const error = await getResponseError(response)
    assert(error === 'channel_not_found', `Response error ${error} is not equal to channel_not_found`)
  } finally {
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
  baseData.device_id = crypto.randomUUID()

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