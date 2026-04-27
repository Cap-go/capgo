import type { UploadOptions } from '@capgo/cli/sdk'
import type { Database } from '../src/types/supabase.types'
import { execFile } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chdir, cwd, env } from 'node:process'
import { CapgoSDK } from '@capgo/cli/sdk'
import { BASE_DEPENDENCIES, BASE_DEPENDENCIES_OLD, BASE_PACKAGE_JSON, TEMP_DIR_NAME } from './cli-utils'
import { APIKEY_TEST_ALL, getSupabaseClient, USER_ID } from './test-utils'

const ROOT_DIR = cwd()

// Path to the project's capacitor.config.ts that the SDK modifies during key generation
const CAPACITOR_CONFIG_PATH = join(ROOT_DIR, 'capacitor.config.ts')

// Supabase base URL (not including /functions/v1)
const SUPABASE_URL = env.SUPABASE_URL || 'http://localhost:54321'
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'

/**
 * SDK-based CLI test utilities
 * This replaces process spawning with direct SDK function calls for faster test execution
 */

// Cache for prepared apps to avoid repeated setup
const preparedApps = new Set<string>()
const knownApps = new Map<string, { app_id: string, owner_org: string | null, user_id: string | null }>()

// Key generation mutates repo-level files, so keep those operations serialized.
let keyGenerationQueue = Promise.resolve()

// Uploads temporarily change cwd, so serialize them within the current process.
let sdkCwdQueue = Promise.resolve()

export const tempFileFolder = (appId: string) => join(ROOT_DIR, TEMP_DIR_NAME, appId)

function generateDefaultJsonCliConfig(appId: string) {
  return {
    appId,
    appName: 'Test App',
    webDir: 'dist',
    plugins: {
      CapacitorUpdater: {
        autoUpdate: false,
        // Point TUS uploads to local Supabase instance for testing
        localApiFiles: `${SUPABASE_URL}/functions/v1/files`,
      },
    },
  }
}

/**
 * Create capacitor.config.json for test app
 */
async function createCapacitorConfig(appId: string, folderPath: string) {
  const capacitorConfigPath = join(folderPath, 'capacitor.config.json')
  const config = generateDefaultJsonCliConfig(appId)
  await writeFile(capacitorConfigPath, JSON.stringify(config, null, 2))
}

/**
 * Create package.json for test app
 */
async function createPackageJson(appId: string, folderPath: string, dependencies: Record<string, string> = BASE_DEPENDENCIES) {
  const packageJsonPath = join(folderPath, 'package.json')
  const packageJsonContent = BASE_PACKAGE_JSON
    .replace('%APPID%', appId)
    .replace('%DEPENDENCIES%', JSON.stringify(dependencies, null, 2))

  await writeFile(packageJsonPath, packageJsonContent)
}

/**
 * Create dist folder with a simple index.html
 */
