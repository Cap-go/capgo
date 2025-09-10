import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { BASE_URL, getSupabaseClient, headers, resetAndSeedAppData, resetAppData, resetAppDataStats } from './test-utils.ts'

const id = randomUUID()
const APPNAME = `com.app.ct.${id}`

const IOS_ONLY = 'iOS Only Channel Test'
const ANDROID_ONLY = 'Android Only Channel Test'
const BOTH_PLATFORMS = 'Both Platforms Channel Test'
const NEITHER_PLATFORM = 'Neither Platform Channel Test'

// This HTTP suite mirrors the SQL trigger tests in:
// supabase/tests/29_test_channel_triggers.sql
// It verifies equivalent behavior via the public API by using PUT /app to update
// default channels atomically (as SQL does with UPDATE on apps), and by using
// POST /channel to validate platform/public constraints.

async function createChannel(appId: string, name: string, ios: boolean, android: boolean) {
  const res = await fetch(`${BASE_URL}/channel`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      app_id: appId,
      channel: name,
      ios,
      android,
      public: false,
    }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`Failed to create channel ${name}: ${res.status} ${res.statusText} ${JSON.stringify(json)}`)
  }
}

// Helper to emulate the SQL `UPDATE public.apps SET default_channel_ios=..., default_channel_android=...`
// Accepts channel names (string) or null to clear, matching the HTTP API contract.
async function putAppDefaults(appId: string, {
  default_channel_ios,
  default_channel_android,
  default_channel_sync,
}: { default_channel_ios?: string | number | null, default_channel_android?: string | number | null, default_channel_sync?: boolean }) {
  return await fetch(`${BASE_URL}/app/${appId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      ...(default_channel_ios === undefined ? {} : { default_channel_ios }),
      ...(default_channel_android === undefined ? {} : { default_channel_android }),
      ...(default_channel_sync === undefined ? {} : { default_channel_sync }),
    }),
  })
}

async function updateChannelPlatforms(appId: string, name: string, ios?: boolean, android?: boolean) {
  return await fetch(`${BASE_URL}/channel`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      app_id: appId,
      channel: name,
      ...(ios == null ? {} : { ios }),
      ...(android == null ? {} : { android }),
    }),
  })
}

beforeAll(async () => {
  await resetAndSeedAppData(APPNAME)
  // Prepare channels used by tests
  await createChannel(APPNAME, IOS_ONLY, true, false)
  await createChannel(APPNAME, ANDROID_ONLY, false, true)
  await createChannel(APPNAME, BOTH_PLATFORMS, true, true)
  await createChannel(APPNAME, NEITHER_PLATFORM, false, false)
})

afterAll(async () => {
  await resetAppData(APPNAME)
  await resetAppDataStats(APPNAME)
})

describe('[PUBLIC] channel triggers parity', () => {
  // Test 1: update_channel_public_from_app - Should ALLOW different platform-specific channels
  // STATE: iOS Only Channel Test (ios=true, android=false, public=false), Android Only Channel Test (ios=false, android=true, public=false)
  // APPS: default_channel_ios=NULL, default_channel_android=NULL
  it('allows assigning platform-specific default channels via app PUT', async () => {
    const res = await putAppDefaults(APPNAME, {
      default_channel_ios: IOS_ONLY,
      default_channel_android: ANDROID_ONLY,
      default_channel_sync: false,
    })
    const body = await res.text()
    console.log('PUT /app defaults (platform-specific)', res.status, body)
    expect(res.status).toBe(200)

    // Verify they are now the defaults and public
    const { data: app, error } = await getSupabaseClient()
      .from('apps')
      .select('default_channel_ios, default_channel_android')
      .eq('app_id', APPNAME)
      .single()
    expect(error).toBeNull()
    expect(app?.default_channel_ios).toBeTruthy()
    expect(app?.default_channel_android).toBeTruthy()

    const params1 = new URLSearchParams({ app_id: APPNAME, channel: IOS_ONLY })
    const g1 = await fetch(`${BASE_URL}/channel?${params1}`, { headers })
    const iosChannelData = await g1.json().catch(() => ({} as any)) as { public: boolean } | undefined
    expect(g1.status).toBe(200)
    expect(iosChannelData).toBeDefined()
    expect(typeof iosChannelData!.public).toBe('boolean')
    expect(iosChannelData!.public).toBe(true)

    const params2 = new URLSearchParams({ app_id: APPNAME, channel: ANDROID_ONLY })
    const g2 = await fetch(`${BASE_URL}/channel?${params2}`, { headers })
    const androidChannelData = await g2.json().catch(() => ({} as any)) as { public: boolean } | undefined
    expect(g2.status).toBe(200)
    expect(androidChannelData).toBeDefined()
    expect(typeof androidChannelData!.public).toBe('boolean')
    expect(androidChannelData!.public).toBe(true)
  })

  // Test 2: update_channel_public_from_app - Should REJECT iOS default supporting both platforms with different Android default
  // STATE: Both Platforms Channel Test (ios=true, android=true, public=false), Android Only Channel Test (ios=false, android=true, public=true)
  // APPS: default_channel_ios=iOS Only Channel Test, default_channel_android=Android Only Channel Test
  it('rejects iOS default supporting both platforms with different Android default', async () => {
    const res = await putAppDefaults(APPNAME, {
      default_channel_ios: BOTH_PLATFORMS,
      default_channel_android: ANDROID_ONLY,
      default_channel_sync: false,
    })
    const body = await res.text()
    console.log('PUT /app mismatch iOS supports android', res.status, body)
    expect(res.status).toBe(400)
    expect(body).toContain('supports both platforms')
  })

  // Test 3: update_channel_public_from_app - Should REJECT Android default supporting both platforms with different iOS default
  // STATE: iOS Only Channel Test (ios=true, android=false, public=false), Both Platforms Channel Test (ios=true, android=true, public=false)
  // APPS: default_channel_ios=iOS Only Channel Test, default_channel_android=Android Only Channel Test
  it('rejects Android default supporting both platforms with different iOS default', async () => {
    const res = await putAppDefaults(APPNAME, {
      default_channel_ios: IOS_ONLY,
      default_channel_android: BOTH_PLATFORMS,
      default_channel_sync: false,
    })
    const body = await res.text()
    console.log('PUT /app mismatch Android supports ios', res.status, body)
    expect(res.status).toBe(400)
    expect(body).toContain('supports both platforms')
  })

  // Test 10: guard_channel_public - Should ALLOW platform changes for non-default channels
  // First remove default assignments (clear defaults), then change platform flags via /channel
  it('allows platform changes for non-default channels after clearing defaults', async () => {
    // Clear defaults via app PUT
    const clear = await putAppDefaults(APPNAME, {
      default_channel_ios: null,
      default_channel_android: null,
      default_channel_sync: false,
    })
    const body = await clear.text()
    console.log('PUT /app clear defaults', clear.status, body)
    expect(clear.status).toBe(200)

    // Now disabling platforms on those channels should succeed
    const r1 = await updateChannelPlatforms(APPNAME, IOS_ONLY, false, false)
    const r2 = await updateChannelPlatforms(APPNAME, ANDROID_ONLY, false, false)

    const iosUpdateData = await r1.json().catch(() => ({} as any)) as { status: string } | undefined
    const androidUpdateData = await r2.json().catch(() => ({} as any)) as { status: string } | undefined
    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)
    expect(iosUpdateData).toBeDefined()
    expect(androidUpdateData).toBeDefined()
    expect(typeof iosUpdateData!.status).toBe('string')
    expect(typeof androidUpdateData!.status).toBe('string')
    expect(androidUpdateData!.status).toBe('ok')
    expect(iosUpdateData!.status).toBe('ok')
  })

  // Test X: channel post guard - REJECT making channel public when neither iOS nor Android is enabled
  it('rejects making a channel public when neither iOS nor Android is enabled', async () => {
    const updateRes = await updateChannelPlatforms(APPNAME, NEITHER_PLATFORM, false, false)
    expect(updateRes.status).toBe(200)

    // explicitly try to set public=true on a neither-platform channel
    const makePublicRes = await fetch(`${BASE_URL}/channel`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ app_id: APPNAME, channel: NEITHER_PLATFORM, public: true, ios: false, android: false }),
    })
    const makePublicBody = await makePublicRes.json().catch(() => ({}))
    expect(makePublicRes.status).toBe(400)
    expect(JSON.stringify(makePublicBody)).toContain('Cannot mark channel as public')

    // Verify it remains non-public
    const params = new URLSearchParams({ app_id: APPNAME, channel: NEITHER_PLATFORM })
    const verifyRes = await fetch(`${BASE_URL}/channel?${params}`, { headers })
    const neitherChannelData = await verifyRes.json().catch(() => ({} as any)) as { public: boolean } | undefined
    expect(verifyRes.status).toBe(200)
    expect(neitherChannelData).toBeDefined()
    expect(typeof neitherChannelData!.public).toBe('boolean')
    expect(neitherChannelData!.public).toBe(false)
  })

  // Test Y: Only iOS default marks iOS-only channel public and keeps platform flags unchanged
  it('marks iOS-only channel public when set as iOS default and does not change platform flags', async () => {
    // Ensure clean state: clear defaults and restore platform flags for IOS_ONLY
    const clearDefaults = await putAppDefaults(APPNAME, {
      default_channel_ios: null,
      default_channel_android: null,
      default_channel_sync: false,
    })
    expect(clearDefaults.status).toBe(200)

    const restoreIosOnly = await updateChannelPlatforms(APPNAME, IOS_ONLY, true, false)
    expect(restoreIosOnly.status).toBe(200)

    const res = await putAppDefaults(APPNAME, {
      default_channel_ios: IOS_ONLY,
      default_channel_android: null,
      default_channel_sync: false,
    })
    const body = await res.text()
    console.log('PUT /app ios-only default', res.status, body)
    expect(res.status).toBe(200)

    const { data: iosChannel, error } = await getSupabaseClient()
      .from('channels')
      .select('public, ios, android')
      .eq('app_id', APPNAME)
      .eq('name', IOS_ONLY)
      .single()
    expect(error).toBeNull()
    expect(iosChannel?.public).toBe(true)
    expect(iosChannel?.ios).toBe(true)
    expect(iosChannel?.android).toBe(false)
  })

  // Test Z: Only Android default marks Android-only channel public and keeps platform flags unchanged
  it('marks Android-only channel public when set as Android default and does not change platform flags', async () => {
    // Ensure clean state: clear defaults and restore platform flags for ANDROID_ONLY
    const clearDefaults = await putAppDefaults(APPNAME, {
      default_channel_ios: null,
      default_channel_android: null,
      default_channel_sync: false,
    })
    expect(clearDefaults.status).toBe(200)

    const restoreAndroidOnly = await updateChannelPlatforms(APPNAME, ANDROID_ONLY, false, true)
    expect(restoreAndroidOnly.status).toBe(200)

    const res = await putAppDefaults(APPNAME, {
      default_channel_ios: null,
      default_channel_android: ANDROID_ONLY,
      default_channel_sync: false,
    })
    const body = await res.text()
    console.log('PUT /app android-only default', res.status, body)
    expect(res.status).toBe(200)

    const { data: androidChannel, error } = await getSupabaseClient()
      .from('channels')
      .select('public, ios, android')
      .eq('app_id', APPNAME)
      .eq('name', ANDROID_ONLY)
      .single()
    expect(error).toBeNull()
    expect(androidChannel?.public).toBe(true)
    expect(androidChannel?.android).toBe(true)
    expect(androidChannel?.ios).toBe(false)
  })

  // Test ZZ: Prevent disabling platform support on default platform-only channels
  it('rejects disabling platform support on default platform-only channels', async () => {
    // Set iOS-only as default iOS; attempt to set ios=false
    const setIosDefault = await putAppDefaults(APPNAME, {
      default_channel_ios: IOS_ONLY,
      default_channel_android: null,
      default_channel_sync: false,
    })
    expect(setIosDefault.status).toBe(200)

    const disableIos = await updateChannelPlatforms(APPNAME, IOS_ONLY, false, undefined)
    const disableIosBody = await disableIos.json().catch(() => ({}))
    expect(disableIos.status).toBe(500)
    expect(JSON.stringify(disableIosBody)).toContain('Cannot remove iOS platform support')

    // Set Android-only as default Android; attempt to set android=false
    const setAndroidDefault = await putAppDefaults(APPNAME, {
      default_channel_ios: null,
      default_channel_android: ANDROID_ONLY,
      default_channel_sync: false,
    })
    expect(setAndroidDefault.status).toBe(200)

    const disableAndroid = await updateChannelPlatforms(APPNAME, ANDROID_ONLY, undefined, false)
    const disableAndroidBody = await disableAndroid.json().catch(() => ({}))
    expect(disableAndroid.status).toBe(500)
    expect(JSON.stringify(disableAndroidBody)).toContain('Cannot remove Android platform support')
  })

  // Test AAA: Prevent assigning iOS default to a channel that does not support iOS
  it('rejects assigning iOS default to android-only channel', async () => {
    // Ensure Android-only channel has correct flags
    const restoreAndroidOnly = await updateChannelPlatforms(APPNAME, ANDROID_ONLY, false, true)
    expect(restoreAndroidOnly.status).toBe(200)

    const res = await putAppDefaults(APPNAME, {
      default_channel_ios: ANDROID_ONLY,
      default_channel_android: null,
      default_channel_sync: false,
    })
    const body = await res.text()
    console.log('PUT /app invalid ios default (android-only)', res.status, body)
    expect(res.status).toBe(400)
    expect(body).toContain('does not support iOS')
  })

  // Test AAB: Prevent assigning Android default to a channel that does not support Android
  it('rejects assigning Android default to ios-only channel', async () => {
    // Ensure iOS-only channel has correct flags
    const restoreIosOnly = await updateChannelPlatforms(APPNAME, IOS_ONLY, true, false)
    expect(restoreIosOnly.status).toBe(200)

    const res = await putAppDefaults(APPNAME, {
      default_channel_ios: null,
      default_channel_android: IOS_ONLY,
      default_channel_sync: false,
    })
    const body = await res.text()
    console.log('PUT /app invalid android default (ios-only)', res.status, body)
    expect(res.status).toBe(400)
    expect(body).toContain('does not support Android')
  })
})
