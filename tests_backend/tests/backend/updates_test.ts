import type { RunnableTest, SupabaseType, updateAndroidBaseData as baseData } from '../../utils.ts'
import { assert, assertEquals, delay, getRawSqlConnection, responseOk, sendUpdate, testPlaywright } from '../../utils.ts'

export function getTest(): RunnableTest {
  return {
    fullName: 'Test updates endpoint',
    tests: [
      {
        name: 'Test two channels',
        test: testTwoChannels,
        timesToExecute: 1,
      },
      {
        name: 'Prepare update test',
        test: prepapreUpdateTest,
        timesToExecute: 1,
      },
      {
        name: 'Test updates endpoint (playwright)',
        test: testUpdateEndpoint,
        timesToExecute: 1,
      },
      {
        name: 'Test updates endpoint for IOS',
        test: testForIos,
        timesToExecute: 3,
      },
    ],
  }
}

const baseDataIos = {
  app_id: 'com.demo.app',
  version_build: '1.0.0',
  version_code: '10203999',
  device_id: 'BDACE2AB-53F9-411F-AF7A-C22D104DA632',
  platform: 'ios',
  version: '1.0.0',
  version_os: '16.0.2',
  plugin_version: '4.3.4',
  version_name: 'builtin',
  is_emulator: false,
  is_prod: true,
}

function getBaseDataIos(): typeof baseData {
  return structuredClone(baseDataIos) as any as typeof baseData
}

const noNew = { message: 'No new version available' }

async function prepapreUpdateTest(_backendBaseUrl: URL, supabase: SupabaseType) {
  const { error } = await supabase.from('channels').update({ version: 9654 }).eq('id', 22)
  assert(error === null, `Supabase set channel version error ${JSON.stringify(error)} is not null`)
}

async function testUpdateEndpoint(backendBaseUrl: URL, supabase: SupabaseType) {
  await testPlaywright('update_endpoint.spec.ts', backendBaseUrl, {})
}

async function forceSupabaseTaskQueueFlush(_supabase: SupabaseType) {
  const connection = await getRawSqlConnection()

  // Ugly, but should work for the most part
  const error = console.error
  // Ignore the notices raised by postgress
  console.error = function (...data: any[]) {}

  const result = await connection.queryArray<[bigint]>('select process_current_jobs_if_unlocked();')

  const waitForResponseArray = result.rows.map(async (id) => {
    if (id.length !== 1)
      throw new Error(`Request id length not 0 (it's ${id.length}).\nRow Data: ${id}\nTotal data: ${result}`)

    let shouldPool = true
    const reqId = id[0]

    while (shouldPool) {
      await delay(50)
      const poolResult = await connection.queryArray('SELECT * FROM net._http_response WHERE id=$1', [reqId])
      shouldPool = poolResult.rows.length !== 1
    }
  })

  try {
    // Timeout of 10 seconds
    await Promise.race([delay(10_000), Promise.all(waitForResponseArray)])
  }
  catch (err) {
    console.log('Pool task queue HTTP response timedout after 10 seconds!')
    console.log(err)
  }

  console.error = error
}

