import type { RunnableTest, SupabaseType } from '../../utils.ts'
import { assert, getResponseError, getUpdateBaseData, responseOk, sendUpdate, testPlaywright } from '../../utils.ts'

const TEST2UUID = 'f851c669-5fc3-4d44-b862-f1438aec7383'

export function getTest(): RunnableTest {
  return {
    fullName: 'Test selectable disallow',
    testWithRedis: false,
    tests: [
      {
        name: 'Prepare selectable disallow test',
        test: prepareTest,
        timesToExecute: 1,
      },
      {
        name: 'Test selectable disallow frontend',
        test: testSelectableDisallowFront,
        timesToExecute: 1,
      },
      {
        name: 'Prepare backend test (without metadata)',
        test: prepareMetadataTestFail,
        timesToExecute: 1,
      },
      {
        name: 'Test update fail (no metadata)',
        test: testDisableUpdateBasedOnMetadataFail,
        timesToExecute: 1,
      },
      {
        name: 'Set metadata for selectable disallow test',
        test: prepareMetadataTestSuccess,
        timesToExecute: 1,
      },
      {
        name: 'Test update success (with metadata)',
        test: testDisableUpdateBasedOnMetadataPresent,
        timesToExecute: 1,
      },
    ],
  }
}

async function prepareTest(_backendBaseUrl: URL, supabase: SupabaseType) {
  // Make the channels major allways
  // We disable ab testing so that the second test can safely enable it
  const { data: data1, error: error1 } = await supabase.from('channels')
    .update({ disableAutoUpdate: 'major', enableAbTesting: false, enable_progressive_deploy: false, secondVersion: null })
    .or('id.in.(22,23)')
    .select('*')

  assert(error1 === null, `Supabase channel error ${JSON.stringify(error1)} is not null`)
  assert(data1 !== null, `Supabase channel data ${JSON.stringify(data1)} is null`)
  assert(data1!.length === 2, `Supabase channel data ${JSON.stringify(data1)} length is not 2`)

  // Make the versions allways have no minVersionUpdate metadata
  // 9601 is the id for the 1.359.0 version
  // We set 1.359.0 from the playwright test
  // This will make the test alter the data in supabase, the developer was warned about this
  const { error: error2 } = await supabase.from('app_versions')
    .update({ minUpdateVersion: null })
    .or(`id.in.(${data1![0].version},${data1![1].version},9601)`)

  assert(error2 === null, `Supabase app_versions error ${JSON.stringify(error2)} is not null`)
}

// This is the preparation required for the update to fail with 'misconfigured_channel'
async function prepareMetadataTestFail(_backendBaseUrl: URL, supabase: SupabaseType) {
  // major and minor are tested in backend, we will only test the version_number option here
  // This is what we will pepare for

  // 9601 is the id for the  1.359.0 version
  const { error } = await supabase.from('channels')
    .update({
      disableAutoUpdate: 'version_number',
      enableAbTesting: false,
      enable_progressive_deploy: false,
      secondVersion: null,
      version: 9601,
    })
    .eq('id', 22)

  assert(error === null, `Supabase channel error ${JSON.stringify(error)} is not null`)
}

async function testDisableUpdateBasedOnMetadataFail(backendBaseUrl: URL, _supabase: SupabaseType) {
  // There is no metadata in version, this will always fail
  const baseData = getUpdateBaseData()
  const response = await sendUpdate(backendBaseUrl, baseData)
  await responseOk(response, 'No metadata misconfiguration')
  const error = await getResponseError(response)
  assert(error === 'misconfigured_channel', `Response error ${error} is not equal to misconfigured_channel`)
}

// This is the preparation required for the update to return something
async function prepareMetadataTestSuccess(_backendBaseUrl: URL, supabase: SupabaseType) {
  const { error: versionError } = await supabase.from('app_versions')
    .update({ minUpdateVersion: '1.2.5' })
    .eq('id', 9601)

  assert(versionError === null, `Supabase app_versions error ${JSON.stringify(versionError)} is not null`)
}

async function testDisableUpdateBasedOnMetadataPresent(backendBaseUrl: URL, _supabase: SupabaseType) {
  // Now we have the required metadata. If version_name > 1.2.5 this will succeed, if not then this will fail
  // First we check the fail
  const baseDataFail = getUpdateBaseData()
  const responseFail = await sendUpdate(backendBaseUrl, baseDataFail)
  await responseOk(responseFail, 'Current version to low')
  const errorFail = await getResponseError(responseFail)
  assert(errorFail === 'disable_auto_update_to_metadata', `Response error ${errorFail} is not equal to disable_auto_update_to_metadata`)

  // Now we send 1.2.5 and see if it suceeds
  const baseDataSuccess = getUpdateBaseData()
  baseDataSuccess.version_name = '1.2.5'
  const responseSuccess = await sendUpdate(backendBaseUrl, baseDataSuccess)
  await responseOk(responseSuccess, 'Current version above metadata')
  const responseSuccessJson = await responseSuccess.json()
  assert(responseSuccessJson.url !== undefined, `Response ${JSON.stringify(responseSuccessJson)} has no url`)
  assert(responseSuccessJson.version !== undefined, `Response ${JSON.stringify(responseSuccessJson)} has no version`)
  assert(responseSuccessJson.version === '1.359.0', `Response ${JSON.stringify(responseSuccessJson)} version is not equal to 1.0.0`)
}

async function testSelectableDisallowFront(_backendBaseUrl: URL, _supabase: SupabaseType) {
  await testPlaywright('selectable_disallow.spec', {})
}
