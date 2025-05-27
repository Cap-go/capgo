import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { INVALID_STRING_DEVICE_ID, INVALID_STRING_PLATFORM, INVALID_STRING_PLUGIN_VERSION } from '../supabase/functions/_backend/utils/utils.ts'
import { APP_NAME, createAppVersions, getBaseData, getSupabaseClient, getVersionFromAction, postUpdate, resetAndSeedAppData, resetAppData, resetAppDataStats } from './test-utils.ts'

const id = randomUUID()
const APP_NAME_UPDATE = `${APP_NAME}.${id}`

interface UpdateRes {
  error?: string
  url?: string
  checksum?: string
  version?: string
  message?: string
  manifest?: any[]
}

const updateNewScheme = z.object({
  url: z.string(),
  version: z.string(),
})

beforeAll(async () => {
  await resetAndSeedAppData(APP_NAME_UPDATE)
})
afterAll(async () => {
  await resetAppData(APP_NAME_UPDATE)
  await resetAppDataStats(APP_NAME_UPDATE)
})

describe('[POST] /updates-lite', () => {
  it('no new version available', async () => {
    const baseData = getBaseData(APP_NAME_UPDATE)
    const response = await postUpdate(baseData)

    expect(response.status).toBe(200)
    expect(await response.json<UpdateRes>()).toEqual({ message: 'No new version available' })
  })

  it('new version available', async () => {
    const baseData = getBaseData(APP_NAME_UPDATE)
    baseData.version_name = '1.1.0'

    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)

    const json = await response.json<UpdateRes>()
    expect(() => updateNewScheme.parse(json)).not.toThrow()
    expect(json.version).toBe('1.0.0')
  })
})

describe('[POST] /updates-lite parallel tests', () => {
  it('with new device', async () => {
    const uuid = randomUUID().toLowerCase()

    const baseData = getBaseData(APP_NAME_UPDATE)
    baseData.version_build = getVersionFromAction('get')
    const version = await createAppVersions(baseData.version_build, APP_NAME_UPDATE)
    baseData.version_name = version.name
    baseData.device_id = uuid

    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)
    const jsonResponse = await response.json<UpdateRes>()
    expect(jsonResponse.checksum).toBe('3885ee49')

    const { error, data } = await getSupabaseClient().from('devices').select().eq('device_id', uuid).eq('app_id', APP_NAME_UPDATE).single()
    expect(error).toBeNull()
    expect(data).toBeTruthy()
    expect(data?.app_id).toBe(baseData.app_id)

    const response2 = await postUpdate(getBaseData(APP_NAME_UPDATE))
    expect(response2.status).toBe(200)
    const json = await response2.json<UpdateRes>()
    expect(json).toEqual({ message: 'No new version available' })

    // Clean up
    await getSupabaseClient().from('devices').delete().eq('device_id', uuid).eq('app_id', APP_NAME_UPDATE)
  })

  it('disable auto update to major', async () => {
    const baseData = getBaseData(APP_NAME_UPDATE)
    baseData.version_build = '0.0.0'
    baseData.version_name = '0.0.0'

    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)
    const json = await response.json<UpdateRes>()
    expect(json.error).toBe('disable_auto_update_to_major')
  })

  it('app that does not exist', async () => {
    const baseData = getBaseData(APP_NAME_UPDATE)
    baseData.app_id = 'does.not.exist'

    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)
    const json = await response.json<UpdateRes>()
    expect(json.error).toBe('app_not_found')
  })
})

describe('[POST] /updates-lite invalid data', () => {
  it('unsupported platform', async () => {
    const baseData = getBaseData(APP_NAME_UPDATE)
    baseData.platform = 'unsupported_platform'
    baseData.version_name = '1.1.0'

    const response = await postUpdate(baseData)
    expect(response.status).toBe(400)

    const json = await response.json<UpdateRes>()
    expect(json.error).toBe(`Cannot parse json: ${INVALID_STRING_PLATFORM}`)
  })

  it('invalid device_id', async () => {
    const invalidUUID = 'invalid-uuid'

    const baseData = getBaseData(APP_NAME_UPDATE)
    baseData.device_id = invalidUUID
    baseData.version_name = '1.1.0'

    const response = await postUpdate(baseData)
    expect(response.status).toBe(400)

    const json = await response.json<UpdateRes>()
    expect(json.error).toBe(`Cannot parse json: ${INVALID_STRING_DEVICE_ID}`)
  })

  it('invalid plugin_version', async () => {
    const baseData = getBaseData(APP_NAME_UPDATE)
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
    const baseData = getBaseData(APP_NAME_UPDATE)
    baseData.device_id = '00000000-0000-0000-1234-000000000000'
    baseData.app_id = 'non.existent.app'

    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)

    const json = await response.json<UpdateRes>()
    expect(json.error).toBe('app_not_found')
  })
})

describe('update-lite manifest scenarios', () => {
  it('manifest update with plugin version > 6.8.0', async () => {
    const baseData = getBaseData(APP_NAME_UPDATE)
    baseData.version_name = '1.1.0'
    baseData.plugin_version = '6.8.1'

    const manifest = [{ file_name: 'test', s3_path: '/test_file.html', file_hash: '1234567890' }]
    const { data: versionData, error: versionError } = await getSupabaseClient().from('app_versions').select('id').eq('name', '1.0.0').eq('app_id', APP_NAME_UPDATE).single().throwOnError()
    if (versionError) {
      throw new Error('Version data not found')
    }

    await getSupabaseClient().from('manifest').delete().eq('app_version_id', versionData.id)
    await getSupabaseClient().from('manifest').insert(manifest.map(m => ({ ...m, app_version_id: versionData.id })))

    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)
    const json = await response.json<UpdateRes>()
    expect(json.manifest).toBeDefined()
    expect(json.manifest?.[0].file_name).toBe('test')
    expect(json.manifest?.[0].download_url).toContain('/test_file.html')
    expect(json.manifest?.[0].file_hash).toBe('1234567890')
  })

  it('manifest should not be available with plugin version < 6.8.0', async () => {
    const baseData = getBaseData(APP_NAME_UPDATE)
    baseData.version_name = '1.1.0'
    baseData.plugin_version = '6.7.0'

    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)
    const json = await response.json<UpdateRes>()
    expect(json.manifest).toBeUndefined()
  })

  it('update fail with no bundle or manifest', async () => {
    const baseData = getBaseData(APP_NAME_UPDATE)
    await getSupabaseClient().from('app_versions').update({ r2_path: null }).eq('name', '1.0.0').eq('app_id', APP_NAME_UPDATE).throwOnError()
    await getSupabaseClient().from('manifest').delete().eq('app_version_id', (await getSupabaseClient().from('app_versions').select('id').eq('name', '1.0.0').eq('app_id', APP_NAME_UPDATE).single().throwOnError()).data.id)

    baseData.version_name = '1.1.0'
    baseData.plugin_version = '6.8.1'
    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)
    const json = await response.json<UpdateRes>()
    expect(json.message).toBe('Cannot get bundle url')
  })
})