async function testTwoChannels(_backendBaseUrl: URL, supabase: SupabaseType) {
  // We update production channel iOS: true then check if two_default channel is still public or not
  const { error: changeProductiuonChannelError } = await supabase.from('channels').update({ ios: true }).eq('id', 22)
  assert(changeProductiuonChannelError === null, `Supabase change production channel (ios) error ${JSON.stringify(changeProductiuonChannelError)} is not null`)
  try {
    await forceSupabaseTaskQueueFlush(supabase)
    const { data: secondChannel, error: getSecondChannelError } = await supabase
      .from('channels')
      .select('*')
      .eq('id', 24)
      .single()

    assert(getSecondChannelError === null, `Supabase get second channel error ${JSON.stringify(getSecondChannelError)} is not null`)
    assert(secondChannel!.public === false, 'Second channel is public')
  }
  finally {
    // Reset to default values
    const { error: changeProductiuonChannelError2 } = await supabase.from('channels').update({ ios: false }).eq('id', 22)
    assert(changeProductiuonChannelError2 === null, `Supabase change production channel (ios) error ${JSON.stringify(changeProductiuonChannelError2)} is not null`)

    const { error: changeSecondChannelError } = await supabase.from('channels').update({ public: true }).eq('id', 24)
    assert(changeSecondChannelError === null, `Supabase change production channel (ios) error ${JSON.stringify(changeSecondChannelError)} is not null`)
  }

  // We update two_default channel android: true then check if production channel is still public or not
  const { error: changeSecondChannelError } = await supabase.from('channels').update({ android: true }).eq('id', 24)
  assert(changeSecondChannelError === null, `Supabase change production channel (ios) error ${JSON.stringify(changeSecondChannelError)} is not null`)
  try {
    await forceSupabaseTaskQueueFlush(supabase)
    const { data: prodChannel, error: getSecondChannelError } = await supabase
      .from('channels')
      .select('*')
      .eq('id', 22)
      .single()

    assert(getSecondChannelError === null, `Supabase get second channel error ${JSON.stringify(getSecondChannelError)} is not null`)
    assert(prodChannel!.public === false, 'Second channel is public')
  }
  finally {
    // Reset to default values
    const { error: changeProductiuonChannelError2 } = await supabase.from('channels').update({ android: false }).eq('id', 24)
    assert(changeProductiuonChannelError2 === null, `Supabase change production channel (ios) error ${JSON.stringify(changeProductiuonChannelError2)} is not null`)

    const { error: changeSecondChannelError } = await supabase.from('channels').update({ public: true }).eq('id', 22)
    assert(changeSecondChannelError === null, `Supabase change production channel (ios) error ${JSON.stringify(changeSecondChannelError)} is not null`)
  }

  // We update production channel android: false then check if two_default channel is still public or not
  const { error: changeSecondChannelError2 } = await supabase.from('channels').update({ android: false }).eq('id', 22)
  assert(changeSecondChannelError2 === null, `Supabase change production channel (ios) error ${JSON.stringify(changeSecondChannelError2)} is not null`)
  try {
    await forceSupabaseTaskQueueFlush(supabase)
    const { data: secondChannel, error: getSecondChannelError } = await supabase
      .from('channels')
      .select('*')
      .eq('id', 24)
      .single()

    assert(getSecondChannelError === null, `Supabase get second channel error ${JSON.stringify(getSecondChannelError)} is not null`)
    assert(secondChannel!.public === false, 'Second channel is public')
  }
  finally {
    // Reset to default values
    const { error: changeProductiuonChannelError2 } = await supabase.from('channels').update({ android: true }).eq('id', 22)
    assert(changeProductiuonChannelError2 === null, `Supabase change production channel (ios) error ${JSON.stringify(changeProductiuonChannelError2)} is not null`)

    const { error: changeSecondChannelError } = await supabase.from('channels').update({ public: true }).eq('id', 24)
    assert(changeSecondChannelError === null, `Supabase change production channel (ios) error ${JSON.stringify(changeSecondChannelError)} is not null`)
  }

  // We update two_default channel iOS: false then check if production channel is still public or not
  const { error: changeSecondChannelError3 } = await supabase.from('channels').update({ ios: false }).eq('id', 24)
  assert(changeSecondChannelError3 === null, `Supabase change production channel (ios) error ${JSON.stringify(changeSecondChannelError3)} is not null`)
  try {
    await forceSupabaseTaskQueueFlush(supabase)
    const { data: prodChannel, error: getSecondChannelError } = await supabase
      .from('channels')
      .select('*')
      .eq('id', 22)
      .single()

    assert(getSecondChannelError === null, `Supabase get second channel error ${JSON.stringify(getSecondChannelError)} is not null`)
    assert(prodChannel!.public === false, 'Second channel is public')
  }
  finally {
    // Reset to default values
    const { error: changeProductiuonChannelError2 } = await supabase.from('channels').update({ ios: true }).eq('id', 24)
    assert(changeProductiuonChannelError2 === null, `Supabase change production channel (ios) error ${JSON.stringify(changeProductiuonChannelError2)} is not null`)

    const { error: changeSecondChannelError } = await supabase.from('channels').update({ public: true }).eq('id', 22)
    assert(changeSecondChannelError === null, `Supabase change production channel (ios) error ${JSON.stringify(changeSecondChannelError)} is not null`)
  }

  await forceSupabaseTaskQueueFlush(supabase)
}

