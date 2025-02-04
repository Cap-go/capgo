import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { INVALID_STRING_DEVICE_ID, INVALID_STRING_PLATFORM, INVALID_STRING_PLUGIN_VERSION } from '../supabase/functions/_backend/utils/utils.ts'
import { getBaseData, getSupabaseClient, postUpdate, resetAndSeedAppData } from './test-utils.ts'

const APPNAME = 'com.demo.app.updates'

interface UpdateRes {
  error?: string
  url?: string
  checksum?: string
  version?: string
  message?: string
}

const updateNewScheme = z.object({
  url: z.string(),
  version: z.string(),
})

beforeAll(async () => {
  await resetAndSeedAppData(APPNAME)
})

describe('[POST] /updates', () => {
  it('no new version available', async () => {
    const baseData = getBaseData(APPNAME)
    const response = await postUpdate(baseData)

    expect(response.status).toBe(200)
    expect(await response.json<UpdateRes>()).toEqual({ message: 'No new version available' })
  })

  it('new version available', async () => {
    const baseData = getBaseData(APPNAME)
    baseData.version_name = '1.1.0'

    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)

    const json = await response.json<UpdateRes>()
    expect(() => updateNewScheme.parse(json)).not.toThrow()
    expect(json.version).toBe('1.0.0')
  })
})

describe('[POST] /updates parallel tests', () => {
  it('with new device', async () => {
    const uuid = randomUUID().toLowerCase()

    const baseData = getBaseData(APPNAME)
    baseData.version_name = '1.1.0'
    baseData.device_id = uuid

    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)
    expect((await response.json<UpdateRes>()).checksum).toBe('3885ee49')

    const { error, data } = await getSupabaseClient().from('devices').select().eq('device_id', uuid).eq('app_id', APPNAME).single()
    expect(error).toBeNull()
    expect(data).toBeTruthy()
    expect(data?.app_id).toBe(baseData.app_id)

    const response2 = await postUpdate(getBaseData(APPNAME))
    expect(response2.status).toBe(200)
    const json = await response2.json<UpdateRes>()
    expect(json).toEqual({ message: 'No new version available' })

    // Clean up
    await getSupabaseClient().from('devices').delete().eq('device_id', uuid).eq('app_id', APPNAME)
  })

  it('disable auto update to major', async () => {
    const baseData = getBaseData(APPNAME)
    baseData.version_build = '0.0.0'
    baseData.version_name = '0.0.0'

    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)
    const json = await response.json<UpdateRes>()
    console.log('json', json)
    expect(json.error).toBe('disable_auto_update_to_major')
  })

  it('app that does not exist', async () => {
    const baseData = getBaseData(APPNAME)
    baseData.app_id = 'does.not.exist'

    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)
    const json = await response.json<UpdateRes>()
    expect(json.error).toBe('app_not_found')
  })

  it('direct channel overwrite', async () => {
    const uuid = randomUUID().toLowerCase()

    const baseData = getBaseData(APPNAME)
    baseData.device_id = uuid;
    (baseData as any).defaultChannel = 'no_access'

    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)

    const json = await response.json<UpdateRes>()
    expect(() => updateNewScheme.parse(json)).not.toThrow()
    expect(json.version).toBe('1.361.0')
  })
})

describe('[POST] /updates invalid data', () => {
  it('unsupported platform', async () => {
    const baseData = getBaseData(APPNAME)
    baseData.platform = 'unsupported_platform'
    baseData.version_name = '1.1.0'

    const response = await postUpdate(baseData)
    expect(response.status).toBe(400)

    const json = await response.json<UpdateRes>()
    expect(json.error).toBe(`Cannot parse json: ${INVALID_STRING_PLATFORM}`)
  })

  it('invalid device_id', async () => {
    const invalidUUID = 'invalid-uuid'

    const baseData = getBaseData(APPNAME)
    baseData.device_id = invalidUUID
    baseData.version_name = '1.1.0'

    const response = await postUpdate(baseData)
    expect(response.status).toBe(400)

    const json = await response.json<UpdateRes>()
    expect(json.error).toBe(`Cannot parse json: ${INVALID_STRING_DEVICE_ID}`)
  })

  it('invalid plugin_version', async () => {
    const baseData = getBaseData(APPNAME)
    baseData.plugin_version = 'invalid_version'

    const response = await postUpdate(baseData)
    expect(response.status).toBe(400)

    const json = await response.json<UpdateRes>()
    expect(json.error).toBe(`Cannot parse json: ${INVALID_STRING_PLUGIN_VERSION}`)
  })

  it('missing fields', async () => {
    const baseData = {} as any

    const response = await postUpdate(baseData)
    expect(response.status).toBe(400)

    const json = await response.json<UpdateRes>()
    expect(json.error).toBe('Cannot parse json: App ID is required')
  })

  it('only platform field', async () => {
    const baseData = { platform: 'android' } as any

    const response = await postUpdate(baseData)
    expect(response.status).toBe(400)

    const json = await response.json<UpdateRes>()
    expect(json.error).toBe('Cannot parse json: App ID is required')
  })

  it('device_id and app_id combination not found', async () => {
    const baseData = getBaseData(APPNAME)
    baseData.device_id = '00000000-0000-0000-1234-000000000000'
    baseData.app_id = 'non.existent.app'

    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)

    const json = await response.json<UpdateRes>()
    expect(json.error).toBe('app_not_found')
  })
})

