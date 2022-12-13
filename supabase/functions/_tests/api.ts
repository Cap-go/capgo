import axiod from 'https://deno.land/x/axiod@0.26.2/mod.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'

export const baseSupabase = 'https://supabase.capgo.app/'
export const baseNetlify = 'https://netlify.capgo.app/'

const defaultAppId = 'unknow.unknow'
const defaultVersion = '1.58.17'
const defaultVersionCode = '15817999'
const defaultVersionId = 142
const defaultBundleId = 142
const defaultChannelId = 142
const defaultChannel = 'dev'
const defaultAction = 'get'
const defaultOs = 'ios'
const defaultVersionOs = '16.0.2'
const defaultVersionName = 'builtin'
const defaultpluginVersion = '4.3.4'
const defaultChecksum = 'ebf52a10'
const defaultSessionKey = null
const defaultDeviceID = 'F7D455A1-337C-4AF2-9494-BA938E83EB44'
const defaultBucketId = '776bf561-94ef-422f-851f-502c85ff6cEE'
const defaultUserId = 'f83fd102-c21d-4984-b6a1-33c2cf018fd7'
const defaultCreatedAt = '2022-06-28T23:22:50.057507+00:00'
const defaultUpdatedAt = '2022-11-03T10:11:59.241191+00:00'

const headers = {
  Authorization: Deno.env.get('TEST_APIKEY') || '',
}
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
  version: defaultVersion,
  session_key: defaultSessionKey,
  checksum: defaultChecksum,
  url: `https://xvwzpoazmxkqosrdewyv.supabase.co/storage/v1/object/sign/apps/${defaultUserId}/${defaultAppId}/versions/${defaultBucketId}?token=`,
}
export const postUpdate = async (baseUrl: string) => {
  const url = `${baseUrl}/updates`
  const response = await axiod.post<typeof defaultUpdateRes>(url, defaultUpdatePayload)
  return response.data
}

export const defaultRes = { status: 'ok' }
export const getOk = async (baseUrl: string) => {
  const url = `${baseUrl}/ok`
  const response = await axiod.get<typeof defaultRes>(url)
  return response.data
}

export const getDatabase = async () => {
  const { data, error } = await supabaseAdmin()
    .from('apps')
    .select()
    .eq('app_id', defaultAppId)
    .single()
  return (data && !error)
}

export const postStats = async (baseUrl: string) => {
  const url = `${baseUrl}/updates`
  const payload = { ...defaultUpdatePayload, action: defaultAction }
  const response = await axiod.post<typeof defaultRes>(url, payload)
  return response.data
}

export const setChannelSelf = async (baseUrl: string) => {
  const url = `${baseUrl}/channel_self`
  const payload = { ...defaultUpdatePayload, channel: defaultChannel }
  const response = await axiod.post<typeof defaultRes>(url, payload)
  return response.data
}

export const defaultPutChannelRes = { channel: 'production', status: 'default' }
export const putChannel = async (baseUrl: string) => {
  const url = `${baseUrl}/channel_self`
  const response = await axiod.put<typeof defaultPutChannelRes>(url, defaultUpdatePayload)
  return response.data
}

export const defaultGetDevicesRes = [{
  created_at: defaultCreatedAt,
  updated_at: defaultUpdatedAt,
  device_id: defaultDeviceID,
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
export const getDevice = async (baseUrl: string) => {
  const url = `${baseUrl}/device`
  const response = await axiod.get<typeof defaultGetDevicesRes>(url, {
    params: {
      app_id: defaultAppId,
    },
    headers,
  })
  return response.data
}
const defaultSetDevice = {
  app_id: defaultAppId,
  device_id: defaultDeviceID,
  version_id: defaultVersion,
  channel: defaultChannel,
}
export const deleteDevice = async (baseUrl: string) => {
  const url = `${baseUrl}/device`
  const response = await axiod.delete<typeof defaultRes>(url, {
    params: {
      app_id: defaultAppId,
    },
    headers,
  })
  return response.data
}

export const postDevice = async (baseUrl: string) => {
  const url = `${baseUrl}/device`
  const response = await axiod.post<typeof defaultRes>(url, defaultSetDevice, {
    headers,
  })
  return response.data
}

export const defaultGetChannelRes = [{
  created_at: defaultCreatedAt,
  updated_at: defaultUpdatedAt,
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
export const getChannel = async (baseUrl: string) => {
  const url = `${baseUrl}/channel`
  const response = await axiod.get<typeof defaultGetChannelRes>(url, {
    params: {
      app_id: defaultAppId,
    },
    headers,
  })
  return response.data
}
export const setChannel = async (baseUrl: string) => {
  const url = `${baseUrl}/channel`
  const response = await axiod.post<typeof defaultRes>(url, {

  },
  {
    headers,
  })
  return response.data
}

export const defaultSetBundleRes = {
  id: defaultBundleId,
  app_id: defaultAppId,
  name: defaultVersion,
  user_id: defaultUserId,
  deleted: false,
  created_at: defaultCreatedAt,
  updated_at: defaultUpdatedAt,
  bucket_id: defaultBucketId,
  external_url: false,
  checksum: defaultChecksum,
  session_key: defaultSessionKey,
}

export const defaultGetBundleRes = [
  defaultSetBundleRes,
]

// export const setBundle = async (baseUrl: string) => {
//   const url = `${baseUrl}/bundle`
//   const response = await axiod.post<typeof defaultGetBundleRes>(url, defaultSetBundleRes, {
//     params: {
//       app_id: defaultAppId,
//     },
//     headers,
//   })
//   return response.data
// }

export const getBundle = async (baseUrl: string) => {
  const url = `${baseUrl}/bundle`
  const response = await axiod.get<typeof defaultGetBundleRes>(url, {
    params: {
      app_id: defaultAppId,
    },
    headers,
  })
  return response.data
}

export const deleteBundle = async (baseUrl: string) => {
  const url = `${baseUrl}/bundle`
  const response = await axiod.delete<typeof defaultRes>(url, {
    params: {
      app_id: defaultAppId,
    },
    headers,
  })
  return response.data
}

