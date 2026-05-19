import type { Context } from 'hono'
import type { AuthInfo, MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { lockOnboardingApp, unlockOnboardingApp } from '../../utils/demo.ts'
import { simpleError } from '../../utils/hono.ts'
import { cloudlog } from '../../utils/logging.ts'
import { closeClient, getPgClient, logPgError } from '../../utils/pg.ts'
import { hasOrgRight, supabaseAdmin } from '../../utils/supabase.ts'

/** Request body for creating a demo app */
export interface CreateDemoApp {
  owner_org: string
  app_id?: string
}

/** Demo version configuration */
interface DemoVersion {
  name: string
  daysAgo: number
  comment?: string
  link?: string
}

const SYSTEM_DEMO_VERSION_NAMES = new Set(['unknown', 'builtin'])

function isSystemDemoVersionName(versionName: string): boolean {
  return SYSTEM_DEMO_VERSION_NAMES.has(versionName)
}

/** Native package structure for demo apps */
interface DemoNativePackage {
  name: string
  version: string
}

/** Manifest entry for demo apps */
interface DemoManifestEntry {
  file_name: string
  s3_path: string
  file_hash: string
  file_size: number
}

/**
 * Generate demo native packages (Capacitor plugins)
 * @param versionName - Version name to base the package versions on
 * @returns Array of native packages
 */
function getDemoNativePackages(versionName: string): DemoNativePackage[] {
  // Base packages that evolve with app versions
  const basePackages: DemoNativePackage[] = [
    { name: '@capacitor/core', version: '6.0.0' },
    { name: '@capacitor/app', version: '6.0.0' },
    { name: '@capacitor/haptics', version: '6.0.0' },
    { name: '@capacitor/keyboard', version: '6.0.0' },
    { name: '@capacitor/status-bar', version: '6.0.0' },
    { name: '@capgo/capacitor-updater', version: '6.0.0' },
  ]

  // Add more plugins in later versions
  if (versionName >= '1.1.0') {
    basePackages.push({ name: '@capacitor/push-notifications', version: '6.0.0' })
    basePackages.push({ name: '@capacitor/local-notifications', version: '6.0.0' })
  }

  if (versionName >= '1.2.0') {
    basePackages.push({ name: '@capacitor/camera', version: '6.0.0' })
    basePackages.push({ name: '@capacitor/filesystem', version: '6.0.0' })
  }

  return basePackages
}

/**
 * SHA256 hashes and sizes for demo files.
 * These demonstrate the differential update feature:
 * - STABLE files: Same hash across all versions (vendor.js, polyfills.js, static assets)
 *   These don't need to be re-downloaded when updating
 * - CHANGING files: Different hash per version (main.js, index.html, styles.css)
 *   These are the files that get downloaded during an update
 *
 * Format: Real SHA256 hashes (64 hex characters)
 */
const DEMO_FILE_HASHES = {
  // Files that NEVER change between versions (third-party libs, static assets)
  // When comparing versions, these show as "unchanged" - no download needed
  stable: {
    'vendor.js': { hash: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456', size: 847293 }, // ~827KB - large vendor bundle
    'polyfills.js': { hash: 'b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef1234567a', size: 124567 }, // ~122KB
    'assets/logo.png': { hash: 'c3d4e5f6789012345678901234567890abcdef1234567890abcdef1234567ab1', size: 45234 }, // ~44KB
    'assets/icon.svg': { hash: 'd4e5f6789012345678901234567890abcdef1234567890abcdef1234567ab12c', size: 2847 }, // ~2.8KB
  },

  // Files that CHANGE with each version (app code, styles)
  // When comparing versions, these show as "modified" - need download
  changing: {
    'index.html': {
      size: 4523, // ~4.4KB
      versions: {
        '1.0.0': 'e5f6789012345678901234567890abcdef1234567890abcdef1234567ab12cd1',
        '1.0.1': 'e5f6789012345678901234567890abcdef1234567890abcdef1234567ab12cd2',
        '1.1.0': 'e5f6789012345678901234567890abcdef1234567890abcdef1234567ab12cd3',
        '1.1.1': 'e5f6789012345678901234567890abcdef1234567890abcdef1234567ab12cd4',
        '1.2.0': 'e5f6789012345678901234567890abcdef1234567890abcdef1234567ab12cd5',
      },
    },
    'main.js': {
      size: 523847, // ~512KB - main application bundle
      versions: {
        '1.0.0': 'f6789012345678901234567890abcdef1234567890abcdef1234567ab12cd1e1',
        '1.0.1': 'f6789012345678901234567890abcdef1234567890abcdef1234567ab12cd1e2',
        '1.1.0': 'f6789012345678901234567890abcdef1234567890abcdef1234567ab12cd1e3',
        '1.1.1': 'f6789012345678901234567890abcdef1234567890abcdef1234567ab12cd1e4',
        '1.2.0': 'f6789012345678901234567890abcdef1234567890abcdef1234567ab12cd1e5',
      },
    },
    'styles.css': {
      size: 87234, // ~85KB
      versions: {
        '1.0.0': '789012345678901234567890abcdef1234567890abcdef1234567ab12cd1e2f1',
        '1.0.1': '789012345678901234567890abcdef1234567890abcdef1234567ab12cd1e2f1', // Same as 1.0.0 (hotfix didn't change styles)
        '1.1.0': '789012345678901234567890abcdef1234567890abcdef1234567ab12cd1e2f2', // Changed in 1.1.0
        '1.1.1': '789012345678901234567890abcdef1234567890abcdef1234567ab12cd1e2f2', // Same as 1.1.0
        '1.2.0': '789012345678901234567890abcdef1234567890abcdef1234567ab12cd1e2f3', // Changed in 1.2.0
      },
    },
  },

  // Files added in specific versions (new features)
  added: {
    'assets/dark-theme.css': {
      minVersion: '1.1.0',
      hash: '89012345678901234567890abcdef1234567890abcdef1234567ab12cd1e2f3a',
      size: 23456, // ~23KB
    },
    'assets/dashboard.js': {
      minVersion: '1.2.0',
      hash: '9012345678901234567890abcdef1234567890abcdef1234567ab12cd1e2f3ab',
      size: 156234, // ~153KB
    },
    'assets/charts.js': {
      minVersion: '1.2.0',
      hash: '012345678901234567890abcdef1234567890abcdef1234567ab12cd1e2f3abc',
      size: 98765, // ~96KB
    },
  },
} as const

/**
 * Generate demo manifest entries (files in the bundle)
 * Demonstrates differential updates:
 * - Stable files have same hash across versions (no re-download needed)
 * - Changing files have different hashes (will be downloaded on update)
 * - New files are only present in versions >= their minVersion
 *
 * @param versionName - Version name
 * @param appId - App ID for generating s3 paths
 * @returns Array of manifest entries with SHA256 hashes
 */
function getDemoManifest(versionName: string, appId: string): DemoManifestEntry[] {
  const entries: DemoManifestEntry[] = []

  // Add stable files (same hash for all versions - no update needed)
  for (const [fileName, fileInfo] of Object.entries(DEMO_FILE_HASHES.stable)) {
    entries.push({
      file_name: fileName,
      s3_path: `demo/${appId}/${versionName}/${fileName}`,
      file_hash: fileInfo.hash,
      file_size: fileInfo.size,
    })
  }

  // Add changing files (different hash per version - will be updated)
  for (const [fileName, fileConfig] of Object.entries(DEMO_FILE_HASHES.changing)) {
    const hash = fileConfig.versions[versionName as keyof typeof fileConfig.versions]
    if (hash) {
      entries.push({
        file_name: fileName,
        s3_path: `demo/${appId}/${versionName}/${fileName}`,
        file_hash: hash,
        file_size: fileConfig.size,
      })
    }
  }

  // Add files that were introduced in specific versions
  for (const [fileName, config] of Object.entries(DEMO_FILE_HASHES.added)) {
    if (versionName >= config.minVersion) {
      entries.push({
        file_name: fileName,
        s3_path: `demo/${appId}/${versionName}/${fileName}`,
        file_hash: config.hash,
        file_size: config.size,
      })
    }
  }

  return entries
}

/** Demo channel configuration */
interface DemoChannel {
  name: string
  public: boolean
  allowDeviceSelfSet?: boolean
}

/**
 * Generate past dates for demo data
 * @param daysAgo - Number of days in the past
 * @returns ISO date string
 */
function daysAgoDate(daysAgo: number): string {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  return date.toISOString()
}

/**
 * Generate a random device ID
 * @returns UUID-like device ID
 */
function generateDeviceId(): string {
  return crypto.randomUUID()
}

async function resetOnboardingDemoData(c: Context<MiddlewareKeyVariables>, appUuid: string): Promise<void> {
  const pgClient = getPgClient(c)
  try {
    await pgClient.query('SELECT public.reset_onboarding_demo_app_data($1::uuid)', [appUuid])
  }
  catch (error) {
    logPgError(c, 'resetOnboardingDemoData', error)
    throw simpleError('cannot_prepare_demo_app', 'Cannot prepare app for demo data', { error: (error as Error)?.message })
  }
  finally {
    await closeClient(c, pgClient)
  }
}

async function trackOnboardingDemoRows(
  c: Context<MiddlewareKeyVariables>,
  appId: string,
  ownerOrg: string,
  relationName: string,
  rowKeys: string[],
  seedId: string,
): Promise<void> {
  if (rowKeys.length === 0)
    return

  const pgClient = getPgClient(c)
  try {
    await pgClient.query(
      'SELECT public.track_onboarding_demo_data($1::text, $2::uuid, $3::text, $4::text[], $5::uuid)',
      [appId, ownerOrg, relationName, rowKeys, seedId],
    )
  }
  catch (error) {
    logPgError(c, 'trackOnboardingDemoRows', error)
    throw simpleError('cannot_track_demo_data', 'Cannot track demo data for safe resets', { error: (error as Error)?.message })
  }
  finally {
    await closeClient(c, pgClient)
  }
}

async function getExistingPendingApp(
  c: Context<MiddlewareKeyVariables>,
  supabase: ReturnType<typeof supabaseAdmin>,
  ownerOrg: string,
  appId: string,
) {
  const { data, error } = await supabase
    .from('apps')
    .select('*')
    .eq('owner_org', ownerOrg)
    .eq('app_id', appId)
    .eq('need_onboarding', true)
    .single()

  if (!error && data) {
    return data
  }

  const { data: existingApp, error: existingAppError } = await supabase
    .from('apps')
    .select('id, need_onboarding')
    .eq('owner_org', ownerOrg)
    .eq('app_id', appId)
    .maybeSingle()

  if (!existingAppError && existingApp && existingApp.need_onboarding !== true) {
    cloudlog({ requestId: c.get('requestId'), message: 'Attempted demo seeding on completed app', app_id: appId })
    throw simpleError('app_not_pending_onboarding', 'Cannot seed demo data on an app that already completed onboarding', { app_id: appId })
  }

  cloudlog({ requestId: c.get('requestId'), message: 'Error loading onboarding app', error: error ?? existingAppError, owner_org: ownerOrg, app_id: appId })
  throw simpleError('cannot_find_app', 'Cannot find app for demo onboarding', { owner_org: ownerOrg, app_id: appId })
}

async function getLatestPendingAppForOrg(
  c: Context<MiddlewareKeyVariables>,
  supabase: ReturnType<typeof supabaseAdmin>,
  ownerOrg: string,
) {
  const { data, error } = await supabase
    .from('apps')
    .select('*')
    .eq('owner_org', ownerOrg)
    .eq('need_onboarding', true)
    .order('created_at', { ascending: false })
    .limit(2)

  if (error) {
    cloudlog({ requestId: c.get('requestId'), message: 'Error loading pending onboarding app for org', error, owner_org: ownerOrg })
    throw simpleError('cannot_find_app', 'Cannot find app for demo onboarding', { owner_org: ownerOrg })
  }

  const appData = data?.[0]
  if (!appData) {
    throw simpleError('cannot_find_app', 'Cannot find app for demo onboarding', { owner_org: ownerOrg })
  }

  if ((data?.length ?? 0) > 1) {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'Multiple pending onboarding apps found, using most recent for legacy demo request',
      owner_org: ownerOrg,
      app_id: appData.app_id,
      count: data?.length ?? 0,
    })
  }

  return appData
}

