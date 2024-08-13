// Imports
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.44.3'
import { z } from 'https://deno.land/x/zod/mod.ts'
import { INVALID_STRING_DEVICE_ID, INVALID_STRING_PLATFORM, INVALID_STRING_PLUGIN_VERSION } from '../_backend/utils/utils.ts'

// Constants
const BASE_URL = 'http://localhost:54321/functions/v1'
const headers = {
  'Content-Type': 'application/json',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_KEY') ?? ''
const supabase = createClient(supabaseUrl, supabaseServiceKey)

const updateAndroidBaseData = {
  platform: 'android',
  device_id: '00009a6b-eefe-490a-9c60-8e965132ae51',
  app_id: 'com.demo.app',
  custom_id: '',
  version_build: '1.0',
  version_code: '1',
  version_os: '13',
  version_name: '1.0.0',
  plugin_version: '5.2.1',
  is_emulator: false,
  is_prod: true,
}

const updateNewScheme = z.object({
  url: z.string(),
  version: z.string(),
})

// Helper functions
function getBaseData() {
  return structuredClone(updateAndroidBaseData)
}

async function resetAndSeedData() {
  const { error } = await supabase.rpc('reset_and_seed_data')
  if (error)
    throw error
}

async function postUpdate(data: object) {
  const response = await fetch(`${BASE_URL}/updates`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  })
  return response
}

// Tests

Deno.test('Test no new version available', async () => {
  await resetAndSeedData()

  const baseData = getBaseData()
  const response = await postUpdate(baseData)

  assertEquals(response.status, 200)
  assertEquals(await response.json(), { message: 'No new version available' })
})

Deno.test('Test new version available', async () => {
  await resetAndSeedData()

  const baseData = getBaseData()
  baseData.version_name = '1.1.0'

  const response = await postUpdate(baseData)
  assertEquals(response.status, 200)

  const json = await response.json()
  // console.log('Test new version available', json)
  updateNewScheme.parse(json)
  assertEquals(json.version, '1.0.0')
})

// TODO: Fix this test, there should be a new device only when a new version is available
Deno.test('Test with new device', async () => {
  await resetAndSeedData()

  const uuid = crypto.randomUUID()

  const baseData = getBaseData()
  baseData.version_name = '1.1.0'
  baseData.device_id = uuid

  const response = await postUpdate(baseData)
  assertEquals(response.status, 200)
  assertEquals((await response.json()).checksum, '3885ee49')

  const { error, data } = await supabase.from('devices')
    .select()
    .eq('device_id', uuid)
    .single()
  assertEquals(error, null)
  assert(data)
  assertEquals(data.app_id, baseData.app_id)

  await supabase.from('devices')
    .delete()
    .eq('device_id', uuid)

  const response2 = await postUpdate(getBaseData())
  assertEquals(response2.status, 200)
  const json = await response2.json()
  // console.log('Test with new device', json)
  assertEquals(json, { message: 'No new version available' })
})

Deno.test('Test disable auto update to major', async () => {
  await resetAndSeedData()

  const baseData = getBaseData()
  baseData.version_name = '0.0.0'

  const response = await postUpdate(baseData)
  assertEquals(response.status, 200)
  const json = await response.json()
  assertEquals(json.error, 'disable_auto_update_to_major')
})

Deno.test('Test disable auto update to minor', async () => {
  await resetAndSeedData()

  const { error } = await supabase.from('channels')
    .update({ disable_auto_update: 'minor', version: 9653 })
    .eq('id', 22)
  assertEquals(error, null)

  const baseData = getBaseData()
  baseData.version_name = '1.1.0'

  const response = await postUpdate(baseData)
  assertEquals(response.status, 200)
  const json = await response.json()
  assertEquals(json.error, 'disable_auto_update_to_minor')
})

Deno.test('Test disable auto update under native', async () => {
  await resetAndSeedData()

  const baseData = getBaseData()
  baseData.version_build = '2.0.0'
  baseData.version_name = '2.0.0'

  const response = await postUpdate(baseData)
  assertEquals(response.status, 200)
  const json = await response.json()
  assertEquals(json.error, 'disable_auto_update_under_native')
})

Deno.test('Test disallow emulator', async () => {
  await resetAndSeedData()

  const { error } = await supabase.from('channels')
    .update({ allow_emulator: false })
    .eq('id', 22)
  assertEquals(error, null)

  const baseData = getBaseData()
  baseData.version_name = '1.1.0'
  baseData.is_emulator = true

  const response = await postUpdate(baseData)
  assertEquals(response.status, 200)
  const json = await response.json()
  assertEquals(json.error, 'disable_emulator')
})

Deno.test('Test development build', async () => {
  await resetAndSeedData()

  const { error } = await supabase.from('channels')
    .update({ allow_dev: false })
    .eq('id', 22)
  assertEquals(error, null)

  const baseData = getBaseData()
  baseData.version_name = '1.1.0'
  baseData.is_prod = false

  const response = await postUpdate(baseData)
  assertEquals(response.status, 200)
  const json = await response.json()
  assertEquals(json.error, 'disable_dev_build')
})

Deno.test('Test with an app that does not exist', async () => {
  await resetAndSeedData()

  const baseData = getBaseData()
  baseData.app_id = 'does.not.exist'

  const response = await postUpdate(baseData)
  assertEquals(response.status, 200)
  const json = await response.json()
  assertEquals(json.error, 'app_not_found')
})

Deno.test({
  name: 'Test direct channel overwrite',
  fn: async () => {
    await resetAndSeedData()

    const uuid = crypto.randomUUID()

    const baseData = getBaseData()
    baseData.device_id = uuid;
    (baseData as any).defaultChannel = 'no_access'

    const response = await postUpdate(baseData)
    assertEquals(response.status, 200)

    const json = await response.json()
    updateNewScheme.parse(json)
    assertEquals(json.version, '1.361.0')
  },
})

