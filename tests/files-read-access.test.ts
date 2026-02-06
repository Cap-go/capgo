import { randomUUID } from 'node:crypto'
import { env } from 'node:process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CLOUDFLARE_FILES_URL, createAppVersions, getSupabaseClient, ORG_ID, USER_ID } from './test-utils.ts'

const USE_CLOUDFLARE = env.USE_CLOUDFLARE_WORKERS === 'true'
const FILES_BASE_URL = USE_CLOUDFLARE
  ? `${CLOUDFLARE_FILES_URL}/files`
  : `${env.SUPABASE_URL}/functions/v1/files`

const id = randomUUID()
const APPNAME = `com.files.read.${id}`

function makeDeviceId(suffix: string) {
  return `device-${id}-${suffix}`
}

function bundlePath(versionName: string) {
  return `orgs/${ORG_ID}/apps/${APPNAME}/${versionName}.zip`
}

function manifestPath(versionName: string, fileName: string) {
  return `orgs/${ORG_ID}/apps/${APPNAME}/${versionName}/${fileName}`
}

async function fetchAttachment(path: string, params: Record<string, string>) {
  // Keep slashes unencoded so the Hono route param `:id{.+}` captures the full path.
  const url = new URL(`${FILES_BASE_URL}/read/attachments/${path}`)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  return fetch(url, { method: 'GET', redirect: 'manual' })
}

beforeAll(async () => {
  const supabase = getSupabaseClient()
  await supabase
    .from('apps')
    .insert({
      app_id: APPNAME,
      owner_org: ORG_ID,
      icon_url: 'https://example.com/icon.png',
    })
})

afterAll(async () => {
  const supabase = getSupabaseClient()
  await supabase.from('channel_devices').delete().eq('app_id', APPNAME)
  await supabase.from('channels').delete().eq('app_id', APPNAME)
  // manifest has no app_id column; delete via app_version join not possible here, so delete by s3_path prefix.
  await supabase.from('manifest').delete().like('s3_path', `orgs/${ORG_ID}/apps/${APPNAME}/%`)
  await supabase.from('app_versions').delete().eq('app_id', APPNAME)
  await supabase.from('apps').delete().eq('app_id', APPNAME)
})

describe('files/read/attachments authorization', () => {
  it('denies bundle zip download when version is not linked to any channel', async () => {
    const supabase = getSupabaseClient()
    const deviceId = makeDeviceId('unlinked-bundle')

    const version = await createAppVersions('1.0.0-unlinked', APPNAME)
    const path = bundlePath(version.name)
    const checksum = `chk-${randomUUID()}`

    await supabase
      .from('app_versions')
      .update({ r2_path: path, checksum })
      .eq('id', version.id)
      .eq('app_id', APPNAME)

    // Some setups may create default channels automatically; ensure this version isn't linked to any channel.
    await supabase
      .from('channels')
      .delete()
      .eq('app_id', APPNAME)
      .eq('version', version.id)

    const res = await fetchAttachment(path, { device_id: deviceId, key: checksum })
    expect(res.status).toBe(404)
  })

  it('denies manifest file download when version is not linked to any channel', async () => {
    const supabase = getSupabaseClient()
    const deviceId = makeDeviceId('unlinked-manifest')

    const version = await createAppVersions('1.0.0-unlinked-manifest', APPNAME)
    const path = manifestPath(version.name, 'main.js')

    await supabase
      .from('manifest')
      .insert({
        app_version_id: version.id,
        file_name: 'main.js',
        file_hash: `hash-${randomUUID()}`,
        s3_path: path,
      })

    // Some setups may create default channels automatically; ensure this version isn't linked to any channel.
    await supabase
      .from('channels')
      .delete()
      .eq('app_id', APPNAME)
      .eq('version', version.id)

    const res = await fetchAttachment(path, { device_id: deviceId, key: String(version.id) })
    expect(res.status).toBe(404)
  })

  it('denies bundle zip download when device is linked to a different channel than the bundle', async () => {
    const supabase = getSupabaseClient()
    const deviceId = makeDeviceId('different-channel')

    const versionA = await createAppVersions('1.0.0-device-channel', APPNAME)
    const versionB = await createAppVersions('1.0.0-bundle-channel', APPNAME)

    const path = bundlePath(versionB.name)
    const checksum = `chk-${randomUUID()}`

    await supabase
      .from('app_versions')
      .update({ r2_path: path, checksum })
      .eq('id', versionB.id)
      .eq('app_id', APPNAME)

    const { data: channelA, error: channelAError } = await supabase
      .from('channels')
      .insert({
        app_id: APPNAME,
        name: `device-channel-${id}`,
        public: false,
        allow_device_self_set: false,
        disable_auto_update_under_native: true,
        disable_auto_update: 'major',
        ios: true,
        android: true,
        electron: true,
        allow_emulator: true,
        allow_device: true,
        allow_dev: true,
        allow_prod: true,
        version: versionA.id,
        owner_org: ORG_ID,
        created_by: USER_ID,
      })
      .select('id')
      .single()

    expect(channelAError).toBeNull()
    expect(channelA?.id).toBeTypeOf('number')

    const { error: channelBError } = await supabase
      .from('channels')
      .insert({
        app_id: APPNAME,
        name: `bundle-channel-${id}`,
        public: false,
        allow_device_self_set: false,
        disable_auto_update_under_native: true,
        disable_auto_update: 'major',
        ios: true,
        android: true,
        electron: true,
        allow_emulator: true,
        allow_device: true,
        allow_dev: true,
        allow_prod: true,
        version: versionB.id,
        owner_org: ORG_ID,
        created_by: USER_ID,
      })

    expect(channelBError).toBeNull()

    await supabase
      .from('channel_devices')
      .upsert({
        device_id: deviceId,
        app_id: APPNAME,
        channel_id: channelA!.id,
        owner_org: ORG_ID,
      }, {
        onConflict: 'device_id,app_id',
      })

    const res = await fetchAttachment(path, { device_id: deviceId, key: checksum })
    expect(res.status).toBe(404)
  })
})

