import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { INVALID_STRING_DEVICE_ID, INVALID_STRING_PLATFORM, INVALID_STRING_PLUGIN_VERSION } from '../supabase/functions/_backend/utils/utils.ts'
import { BASE_URL, getBaseData, getSupabaseClient, headers, resetAndSeedAppData } from './test-utils.ts'

const ORG_ID = '00000000-0000-0000-0000-000000000000'

beforeAll(async () => {
  // await resetAndSeedAppData(APPNAME)
  const { data } = await getSupabaseClient().from('orgs').select().eq('id', ORG_ID).single()
  if (data) {
    await getSupabaseClient().from('orgs').delete().eq('id', ORG_ID)
  }
  const { error } = await getSupabaseClient().from('orgs').insert({
    id: ORG_ID,
    name: 'Test Organization',
    management_email: 'test@test.com',
    created_by: '6aa76066-55ef-4238-ade6-0b32334a4097',
  })
  if (error)
    throw error
})

describe('[GET] /organization', () => {
  it('get organization', async () => {
    const response = await fetch(`${BASE_URL}/organization`, {
      headers,
    })
    expect(response.status).toBe(200)
    const type = z.array(z.object({ id: z.string(), name: z.string() }))
    expect(type.parse(await response.json()).length).toBeGreaterThan(0)
  })

  it('get organization by id', async () => {
    const response = await fetch(`${BASE_URL}/organization?orgId=${ORG_ID}`, {
      headers,
    })
    expect(response.status).toBe(200)
    const type = z.object({ id: z.string(), name: z.string() })
    const safe = type.safeParse(await response.json())
    expect(safe.success).toBe(true)
    expect(safe.data).toEqual({ id: ORG_ID, name: 'Test Organization' })
  })
})

describe('[GET] /organization/members', () => {
  it('get organization members', async () => {
    const response = await fetch(`${BASE_URL}/organization/members?orgId=${ORG_ID}`, {
      headers,
    })
    expect(response.status).toBe(200)
    const type = z.array(z.object({
      uid: z.string(),
      email: z.string(),
      image_url: z.string(),
      role: z.string()
    }))
    const safe = type.safeParse(await response.json())
    expect(safe.success).toBe(true)
    expect(safe.data?.length).toBe(1)
    expect(safe.data?.[0].uid).toBe('6aa76066-55ef-4238-ade6-0b32334a4097')
    expect(safe.data?.[0].email).toBe('test@capgo.app')
    expect(safe.data?.[0].role).toBe('super_admin')
  })
})

describe('[POST] /organization/members', () => {
  it('add organization member', async () => {
    const response = await fetch(`${BASE_URL}/organization/members`, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        orgId: ORG_ID,
        email: 'admin@capgo.app',
        invite_type: 'read',
      }),
    })
    expect(response.status).toBe(200)
    const type = z.object({
      status: z.string(),
    })
    const safe = type.safeParse(await response.json())
    expect(safe.success).toBe(true)
    expect(safe.data?.status).toBe('OK')

    const { data: userData, error: userError } = await getSupabaseClient().from('users').select().eq('email', 'admin@capgo.app').single()
    expect(userError).toBeNull()
    expect(userData).toBeTruthy()
    expect(userData?.email).toBe('admin@capgo.app')

    const { data, error } = await getSupabaseClient().from('org_users').select().eq('org_id', ORG_ID).eq('user_id', userData!.id).single()
    expect(error).toBeNull()
    expect(data).toBeTruthy()
    expect(data?.org_id).toBe(ORG_ID)
    expect(data?.user_right).toBe('invite_read')
  })
})

describe('[DELETE] /organization/members', () => {
  it('delete organization member', async () => {
    const { data: userData, error: userError } = await getSupabaseClient().from('users').select().eq('email', 'admin@capgo.app').single()
    expect(userError).toBeNull()
    expect(userData).toBeTruthy()
    expect(userData?.email).toBe('admin@capgo.app')

    const { error } = await getSupabaseClient().from('org_users').insert({
      org_id: ORG_ID,
      user_id: userData!.id,
      user_right: 'invite_read',
    })
    expect(error).toBeNull()

    const response = await fetch(`${BASE_URL}/organization/members?orgId=${ORG_ID}&email=admin@capgo.app`, {
      headers,
      method: 'DELETE',
    })
    expect(response.status).toBe(200)
    const type = z.object({
      status: z.string(),
    })
    const safe = type.safeParse(await response.json())
    expect(safe.success).toBe(true)
    expect(safe.data?.status).toBe('OK')

    const { data, error: orgUserError } = await getSupabaseClient().from('org_users').select().eq('org_id', ORG_ID).eq('user_id', userData!.id).single()
    expect(orgUserError).toBeTruthy()
    expect(data).toBeNull()
  })
})

