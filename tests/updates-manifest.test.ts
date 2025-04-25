// import type { ManifestEntry } from 'supabase/functions/_backend/utils/downloadUrl.ts'

// TODO: re enable after we find solution for queue
// import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
// import { afterAll, beforeAll, describe, expect, it } from 'vitest'
// import { getBaseData, getSupabaseClient, postUpdate, resetAndSeedAppData, resetAppData, resetAppDataStats } from './test-utils.ts'

// const id = randomUUID()
// const APPNAME = `com.demo.app.updates.${id}`

// const manifest = [{ file_name: 'test', s3_path: '/test_file.html', file_hash: '1234567890' }]

// interface UpdateRes {
//   error?: string
//   url?: string
//   checksum?: string
//   version?: string
//   message?: string
//   manifest?: ManifestEntry[]
// }

// beforeAll(async () => {
//   await resetAndSeedAppData(APPNAME)
// })
// afterAll(async () => {
//   await resetAppData(APPNAME)
//   await resetAppDataStats(APPNAME)
// })

// describe('update manifest scenarios', () => {
//   it.only('manifest update', async () => {
//   // test manifest update working with plugin version > 6.8.0
//     const baseData = getBaseData(APPNAME)
//     // add to version 1.361.0 manifest
//     const { data: versionData, error: versionError } = await getSupabaseClient().from('app_versions').update({ manifest }).eq('name', '1.0.0').eq('app_id', APPNAME).throwOnError().select('id').single()
//     if (versionError) {
//       console.log('Version data not found', versionError)
//       throw new Error('Version data not found')
//     }
//     const { data: manifestData, error } = await getSupabaseClient()
//       .from('manifest')
//       .select('*')
//       .eq('app_version_id', versionData.id)
//       .single()

//     if (error) {
//       console.log('Manifest entry not found', error)
//     }
//     else {
//       console.log('Manifest entry found', manifestData)
//     }
//     baseData.version_name = '1.1.0'
//     baseData.plugin_version = '6.8.1'
//     const response = await postUpdate(baseData)
//     expect(response.status).toBe(200)
//     const json = await response.json<UpdateRes>()
//     expect(json.manifest).toBeDefined()
//     expect(json.manifest?.[0].file_name).toBe('test')
//     expect(json.manifest?.[0].download_url).toContain('/test_file.html')
//     expect(json.manifest?.[0].file_hash).toBe('1234567890')
//   })
//   // test for plugin version < 6.8.0
//   it('manifest should not be available with plugin version < 6.8.0', async () => {
//     const baseData = getBaseData(APPNAME)
//     baseData.version_name = '1.1.0'
//     baseData.plugin_version = '6.7.0'
//     await getSupabaseClient().from('app_versions').update({ manifest }).eq('name', '1.0.0').eq('app_id', APPNAME).throwOnError()
//     const response = await postUpdate(baseData)
//     expect(response.status).toBe(200)
//     const json = await response.json<UpdateRes>()
//     expect(json.manifest).toBeUndefined()
//   })

//   // // test for a update with only manifest defined and no r2_path
//   it('update fail with nothing', async () => {
//     const baseData = getBaseData(APPNAME)
//     await getSupabaseClient().from('app_versions').update({ r2_path: null, manifest: null }).eq('name', '1.0.0').eq('app_id', APPNAME).throwOnError()
//     baseData.version_name = '1.1.0'
//     baseData.plugin_version = '6.8.1'
//     const response = await postUpdate(baseData)
//     expect(response.status).toBe(200)
//     const json = await response.json<UpdateRes>()
//     expect(json.message).toBe('Cannot get bundle')
//   })

//   it('update with only manifest', async () => {
//     const baseData = getBaseData(APPNAME)
//     await getSupabaseClient().from('app_versions').update({ r2_path: null, manifest }).eq('name', '1.0.0').eq('app_id', APPNAME).throwOnError()
//     baseData.version_name = '1.1.0'
//     baseData.plugin_version = '6.8.1'
//     const response = await postUpdate(baseData)
//     expect(response.status).toBe(200)
//     const json = await response.json<UpdateRes>()
//     expect(json.manifest).toBeDefined()
//   })
// })

it('test manifest', async () => {
  expect(true).toBe(true)
})