Deno.test('Test channel overwrite', async () => {
  await resetAndSeedData()

  const uuid = crypto.randomUUID()

  const { error } = await supabase.from('channel_devices')
    .insert({
      device_id: uuid,
      channel_id: 23,
      app_id: updateAndroidBaseData.app_id,
      owner_org: '00000000-0000-0000-0000-000000000000',
    })
  assertEquals(error, null)

  const { error: error2 } = await supabase.from('channels')
    .update({ disable_auto_update: 'none', version: 9653, allow_dev: true, allow_emulator: true, android: true })
    .eq('id', 23)
  assertEquals(error2, null)

  const baseData = getBaseData()
  baseData.device_id = uuid
  baseData.version_name = '0.0.0'

  const response = await postUpdate(baseData)
  assertEquals(response.status, 200)

  const json = await response.json()
  // console.log('Test channel overwrite', json)
  updateNewScheme.parse(json)
  assertEquals(json.version, '1.361.0')

  await supabase.from('channel_devices')
    .delete()
    .eq('device_id', uuid)
})

Deno.test('Test version overwrite', async () => {
  await resetAndSeedData()

  const uuid = crypto.randomUUID()

  const { error } = await supabase.from('devices_override')
    .insert({
      device_id: uuid,
      version: 9601,
      app_id: updateAndroidBaseData.app_id,
      owner_org: '00000000-0000-0000-0000-000000000000',
    })
  assertEquals(error, null)

  const { error: error2 } = await supabase.from('channels')
    .update({ disable_auto_update: 'none', version: 9653, allow_dev: true, allow_emulator: true, android: true })
    .eq('id', 23)
  assertEquals(error2, null)

  const baseData = getBaseData()
  baseData.device_id = uuid
  baseData.version_name = '0.0.0'

  const response = await postUpdate(baseData)
  assertEquals(response.status, 200)

  const json = await response.json()
  // console.log('Test version overwrite', json)
  updateNewScheme.parse(json)
  assertEquals(json.version, '1.359.0')

  await supabase.from('devices_override')
    .delete()
    .eq('device_id', uuid)
})

Deno.test('Test disallowed public channel update', async () => {
  await resetAndSeedData()

  const { error } = await supabase.from('channels')
    .update({ public: false })
    .eq('id', 22)
  assertEquals(error, null)

  const baseData = getBaseData()
  baseData.version_name = '1.1.0'

  const response = await postUpdate(baseData)
  assertEquals(response.status, 200)
  const json = await response.json()
  // console.log('Test disallowed public channel update', json)
  assertEquals(json.error, 'no_channel')
})

Deno.test('Test disabled progressive deployment', async () => {
  await resetAndSeedData()

  const { error } = await supabase.from('channels')
    .update({ enable_progressive_deploy: false })
    .eq('id', 22)
  assertEquals(error, null)

  const baseData = getBaseData()
  baseData.version_name = '1.0.0'

  const response = await postUpdate(baseData)
  assertEquals(response.status, 200)

  const json = await response.json()
  // console.log('Test disabled progressive deployment', json)
  assertEquals(json.message, 'No new version available')
})

Deno.test('Test unsupported platform', async () => {
  await resetAndSeedData()

  const baseData = getBaseData()
  baseData.platform = 'unsupported_platform'
  baseData.version_name = '1.1.0'

  const response = await postUpdate(baseData)
  assertEquals(response.status, 400)

  const json = await response.json()
  assertEquals(json.error, `Cannot parse json: ${INVALID_STRING_PLATFORM}`)
  // console.log('Test unsupported platform', json)
})

Deno.test('Test invalid device_id', async () => {
  await resetAndSeedData()

  const invalidUUID = 'invalid-uuid'

  const baseData = getBaseData()
  baseData.device_id = invalidUUID
  baseData.version_name = '1.1.0'

  const response = await postUpdate(baseData)
  assertEquals(response.status, 400)

  const json = await response.json()
  assertEquals(json.error, `Cannot parse json: ${INVALID_STRING_DEVICE_ID}`)
  // console.log('Test invalid device_id', json)
})

Deno.test('Test invalid plugin_version', async () => {
  await resetAndSeedData()

  const baseData = getBaseData()
  baseData.plugin_version = 'invalid_version'

  const response = await postUpdate(baseData)
  assertEquals(response.status, 400)

  const json = await response.json()
  assertEquals(json.error, `Cannot parse json: ${INVALID_STRING_PLUGIN_VERSION}`)
  // console.log('Test invalid plugin_version', json)
})

Deno.test('Test missing fields', async () => {
  await resetAndSeedData()

  const baseData = {} as any

  const response = await postUpdate(baseData)
  assertEquals(response.status, 400)

  const json = await response.json()
  assertEquals(json.error, 'Cannot parse json: App ID is required')
  // console.log('Test missing fields', json)
})

Deno.test('Test only platform field', async () => {
  await resetAndSeedData()

  const baseData = { platform: 'android' } as any

  const response = await postUpdate(baseData)
  assertEquals(response.status, 400)

  const json = await response.json()
  assertEquals(json.error, 'Cannot parse json: App ID is required')
  // console.log('Test only platform field', json)
})

Deno.test('Test device_id and app_id combination not found', async () => {
  await resetAndSeedData()

  const baseData = getBaseData()
  baseData.device_id = '00000000-0000-0000-1234-000000000000'
  baseData.app_id = 'non.existent.app'

  const response = await postUpdate(baseData)
  assertEquals(response.status, 200)

  const json = await response.json()
  assertEquals(json.error, 'app_not_found')
  // console.log('Test device_id and app_id combination not found', json)
})