describe('[POST] /organization', () => {
  it('update organization', async () => {
    const name = `Updated Organization ${new Date().toISOString()}`
    const response = await fetch(`${BASE_URL}/organization`, {
      headers,
      method: 'POST',
      body: JSON.stringify({ orgId: ORG_ID, name }),
    })
    expect(response.status).toBe(200)
    const type = z.object({
      status: z.string(),
    })
    const safe = type.safeParse(await response.json())
    expect(safe.success).toBe(true)
    expect(safe.data?.status).toBe('Organization updated')

    const { data, error } = await getSupabaseClient().from('orgs').select().eq('id', ORG_ID).single()
    expect(error).toBeNull()
    expect(data).toBeTruthy()
    expect(data?.name).toBe(name)
  })
})

describe('[PUT] /organization', () => {
  it('create organization', async () => {
    const name = `Created Organization ${new Date().toISOString()}`
    const response = await fetch(`${BASE_URL}/organization`, {
      headers,
      method: 'PUT',
      body: JSON.stringify({ name }),
    })
    expect(response.status).toBe(200)
    const type = z.object({
      status: z.string(),
      id: z.string().uuid(),
    })
    const safe = type.safeParse(await response.json())
    expect(safe.success).toBe(true)
    expect(safe.data?.status).toBe('Organization created')
    expect(safe.data?.id).toBeDefined()

    const { data, error } = await getSupabaseClient().from('orgs').select().eq('id', safe.data!.id).single()
    expect(error).toBeNull()
    expect(data).toBeTruthy()
    expect(data?.name).toBe(name)
  })
})

describe.todo('[DELETE] /organization', () => {
  it.todo('delete organization', async () => {
    const id = randomUUID()
    const { error } = await getSupabaseClient().from('orgs').insert({
      id,
      name: `Test Organization ${new Date().toISOString()}`,
      management_email: 'test@test.com',
      created_by: '6aa76066-55ef-4238-ade6-0b32334a4097',
    })
    expect(error).toBeNull()

    const { data: dataOrg, error: errorOrg } = await getSupabaseClient().from('orgs').select().eq('id', id).single()
    expect(errorOrg).toBeNull()
    expect(dataOrg).toBeTruthy()

    const response = await fetch(`${BASE_URL}/organization?orgId=${id}`, {
      headers,
      method: 'DELETE',
    })
    expect(response.status).toBe(200)

    const { data: dataOrg2, error: errorOrg2 } = await getSupabaseClient().from('orgs').select().eq('id', id).single()
    expect(errorOrg2).toBeTruthy()
    expect(dataOrg2).toBeNull()
  })
})

// describe('[POST] /updates parallel tests', () => {
//   it('with new device', async () => {
//     const uuid = randomUUID().toLowerCase()

//     const baseData = getBaseData(APPNAME)
//     baseData.version_name = '1.1.0'
//     baseData.device_id = uuid

//     const response = await postUpdate(baseData)
//     expect(response.status).toBe(200)
//     expect((await response.json<UpdateRes>()).checksum).toBe('3885ee49')

//     const { error, data } = await getSupabaseClient().from('devices').select().eq('device_id', uuid).eq('app_id', APPNAME).single()
//     expect(error).toBeNull()
//     expect(data).toBeTruthy()
//     expect(data?.app_id).toBe(baseData.app_id)

//     const response2 = await postUpdate(getBaseData(APPNAME))
//     expect(response2.status).toBe(200)
//     const json = await response2.json<UpdateRes>()
//     expect(json).toEqual({ message: 'No new version available' })

//     // Clean up
//     await getSupabaseClient().from('devices').delete().eq('device_id', uuid).eq('app_id', APPNAME)
//   })

//   it('disable auto update to major', async () => {
//     const baseData = getBaseData(APPNAME)
//     baseData.version_name = '0.0.0'

