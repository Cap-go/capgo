import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { cwd } from 'node:process'
import type { AddChannelOptions, CleanupOptions, UploadOptions } from '@capgo/cli/sdk'
import { CapgoSDK } from '@capgo/cli/sdk'
import { APIKEY_TEST_ALL } from './test-utils'
import { env } from 'node:process'

// Supabase base URL (not including /functions/v1)
const SUPABASE_URL = env.SUPABASE_URL || 'http://localhost:54321'
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
import { BASE_DEPENDENCIES, BASE_DEPENDENCIES_OLD, BASE_PACKAGE_JSON, TEMP_DIR_NAME } from './cli-utils'

/**
 * SDK-based CLI test utilities
 * This replaces process spawning with direct SDK function calls for faster test execution
 */

// Cache for prepared apps to avoid repeated setup
const preparedApps = new Set<string>()

export const tempFileFolder = (appId: string) => join(cwd(), TEMP_DIR_NAME, appId)

function generateDefaultJsonCliConfig(appId: string) {
  return {
    appId,
    appName: 'Test App',
    webDir: 'dist',
    plugins: {
      CapacitorUpdater: {
        autoUpdate: false,
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

/**
 * Create an SDK instance with test credentials
 */
export function createTestSDK(apikey: string = APIKEY_TEST_ALL) {
  return new CapgoSDK({
    apikey,
    supaHost: SUPABASE_URL,
    supaAnon: SUPABASE_ANON_KEY,
  })
}

/**
 * Upload a bundle using the SDK
 */
export async function uploadBundleSDK(
  appId: string,
  version: string,
  channel?: string,
  additionalOptions?: Partial<UploadOptions>,
) {
  const sdk = createTestSDK()
  const folderPath = tempFileFolder(appId)

  const options: UploadOptions = {
    appId,
    path: join(folderPath, 'dist'),
    bundle: version,
    channel,
    apikey: APIKEY_TEST_ALL,
    supaHost: SUPABASE_URL,
    supaAnon: SUPABASE_ANON_KEY,
    ignoreCompatibilityCheck: true,
    disableCodeCheck: true,
    useZip: true, // Use legacy zip upload for local testing
    ...additionalOptions,
  }

  return sdk.uploadBundle(options)
}

/**
 * Add a channel using the SDK
 */
export async function addChannelSDK(
  channelId: string,
  appId: string,
  isDefault?: boolean,
  additionalOptions?: Partial<AddChannelOptions>,
) {
  const sdk = createTestSDK()

  const options: AddChannelOptions = {
    channelId,
    appId,
    default: isDefault,
    supaHost: SUPABASE_URL,
    supaAnon: SUPABASE_ANON_KEY,
    ...additionalOptions,
  }

  return sdk.addChannel(options)
}

/**
 * Delete a channel using the SDK
 */
export async function deleteChannelSDK(
  channelId: string,
  appId: string,
  deleteBundle = false,
) {
  const sdk = createTestSDK()
  return sdk.deleteChannel(channelId, appId, deleteBundle)
}

/**
 * Set/update channel using the SDK
 */
export async function setChannelSDK(
  channelId: string,
  appId: string,
  bundle?: string,
  additionalOptions?: Partial<any>,
) {
  const sdk = createTestSDK()

  const options = {
    channelId,
    appId,
    bundle,
    supaHost: SUPABASE_URL,
    supaAnon: SUPABASE_ANON_KEY,
    ...additionalOptions,
  }

  return sdk.updateChannel(options)
}

/**
 * List channels using the SDK
 */
export async function listChannelsSDK(appId: string) {
  const sdk = createTestSDK()
  return sdk.listChannels(appId)
}

/**
 * List bundles using the SDK
 */
export async function listBundlesSDK(appId: string) {
  const sdk = createTestSDK()
  return sdk.listBundles(appId)
}

/**
 * Delete a bundle using the SDK
 */
export async function deleteBundleSDK(appId: string, bundleId: string) {
  const sdk = createTestSDK()
  return sdk.deleteBundle(appId, bundleId)
}

/**
 * Cleanup old bundles using the SDK
 */
export async function cleanupBundlesSDK(
  appId: string,
  keep: number,
  additionalOptions?: Partial<CleanupOptions>,
) {
  const sdk = createTestSDK()

  const options: CleanupOptions = {
    appId,
    keep,
    force: true,
    supaHost: SUPABASE_URL,
    supaAnon: SUPABASE_ANON_KEY,
    ...additionalOptions,
  }

  return sdk.cleanupBundles(options)
}

/**
 * Add an app using the SDK
 */
export async function addAppSDK(appId: string, name?: string, icon?: string) {
  const sdk = createTestSDK()
  return sdk.addApp({
    appId,
    name,
    icon,
    supaHost: SUPABASE_URL,
    supaAnon: SUPABASE_ANON_KEY,
  })
}

/**
 * Delete an app using the SDK
 */
export async function deleteAppSDK(appId: string, skipConfirmation = true) {
  const sdk = createTestSDK()
  return sdk.deleteApp(appId, skipConfirmation)
}

/**
 * List apps using the SDK
 */
export async function listAppsSDK() {
  const sdk = createTestSDK()
  return sdk.listApps()
}

// Export BASE_DEPENDENCIES for compatibility
export { BASE_DEPENDENCIES, BASE_DEPENDENCIES_OLD }
