import { Buffer } from 'node:buffer'
import { createClient } from '@supabase/supabase-js'
import AdmZip from 'adm-zip'
import { beforeAll, describe, expect, it } from 'vitest'
// import { prepareCli, runCli, setDependencies } from './cliUtils'
import type { Database } from '~/types/supabase.types'
import { prepareCli, runCli } from './cliUtils'
import { getUpdateBaseData, responseOk, sendUpdate } from './utils'

const BASE_URL = new URL('http://localhost:54321/functions/v1')
const SERVICE_ROLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
let semver = `1.0.${Date.now()}`

function increaseSemver() {
  const lastNumber = Number.parseInt(semver.charAt(semver.length - 1))
  const newSemver = `${semver.slice(0, -1)}${(lastNumber + 1).toString()}`
  semver = newSemver
}
function createSupabase() {
  const supabase = createClient<Database>('http://localhost:54321', SERVICE_ROLE)
  return supabase
}
function resetAndSeedData() {
  const supabase = createSupabase()
  return supabase.rpc('reset_and_seed_data')
}

describe('tests CLI upload', () => {
  beforeAll(async () => {
    await prepareCli(BASE_URL)
  })
  it('should upload bundle successfully', async () => {
    await resetAndSeedData()
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check'], true)
    expect(output).toContain('Bundle uploaded')
  })
  it('should download and verify uploaded bundle', async () => {
    const baseData = getUpdateBaseData()
    const response = await sendUpdate(BASE_URL, baseData)
    await responseOk(response, 'Update new bundle')

    const responseJson = await response.json<{ url: string, version: string }>()
    expect(responseJson.url).toBeDefined()
    expect(responseJson.version).toBe(semver)

    const downloadResponse = await fetch(responseJson.url)
    await responseOk(downloadResponse, 'Download new bundle')
    const arrayBuffer = await downloadResponse.arrayBuffer()

    const zip = new AdmZip(Buffer.from(arrayBuffer))
    const zipEntries = zip.getEntries()

    expect(zipEntries.length).toBe(2)

    const indexJsEntry = zipEntries.find(entry => entry.entryName.includes('index.js'))
    expect(indexJsEntry).toBeDefined()

    const indexJsContent = indexJsEntry!.getData().toString('utf8')
    expect(indexJsContent).toBe('import { CapacitorUpdater } from \'@capgo/capacitor-updater\';\nconsole.log(\"Hello world!!!\");\nCapacitorUpdater.notifyAppReady();')
  })
  it('should not upload same twice', async () => {
    increaseSemver()
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check'], false)
    expect(output).toContain('Cannot upload the same bundle content')
  })
})

describe('tests Wrong cases', () => {
  beforeAll(async () => {
    await prepareCli(BASE_URL)
  })
  it('cannot upload with wrong api key', async () => {
    const testApiKey = crypto.randomUUID()

    increaseSemver()
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check'], false, testApiKey)
    expect(output).toContain('Invalid API key or insufficient permissions.')
  })

  it('should test selectable disallow upload', async () => {
    const supabase = createSupabase()
    increaseSemver()
    await supabase.from('channels').update({ disable_auto_update: 'version_number' }).eq('id', 22)
    // test if is set correctly
    const { data: channel } = await supabase.from('channels').select('*').eq('id', 22).single()
    expect(channel?.disable_auto_update).toBe('version_number')

    try {
      const output1 = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production'])
      expect(output1).toContain('to provide a min-update-version')

      const output2 = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--min-update-version', 'invalid', '--ignore-metadata-check'])
      expect(output2).toContain('should follow semver convention')
    }
    finally {
      await supabase.from('channels').update({ disable_auto_update: 'major' }).eq('id', 22)
    }
  })
})