//     const response = await postUpdate(baseData)
//     expect(response.status).toBe(200)
//     const json = await response.json<UpdateRes>()
//     expect(json.error).toBe('disable_auto_update_to_major')
//   })

//   it('app that does not exist', async () => {
//     const baseData = getBaseData(APPNAME)
//     baseData.app_id = 'does.not.exist'

//     const response = await postUpdate(baseData)
//     expect(response.status).toBe(200)
//     const json = await response.json<UpdateRes>()
//     expect(json.error).toBe('app_not_found')
//   })

//   it('direct channel overwrite', async () => {
//     const uuid = randomUUID().toLowerCase()

//     const baseData = getBaseData(APPNAME)
//     baseData.device_id = uuid;
//     (baseData as any).defaultChannel = 'no_access'

//     const response = await postUpdate(baseData)
//     expect(response.status).toBe(200)

//     const json = await response.json<UpdateRes>()
//     expect(() => updateNewScheme.parse(json)).not.toThrow()
//     expect(json.version).toBe('1.361.0')
//   })
// })

// describe('[POST] /updates invalid data', () => {
//   it('unsupported platform', async () => {
//     const baseData = getBaseData(APPNAME)
//     baseData.platform = 'unsupported_platform'
//     baseData.version_name = '1.1.0'

//     const response = await postUpdate(baseData)
//     expect(response.status).toBe(400)

//     const json = await response.json<UpdateRes>()
//     expect(json.error).toBe(`Cannot parse json: ${INVALID_STRING_PLATFORM}`)
//   })

//   it('invalid device_id', async () => {
//     const invalidUUID = 'invalid-uuid'

//     const baseData = getBaseData(APPNAME)
//     baseData.device_id = invalidUUID
//     baseData.version_name = '1.1.0'

//     const response = await postUpdate(baseData)
//     expect(response.status).toBe(400)

//     const json = await response.json<UpdateRes>()
//     expect(json.error).toBe(`Cannot parse json: ${INVALID_STRING_DEVICE_ID}`)
//   })

//   it('invalid plugin_version', async () => {
//     const baseData = getBaseData(APPNAME)
//     baseData.plugin_version = 'invalid_version'

//     const response = await postUpdate(baseData)
//     expect(response.status).toBe(400)

//     const json = await response.json<UpdateRes>()
//     expect(json.error).toBe(`Cannot parse json: ${INVALID_STRING_PLUGIN_VERSION}`)
//   })

//   it('missing fields', async () => {
//     const baseData = {} as any

//     const response = await postUpdate(baseData)
//     expect(response.status).toBe(400)

//     const json = await response.json<UpdateRes>()
//     expect(json.error).toBe('Cannot parse json: App ID is required')
//   })

//   it('only platform field', async () => {
//     const baseData = { platform: 'android' } as any

//     const response = await postUpdate(baseData)
//     expect(response.status).toBe(400)

//     const json = await response.json<UpdateRes>()
//     expect(json.error).toBe('Cannot parse json: App ID is required')
//   })

//   it('device_id and app_id combination not found', async () => {
//     const baseData = getBaseData(APPNAME)
//     baseData.device_id = '00000000-0000-0000-1234-000000000000'
//     baseData.app_id = 'non.existent.app'

//     const response = await postUpdate(baseData)
//     expect(response.status).toBe(200)

//     const json = await response.json<UpdateRes>()
//     expect(json.error).toBe('app_not_found')
//   })
// })

// describe('update scenarios', () => {
//   it('disable auto update under native', async () => {
//     const baseData = getBaseData(APPNAME)
//     baseData.version_build = '2.0.0'
//     baseData.version_name = '2.0.0'

//     const response = await postUpdate(baseData)
//     expect(response.status).toBe(200)
//     const json = await response.json<UpdateRes>()
//     expect(json.error).toBe('disable_auto_update_under_native')
//   })

//   it('disable auto update to minor', async () => {
//     const versionId = await getSupabaseClient().from('app_versions').select('id').eq('name', '1.361.0').eq('app_id', APPNAME).single().throwOnError().then(({ data }) => data?.id)
//     await getSupabaseClient().from('channels').update({ disable_auto_update: 'minor', version: versionId }).eq('name', 'production').eq('app_id', APPNAME).throwOnError()

//     const baseData = getBaseData(APPNAME)
//     baseData.version_name = '1.1.0'

