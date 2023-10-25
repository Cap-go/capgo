import { type RunnableTest, type SupabaseType, responseOk, assert, getResponseError, getUpdateBaseData } from '../../utils.ts'

const baseData = {
  channel: 'production',
  ...getUpdateBaseData()
}

const getBaseData = (): typeof baseData => structuredClone(baseData)

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
        test: testInvalidSemverPost,
      },
      {
        name: 'Test post without field (device_id)',
        timesToExecute: 1,
        test: (backendBaseUrl, supabase) => testPostWithoutField(backendBaseUrl, supabase, 'device_id')
      },
      {
        name: 'Test post without field (app_id)',
        timesToExecute: 1,
        test: (backendBaseUrl, supabase) => testPostWithoutField(backendBaseUrl, supabase, 'app_id')
      }
    ],
  }
}

function getEndpointUrl(backendBaseUrl: URL) {
  return new URL('channel_self', backendBaseUrl)
}

function fetchEndpoint(backendBaseUrl: URL, method: 'POST' | 'PUT' | 'DELETE', body: object) {
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

async function testInvalidSemverPost(backendBaseUrl: URL, _supabase: SupabaseType) {
  const baseData = getBaseData()
  baseData.version_build = 'invalid semver'

  const response = await fetchEndpoint(backendBaseUrl, 'POST', baseData)
  //responseOk(response, 'Test invalid semver')
  
  const error = await getResponseError(response)
  assert(error === 'semver_error', `Response error ${error} is not equal to semver_error`)
}

async function testPostWithoutField(backendBaseUrl: URL, _supabase: SupabaseType, field: string) {
  // Dirty, tho should work
  const baseData = getBaseData() as any
  delete baseData[field]

  console.log(baseData)

  const response = await fetchEndpoint(backendBaseUrl, 'POST', baseData)
  responseOk(response, `Test post without field ${field}`)

  const error = await getResponseError(response)
  assert(error === 'missing_info', `Response error ${error} is not equal to missing_info`)
}