describe('update scenarios', () => {
  it('disable auto update under native', async () => {
    const baseData = getBaseData(APPNAME)
    baseData.version_build = '2.0.0'
    baseData.version_name = '2.0.0'

    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)
    const json = await response.json<UpdateRes>()
    expect(json.error).toBe('disable_auto_update_under_native')
  })

  it('disable auto update to minor', async () => {
    const versionId = await getSupabaseClient().from('app_versions').select('id').eq('name', '1.361.0').eq('app_id', APPNAME).single().throwOnError().then(({ data }) => data?.id)
    await getSupabaseClient().from('channels').update({ disable_auto_update: 'minor', version: versionId }).eq('name', 'production').eq('app_id', APPNAME).throwOnError()

    const baseData = getBaseData(APPNAME)
    baseData.version_name = '1.1.0'

    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)
    const json = await response.json<UpdateRes>()
    expect(json.error).toBe('disable_auto_update_to_minor')
  })

  it('disallow emulator', async () => {
    await getSupabaseClient().from('channels').update({ allow_emulator: false, disable_auto_update: 'major' }).eq('name', 'production').eq('app_id', APPNAME)

    const baseData = getBaseData(APPNAME)
    baseData.version_name = '1.1.0'
    baseData.is_emulator = true

    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)
    const json = await response.json<UpdateRes>()
    expect(json.error).toBe('disable_emulator')
  })

  it('development build', async () => {
    await getSupabaseClient().from('channels').update({ allow_dev: false }).eq('name', 'production').eq('app_id', APPNAME)

    const baseData = getBaseData(APPNAME)
    baseData.version_name = '1.1.0'
    baseData.is_prod = false

    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)
    const json = await response.json<UpdateRes>()
    expect(json.error).toBe('disable_dev_build')
  })

  it('channel overwrite', async () => {
    const uuid = randomUUID().toLowerCase()

    // get the channel id
    const { data, error } = await getSupabaseClient().from('channels').select('id').eq('name', 'no_access').eq('app_id', APPNAME).single()
    expect(error).toBeNull()
    expect(data).toBeTruthy()
    const channelId = data?.id

    await getSupabaseClient().from('channel_devices').insert({
      device_id: uuid,
      channel_id: channelId as number,
      app_id: APPNAME,
      owner_org: '00000000-0000-0000-0000-000000000000',
    })

    await getSupabaseClient().from('channels').update({ disable_auto_update: 'none', allow_dev: true, allow_emulator: true, android: true }).eq('name', 'no_access').eq('app_id', APPNAME)

    const baseData = getBaseData(APPNAME)
    baseData.device_id = uuid
    baseData.version_name = '0.0.0'

    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)

    const json = await response.json<UpdateRes>()
    expect(() => updateNewScheme.parse(json)).not.toThrow()
    expect(json.version).toBe('1.361.0')

    // Clean up
    await getSupabaseClient().from('channel_devices').delete().eq('device_id', uuid).eq('app_id', APPNAME)
  })

  it('disallowed public channel update', async () => {
    await getSupabaseClient().from('channels').update({ public: false }).eq('name', 'production').eq('app_id', APPNAME)

    const baseData = getBaseData(APPNAME)
    baseData.version_name = '1.1.0'

    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)
    const json = await response.json<UpdateRes>()
    expect(json.error).toBe('no_channel')
  })
})