async function testForIos(backendBaseUrl: URL, supabase: SupabaseType) {
  // prepare supabase
  const { error: getIosChannelError, data: prevIosChannelGet } = await supabase.from('channels')
    .select()
    .eq('id', '24')
    .single()

  assert(getIosChannelError === null, `Get ios channel error not null. ${getIosChannelError}`)

  const { error: setIosChannelError } = await supabase.from('channels')
    .update({ public: true, ios: true })
    .eq('id', '24')
    .single()

  assert(setIosChannelError === null, `Set ios channel error not null. ${setIosChannelError}`)

  // Test for IOS device
  try {
    const iosNoNewData = getBaseDataIos()
    iosNoNewData.version_build = '1.0.0'
    const iosNoNewResponse = await sendUpdate(backendBaseUrl, iosNoNewData)
    await responseOk(iosNoNewResponse, 'IOS no new update')
    const iosNoNewUpdateData = await iosNoNewResponse.json()
    assertEquals(iosNoNewUpdateData, noNew, `IOS no new response ${JSON.stringify(iosNoNewUpdateData)} is not equal to ${JSON.stringify(iosNoNewUpdateData)}`)

    const { error: enableAutoUpdateUnderNativeError } = await supabase.from('channels').update({ disableAutoUpdateUnderNative: false }).eq('id', 24)
    assert(enableAutoUpdateUnderNativeError === null, `Supabase enableAutoUpdateUnderNativeError error ${JSON.stringify(enableAutoUpdateUnderNativeError)} is not null`)

    try {
      const baseIOSData = getBaseDataIos()
      baseIOSData.version_build = '1.1.0'
      const iosDeviceResponse = await sendUpdate(backendBaseUrl, baseIOSData)
      await responseOk(iosDeviceResponse, 'IOS new update')
      const iosUpdateData = await iosDeviceResponse.json()
      assert(iosUpdateData.url !== undefined, `Response ${JSON.stringify(iosUpdateData)} has no url`)
      assert(iosUpdateData.version !== undefined, `Response ${JSON.stringify(iosUpdateData)} has no version`)
      assert(iosUpdateData.version === '1.0.0', `Response ${JSON.stringify(iosUpdateData)} version is not equal to 1.0.0`)
    }
    finally {
      // Renable this so that we don't break other tests
      const { error: enableAutoUpdateUnderNativeError } = await supabase.from('channels').update({ disableAutoUpdateUnderNative: true }).eq('id', 24)
      assert(enableAutoUpdateUnderNativeError === null, `Supabase enableAutoUpdateUnderNativeError error ${JSON.stringify(enableAutoUpdateUnderNativeError)} is not null`)
    }
  }
  finally {
    const { error: deleteDeviceError } = await supabase.from('devices').delete().eq('device_id', baseDataIos.device_id)
    assert(deleteDeviceError === null, `Supabase delete device IOS error ${JSON.stringify(deleteDeviceError)} is not null`)

    const { error: setIosChannelError } = await supabase.from('channels')
      .update(prevIosChannelGet!)
      .eq('id', '24')
      .single()

    assert(setIosChannelError === null, `Set ios channel error not null. ${setIosChannelError}`)
  }
}
