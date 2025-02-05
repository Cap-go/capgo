import type { ManifestEntry } from 'supabase/functions/_backend/utils/downloadUrl.ts'

import { beforeAll, describe, expect, it } from 'vitest'
import { getBaseData, getSupabaseClient, postUpdate, resetAndSeedAppData } from './test-utils.ts'

const APPNAME = 'com.demo.app.updates'

interface UpdateRes {
  error?: string
  url?: string
  checksum?: string
  version?: string
  message?: string
  manifest?: ManifestEntry[]
}

beforeAll(async () => {
  await resetAndSeedAppData(APPNAME)
})

describe('update manifest scenarios', () => {
  it('manifest update', async () => {
  // test manifest update working with plugin version > 6.8.0
    const baseData = getBaseData(APPNAME)
    // add to version 1.361.0 manifest
    await getSupabaseClient().from('app_versions').update({ manifest: [{ file_name: 'test', s3_path: '/test_file.html', file_hash: '1234567890' }] }).eq('name', '1.0.0').eq('app_id', APPNAME).throwOnError()
    baseData.version_name = '1.1.0'
    baseData.plugin_version = '6.8.1'
    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)
    const json = await response.json<UpdateRes>()
    expect(json.manifest).toBeDefined()
    expect(json.manifest?.[0].file_name).toBe('test')
    console.log('json.manifest?.[0].s3_path', json.manifest?.[0].download_url)
    expect(json.manifest?.[0].download_url).toContain('/test_file.html')
    expect(json.manifest?.[0].file_hash).toBe('1234567890')
  })
  // test for plugin version < 6.8.0
  it('manifest should not be available with plugin version < 6.8.0', async () => {
    const baseData = getBaseData(APPNAME)
    baseData.version_name = '1.1.0'
    baseData.plugin_version = '6.7.0'
    await getSupabaseClient().from('app_versions').update({ manifest: [{ file_name: 'test', s3_path: '/test_file.html', file_hash: '1234567890' }] }).eq('name', '1.0.0').eq('app_id', APPNAME).throwOnError()
    const response = await postUpdate(baseData)
    expect(response.status).toBe(200)
    const json = await response.json<UpdateRes>()
    expect(json.manifest).toBeUndefined()
  })

  // // // test for a update with only manifest defined and no r2_path
  // it('update with only manifest', async () => {
  //   const baseData = getBaseData(APPNAME)
  //   await getSupabaseClient().from('app_versions').update({ r2_path: null }).eq('name', '1.0.0').eq('app_id', APPNAME).throwOnError()
  //   baseData.version_name = '1.1.0'
  //   const response = await postUpdate(baseData)
  //   expect(response.status).toBe(200)
  //   const json = await response.json<UpdateRes>()
  //   console.log('json', json)
  //   expect(json.manifest).toBeDefined()
  // })
})
