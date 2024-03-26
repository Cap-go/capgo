import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { ANON_KEY, SUPABASE_URL, useSupabaseAdmin } from './utils'
import type { Database } from '~/types/supabase.types'

test.describe.configure({ mode: 'serial' })

async function createDefaultJWTSupabase() {
  const supabase = createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })

  await supabase.auth.signInWithPassword({
    email: 'test@capgo.app',
    password: 'testtest',
  })

  return supabase
}

function apiKeyTypeToKey(keyType: string) {
  let apiKey = ''

  switch (keyType) {
    case 'read':
      apiKey = '67eeaff4-ae4c-49a6-8eb1-0875f5369de0'
      break
    case 'upload':
      apiKey = 'c591b04e-cf29-4945-b9a0-776d0672061a'
      break
    case 'write':
      apiKey = '985640ce-4031-4cfd-8095-d1d1066b6b3b'
      break
    case 'all':
      apiKey = 'ae6e7458-c46d-4c00-aa3b-153b0b8520ea'
      break
    default:
      throw new Error(`Api key type ${keyType} is not known`)
  }

  return apiKey
}

async function createDefaultApikeySupabase(keyType: string) {
  const supabase = createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        capgkey: apiKeyTypeToKey(keyType),
      },
    },
  })

  return supabase
}

test.beforeEach(async () => {
  // Reseed the db
  const supabaseAdmin = await useSupabaseAdmin()
  const { error } = await supabaseAdmin.rpc('reset_and_seed_data')
  expect(error).toBeFalsy()
})

test('Sanity check on apikey types', async () => {
  const supabase = await useSupabaseAdmin()

  for (const type of ['read', 'upload', 'write', 'all']) {
    const apikey = apiKeyTypeToKey(type)

    const { data, error } = await supabase.from('apikeys')
      .select('*')
      .eq('key', apikey)
      .single()

    expect(error).toBeFalsy()
    expect(data?.mode).toBeTruthy()
    expect(data?.mode).toBe(type)
  }
})

test.describe('Test "apps" RLS policies', () => {
  test('Test read with perm "super_admin" (JWT)', async () => {
    const supabase = await createDefaultJWTSupabase()

    const { count, error } = await supabase.from('apps').select('*', { count: 'exact' })

    expect(error).toBeFalsy()
    expect(count).toBeTruthy()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('Test read with perm "read" (JWT)', async () => {
    // Setup
    const supabaseAdmin = await useSupabaseAdmin()

    const { error: error1 } = await supabaseAdmin.from('org_users')
      .update({ user_right: 'read' })
      .eq('user_id', '6aa76066-55ef-4238-ade6-0b32334a4097')

    expect(error1).toBeFalsy()
    // Setup done

    const supabase = await createDefaultJWTSupabase()
    const { count, error } = await supabase.from('apps').select('*', { count: 'exact' })

    expect(error).toBeFalsy()
    expect(count).toBeTruthy()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('Test read with perm "super_admin" (all types apikey)', async () => {
    for (const type of ['read', 'upload', 'write', 'all']) {
      const supabase = await createDefaultApikeySupabase(type)

      const { count, error } = await supabase.from('apps').select('*', { count: 'exact' })

      expect(error).toBeFalsy()
      expect(count).toBeTruthy()
      expect(count).toBeGreaterThanOrEqual(1)
    }
  })

  test('Test read with perm "read" (all types apikey)', async () => {
    // Setup
    const supabaseAdmin = await useSupabaseAdmin()

    const { error: error1 } = await supabaseAdmin.from('org_users')
      .update({ user_right: 'read' })
      .eq('user_id', '6aa76066-55ef-4238-ade6-0b32334a4097')

    expect(error1).toBeFalsy()
    // Setup done

    for (const type of ['read', 'upload', 'write', 'all']) {
      const supabase = await createDefaultApikeySupabase(type as any)
      const { count, error } = await supabase.from('apps').select('*', { count: 'exact' })

      expect(error).toBeFalsy()
      expect(count).toBeTruthy()
      expect(count).toBeGreaterThanOrEqual(1)
    }
  })

  test('Test delete app with perm "supa_admin" (JWT)', async () => {
    const supabase = await createDefaultJWTSupabase()
    const supabaseAdmin = await useSupabaseAdmin()

    const { error } = await supabase.from('apps').delete().eq('app_id', 'com.demo.app')
    expect(error).toBeFalsy()

    const { count, error: error2 } = await supabaseAdmin
      .from('apps')
      .select('*', { count: 'exact' })
      .eq('app_id', 'com.demo.app')

    expect(error2).toBeFalsy()
    expect(count).toBe(0)
  })

  test('Test delete app with perm "supa_admin" (all types apikey)', async () => {
    const supabaseAdmin = await useSupabaseAdmin()

    for (const type of ['read', 'upload', 'write', 'all']) {
      const supabase = await createDefaultApikeySupabase(type as any)
      const { error } = await supabase.from('apps')
        .delete()
        .eq('app_id', 'com.demo.app')
      expect(error).toBeFalsy()

      const { count, error: error2 } = await supabaseAdmin
        .from('apps')
        .select('*', { count: 'exact' })
        .eq('app_id', 'com.demo.app')

      expect(error2).toBeFalsy()
      expect(count).toBe(1)
    }
  })

  test('Test update app with perm "supa_admin" (JWT)', async () => {
    const supabase = await createDefaultJWTSupabase()

    const { error, data } = await supabase
      .from('apps')
      .update({ retention: 924 })
      .eq('app_id', 'com.demo.app')
      .select()
      .single()

    expect(error).toBeFalsy()
    expect(data).toBeTruthy()
    expect(data?.retention).toBe(924)
  })

  test('Test update app with perm < "admin" (JWT)', async () => {
    const supabase = await createDefaultJWTSupabase()
    const supabaseAdmin = await useSupabaseAdmin()

    for (const type of ['read', 'upload', 'write']) {
      const { error: error1 } = await supabaseAdmin.from('org_users')
        .update({ user_right: type as any })
        .eq('user_id', '6aa76066-55ef-4238-ade6-0b32334a4097')

      expect(error1).toBeFalsy()

      const { error, data } = await supabase
        .from('apps')
        .update({ retention: 924 })
        .eq('app_id', 'com.demo.app')
        .select()
        .single()

      expect(error).toBeTruthy()
      expect(data).toBeFalsy()

      const { data: app, error: error2 } = await supabaseAdmin.from('apps')
        .select()
        .eq('app_id', 'com.demo.app')
        .single()

      expect(error2).toBeFalsy()
      expect(app).toBeTruthy()
      expect(app?.retention).not.toBe(924)
    }
  })
})
