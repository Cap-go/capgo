// Imports
import { assert, assertEquals } from 'https://deno.land/std@0.192.0/testing/asserts.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.8.0'
import { z } from 'https://deno.land/x/zod/mod.ts'

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
  console.log('Test new version available', json)
  updateNewScheme.parse(json)
  assertEquals(json.version, '1.0.0')
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
    .update({ disableAutoUpdate: 'minor', version: 9653 })
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
    .update({ disableAutoUpdate: 'none', version: 9653, allow_dev: true, allow_emulator: true, android: true })
    .eq('id', 23)
  assertEquals(error2, null)

  const baseData = getBaseData()
  baseData.device_id = uuid
  baseData.version_name = '0.0.0'

  const response = await postUpdate(baseData)
  assertEquals(response.status, 200)

  const json = await response.json()
  console.log('Test channel overwrite', json)
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
    .update({ disableAutoUpdate: 'none', version: 9653, allow_dev: true, allow_emulator: true, android: true })
    .eq('id', 23)
  assertEquals(error2, null)

  const baseData = getBaseData()
  baseData.device_id = uuid
  baseData.version_name = '0.0.0'

  const response = await postUpdate(baseData)
  assertEquals(response.status, 200)

  const json = await response.json()
  console.log('Test version overwrite', json)
  updateNewScheme.parse(json)
  assertEquals(json.version, '1.359.0')

  await supabase.from('devices_override')
    .delete()
    .eq('device_id', uuid)
})

Deno.test('Test with new device', async () => {
  await resetAndSeedData()

  const uuid = crypto.randomUUID()

  const baseData = getBaseData()
  baseData.device_id = uuid

  const response = await postUpdate(baseData)
  assertEquals(response.status, 200)
  assertEquals(await response.json(), { message: 'No new version available' })

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

  const response2 = await postUpdate(baseData)
  assertEquals(response2.status, 200)
  const json = await response2.json()
  console.log('Test with new device', json)
  assertEquals(json, { message: 'No new version available' })
})

// TODO: Fix this test by fixing the code in the project
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
