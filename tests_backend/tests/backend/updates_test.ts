import type { RunnableTest, SupabaseType, updateAndroidBaseData } from '../../utils.ts'
import { assert, assertEquals, updateAndroidBaseData as baseData, defaultUserId, delay, getUpdateBaseData as getBaseData, getResponseError, responseOk, sendUpdate } from '../../utils.ts'

export function getTest(): RunnableTest {
  return {
    fullName: 'Test updates endpoint',
    testWithRedis: true,
    tests: [
      {
        name: 'Prepare update test',
        test: prepapreUpdateTest,
        timesToExecute: 1,
      },
      {
        name: 'Test updates endpoint (big)',
        test: testUpdateEndpoint,
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
  return structuredClone(baseDataIos)
}

const noNew = { message: 'No new version available' }

async function prepapreUpdateTest(_backendBaseUrl: URL, supabase: SupabaseType) {
  const { error } = await supabase.from('channels').update({ version: 9654 }).eq('id', 22)
  assert(error === null, `Supabase set channel version error ${JSON.stringify(error)} is not null`)
}

async function testUpdateEndpoint(backendBaseUrl: URL, supabase: SupabaseType) {
  const noNewResponse = await sendUpdate(backendBaseUrl, baseData)
  await responseOk(noNewResponse, 'No new')

  const json = await noNewResponse.json()
  assertEquals(json, noNew, `Response ${JSON.stringify(json)} is not equal to ${JSON.stringify(noNew)}`)

  const newVersionData = getBaseData()
  newVersionData.version_name = '1.1.0'
  const newVersion = await sendUpdate(backendBaseUrl, newVersionData)
  await responseOk(newVersion, 'New version')
  const newVersionJson = await newVersion.json()
  assert(newVersionJson.url !== undefined, `Response ${JSON.stringify(newVersionJson)} has no url`)
  assert(newVersionJson.version !== undefined, `Response ${JSON.stringify(newVersionJson)} has no version`)
  assert(newVersionJson.version === '1.0.0', `Response ${JSON.stringify(newVersionJson)} version is not equal to 1.0.0`)
  // We cannot test download because we don't have a file to download (The file is uploaded to s3, we could test this IF we used the cli to upload the file to s3)
  // This is a diffrent test outside of the scope of this test

  const autoUpdateMajorFailData = getBaseData()
  autoUpdateMajorFailData.version_name = '0.0.0'
  const failMajorResponse = await sendUpdate(backendBaseUrl, autoUpdateMajorFailData)
  await responseOk(failMajorResponse, 'Disable auto update to major')
  const failMajorError = await getResponseError(failMajorResponse)
  assert(failMajorError === 'disable_auto_update_to_major', `Response error ${failMajorError} is not equal to disable_auto_update_to_major`)

  const setDisableUpdateMinor = await supabase.from('channels').update({ disableAutoUpdate: 'minor' }).eq('id', 22)
  assert(setDisableUpdateMinor.error === null, `Supabase set minor update error ${JSON.stringify(setDisableUpdateMinor.error)} is not null`)

  // 3 seconds of delay so that supabase can invalidate the data
  await delay(3000)

  try {
    // Set version to 1.361.0
    const setVersionResult = await supabase.from('channels').update({ version: 9653 }).eq('id', 22)
    assert(setVersionResult.error === null, `Supabase version error ${JSON.stringify(setVersionResult.error)} is not null`)

    // Nested becouse it has to be that way

    try {
      const autoUpdateMinorFailData = getBaseData()
      autoUpdateMinorFailData.version_name = '1.1.0'
      const failMinorResponse = await sendUpdate(backendBaseUrl, autoUpdateMinorFailData)
      await responseOk(failMinorResponse, 'Disable auto update to minor')
      const failMinorError = await getResponseError(failMinorResponse)
      assert(failMinorError === 'disable_auto_update_to_minor', `Response error ${failMinorError} is not equal to disable_auto_update_to_minor`)
    }
    finally {
      // Revert version to 1.0.0
      const setVersionResult = await supabase.from('channels').update({ version: 9654 }).eq('id', 22)
      assert(setVersionResult.error === null, `Supabase version error ${JSON.stringify(setVersionResult.error)} is not null`)
    }
  }
  finally {
    const setDisableUpdateMajor = await supabase.from('channels').update({ disableAutoUpdate: 'major' }).eq('id', 22)
    assert(setDisableUpdateMajor.error === null, `Supabase set minor update error ${JSON.stringify(setDisableUpdateMajor.error)} is not null`)

    // 3 seconds of delay so that supabase can invalidate the data
    await delay(3000)
  }

  const disableAutoUpdateUnderNativeData = getBaseData()
  disableAutoUpdateUnderNativeData.version_build = '2.0.0'
  disableAutoUpdateUnderNativeData.version_name = '2.0.0'
  const disableAutoUpdateUnderNativeResponse = await sendUpdate(backendBaseUrl, disableAutoUpdateUnderNativeData)
  await responseOk(disableAutoUpdateUnderNativeResponse, 'Disable auto update under native')
  const disableAutoUpdateUnderNativeError = await getResponseError(disableAutoUpdateUnderNativeResponse)
  assert(disableAutoUpdateUnderNativeError === 'disable_auto_update_under_native', `Response error ${disableAutoUpdateUnderNativeError} is not equal to disable_auto_update_under_native`)

  // We disable 'allow_emulator' to test what happens when we send a request with is_emulator = true
  const { error: emulatorError } = await supabase.from('channels').update({ allow_emulator: false }).eq('id', 22)
  assert(emulatorError === null, `Supabase error ${JSON.stringify(emulatorError)} is not null`)

  const disableEmulatorData = getBaseData()
  disableEmulatorData.version_name = '1.1.0'
  disableEmulatorData.is_emulator = true
  try {
    const disableEmulatorResponse = await sendUpdate(backendBaseUrl, disableEmulatorData)
    await responseOk(disableEmulatorResponse, 'Disable emulator')
    const disableEmulatorError = await getResponseError(disableEmulatorResponse)
    assert (disableEmulatorError === 'disable_emulator', `Response error ${disableEmulatorError} is not equal to disable_emulator`)
  }
  finally {
    const { error: emulatorError2 } = await supabase.from('channels').update({ allow_emulator: true }).eq('id', 22)
    assert(emulatorError2 === null, `Supabase disable_emulator error ${JSON.stringify(emulatorError2)} is not null`)
  }

  // We disable 'allow_dev' to test what happens when we send a request with allow_dev = true
  const { error: setAllowDevError } = await supabase.from('channels').update({ allow_dev: false }).eq('id', 22)
  assert(emulatorError === null, `Supabase error ${JSON.stringify(setAllowDevError)} is not null`)

  const allowDevData = getBaseData()
  allowDevData.version_name = '1.1.0'
  allowDevData.is_prod = false
  try {
    const allowDevResponse = await sendUpdate(backendBaseUrl, allowDevData)
    await responseOk(allowDevResponse, 'Allow dev')
    const allowDevError = await getResponseError(allowDevResponse)
    assert (allowDevError === 'disable_dev_build', `Response error ${allowDevError} is not equal to disable_dev_build`)
  }
  finally {
    const { error: setAllowDevError2 } = await supabase.from('channels').update({ allow_dev: true }).eq('id', 22)
    assert(setAllowDevError2 === null, `Supabase disable_dev_build error ${JSON.stringify(setAllowDevError2)} is not null`)
  }

  // We test what happens if app does not exist
  const appDoesNotExistData = getBaseData()
  appDoesNotExistData.app_id = 'does.not.exist'
  const appDoesNotExistResponse = await sendUpdate(backendBaseUrl, appDoesNotExistData)
  await responseOk(appDoesNotExistResponse, 'App does not exist')
  const appDoesNotExistError = await getResponseError(appDoesNotExistResponse)
  assert(appDoesNotExistError === 'app_not_found', `Response error ${appDoesNotExistError} is not equal to app_not_found`)

  // We test what happens if device id does not exist
  const newDeviceData = getBaseData()
  newDeviceData.device_id = crypto.randomUUID()
  try {
    const newDeviceResponse = await sendUpdate(backendBaseUrl, newDeviceData)
    await responseOk(newDeviceResponse, 'Device does not exist')
    // We check in supabase now
    const { data: newDeviceSupa, error: newDeviceSupaError } = await supabase
      .from('devices')
      .select()
      .eq('device_id', newDeviceData.device_id)
      .single()

    assert(newDeviceSupaError === null, `Supabase get device error ${JSON.stringify(newDeviceSupaError)} is not null`)
    assert(newDeviceSupa !== null, 'Supabase get device is null')
    assert(newDeviceSupa?.device_id === newDeviceData.device_id, `Supabase device ${JSON.stringify(newDeviceSupa)} id is not equal to ${newDeviceData.device_id}`)

    // Test channel overwrite
    // This reuse is because after we sent the first request, the device is created in supabase
    // If we create new UUID we have to manually create the device in supabase
    const channelOverwriteData = newDeviceData
    try {
      const { error: channelOverwriteError } = await supabase
        .from('channel_devices')
        .insert({
          device_id: channelOverwriteData.device_id,
          channel_id: 23,
          app_id: channelOverwriteData.app_id,
          created_by: defaultUserId,
        })

      assert(channelOverwriteError === null, `Supabase channel_devices insert error ${JSON.stringify(channelOverwriteError)} is not null`)

      // 3 seconds of delay so that supabase can invalidate the data
      await delay(3000)

      const overwritenChannel = await sendUpdate(backendBaseUrl, channelOverwriteData)
      await responseOk(overwritenChannel, 'Overwrite channel version')
      const overwriteChannelJson = await overwritenChannel.json()
      assert(overwriteChannelJson.url !== undefined, `Response ${JSON.stringify(overwriteChannelJson)} has no url`)
      assert(overwriteChannelJson.version !== undefined, `Response ${JSON.stringify(overwriteChannelJson)} has no version`)
      assert(overwriteChannelJson.version === '1.361.0', `Response ${JSON.stringify(overwriteChannelJson)} version is not equal to 1.361.0`)

      // That is not the end. Let's make sure that the channel update will succeed if the overwriten channel as a different update strategy
      const { error: changeOverwritenChannelStrategyError } = await supabase
        .from('channels')
        .update({ disableAutoUpdate: 'none' })
        .eq('id', 23)

      assert(changeOverwritenChannelStrategyError === null, `Supabase changeOverwritenChannelStrategyError error ${JSON.stringify(changeOverwritenChannelStrategyError)} is not null`)

      // 3 seconds of delay so that supabase can invalidate the data
      await delay(3000)

      try {
        const overwrittenChannelData2 = structuredClone(newDeviceData) as typeof updateAndroidBaseData
        overwrittenChannelData2.version_name = '0.0.0'

        const overwrittenChannelResponse2 = await sendUpdate(backendBaseUrl, overwrittenChannelData2)
        await responseOk(overwrittenChannelResponse2, 'Overwrite channel version 2')
        const overwriteChannelJson2 = await overwrittenChannelResponse2.json()
        assert(overwriteChannelJson2.url !== undefined, `Response ${JSON.stringify(overwriteChannelJson2)} has no url`)
        assert(overwriteChannelJson2.version !== undefined, `Response ${JSON.stringify(overwriteChannelJson2)} has no version`)
        assert(overwriteChannelJson2.version === '1.361.0', `Response ${JSON.stringify(overwriteChannelJson2)} version is not equal to 1.361.0`)
      }
      finally {
        const { error: changeOverwritenChannelStrategyError } = await supabase
          .from('channels')
          .update({ disableAutoUpdate: 'major' })
          .eq('id', 23)

        assert(changeOverwritenChannelStrategyError === null, `Supabase changeOverwritenChannelStrategyError error ${JSON.stringify(changeOverwritenChannelStrategyError)} is not null`)

        // 3 seconds of delay so that supabase can invalidate the data
        await delay(3000)
      }
    }
    finally {
      const { error: deleteChannelDeviceError } = await supabase.from('channel_devices').delete().eq('device_id', channelOverwriteData.device_id)
      assert(deleteChannelDeviceError === null, `Supabase delete channel_device error ${JSON.stringify(deleteChannelDeviceError)} is not null`)
    }

    // We deleted the channel overwrite, there should not be any new version
    const noNewOverwriteResponse = await sendUpdate(backendBaseUrl, channelOverwriteData)
    await responseOk(noNewOverwriteResponse, 'No new overwrite')
    const noNewOverwriteJson = await noNewOverwriteResponse.json()
    assertEquals(noNewOverwriteJson, noNew, `Response ${JSON.stringify(noNewOverwriteJson)} is not equal to ${JSON.stringify(noNew)}`)

    // Now we test the version overwrite
    const versionOverwriteData = channelOverwriteData
    try {
      const { error: versionOverwriteInsertError } = await supabase
        .from('devices_override')
        .insert({
          device_id: versionOverwriteData.device_id,
          version: 9601,
          app_id: channelOverwriteData.app_id,
          created_by: defaultUserId,
        })

      assert(versionOverwriteInsertError === null, `Supabase devices_override insert error ${JSON.stringify(versionOverwriteInsertError)} is not null`)

      // 3 seconds of delay so that supabase can invalidate the data
      await delay(3000)

      const versionOverwriteResponse = await sendUpdate(backendBaseUrl, versionOverwriteData)
      const versionOverwriteJson = await versionOverwriteResponse.json()
      assert(versionOverwriteJson.url !== undefined, `Response ${JSON.stringify(versionOverwriteJson)} has no url`)
      assert(versionOverwriteJson.version !== undefined, `Response ${JSON.stringify(versionOverwriteJson)} has no version`)
      assert(versionOverwriteJson.version === '1.359.0', `Response ${JSON.stringify(versionOverwriteJson)} version is not equal to 1.359.0`)
    }
    finally {
      const { error: deleteVersionOverwite } = await supabase.from('devices_override').delete().eq('device_id', channelOverwriteData.device_id)
      assert(deleteVersionOverwite === null, `Supabase delete devices_override error ${JSON.stringify(deleteVersionOverwite)} is not null`)
    }

    // We again check for no new version
    const noNewOverwriteResponse2 = await sendUpdate(backendBaseUrl, versionOverwriteData)
    await responseOk(noNewOverwriteResponse2, 'No new overwrite')
    const noNewOverwriteJson2 = await noNewOverwriteResponse2.json()
    assertEquals(noNewOverwriteJson2, noNew, `Response ${JSON.stringify(noNewOverwriteJson2)} is not equal to ${JSON.stringify(noNew)}`)
  }
  finally {
    const { error: deleteDeviceError } = await supabase.from('devices').delete().eq('device_id', newDeviceData.device_id)
    assert(deleteDeviceError === null, `Supabase delete device error ${JSON.stringify(deleteDeviceError)} is not null`)
  }

  // Test for IOS device
  try {
    const iosNoNewData = getBaseDataIos()
    iosNoNewData.version_build = '1.0.0'
    const iosNoNewResponse = await sendUpdate(backendBaseUrl, iosNoNewData)
    await responseOk(iosNoNewResponse, 'IOS no new update')
    const iosNoNewUpdateData = await iosNoNewResponse.json()
    assertEquals(iosNoNewUpdateData, noNew, `IOS no new response ${JSON.stringify(iosNoNewUpdateData)} is not equal to ${JSON.stringify(iosNoNewUpdateData)}`)

    const { error: enableAutoUpdateUnderNativeError } = await supabase.from('channels').update({ disableAutoUpdateUnderNative: false }).eq('id', 22)
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
      const { error: enableAutoUpdateUnderNativeError } = await supabase.from('channels').update({ disableAutoUpdateUnderNative: true }).eq('id', 22)
      assert(enableAutoUpdateUnderNativeError === null, `Supabase enableAutoUpdateUnderNativeError error ${JSON.stringify(enableAutoUpdateUnderNativeError)} is not null`)
    }
  }
  finally {
    const { error: deleteDeviceError } = await supabase.from('devices').delete().eq('device_id', baseDataIos.device_id)
    assert(deleteDeviceError === null, `Supabase delete device IOS error ${JSON.stringify(deleteDeviceError)} is not null`)
  }
}
