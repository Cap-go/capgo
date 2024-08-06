import * as crypto from 'node:crypto'
import type { APIRequestContext } from '@playwright/test'
import { test } from '@playwright/test'
import { z } from 'zod'
import { useSupabaseAdmin } from './utils'
import { expect } from './zodUtils'
import type { Database } from '~/types/supabase.types'

const functionUrl = process.env.BACKEND_URL || 'http://localhost:54321/functions/v1/'
// const defaultUserId = '6aa76066-55ef-4238-ade6-0b32334a4097'

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

function getBaseData() {
  return structuredClone(updateAndroidBaseData)
}

const updateNewScheme = z.object({
  url: z.string(),
  version: z.string(),
})

const backendTest = test.extend<object, {}>({
  baseURL: new URL('updates', functionUrl).toString(),
})

backendTest.describe.configure({ mode: 'serial' })

const copiedChannelList: { data: Database['public']['Tables']['channels']['Row'], id: number }[] = []
async function copyChannelById(id: number) {
  const supabase = await useSupabaseAdmin()

  const { data, error } = await supabase.from('channels')
    .select()
    .eq('id', id)
    .single()

  expect(error).toBeFalsy()
  expect(data).toBeTruthy()

  copiedChannelList.push({ data: data!, id })
}

async function restoreChannel() {
  const supabase = await useSupabaseAdmin()
  expect(copiedChannelList.length).toBeGreaterThan(0)

  const copiedChannel = await copiedChannelList.pop()
  expect(copiedChannel).toBeTruthy()

  const { error } = await supabase.from('channels')
    .update(copiedChannel!.data)
    .eq('id', copiedChannel!.id)

  expect(error).toBeFalsy()
}

function postUpdate(request: APIRequestContext, data: object) {
  return request.post('', {
    data,
  })
}