describe.skipIf(USE_CLOUDFLARE)('files/read/attachments authorization (supabase runtime)', () => {
  it('allows bundle zip download when version is linked to a public channel', async () => {
    const supabase = getSupabaseClient()
    const deviceId = makeDeviceId('public-channel')

    const version = await createAppVersions('1.0.0-public', APPNAME)
    const path = bundlePath(version.name)
    const checksum = `chk-${randomUUID()}`

    await supabase
      .from('app_versions')
      .update({ r2_path: path, checksum })
      .eq('id', version.id)
      .eq('app_id', APPNAME)

    await supabase
      .from('channels')
      .insert({
        app_id: APPNAME,
        name: `public-${id}`,
        public: true,
        allow_device_self_set: false,
        disable_auto_update_under_native: true,
        disable_auto_update: 'major',
        ios: true,
        android: true,
        electron: true,
        allow_emulator: true,
        allow_device: true,
        allow_dev: true,
        allow_prod: true,
        version: version.id,
        owner_org: ORG_ID,
        created_by: USER_ID,
      })

    const res = await fetchAttachment(path, { device_id: deviceId, key: checksum })
    // In Supabase Edge Functions runtime, the handler redirects to the public storage URL.
    expect(res.status).toBe(302)
  })

  it('requires explicit channel_devices link for private channel with allow_device_self_set=false', async () => {
    const supabase = getSupabaseClient()
    const deviceId = makeDeviceId('private-channel')

    const version = await createAppVersions('1.0.0-private', APPNAME)
    const path = bundlePath(version.name)
    const checksum = `chk-${randomUUID()}`

    await supabase
      .from('app_versions')
      .update({ r2_path: path, checksum })
      .eq('id', version.id)
      .eq('app_id', APPNAME)

    const { data: channel, error: channelError } = await supabase
      .from('channels')
      .insert({
        app_id: APPNAME,
        name: `private-${id}`,
        public: false,
        allow_device_self_set: false,
        disable_auto_update_under_native: true,
        disable_auto_update: 'major',
        ios: true,
        android: true,
        electron: true,
        allow_emulator: true,
        allow_device: true,
        allow_dev: true,
        allow_prod: true,
        version: version.id,
        owner_org: ORG_ID,
        created_by: USER_ID,
      })
      .select('id')
      .single()

    expect(channelError).toBeNull()
    expect(channel?.id).toBeTypeOf('number')

    // Not linked: should be denied
    const resDenied = await fetchAttachment(path, { device_id: deviceId, key: checksum })
    expect(resDenied.status).toBe(404)

    // Link device to channel: should be allowed
    await supabase
      .from('channel_devices')
      .upsert({
        device_id: deviceId,
        app_id: APPNAME,
        channel_id: channel!.id,
        owner_org: ORG_ID,
      }, {
        onConflict: 'device_id,app_id',
      })

    const resAllowed = await fetchAttachment(path, { device_id: deviceId, key: checksum })
    expect(resAllowed.status).toBe(302)
  })
})
