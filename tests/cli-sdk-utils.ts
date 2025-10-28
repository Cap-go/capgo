import type { UploadOptions } from '@capgo/cli/sdk'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { cwd, env } from 'node:process'
import { CapgoSDK } from '@capgo/cli/sdk'
import { BASE_DEPENDENCIES, BASE_DEPENDENCIES_OLD, BASE_PACKAGE_JSON, TEMP_DIR_NAME } from './cli-utils'
import { APIKEY_TEST_ALL } from './test-utils'

// Supabase base URL (not including /functions/v1)
const SUPABASE_URL = env.SUPABASE_URL || 'http://localhost:54321'
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

/**
 * SDK-based CLI test utilities
 * This replaces process spawning with direct SDK function calls for faster test execution
 */

// Cache for prepared apps to avoid repeated setup
const preparedApps = new Set<string>()

// Simple queue for key generation to prevent concurrent conflicts
// When multiple tests run in parallel, they all try to create keys in the project root
// This queue ensures they run one at a time
let keyGenerationQueue = Promise.resolve()

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
    useZip: true, // Use legacy zip upload for local testing
    ...additionalOptions,
  }

  return sdk.uploadBundle(options)
}

// Note: Tests should use createTestSDK() directly for channel operations
// Example: const sdk = createTestSDK(); await sdk.addChannel({ channelId, appId })

/**
 * Generate encryption keys using the SDK
 * Uses a queue to serialize operations (prevent concurrent conflicts when creating keys in project root)
 */
export async function generateEncryptionKeysSDK(appId: string, force = true) {
  const { existsSync, renameSync } = await import('node:fs')

  // Queue this operation to run after previous ones complete
  const previousOperation = keyGenerationQueue
  let operationComplete: () => void
  keyGenerationQueue = new Promise(resolve => operationComplete = resolve)

  // Wait for previous operation to finish
  await previousOperation

  try {
    const sdk = createTestSDK()
    const folderPath = tempFileFolder(appId)

    // Generate keys (they will be created in the project root)
    const result = await sdk.generateEncryptionKeys({ force })

    if (!result.success) {
      return result
    }

    // Find where the keys were actually created and move them to the test folder
    const projectRoot = cwd()
    const privateKeySource = join(projectRoot, '.capgo_key_v2')
    const publicKeySource = join(projectRoot, '.capgo_key_v2.pub')
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
    // Signal that this operation is complete
    operationComplete!()
  }
}

// Export BASE_DEPENDENCIES for compatibility
export { BASE_DEPENDENCIES, BASE_DEPENDENCIES_OLD }
