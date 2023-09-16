import type { SupabaseType } from '../utils.ts'
import { assert, assertEquals } from '../utils.ts'

const baseData = {
  platform: 'android',
  device_id: '00009a6b-eefe-490a-9c60-8e965132ae51',
  app_id: 'com.demo.app',
  custom_id: '',
  version_build: '1.0',
  version_code: '1',
  version_os: '13',
  version_name: '1.0.0',
  plugin_version: '5.2.1',
  is_emulator: true,
  is_prod: true,
}

function getBaseData(): typeof baseData {
  return structuredClone(baseData)
}

const noNew = { message: 'No new version available' }

export async function testUpdateEndpoint(backendBaseUrl: URL, supabase: SupabaseType) {
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
  executeWithTeardown(
    async () => {
      const disableEmulatorResponse = await sendUpdate(backendBaseUrl, disableEmulatorData)
      await responseOk(disableEmulatorResponse, 'Disable emulator')
      const disableEmulatorError = await getResponseError(disableEmulatorResponse)
      assert (disableEmulatorError === 'disable_emulator', `Response error ${disableEmulatorError} is not equal to disable_emulator`)
    },
    async () => {
      const { error: emulatorError2 } = await supabase.from('channels').update({ allow_emulator: true }).eq('id', 22)
      assert(emulatorError2 === null, `Supabase disable_emulator error ${JSON.stringify(emulatorError2)} is not null`)
    },
  )

  // We disable 'allow_dev' to test what happens when we send a request with allow_dev = true
  const { error: setAllowDevError } = await supabase.from('channels').update({ allow_dev: false }).eq('id', 22)
  assert(emulatorError === null, `Supabase error ${JSON.stringify(setAllowDevError)} is not null`)

  const allowDevData = getBaseData()
  allowDevData.version_name = '1.1.0'
  allowDevData.is_prod = false
  executeWithTeardown(
    async () => {
      const allowDevResponse = await sendUpdate(backendBaseUrl, allowDevData)
      await responseOk(allowDevResponse, 'Allow dev')
      const allowDevError = await getResponseError(allowDevResponse)
      assert (allowDevError === 'disable_dev_build', `Response error ${allowDevError} is not equal to disable_dev_build`)
    },
    async () => {
      const { error: setAllowDevError2 } = await supabase.from('channels').update({ allow_dev: true }).eq('id', 22)
      assert(setAllowDevError2 === null, `Supabase disable_dev_build error ${JSON.stringify(setAllowDevError2)} is not null`)
    })

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
  await executeWithTeardown(
    async () => {
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
    },
    async () => {
      const { error: deleteDeviceError } = await supabase.from('devices').delete().eq('device_id', newDeviceData.device_id)
      assert(deleteDeviceError === null, `Supabase delete device error ${JSON.stringify(deleteDeviceError)} is not null`)
    },
  )
}

async function executeWithTeardown(action: () => Promise<void>, teardown: () => Promise<void>) {
  try {
    await action()
  }
  finally {
    await teardown()
  }
}

async function getResponseError(response: Response): Promise<string> {
  const json = await response.json()
  assert(json.error !== undefined, `Response ${JSON.stringify(json)} has no error`)

  return json.error
}

async function responseOk(response: Response, requestName: string) {
  const cloneResponse = response.clone()
  assert(cloneResponse.ok, `${requestName} response not ok: ${cloneResponse.status} ${cloneResponse.statusText} ${await cloneResponse.text()}`)
}

async function sendUpdate(baseUrl: URL, data: typeof baseData): Promise<Response> {
  return await fetch(new URL('updates', baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })
}