backendTest.describe('Test update logic', () => {
  backendTest.beforeAll(async () => await copyChannelById(22))
  backendTest.beforeAll(async () => {
    const supabase = await useSupabaseAdmin()

    const { error } = await supabase.from('channels')
      .update({
        version: 9654,
        public: true,
        android: true,
        disable_auto_update: 'major',
      })
      .eq('id', 22)

    await expect(error).toBeFalsy()
  })
  backendTest.afterAll(restoreChannel)

  backendTest('Test no new version available', async ({ request }) => {
    const baseData = getBaseData()

    const response = await postUpdate(request, baseData)

    expect(response.ok()).toBeTruthy()
    expect(await response.json()).toEqual({ message: 'No new version available' })
  })

  backendTest('Test new version available', async ({ request }) => {
    const baseData = getBaseData()
    baseData.version_name = '1.1.0'

    const response = await postUpdate(request, baseData)
    expect(response.ok()).toBeTruthy()

    const json = await response.json()
    await expect(json).toMatchSchema(updateNewScheme)
    const parsed = updateNewScheme.parse(json)

    expect(parsed.version).toBe('1.0.0')
  })

  backendTest('Test disable auto update to major', async ({ request }) => {
    const baseData = getBaseData()
    baseData.version_name = '0.0.0'

    const response = await postUpdate(request, baseData)
    expect(response.ok()).toBeTruthy()

    expect(response).toHaveError('disable_auto_update_to_major')
  })

  backendTest.describe('Test disable auto update to minor', () => {
    backendTest.beforeAll(async () => await copyChannelById(22))
    backendTest.afterAll(restoreChannel)

    backendTest.beforeAll('Prepare test', async () => {
      const supabase = await useSupabaseAdmin()

      // Set version to 1.361.0
      const { error } = await supabase.from('channels')
        .update({ disable_auto_update: 'minor', version: 9653 })
        .eq('id', 22)

      expect(error).toBeFalsy()
    })

    backendTest('Test disable_auto_update_to_minor', async ({ request }) => {
      const baseData = getBaseData()
      baseData.version_name = '1.1.0'

      const response = await postUpdate(request, baseData)
      expect(response.ok()).toBeTruthy()

      expect(response).toHaveError('disable_auto_update_to_minor')
    })
  })

  backendTest('Test disable auto update under native', async ({ request }) => {
    const baseData = getBaseData()
    baseData.version_build = '2.0.0'
    baseData.version_name = '2.0.0'

    const response = await postUpdate(request, baseData)
    expect(response.ok()).toBeTruthy()

    expect(response).toHaveError('disable_auto_update_under_native')
  })

  backendTest.describe('Test disallow emulator', () => {
    backendTest.beforeAll(async () => await copyChannelById(22))
    backendTest.afterAll(restoreChannel)

    backendTest.beforeAll('Prepare test', async () => {
      const supabase = await useSupabaseAdmin()

      // Set version to 1.361.0
      const { error } = await supabase.from('channels')
        .update({ allow_emulator: false })
        .eq('id', 22)

      expect(error).toBeFalsy()
    })

    backendTest('Test disable_emulator', async ({ request }) => {
      const baseData = getBaseData()
      baseData.version_name = '1.1.0'
      baseData.is_emulator = true

      const response = await postUpdate(request, baseData)
      expect(response.ok()).toBeTruthy()

      expect(response).toHaveError('disable_emulator')
    })
  })

  backendTest.describe('Test development build', () => {
    backendTest.beforeAll(async () => await copyChannelById(22))
    backendTest.afterAll(restoreChannel)

    backendTest.beforeAll('Prepare test', async () => {
      const supabase = await useSupabaseAdmin()

      // Set version to 1.361.0
      const { error } = await supabase.from('channels')
        .update({ allow_dev: false })
        .eq('id', 22)

      expect(error).toBeFalsy()
    })

    backendTest('Test disable_dev_build', async ({ request }) => {
      const baseData = getBaseData()
      baseData.version_name = '1.1.0'
      baseData.is_prod = false

      const response = await postUpdate(request, baseData)
      expect(response.ok()).toBeTruthy()

      expect(response).toHaveError('disable_dev_build')
    })
  })

  backendTest('Test with an app that does not exist', async ({ request }) => {
    const baseData = getBaseData()
    baseData.app_id = 'does.not.exist'

    const response = await postUpdate(request, baseData)
    expect(response.ok()).toBeTruthy()

    expect(response).toHaveError('app_not_found')
  })

  backendTest.describe('Test with new device', () => {
    const uuid = crypto.randomUUID()

    // Remove the device from db after the test
    backendTest.afterAll(async ({ request }) => {
      const supabase = await useSupabaseAdmin()

      const { error } = await supabase.from('devices')
        .delete()
        .eq('device_id', uuid)

      expect(error).toBeFalsy()

      // After removing the overwrite check if there are no new versions avalible
      const baseData = getBaseData()
      baseData.device_id = uuid

      // Get and check response
      const response = await postUpdate(request, baseData)
      expect(response.ok()).toBeTruthy()

      // Parse response (check schema)
      const json = await response.json()
      expect(json).toEqual({ message: 'No new version available' })
    })

    backendTest('Assert new device was created', async ({ request }) => {
      const baseData = getBaseData()
      baseData.device_id = uuid

      // Get and check response
      const response = await postUpdate(request, baseData)
      expect(response.ok()).toBeTruthy()

      // Parse response (check schema)
      const json = await response.json()
      expect(json).toEqual({ message: 'No new version available' })

      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
      await delay(3000)

      // Check if device was added
      const supabase = await useSupabaseAdmin()
      const { error, data } = await supabase.from('clickhouse_devices')
        .select()
        .eq('device_id', uuid)
        .single()

      expect(error).toBeFalsy()
      expect(data).toBeTruthy()
      expect(data!.app_id).toBe(baseData.app_id)
    })

    backendTest.describe('Test channel overwrite', () => {
      backendTest.beforeAll(async () => await copyChannelById(23))
      backendTest.afterAll(restoreChannel)

      // Make sure that this overwrite gets deleted after the test
      backendTest.afterAll(async () => {
        const supabase = await useSupabaseAdmin()
        const { error } = await supabase.from('channel_devices')
          .delete()
          .eq('device_id', uuid)

        expect(error).toBeFalsy()
      })

      // Prepare test
      backendTest.beforeAll(async () => {
        const supabase = await useSupabaseAdmin()

        const { error } = await supabase
          .from('channel_devices')
          .insert({
            device_id: uuid,
            channel_id: 23,
            app_id: updateAndroidBaseData.app_id,
            owner_org: '00000000-0000-0000-0000-000000000000',
          })
        expect(error).toBeFalsy()

        const { error: error2 } = await supabase
          .from('channels')
          .update({ disable_auto_update: 'none', version: 9653, allow_dev: true, allow_emulator: true, android: true })
          .eq('id', 23)

        expect(error2).toBeFalsy()
      })

      backendTest('Test device overwrite', async ({ request }) => {
        const baseData = await getBaseData()
        baseData.device_id = uuid
        baseData.version_name = '0.0.0'

        const response = await postUpdate(request, baseData)
        expect(response.ok()).toBeTruthy()

        const json = await response.json()
        await expect(json).toMatchSchema(updateNewScheme)
        const parsed = updateNewScheme.parse(json)

        expect(parsed.version).toBe('1.361.0')
      })
    })

    backendTest.describe('Test version overwrite', () => {
      backendTest.beforeAll(async () => await copyChannelById(23))
      backendTest.afterAll(restoreChannel)

      // Make sure that this overwrite gets deleted after the test
      backendTest.afterAll(async () => {
        const supabase = await useSupabaseAdmin()
        const { error } = await supabase.from('devices_override')
          .delete()
          .eq('device_id', uuid)

        expect(error).toBeFalsy()
      })

      // Prepare test
      backendTest.beforeAll(async () => {
        const supabase = await useSupabaseAdmin()

        const { error } = await supabase
          .from('devices_override')
          .insert({
            device_id: uuid,
            version: 9601,
            app_id: updateAndroidBaseData.app_id,
            owner_org: '00000000-0000-0000-0000-000000000000',
          })
        expect(error).toBeFalsy()

        const { error: error2 } = await supabase
          .from('channels')
          .update({ disable_auto_update: 'none', version: 9653, allow_dev: true, allow_emulator: true, android: true })
          .eq('id', 23)

        expect(error2).toBeFalsy()
      })

      backendTest('Test device overwrite', async ({ request }) => {
        const baseData = await getBaseData()
        baseData.device_id = uuid
        baseData.version_name = '0.0.0'

        const response = await postUpdate(request, baseData)
        expect(response.ok()).toBeTruthy()

        const json = await response.json()
        await expect(json).toMatchSchema(updateNewScheme)
        const parsed = updateNewScheme.parse(json)

        expect(parsed.version).toBe('1.359.0')
      })
    })
  })
})