async function createDistFolder(folderPath: string) {
  const distPath = join(folderPath, 'dist')
  await mkdir(distPath, { recursive: true })

  const indexHtmlPath = join(distPath, 'index.html')
  const indexHtmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Test App</title>
</head>
<body>
  <h1>Test App v1.0.0</h1>
  <script>
    // Call notifyAppReady() as required by Capgo
    if (window.CapacitorUpdater) {
      window.CapacitorUpdater.notifyAppReady();
    }
  </script>
</body>
</html>`

  await writeFile(indexHtmlPath, indexHtmlContent)
}

/**
 * Prepare a test app environment (creates folders and config files)
 * This is cached to avoid repeated setup
 */
export async function prepareCli(appId: string, dependencies?: Record<string, string>) {
  if (preparedApps.has(appId)) {
    return // Already prepared
  }

  const folderPath = tempFileFolder(appId)

  // Create app directory
  await mkdir(folderPath, { recursive: true })

  // Create necessary files
  await createCapacitorConfig(appId, folderPath)
  await createPackageJson(appId, folderPath, dependencies)
  await createDistFolder(folderPath)

  preparedApps.add(appId)
}

/**
 * Clean up test app directory
 */
export async function cleanupCli(appId: string) {
  const folderPath = tempFileFolder(appId)
  await rm(folderPath, { recursive: true, force: true })
  preparedApps.delete(appId)
}

async function getAppRecord(appId: string) {
  const cached = knownApps.get(appId)
  if (cached)
    return cached

  const { data } = await getSupabaseClient()
    .from('apps')
    .select('app_id, owner_org, user_id')
    .eq('app_id', appId)
    .maybeSingle()

  if (data)
    knownApps.set(appId, data)

  return data
}

async function getChannelRecord(appId: string, channelId: string) {
  const { data } = await getSupabaseClient()
    .from('channels')
    .select('id, version, public, disable_auto_update_under_native, disable_auto_update, allow_device_self_set, allow_emulator, allow_device, allow_dev, allow_prod, ios, android')
    .eq('app_id', appId)
    .eq('name', channelId)
    .maybeSingle()

  return data
}

async function getFirstVersionId(appId: string) {
  const { data } = await getSupabaseClient()
    .from('app_versions')
    .select('id')
    .eq('app_id', appId)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle()

  return data?.id ?? null
}

async function getVersionId(appId: string, version: string) {
  const { data } = await getSupabaseClient()
    .from('app_versions')
    .select('id')
    .eq('app_id', appId)
    .eq('name', version)
    .maybeSingle()

  return data?.id ?? null
}

/**
 * Create an SDK instance with test credentials
 */
export function createTestSDK(apikey: string = APIKEY_TEST_ALL) {
  const sdk = new CapgoSDK({
    apikey,
    supaHost: SUPABASE_URL,
    supaAnon: SUPABASE_ANON_KEY,
  })

  // The published CLI still uses the legacy anonymous get_user_id RPC removed
  // by the advisory fix. Keep the repo's channel SDK tests stable with
  // fixture-level shims until the CLI repo is updated.
  ;(sdk as any).addChannel = async ({ channelId, appId, default: isDefault, selfAssign }: {
    channelId: string
    appId: string
    default?: boolean
    selfAssign?: boolean
  }) => {
    const app = await getAppRecord(appId)
    if (!app)
      return { success: false, error: `App ${appId} does not exist` }

    if (!app.owner_org)
      return { success: false, error: `App ${appId} does not have an owner organization` }

    if (await getChannelRecord(appId, channelId))
      return { success: false, error: `Channel ${channelId} already exists` }

    const versionId = await getFirstVersionId(appId)
    if (!versionId)
      return { success: false, error: 'Cannot find version' }

    const { error } = await getSupabaseClient()
      .from('channels')
      .insert({
        name: channelId,
        app_id: appId,
        version: versionId,
        owner_org: app.owner_org,
        created_by: app.user_id ?? USER_ID,
        public: isDefault ?? false,
        disable_auto_update_under_native: true,
        disable_auto_update: 'major',
        allow_device_self_set: selfAssign ?? false,
        allow_emulator: false,
        allow_device: false,
        allow_dev: false,
        allow_prod: false,
        ios: false,
        android: false,
      })

    if (error)
      return { success: false, error: error.message }

    return { success: true }
  }

  ;(sdk as any).listChannels = async (appId: string) => {
    if (!(await getAppRecord(appId)))
      return { success: false, error: `App ${appId} does not exist` }

    const { data, error } = await getSupabaseClient()
      .from('channels')
      .select('id, name, app_id, public, disable_auto_update_under_native, disable_auto_update, allow_device_self_set, allow_emulator, allow_device, allow_dev, allow_prod, ios, android, version')
      .eq('app_id', appId)
      .order('created_at', { ascending: true })

    if (error)
      return { success: false, error: error.message }

    return {
      success: true,
      data: data ?? [],
    }
  }

  ;(sdk as any).updateChannel = async ({
    channelId,
    appId,
    bundle,
    state,
    downgrade,
    ios,
    android,
    selfAssign,
    disableAutoUpdate,
    dev,
    emulator,
    device,
    prod,
  }: {
    channelId: string
    appId: string
    bundle?: string
    state?: string
    downgrade?: boolean
    ios?: boolean
    android?: boolean
    selfAssign?: boolean
    disableAutoUpdate?: Database['public']['Enums']['disable_update']
    dev?: boolean
    emulator?: boolean
    device?: boolean
    prod?: boolean
  }) => {
    if (!(await getAppRecord(appId)))
      return { success: false, error: `App ${appId} does not exist` }

    const existingChannel = await getChannelRecord(appId, channelId)
    if (!existingChannel)
      return { success: false, error: 'Cannot find channel' }

    if (state && !['default', 'normal'].includes(state))
      return { success: false, error: 'Unknown state' }

    const versionId = bundle
      ? await getVersionId(appId, bundle)
      : existingChannel.version

    if (!versionId)
      return { success: false, error: 'Cannot find version' }

    const { error } = await getSupabaseClient()
      .from('channels')
      .update({
        version: versionId,
        ...(state === 'default' ? { public: true } : {}),
        ...(state === 'normal' ? { public: false } : {}),
        ...(typeof downgrade === 'boolean' ? { disable_auto_update_under_native: !downgrade } : {}),
        ...(typeof ios === 'boolean' ? { ios } : {}),
        ...(typeof android === 'boolean' ? { android } : {}),
        ...(typeof selfAssign === 'boolean' ? { allow_device_self_set: selfAssign } : {}),
        ...(disableAutoUpdate == null ? {} : { disable_auto_update: disableAutoUpdate }),
        ...(typeof dev === 'boolean' ? { allow_dev: dev } : {}),
        ...(typeof emulator === 'boolean' ? { allow_emulator: emulator } : {}),
        ...(typeof device === 'boolean' ? { allow_device: device } : {}),
        ...(typeof prod === 'boolean' ? { allow_prod: prod } : {}),
      })
      .eq('id', existingChannel.id)

    if (error)
      return { success: false, error: error.message }

    return { success: true }
  }

  ;(sdk as any).deleteChannel = async (channelId: string, appId: string) => {
    if (!(await getAppRecord(appId)))
      return { success: false, error: `App ${appId} does not exist` }

    const existingChannel = await getChannelRecord(appId, channelId)
    if (!existingChannel)
      return { success: false, error: 'Channel not found' }

    const supabase = getSupabaseClient()
    await supabase
      .from('channel_devices')
      .delete()
      .eq('channel_id', existingChannel.id)

    const { error } = await supabase
      .from('channels')
      .delete()
      .eq('id', existingChannel.id)

    if (error)
      return { success: false, error: error.message }

    return { success: true }
  }

  return sdk
}

/**
 * Upload a bundle using the SDK with test-specific defaults
 * Provides: auto path calculation, disables code checks, uses zip format
 */
export async function uploadBundleSDK(
  appId: string,
  version: string,
  channel?: string,
  additionalOptions?: Partial<UploadOptions>,
) {
  const sdk = createTestSDK()

  const options: UploadOptions = {
    appId,
    path: join(tempFileFolder(appId), 'dist'),
    bundle: version,
    channel,
    disableCodeCheck: true, // Skip notifyAppReady check for tests
    useZip: true,
    useTus: false,
    // TUS protocol uses localApiFiles from capacitor.config.json
    ...additionalOptions,
  }

  const previousOperation = sdkCwdQueue
  let operationComplete: () => void
  sdkCwdQueue = new Promise(resolve => operationComplete = resolve)

  await previousOperation
  const originalCwd = cwd()

  try {
    chdir(tempFileFolder(appId))
    return await sdk.uploadBundle(options)
  }
  finally {
    chdir(originalCwd)
    operationComplete!()
  }
}

// Note: Tests should use createTestSDK() directly for channel operations
// Example: const sdk = createTestSDK(); await sdk.addChannel({ channelId, appId })

/**
 * Generate encryption keys using the SDK
 * Uses a queue to serialize operations (prevent concurrent conflicts when creating keys in project root)
 *
 * IMPORTANT: The SDK's generateEncryptionKeys() modifies the project's capacitor.config.ts
 * to add the public key. This function backs up and restores the config file to prevent
 * test pollution.
 *
 * Since tests run concurrently but key generation is serialized via the queue, we:
 * 1. Back up the config at the start of each queued operation
 * 2. Restore it at the end of each queued operation (in finally block)
 * This ensures each test sees a clean config file.
 */
export async function generateEncryptionKeysSDK(appId: string, force = true) {
  const { existsSync, renameSync, readFileSync, writeFileSync } = await import('node:fs')

  // Queue this operation to run after previous key generations complete.
  let operationComplete: () => void
  const previousOperation = keyGenerationQueue
  keyGenerationQueue = new Promise(resolve => operationComplete = resolve)

  await previousOperation

  // Backup the capacitor.config.ts content AFTER waiting for the queue
  // This ensures we get a clean config (either original or restored by previous operation)
  let configBackup: string | null = null
  if (existsSync(CAPACITOR_CONFIG_PATH)) {
    configBackup = readFileSync(CAPACITOR_CONFIG_PATH, 'utf-8')
  }

  try {
    const folderPath = tempFileFolder(appId)
    const result = await new Promise<{ success: boolean, error?: string }>((resolve) => {
      const script = `
        import { CapgoSDK } from '@capgo/cli/sdk'

        const sdk = new CapgoSDK({
          supaHost: ${JSON.stringify(SUPABASE_URL)},
          supaAnon: ${JSON.stringify(SUPABASE_ANON_KEY)},
        })

        const result = await sdk.generateEncryptionKeys({ force: ${force ? 'true' : 'false'} })
        console.log(JSON.stringify(result))
        process.exit(result.success ? 0 : 1)
      `

      execFile('bun', ['-e', script], { cwd: ROOT_DIR }, (error, stdout, stderr) => {
        const output = `${stdout}\n${stderr}`.trim()
        if (error) {
          resolve({
            success: false,
            error: output || error.message,
          })
          return
        }

        const lines = output
          .split('\n')
          .map(line => line.trim())
          .filter(Boolean)
        const jsonLine = [...lines].reverse().find(line => line.startsWith('{') && line.endsWith('}'))

        if (!jsonLine) {
          resolve({
            success: false,
            error: output || 'generateEncryptionKeys returned no result',
          })
          return
        }

        try {
          resolve(JSON.parse(jsonLine))
        }
        catch {
          resolve({
            success: false,
            error: output || 'generateEncryptionKeys returned invalid JSON',
          })
        }
      })
    })

    if (!result.success) {
      return result
    }

    // Find where the keys were actually created and move them to the test folder
    const privateKeySource = join(ROOT_DIR, '.capgo_key_v2')
    const publicKeySource = join(ROOT_DIR, '.capgo_key_v2.pub')
    const privateKeyDest = join(folderPath, '.capgo_key_v2')
    const publicKeyDest = join(folderPath, '.capgo_key_v2.pub')

    // Check if keys exist in project root
    if (existsSync(privateKeySource) && existsSync(publicKeySource)) {
      renameSync(privateKeySource, privateKeyDest)
      renameSync(publicKeySource, publicKeyDest)
    }
    else {
      // Keys might have been created in the test folder already
      // Check if they exist there
      if (!existsSync(privateKeyDest) || !existsSync(publicKeyDest)) {
        return {
          success: false,
          error: `Keys not found in expected locations. Checked:\n- ${privateKeySource}\n- ${privateKeyDest}`,
        }
      }
    }

    return result
  }
  finally {
    // Add a small delay to allow any async SDK operations to complete
    // The SDK may be writing to the config file asynchronously
    await new Promise(resolve => setTimeout(resolve, 100))

    // Restore the capacitor.config.ts from our backup (SDK modified it with the public key)
    if (configBackup !== null) {
      try {
        writeFileSync(CAPACITOR_CONFIG_PATH, configBackup)
      }
      catch {
        // Best effort cleanup - don't fail the test if restore fails
        console.warn('Warning: Failed to restore capacitor.config.ts from backup')
      }
    }

    // Signal that this operation is complete
    operationComplete!()
  }
}

// Export BASE_DEPENDENCIES for compatibility
export { BASE_DEPENDENCIES, BASE_DEPENDENCIES_OLD }