//     const response = await postUpdate(baseData)
//     expect(response.status).toBe(200)
//     const json = await response.json<UpdateRes>()
//     expect(json.error).toBe('disable_auto_update_to_minor')
//   })

//   it('disallow emulator', async () => {
//     await getSupabaseClient().from('channels').update({ allow_emulator: false, disable_auto_update: 'major' }).eq('name', 'production').eq('app_id', APPNAME)

//     const baseData = getBaseData(APPNAME)
//     baseData.version_name = '1.1.0'
//     baseData.is_emulator = true

//     const response = await postUpdate(baseData)
//     expect(response.status).toBe(200)
//     const json = await response.json<UpdateRes>()
//     expect(json.error).toBe('disable_emulator')
//   })

//   it('development build', async () => {
//     await getSupabaseClient().from('channels').update({ allow_dev: false }).eq('name', 'production').eq('app_id', APPNAME)

//     const baseData = getBaseData(APPNAME)
//     baseData.version_name = '1.1.0'
//     baseData.is_prod = false

//     const response = await postUpdate(baseData)
//     expect(response.status).toBe(200)
//     const json = await response.json<UpdateRes>()
//     expect(json.error).toBe('disable_dev_build')
//   })

//   it('channel overwrite', async () => {
//     const uuid = randomUUID().toLowerCase()

//     // get the channel id
//     const { data, error } = await getSupabaseClient().from('channels').select('id').eq('name', 'no_access').eq('app_id', APPNAME).single()
//     expect(error).toBeNull()
//     expect(data).toBeTruthy()
//     const channelId = data?.id

//     await getSupabaseClient().from('channel_devices').insert({
//       device_id: uuid,
//       channel_id: channelId,
//       app_id: APPNAME,
//       owner_org: '00000000-0000-0000-0000-000000000000',
//     })

//     await getSupabaseClient().from('channels').update({ disable_auto_update: 'none', allow_dev: true, allow_emulator: true, android: true }).eq('name', 'no_access').eq('app_id', APPNAME)

//     const baseData = getBaseData(APPNAME)
//     baseData.device_id = uuid
//     baseData.version_name = '0.0.0'

//     const response = await postUpdate(baseData)
//     expect(response.status).toBe(200)

//     const json = await response.json<UpdateRes>()
//     expect(() => updateNewScheme.parse(json)).not.toThrow()
//     expect(json.version).toBe('1.361.0')

//     // Clean up
//     await getSupabaseClient().from('channel_devices').delete().eq('device_id', uuid).eq('app_id', APPNAME)
//   })

//   it('version overwrite', async () => {
//     const uuid = randomUUID().toLowerCase()

//     // get the version id
//     const { data, error } = await getSupabaseClient().from('app_versions').select('id').eq('name', '1.359.0').eq('app_id', APPNAME).single()
//     expect(error).toBeNull()
//     expect(data).toBeTruthy()
//     const versionId = data?.id

//     await getSupabaseClient().from('devices_override').insert({
//       device_id: uuid,
//       version: versionId,
//       app_id: APPNAME,
//       owner_org: '00000000-0000-0000-0000-000000000000',
//     })

//     await getSupabaseClient().from('channels').update({ disable_auto_update: 'none', allow_dev: true, allow_emulator: true, android: true }).eq('name', 'no_access').eq('app_id', APPNAME)

//     const baseData = getBaseData(APPNAME)
//     baseData.device_id = uuid
//     baseData.version_name = '0.0.0'

//     const response = await postUpdate(baseData)
//     expect(response.status).toBe(200)

//     const json = await response.json<UpdateRes>()
//     expect(() => updateNewScheme.parse(json)).not.toThrow()
//     expect(json.version).toBe('1.359.0')

//     // Clean up
//     await getSupabaseClient().from('devices_override').delete().eq('device_id', uuid).eq('app_id', APPNAME)
//   })

//   it('disallowed public channel update', async () => {
//     await getSupabaseClient().from('channels').update({ public: false }).eq('name', 'production').eq('app_id', APPNAME)

//     const baseData = getBaseData(APPNAME)
//     baseData.version_name = '1.1.0'

//     const response = await postUpdate(baseData)
//     expect(response.status).toBe(200)
//     const json = await response.json<UpdateRes>()
//     expect(json.error).toBe('no_channel')
//   })
// })
