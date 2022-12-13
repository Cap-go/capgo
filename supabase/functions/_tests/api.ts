import axiod from 'https://deno.land/x/axiod@0.26.2/mod.ts'

export const baseSupabase = 'https://supabase.capgo.app/'
export const baseNetlify = 'https://netlify.capgo.app/'

const defaultAppId = 'ee.test.test'
const defaultVersion = '1.58.17'
const defaultVersionCode = '15817999'
const defaultVersionId = 142
const defaultChannelId = 142
const defaultChannel = 'dev'
const defaultOs = 'ios'
const defaultVersionOs = '16.0.2'
const defaultVersionName = 'builtin'
const defaultpluginVersion = '4.3.4'
const defaultDeviceID = 'F7D455A1-337C-4AF2-9494-BA938E83EB44'
const defaultZipId = '776bf561-94ef-422f-851f-502c85ff6cEE'
const defaultUserId = 'f83fd102-c21d-4984-b6a1-33c2cf018fd7'

export const defaultUpdatePayload = {
  platform: defaultOs,
  device_id: defaultDeviceID,
  app_id: defaultAppId,
  version_build: defaultVersion,
  version_code: defaultVersionCode,
  version_os: defaultVersionOs,
  version_name: defaultVersionName,
  plugin_version: defaultpluginVersion,
}

export const defaultUpdateRes = {
  version: '1.58.17',
  session_key: null,
  checksum: 'ebf52a10',
  url: `https://xvwzpoazmxkqosrdewyv.supabase.co/storage/v1/object/sign/apps/${defaultUserId}/${defaultAppId}/versions/${defaultZipId}?token=`,
}
export const postUpdate = async (baseUrl: string) => {
  const url = `${baseUrl}/updates`
  const response = await axiod.post(url, defaultUpdatePayload)
  return response.data
}

export const defaultSetChannelRes = { status: 'ok' }
export const setChannel = async (baseUrl: string) => {
  const url = `${baseUrl}/channel_self`
  const payload = { ...defaultUpdatePayload, channel: defaultChannel }
  const response = await axiod.post(url, payload)
  return response.data
}

export const defaultPutChannelRes = { channel: 'production', status: 'default' }
export const putChannel = async (baseUrl: string) => {
  const url = `${baseUrl}/channel_self`
  const response = await axiod.put(url, defaultUpdatePayload)
  return response.data
}

export const defaultGetDevicesRes = [{
  created_at: '2022-06-28T23:22:50.057507+00:00',
  updated_at: '2022-11-03T10:11:59.241191+00:00',
  device_id: 'BD5185F4-9966-414C-93EF-F504CFE62288',
  custom_id: '',
  is_prod: true,
  is_emulator: false,
  app_id: defaultAppId,
  platform: defaultOs,
  plugin_version: defaultpluginVersion,
  os_version: defaultVersionOs,
  version_build: defaultVersionName,
  version: { name: defaultVersion, id: defaultVersionId },
}]
export const getDevices = async (baseUrl: string) => {
  const url = `${baseUrl}/device`
  const response = await axiod.get(url, {
    params: {
      app_id: defaultAppId,
    },
    headers: {
      Authorization: Deno.env.get('TEST_APIKEY') || '',
    },
  })
  return response.data
}

export const defaultGetChannelRes = [{
  created_at: '2022-06-28T22:16:30.364812+00:00',
  updated_at: '2022-12-05T22:08:20.700084+00:00',
  id: defaultChannelId,
  name: defaultChannel,
  app_id: defaultAppId,
  created_by: defaultUserId,
  public: true,
  disableAutoUpdateUnderNative: false,
  disableAutoUpdateToMajor: false,
  allow_emulator: true,
  allow_dev: true,
  version: { name: defaultVersion, id: defaultVersionId },
}]
export const getChannels = async (baseUrl: string) => {
  const url = `${baseUrl}/channel`
  const response = await axiod.get(url, {
    params: {
      app_id: defaultAppId,
    },
    headers: {
      Authorization: Deno.env.get('TEST_APIKEY') || '',
    },
  })
  return response.data
}

export const defaultGetBundleRes = [
  {},
]
export const getBundle = async (baseUrl: string) => {
  const url = `${baseUrl}/bundle`
  const response = await axiod.get(url, {
    params: {
      app_id: defaultAppId,
    },
    headers: {
      Authorization: Deno.env.get('TEST_APIKEY') || '',
    },
  })
  return response.data
}