describe('tests CLI for organization', () => {
  beforeAll(async () => {
    await prepareCli(BASE_URL)
  })

  // todo: fix this test
  // it.only('should test auto min version flag', async () => {
  //   await resetAndSeedData()
  //   // const { error } = await supabase.from('channels').update({  }).eq('id', 22)
  //   const uploadWithAutoFlagWithAssert = async (expected: string) => {
  //     const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--auto-min-update-version'])
  //     console.log(output)
  //     const minUpdateVersion = output.split('\n').find(l => l.includes('Auto set min-update-version'))
  //     expect(minUpdateVersion).toBeDefined()
  //     expect(minUpdateVersion).toContain(expected)
  //     return output
  //   }

  //   increaseSemver()
  //   await uploadWithAutoFlagWithAssert(semver)

  //   const expected = semver
  //   increaseSemver()
  //   await uploadWithAutoFlagWithAssert(expected)
  //   const supabase = createSupabase()
  //   await supabase
  //     .from('app_versions')
  //     .update({ minUpdateVersion: null })
  //     .eq('name', semver)

  //   increaseSemver()
  //   const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--auto-min-update-version', '--ignore-checksum-check'])
  //   expect(output).toContain('skipping auto setting compatibility')

  //   await supabase
  //     .from('app_versions')
  //     .update({ minUpdateVersion: '1.0.0', native_packages: null })
  //     .eq('name', semver)

  //   increaseSemver()
  //   const output2 = await uploadWithAutoFlagWithAssert(semver)
  //   expect(output2).toContain('it\'s your first upload with compatibility check')
  // })

  it('should test upload with organization', async () => {
    const testApiKey = crypto.randomUUID()
    const testUserId = '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5'
    const supabase = createSupabase()
    await resetAndSeedData()
    await supabase.from('apikeys')
      .insert({ key: testApiKey, user_id: testUserId, mode: 'upload', name: 'test' })

    try {
      const { data: orgMembers } = await supabase.from('org_users')
        .delete()
        .eq('user_id', testUserId)
        .select('*')

      try {
        await supabase.from('org_users')
          .insert({ user_id: testUserId, org_id: '046a36ac-e03c-4590-9257-bd6c9dba9ee8', user_right: 'upload' })

        try {
          increaseSemver()
          const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check'], false, testApiKey)
          expect(output).toContain('Bundle uploaded')
        }
        finally {
          await supabase.from('org_users')
            .delete()
            .eq('user_id', testUserId)
            .eq('org_id', '046a36ac-e03c-4590-9257-bd6c9dba9ee8')
            .eq('user_right', 'upload')
        }
      }
      finally {
        await supabase.from('org_users').insert(orgMembers!)
      }
    }
    finally {
      await supabase.from('apikeys')
        .delete()
        .eq('key', testApiKey)
        .eq('user_id', testUserId)
    }
  })
})

// describe('tests CLI metadata', () => {
//   beforeAll(async () => {
//     await prepareCli(BASE_URL)
//   })

//   it.only('should test compatibility table', async () => {
//     await resetAndSeedData()
//     const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production'], true)
//     expect(output).toContain('Bundle uploaded')

//     const assertCompatibilityTableColumns = async (column1: string, column2: string, column3: string, column4: string) => {
//       const output = await runCli(['bundle', 'compatibility', '-c', 'production'])
//       const androidPackage = output.split('\n').find(l => l.includes('@capacitor/android'))
//       expect(androidPackage).toBeDefined()

//       const columns = androidPackage!.split('│').slice(2, -1)
//       expect(columns.length).toBe(4)
//       expect(columns[0]).toContain(column1)
//       expect(columns[1]).toContain(column2)
//       expect(columns[2]).toContain(column3)
//       expect(columns[3]).toContain(column4)
//     }

//     await assertCompatibilityTableColumns('@capacitor/android', '4.5.0', 'None', '❌')

//     increaseSemver()
//     await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--ignore-metadata-check'])

//     await assertCompatibilityTableColumns('@capacitor/android', '4.5.0', '4.5.0', '✅')

//     setDependencies({})

//     await assertCompatibilityTableColumns('@capacitor/android', 'None', '4.5.0', '❌')
//   })
// })