/**
 * Seeds demo data into an already-created onboarding app.
 * The app stays marked by public.apps.need_onboarding = true until the
 * onboarding flow is completed, and is automatically deleted after 14 days if
 * onboarding never completes.
 *
 * This creates a fully populated demo app with:
 * - Multiple versions (1.0.0, 1.0.1, 1.1.0, 1.1.1, 1.2.0)
 * - Multiple channels (production, development, pr-123)
 * - Deploy history showing version deployments
 * - Fake devices across iOS and Android
 * - Chart data (MAU, bandwidth, storage) for the past 14 days
 *
 * @param c - Hono context with middleware key variables
 * @param body - Request body containing owner_org
 * @returns Response with app_id and success message
 */
export async function createDemoApp(c: Context<MiddlewareKeyVariables>, body: CreateDemoApp): Promise<Response> {
  const requestId = c.get('requestId')
  const auth = c.get('auth') as AuthInfo | undefined

  if (!auth?.userId) {
    throw simpleError('not_authenticated', 'Not authenticated')
  }

  if (!body.owner_org) {
    throw simpleError('missing_owner_org', 'Missing owner_org', { body })
  }

  // Check if the user is allowed to create an app in this organization
  if (!(await hasOrgRight(c, body.owner_org, auth.userId, 'write'))) {
    throw simpleError('cannot_access_organization', 'You can\'t access this organization', { org_id: body.owner_org })
  }

  const supabase = supabaseAdmin(c)
  const requestedAppId = body.app_id?.trim()
  const resolvedApp = requestedAppId
    ? { app_id: requestedAppId }
    : await getLatestPendingAppForOrg(c, supabase, body.owner_org)
  const lockedAppId = resolvedApp.app_id
  const onboardingLock = await lockOnboardingApp(c, lockedAppId)

  try {
    const appData = await getExistingPendingApp(c, supabase, body.owner_org, lockedAppId)
    if (!appData.id) {
      throw simpleError('cannot_find_app', 'Cannot find app for demo onboarding', { owner_org: body.owner_org, app_id: lockedAppId })
    }
    const appId = appData.app_id
    const demoSeedId = crypto.randomUUID()
    await resetOnboardingDemoData(c, appData.id)

    cloudlog({ requestId, message: 'Creating demo app with demo data', appId, owner_org: body.owner_org })

    // RLS bypass needed: Demo app creation inserts into multiple tables (apps, app_versions,
    // channels, devices, daily_mau, daily_bandwidth, daily_storage, daily_version, build_requests,
    // manifest, deploy_history) where RLS policies may not grant direct user insert access.
    // Authorization is enforced at endpoint level via hasOrgRight check above.

    // Create the demo app
    cloudlog({ requestId, message: 'Demo app created', appData })

    // Demo versions to create - simulates app development lifecycle
    const demoVersions: DemoVersion[] = [
      { name: 'unknown', daysAgo: 14 },
      { name: 'builtin', daysAgo: 14 },
      { name: '1.0.0', daysAgo: 13, comment: 'Initial release' },
      { name: '1.0.1', daysAgo: 10, comment: 'Bug fixes for login screen' },
      { name: '1.1.0', daysAgo: 7, comment: 'Added dark mode support' },
      { name: '1.1.1', daysAgo: 4, comment: 'Performance improvements' },
      { name: '1.2.0', daysAgo: 1, comment: 'New dashboard features', link: 'https://github.com/example/demo-app/pull/123' },
    ]

    const systemDemoVersions = demoVersions.filter(version => isSystemDemoVersionName(version.name))
    const appDemoVersions = demoVersions.filter(version => !isSystemDemoVersionName(version.name))

    const buildVersionInsert = (v: DemoVersion): Database['public']['Tables']['app_versions']['Insert'] => {
      const isSystemVersion = isSystemDemoVersionName(v.name)
      const manifest = isSystemVersion ? null : getDemoManifest(v.name, appId)
      const nativePackages = isSystemVersion ? null : getDemoNativePackages(v.name)

      return {
        owner_org: body.owner_org,
        deleted: isSystemVersion,
        name: v.name,
        app_id: appId,
        created_at: daysAgoDate(v.daysAgo),
        comment: v.comment,
        link: v.link,
        user_id: auth.userId,
        // Add manifest and native_packages for non-system versions
        manifest: manifest as any,
        manifest_count: manifest?.length ?? 0,
        native_packages: nativePackages as any,
      }
    }

    const { data: existingSystemVersions, error: existingSystemVersionsError } = await supabase
      .from('app_versions')
      .select('id, name')
      .eq('app_id', appId)
      .in('name', systemDemoVersions.map(version => version.name))

    if (existingSystemVersionsError || !existingSystemVersions) {
      cloudlog({ requestId, message: 'Error loading demo system versions', error: existingSystemVersionsError })
      throw simpleError('cannot_create_demo_versions', 'Cannot create demo versions', { error: existingSystemVersionsError })
    }

    let systemVersionsData = existingSystemVersions
    const existingSystemVersionNames = new Set(existingSystemVersions.map(version => version.name))
    const missingSystemVersionInserts = systemDemoVersions
      .filter(version => !existingSystemVersionNames.has(version.name))
      .map(buildVersionInsert)

    if (missingSystemVersionInserts.length > 0) {
      const { data: insertedSystemVersions, error: insertedSystemVersionsError } = await supabase
        .from('app_versions')
        .insert(missingSystemVersionInserts)
        .select('id, name')

      if (insertedSystemVersionsError || !insertedSystemVersions) {
        cloudlog({ requestId, message: 'Error creating demo system versions', error: insertedSystemVersionsError })
        throw simpleError('cannot_create_demo_versions', 'Cannot create demo versions', { error: insertedSystemVersionsError })
      }

      systemVersionsData = [...systemVersionsData, ...insertedSystemVersions]
    }

    const versionInserts = appDemoVersions.map(buildVersionInsert)

    const { data: versionsData, error: versionsError } = await supabase
      .from('app_versions')
      .insert(versionInserts)
      .select('id, name')

    if (versionsError || !versionsData) {
      cloudlog({ requestId, message: 'Error creating demo versions', error: versionsError })
      throw simpleError('cannot_create_demo_versions', 'Cannot create demo versions', { error: versionsError })
    }

    await trackOnboardingDemoRows(c, appId, body.owner_org, 'app_versions', versionsData.map(v => String(v.id)), demoSeedId)
    cloudlog({ requestId, message: 'Demo versions created', count: versionsData.length })

    const versionMap = new Map([...systemVersionsData, ...versionsData].map(v => [v.name, v.id]))

    // Insert manifest entries into the manifest table for each version
    // This is required for the bundle file list to show in the UI
    const manifestInserts: Database['public']['Tables']['manifest']['Insert'][] = []

    for (const version of appDemoVersions) {
      const versionId = versionMap.get(version.name)
      if (!versionId)
        continue

      const manifestEntries = getDemoManifest(version.name, appId)
      for (const entry of manifestEntries) {
        manifestInserts.push({
          app_version_id: versionId,
          file_name: entry.file_name,
          file_hash: entry.file_hash,
          s3_path: entry.s3_path,
          file_size: entry.file_size,
        })
      }
    }

    if (manifestInserts.length > 0) {
      const { data: manifestData, error: manifestError } = await supabase
        .from('manifest')
        .insert(manifestInserts)
        .select('id')

      if (manifestError || !manifestData) {
        cloudlog({ requestId, message: 'Error creating manifest entries', error: manifestError })
        throw simpleError('cannot_create_demo_manifest', 'Cannot create demo manifest entries', { error: manifestError })
      }

      await trackOnboardingDemoRows(c, appId, body.owner_org, 'manifest', manifestData.map(row => String(row.id)), demoSeedId)
      cloudlog({ requestId, message: 'Manifest entries created', count: manifestInserts.length })
    }

    // Demo channels configuration
    const demoChannels: DemoChannel[] = [
      { name: 'production', public: true },
      { name: 'development', public: false },
      { name: 'pr-123', public: false, allowDeviceSelfSet: true },
    ]

    // Channel to version mapping
    const channelVersions: Record<string, string> = {
      'production': '1.1.1',
      'development': '1.2.0',
      'pr-123': '1.2.0',
    }

    // Create channels. Do not upsert here: if a real channel already uses one
    // of these names/public-platform slots, failing is safer than overwriting it.
    const channelInserts: Database['public']['Tables']['channels']['Insert'][] = []

    for (const channel of demoChannels) {
      const versionName = channelVersions[channel.name]
      const versionId = versionMap.get(versionName)

      if (!versionId) {
        cloudlog({ requestId, message: 'Version not found for channel', channel: channel.name, versionName })
        continue
      }

      channelInserts.push({
        created_by: auth.userId,
        app_id: appId,
        name: channel.name,
        public: channel.public,
        disable_auto_update_under_native: true,
        disable_auto_update: 'major',
        ios: true,
        android: true,
        electron: true,
        allow_device_self_set: channel.allowDeviceSelfSet ?? false,
        allow_emulator: true,
        allow_device: true,
        allow_dev: channel.name !== 'production',
        allow_prod: true,
        version: versionId,
        owner_org: body.owner_org,
      })
    }

    const { data: allChannels, error: allChannelsError } = await supabase
      .from('channels')
      .insert(channelInserts)
      .select('id, name')

    if (allChannelsError || !allChannels) {
      cloudlog({ requestId, message: 'Error getting channels', error: allChannelsError })
      throw simpleError('cannot_create_demo_channels', 'Cannot create demo channels', { error: allChannelsError })
    }

    await trackOnboardingDemoRows(c, appId, body.owner_org, 'channels', allChannels.map(row => String(row.id)), demoSeedId)

    const createdChannels: Map<string, number> = new Map()
    for (const ch of allChannels) {
      createdChannels.set(ch.name, ch.id)
    }

    // Create deploy history to show progression
    const deployHistory: Array<{ channel: string, version: string, daysAgo: number }> = [
      { channel: 'production', version: '1.0.0', daysAgo: 13 },
      { channel: 'development', version: '1.0.1', daysAgo: 10 },
      { channel: 'production', version: '1.0.1', daysAgo: 9 },
      { channel: 'development', version: '1.1.0', daysAgo: 7 },
      { channel: 'production', version: '1.1.0', daysAgo: 6 },
      { channel: 'development', version: '1.1.1', daysAgo: 4 },
      { channel: 'production', version: '1.1.1', daysAgo: 3 },
      { channel: 'pr-123', version: '1.2.0', daysAgo: 1 },
      { channel: 'development', version: '1.2.0', daysAgo: 1 },
    ]

    const deployInserts = deployHistory
      .filter(d => createdChannels.has(d.channel) && versionMap.has(d.version))
      .map(d => ({
        app_id: appId,
        channel_id: createdChannels.get(d.channel)!,
        version_id: versionMap.get(d.version)!,
        created_by: auth.userId,
        owner_org: body.owner_org,
        created_at: daysAgoDate(d.daysAgo),
        deployed_at: daysAgoDate(d.daysAgo),
      }))

    if (deployInserts.length > 0) {
      const { data: deployData, error: deployError } = await supabase
        .from('deploy_history')
        .insert(deployInserts)
        .select('id')

      if (deployError || !deployData) {
        cloudlog({ requestId, message: 'Error creating deploy history', error: deployError })
        throw simpleError('cannot_create_demo_deploy_history', 'Cannot create demo deploy history', { error: deployError })
      }

      await trackOnboardingDemoRows(c, appId, body.owner_org, 'deploy_history', deployData.map(row => String(row.id)), demoSeedId)
      cloudlog({ requestId, message: 'Deploy history created', count: deployInserts.length })
    }

    // Create fake devices - mix of iOS and Android
    // Note: In production Cloudflare Workers, devices are read from Analytics Engine (DEVICE_INFO)
    // This Supabase data serves as fallback for non-workerd environments (dev, staging, Deno)
    const platforms: Array<Database['public']['Enums']['platform_os']> = ['ios', 'android']
    const deviceInserts: Database['public']['Tables']['devices']['Insert'][] = []
    const generatedDeviceIds: string[] = []

    // Create 8 devices (4 iOS, 4 Android)
    for (let i = 0; i < 8; i++) {
      const platform = platforms[i % 2]
      const latestVersionId = versionMap.get('1.1.1')
      const deviceId = generateDeviceId()
      generatedDeviceIds.push(deviceId)
      deviceInserts.push({
        app_id: appId,
        device_id: deviceId,
        platform,
        plugin_version: '6.0.0',
        version: latestVersionId,
        version_name: '1.1.1',
        version_build: '1',
        os_version: platform === 'ios' ? '17.0' : '14',
        is_emulator: false,
        is_prod: true,
        updated_at: daysAgoDate(Math.floor(Math.random() * 3)),
      })
    }

    const { data: devicesData, error: devicesError } = await supabase
      .from('devices')
      .insert(deviceInserts)
      .select('id')

    if (devicesError || !devicesData) {
      cloudlog({ requestId, message: 'Error creating demo devices', error: devicesError })
      throw simpleError('cannot_create_demo_devices', 'Cannot create demo devices', { error: devicesError })
    }

    await trackOnboardingDemoRows(c, appId, body.owner_org, 'devices', devicesData.map(row => String(row.id)), demoSeedId)
    cloudlog({ requestId, message: 'Demo devices created', count: deviceInserts.length })

    // Create chart data for the past 14 days
    // Insert directly into daily_* tables (which the frontend queries via get_app_metrics RPC)
    // instead of raw *_usage tables (which require cron job aggregation)
    const dailyMauInserts: Database['public']['Tables']['daily_mau']['Insert'][] = []
    const dailyBandwidthInserts: Database['public']['Tables']['daily_bandwidth']['Insert'][] = []
    const dailyStorageInserts: Database['public']['Tables']['daily_storage']['Insert'][] = []
    const dailyVersionInserts: Database['public']['Tables']['daily_version']['Insert'][] = []

    // Version sizes for storage calculation
    const versionSizes: Record<string, number> = {
      '1.0.0': 4500000,
      '1.0.1': 4600000,
      '1.1.0': 5200000,
      '1.1.1': 5300000,
      '1.2.0': 5800000,
    }

    // Track cumulative storage (versions accumulate over time)
    let cumulativeStorage = 0

    // Version active periods (when each version was in production)
    const versionActivePeriods: Record<string, { startDaysAgo: number, endDaysAgo: number }> = {
      '1.0.0': { startDaysAgo: 13, endDaysAgo: 9 },
      '1.0.1': { startDaysAgo: 9, endDaysAgo: 6 },
      '1.1.0': { startDaysAgo: 6, endDaysAgo: 3 },
      '1.1.1': { startDaysAgo: 3, endDaysAgo: 0 },
      '1.2.0': { startDaysAgo: 1, endDaysAgo: 0 }, // Only in dev/pr channel
    }

    for (let daysAgo = 13; daysAgo >= 0; daysAgo--) {
      const date = daysAgoDate(daysAgo).split('T')[0] // Get just the date part (YYYY-MM-DD)

      // MAU: Number of active devices increases over time (simulating user growth)
      const mau = Math.min(generatedDeviceIds.length, 3 + Math.floor((13 - daysAgo) * 0.5))
      dailyMauInserts.push({
        app_id: appId,
        date,
        mau,
      })

      // Bandwidth: Downloads per day (varies based on active users)
      const bundleSize = 5500000 // ~5.5MB average bundle
      const downloadsToday = Math.max(1, mau - 1)
      const bandwidth = bundleSize * downloadsToday
      dailyBandwidthInserts.push({
        app_id: appId,
        date,
        bandwidth,
      })

      // Storage: Add new version sizes when they're released
      for (const [versionName, size] of Object.entries(versionSizes)) {
        const versionConfig = demoVersions.find(v => v.name === versionName)
        if (versionConfig && versionConfig.daysAgo === daysAgo) {
          cumulativeStorage += size
        }
      }
      // Only add storage entry if we have some storage
      if (cumulativeStorage > 0) {
        dailyStorageInserts.push({
          app_id: appId,
          date,
          storage: cumulativeStorage,
        })
      }

      // Version usage: Create aggregated stats for each active version on this day
      for (const [versionName, period] of Object.entries(versionActivePeriods)) {
        if (daysAgo <= period.startDaysAgo && daysAgo >= period.endDaysAgo) {
          const versionId = versionMap.get(versionName)
          if (!versionId)
            continue

          // Activity increases as version gets more exposure
          const daysSinceRelease = period.startDaysAgo - daysAgo
          const baseActivity = Math.min(3 + daysSinceRelease, 8)

          const getCount = baseActivity * 2
          const installCount = Math.floor(getCount * 0.8)
          const failCount = Math.max(0, Math.floor(getCount * 0.05))
          const uninstallCount = daysAgo < period.startDaysAgo - 1 ? Math.max(0, Math.floor(installCount * 0.1)) : 0

          dailyVersionInserts.push({
            app_id: appId,
            date,
            version_id: versionId,
            version_name: versionName,
            get: getCount,
            install: installCount,
            fail: failCount,
            uninstall: uninstallCount,
          })
        }
      }
    }

    // Daily rollups are aggregate buckets. Seed only empty buckets and never
    // track them for reset, because real usage can later be folded into the
    // same app/date row by stats refresh jobs.
    if (dailyMauInserts.length > 0) {
      const { error: mauError } = await supabase.from('daily_mau').upsert(dailyMauInserts, { onConflict: 'app_id,date', ignoreDuplicates: true })
      if (mauError) {
        cloudlog({ requestId, message: 'Error creating daily_mau data', error: mauError })
        throw simpleError('cannot_create_demo_daily_mau', 'Cannot create demo MAU data', { error: mauError })
      }

      cloudlog({ requestId, message: 'Daily MAU data created', count: dailyMauInserts.length })
    }

    if (dailyBandwidthInserts.length > 0) {
      const { error: bandwidthError } = await supabase.from('daily_bandwidth').upsert(dailyBandwidthInserts, { onConflict: 'app_id,date', ignoreDuplicates: true })
      if (bandwidthError) {
        cloudlog({ requestId, message: 'Error creating daily_bandwidth data', error: bandwidthError })
        throw simpleError('cannot_create_demo_daily_bandwidth', 'Cannot create demo bandwidth data', { error: bandwidthError })
      }

      cloudlog({ requestId, message: 'Daily bandwidth data created', count: dailyBandwidthInserts.length })
    }

    if (dailyStorageInserts.length > 0) {
      const { error: storageError } = await supabase.from('daily_storage').upsert(dailyStorageInserts, { onConflict: 'app_id,date', ignoreDuplicates: true })
      if (storageError) {
        cloudlog({ requestId, message: 'Error creating daily_storage data', error: storageError })
        throw simpleError('cannot_create_demo_daily_storage', 'Cannot create demo storage data', { error: storageError })
      }

      cloudlog({ requestId, message: 'Daily storage data created', count: dailyStorageInserts.length })
    }

    if (dailyVersionInserts.length > 0) {
      const { error: versionError } = await supabase.from('daily_version').upsert(dailyVersionInserts as any, { onConflict: 'app_id,date,version_name', ignoreDuplicates: true })
      if (versionError) {
        cloudlog({ requestId, message: 'Error creating daily_version data', error: versionError })
        throw simpleError('cannot_create_demo_daily_version', 'Cannot create demo version data', { error: versionError })
      }

      cloudlog({ requestId, message: 'Daily version data created', count: dailyVersionInserts.length })
    }

    cloudlog({ requestId, message: 'Chart data created for 14 days' })

    // Create fake native builds to showcase the build feature
    // Shows a mix of successful builds and one pending build
    const buildInserts: Database['public']['Tables']['build_requests']['Insert'][] = []

    // Build configurations for different versions
    const nativeBuilds = [
      { version: '1.0.0', platform: 'ios', daysAgo: 13, status: 'succeeded' },
      { version: '1.0.0', platform: 'android', daysAgo: 13, status: 'succeeded' },
      { version: '1.1.0', platform: 'ios', daysAgo: 7, status: 'succeeded' },
      { version: '1.1.0', platform: 'android', daysAgo: 7, status: 'succeeded' },
      { version: '1.1.1', platform: 'ios', daysAgo: 4, status: 'succeeded' },
      { version: '1.1.1', platform: 'android', daysAgo: 4, status: 'succeeded' },
      { version: '1.2.0', platform: 'ios', daysAgo: 1, status: 'succeeded' },
      { version: '1.2.0', platform: 'android', daysAgo: 0, status: 'pending' }, // One pending build to show UI state
    ]

    for (const build of nativeBuilds) {
      const buildId = crypto.randomUUID()
      const createdAt = daysAgoDate(build.daysAgo)
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // Expires in 24 hours

      buildInserts.push({
        id: buildId,
        app_id: appId,
        owner_org: body.owner_org,
        platform: build.platform,
        requested_by: auth.userId,
        status: build.status,
        build_mode: 'release',
        build_config: {
          version: build.version,
          bundleId: appId,
          buildNumber: build.version.replace(/\./g, ''),
        },
        builder_job_id: build.status === 'succeeded' ? `demo-job-${buildId.slice(0, 8)}` : null,
        runner_wait_seconds: build.status === 'succeeded' ? 20 + build.daysAgo * 3 : 0,
        created_at: createdAt,
        upload_expires_at: expiresAt,
        upload_path: `builds/${appId}/${build.platform}/${build.version}`,
        upload_session_key: `demo-session-${buildId.slice(0, 8)}`,
        upload_url: `https://demo-builds.example.com/${appId}/${build.platform}/${build.version}`,
      })
    }

    if (buildInserts.length > 0) {
      const { data: buildData, error: buildError } = await supabase
        .from('build_requests')
        .insert(buildInserts)
        .select('id')

      if (buildError || !buildData) {
        cloudlog({ requestId, message: 'Error creating demo build requests', error: buildError })
        throw simpleError('cannot_create_demo_build_requests', 'Cannot create demo build requests', { error: buildError })
      }

      await trackOnboardingDemoRows(c, appId, body.owner_org, 'build_requests', buildData.map(row => String(row.id)), demoSeedId)
      cloudlog({ requestId, message: 'Demo build requests created', count: buildInserts.length })
    }

    // Invalidate the app_metrics_cache so the dashboard shows fresh data immediately
    // The get_app_metrics RPC caches results for 5 minutes, so we need to clear it
    const { error: cacheError } = await supabase
      .from('app_metrics_cache')
      .delete()
      .eq('org_id', body.owner_org)

    if (cacheError) {
      cloudlog({ requestId, message: 'Error invalidating app_metrics_cache', error: cacheError })
    }
    else {
      cloudlog({ requestId, message: 'App metrics cache invalidated for org', org_id: body.owner_org })
    }

    cloudlog({ requestId, message: 'Demo app with all demo data created successfully', appId })

    return c.json({
      status: 'ok',
      app_id: appId,
      name: appData.name ?? 'Demo App',
      message: 'Demo app created successfully with sample data. Explore channels, versions, and analytics!',
    })
  }
  finally {
    await unlockOnboardingApp(c, onboardingLock, lockedAppId)
  }
}
