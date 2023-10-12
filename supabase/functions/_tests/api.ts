import axios from 'https://deno.land/x/axiod@0.26.2/mod.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import { getEnv } from '../_utils/utils.ts'

export const baseSupabase = 'https://xvwzpoazmxkqosrdewyv.supabase.co/functions/v1/'
export const baseNetlify = 'https://web.capgo.app/api/'
export const baseNetlifyEdge = 'https://web.capgo.app/api-edge/'

const defaultAppId = 'unknow.unknow'
const defaultVersion = '1.2.3'
const defaultVersionDev = '1.2.2'
const defaultVersionCode = '10203999'
const defaultVersionId = 6640
const defaultChannelId = 591
const defaultChannel = 'dev'
const defaultAction = 'get'
const defaultOs = 'ios'
const defaultVersionOs = '16.0.2'
const defaultStatus = 'default'
const defaultVersionName = 'builtin'
const defaultpluginVersion = '4.13.1'
const defaultChecksum = 'ebf52a10'
const defaultStorageSplit = '?token='
const defaultSessionUpdateKey = ''
const defaultSessionKey = null
const defaultStorageProvider = 'supabase'
export const defaultDeviceID = 'F7D455A1-337C-4AF2-9494-BA938E83EB44'
const defaultBucketId = 'test_bucket.zip'
const defaultUserId = '6aa76066-55ef-4238-ade6-0b32334a4097'
const defaultCreatedAt = '2022-12-13T23:22:50.057507+00:00'
const defaultUpdatedAt = '2022-12-21T13:35:17.523397+00:00'

const headers = {
  Authorization: getEnv('TEST_APIKEY'),
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
export const defaultDb = { status: 'ok', service: 'database' }

export const defaultUpdateRes = {
  version: defaultVersion,
  session_key: defaultSessionUpdateKey,
  checksum: defaultChecksum,
  url: `https://xvwzpoazmxkqosrdewyv.supabase.co/storage/v1/object/sign/apps/${defaultUserId}/${defaultAppId}/versions/${defaultBucketId}`,
}
export async function postUpdate(baseUrl: string) {
  const url = `${baseUrl}/updates`
  const payload = { ...defaultUpdatePayload, version_build: defaultVersionDev }
  const response = await axios.post<typeof defaultUpdateRes>(url, payload, {
    headers: {
      'x-forwarded-for': '1.1.1.1',
    },
  })
  response.data.url = response.data.url.split(defaultStorageSplit)[0]
  return response.data
}

export const defaultResOk = { status: 'ok', service: 'ok' }
export const defaultRes = { status: 'ok' }
export async function getOk(baseUrl: string) {
  const url = `${baseUrl}/ok`
  const response = await axios.get<typeof defaultResOk>(url)
  return response.data
}

export async function getDatabase() {
  const { data, error } = await supabaseAdmin()
    .from('apps')
    .select()
    .eq('app_id', defaultAppId)
    .single()
  return (data && !error)
}

export async function postStats(baseUrl: string) {
  const url = `${baseUrl}/stats`
  const payload = { ...defaultUpdatePayload, action: defaultAction }
  const response = await axios.post<typeof defaultRes>(url, payload)
  return response.data
}

export async function setChannelSelf(baseUrl: string) {
  const url = `${baseUrl}/channel_self`
  const payload = { ...defaultUpdatePayload, channel: defaultChannel }
  const response = await axios.post<typeof defaultRes>(url, payload)
  return response.data
}

export const defaultPutChannelRes = { channel: defaultChannel, status: defaultStatus }
export async function putChannel(baseUrl: string) {
  const url = `${baseUrl}/channel_self`
  const response = await axios.put<typeof defaultPutChannelRes>(url, defaultUpdatePayload)
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
  version_build: defaultVersion,
  version: { name: defaultVersion, id: defaultVersionId },
}]
export async function getDevice(baseUrl: string) {
  const url = `${baseUrl}/device`
  const response = await axios.get<typeof defaultGetDevicesRes>(url, {
    params: {
      app_id: defaultAppId,
    },
    headers,
  })
  return response.data.map((res) => {
    res.updated_at = defaultUpdatedAt
    res.created_at = defaultCreatedAt
    res.version_build = defaultVersion
    res.version = { name: defaultVersion, id: defaultVersionId }
    return res
  })
}
const defaultSetDevice = {
  app_id: defaultAppId,
  device_id: defaultDeviceID,
  version_id: defaultVersion,
  channel: defaultChannel,
}
export async function deleteDevice(baseUrl: string) {
  const url = `${baseUrl}/device`
  const response = await axios.delete<typeof defaultRes>(url, {
    params: {
      app_id: defaultAppId,
    },
    headers,
  })
  return response.data
}

export async function postDevice(baseUrl: string) {
  const url = `${baseUrl}/device`
  const response = await axios.post<typeof defaultRes>(url, defaultSetDevice, {
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
  disableAutoUpdateUnderNative: true,
  disableAutoUpdateToMajor: true,
  allow_device_self_set: false,
  allow_emulator: true,
  allow_dev: true,
  version: { name: defaultVersion, id: defaultVersionId },
}]

export async function getChannels(baseUrl: string) {
  const url = `${baseUrl}/channel`
  const response = await axios.get<typeof defaultGetChannelRes>(url, {
    params: {
      app_id: defaultAppId,
    },
    headers,
  })
  return response.data.map((res) => {
    res.updated_at = defaultUpdatedAt
    res.created_at = defaultCreatedAt
    res.version = { name: defaultVersion, id: defaultVersionId }
    return res
  })
}
export async function setChannel(baseUrl: string) {
  const url = `${baseUrl}/channel`
  const response = await axios.post<typeof defaultRes>(url, {

  },
  {
    headers,
  })
  return response.data
}

export const defaultSetBundleRes = {
  id: defaultVersionId,
  app_id: defaultAppId,
  name: defaultVersion,
  user_id: defaultUserId,
  deleted: false,
  created_at: defaultCreatedAt,
  updated_at: defaultUpdatedAt,
  bucket_id: defaultBucketId,
  external_url: null,
  checksum: defaultChecksum,
  session_key: defaultSessionKey,
  storage_provider: defaultStorageProvider,
}

export const defaultGetBundleRes = [
  defaultSetBundleRes,
]

// export const setBundle = async (baseUrl: string) => {
//   const url = `${baseUrl}/bundle`
//   const response = await axios.post<typeof defaultGetBundleRes>(url, defaultSetBundleRes, {
//     params: {
//       app_id: defaultAppId,
//     },
//     headers,
//   })
//   return response.data
// }

export async function getBundle(baseUrl: string) {
  const url = `${baseUrl}/bundle`
  const response = await axios.get<typeof defaultGetBundleRes>(url, {
    params: {
      app_id: defaultAppId,
    },
    headers,
  })
  return response.data.map((res) => {
    res.updated_at = defaultUpdatedAt
    res.created_at = defaultCreatedAt
    return res
  })
}

export async function deleteBundle(baseUrl: string) {
  const url = `${baseUrl}/bundle`
  const response = await axios.delete<typeof defaultRes>(url, {
    params: {
      app_id: defaultAppId,
    },
    headers,
  })
  return response.data
}
