import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process, { cwd, env } from 'node:process'
import { sync as rimrafSync } from 'rimraf'
import { APIKEY_TEST_ALL, BASE_URL } from './test-utils'


export const TEMP_DIR_NAME = 'temp_cli_test'
export const BASE_PACKAGE_JSON = `{
  "name": "%APPID%",
  "version": "1.0.0",
  "description": "An Amazing Test App",
  "dependencies": %DEPENDENCIES%,
  "devDependencies": {
    "@capacitor/cli": "^7.0.0",
    "typescript": "^5.2.2"
  },
  "author": ""
}`
export const BASE_DEPENDENCIES = {
  '@capacitor/android': '^7.0.0',
  '@capacitor/core': '7.0.0',
  '@capgo/capacitor-updater': '7.0.38',
}
export const BASE_DEPENDENCIES_OLD = {
  '@capacitor/android': '^6.0.0',
  '@capacitor/core': '6.0.0',
  '@capgo/capacitor-updater': '6.14.17',
}

// Cache for prepared apps to avoid repeated setup
const preparedApps = new Set<string>()

// Track active processes for cleanup
const activeProcesses = new Set<ReturnType<typeof spawn>>()

// Check if CLI is available locally
function hasLocalCli(): boolean {
  try {
    require.resolve('@capgo/cli')
    return true
  }
  catch {
    return false
  }
}

export const tempFileFolder = (appId: string) => join(cwd(), TEMP_DIR_NAME, appId)

function generateDefaultJsonCliConfig(appId: string) {
  return {
    appId,
    appName: 'demoApp',
    webDir: 'dist',
    plugins: {
      CapacitorUpdater: {
        autoUpdate: true,
        statsUrl: `${BASE_URL}/stats`,
        channelUrl: `${BASE_URL}/channel_self`,
        updateUrl: `${BASE_URL}/updates`,
        localS3: true,
        localHost: 'http://localhost:5173',
        localWebHost: 'http://localhost:5173',
        localSupa: env.SUPABASE_URL,
        localSupaAnon: env.SUPABASE_ANON_KEY,
        localApiFiles: BASE_URL,
      },
    },
  }
}

function generateCliConfig(appId: string): string {
  return `import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = ${JSON.stringify(generateDefaultJsonCliConfig(appId), null, 2)};

export default config;\n`
}

export function setDependencies(dependencies: Record<string, string>, appId: string) {
  // write package.json
  const pathPack = join(tempFileFolder(appId), 'package.json')
  const res = BASE_PACKAGE_JSON.replace('%APPID%', appId).replace('%DEPENDENCIES%', JSON.stringify(dependencies, null, 2))
  writeFileSync(pathPack, res)
}

export function deleteTempFolders(appId: string) {
  const tempFolder = tempFileFolder(appId)
  if (existsSync(tempFolder)) {
    // console.log('Deleting temp folder', tempFolder)
    rimrafSync(tempFolder)
  }
  preparedApps.delete(appId)
}

export function getSemver(semver = `1.0.${Date.now()}`) {
  const lastNumber = Number.parseInt(semver.charAt(semver.length - 1))
  const newSemver = `${semver.slice(0, -1)}${(lastNumber + 1).toString()}`
  return newSemver
}

export async function prepareCli(appId: string, old = false, installDeps = false) {
  // Skip if already prepared
  if (preparedApps.has(appId)) {
    return
  }

  const defaultConfig = generateCliConfig(appId)
  deleteTempFolders(appId)
  mkdirSync(tempFileFolder(appId), { recursive: true })

  const capacitorConfigPath = join(tempFileFolder(appId), 'capacitor.config.ts')
  writeFileSync(capacitorConfigPath, defaultConfig)

  mkdirSync(join(tempFileFolder(appId), 'dist'), { recursive: true })
  writeFileSync(join(tempFileFolder(appId), 'dist', 'index.js'), 'import { CapacitorUpdater } from \'@capgo/capacitor-updater\';\nconsole.log("Hello world!!!");\nCapacitorUpdater.notifyAppReady();')
  writeFileSync(join(tempFileFolder(appId), 'dist', 'index.html'), '')
  
  // Create package.json for reference
  setDependencies(old ? BASE_DEPENDENCIES_OLD : BASE_DEPENDENCIES, appId)

  if (installDeps) {
    // Only install dependencies for tests that specifically need them (like metadata tests)
    await npmInstallMinimal(appId)
  } else {
    // Create empty node_modules folder to satisfy CLI checks without installing
    const nodeModulesPath = join(tempFileFolder(appId), 'node_modules')
    mkdirSync(nodeModulesPath, { recursive: true })
    
    // Create a minimal package.json in node_modules to indicate it's "installed"
    writeFileSync(join(nodeModulesPath, '.package-lock.json'), '{"name": "temp", "lockfileVersion": 1}')
  }

  preparedApps.add(appId)
}

// Minimal install that only gets essential dependencies
async function npmInstallMinimal(appId: string) {
  try {
    // Use exec again but import it
    const { exec } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const execAsync = promisify(exec)
    
    // First try bun install
    await execAsync('bun install', { 
      cwd: tempFileFolder(appId),
      timeout: 60000
    })
  }
  catch (error) {
    console.error(`bun install failed for ${appId}, trying npm:`, error)
    
    try {
      const { exec } = await import('node:child_process')
      const { promisify } = await import('node:util')
      const execAsync = promisify(exec)
      
      // Fallback to npm
      await execAsync('npm install --silent --no-audit --no-fund', { 
        cwd: tempFileFolder(appId),
        timeout: 60000
      })
    }
    catch (npmError) {
      console.error(`Both bun and npm install failed for ${appId}:`, npmError)
      // Create fake node_modules as fallback
      const nodeModulesPath = join(tempFileFolder(appId), 'node_modules')
      mkdirSync(nodeModulesPath, { recursive: true })
      writeFileSync(join(nodeModulesPath, '.package-lock.json'), '{"name": "temp", "lockfileVersion": 1}')
      throw npmError
    }
  }
}

// cleanup CLI
export function cleanupCli(appId: string) {
  deleteTempFolders(appId)
}

// Cleanup function for process management
export function cleanupAllProcesses() {
  activeProcesses.forEach((proc) => {
    try {
      proc.kill('SIGTERM')
    }
    catch {
      // Process may already be dead
    }
  })
  activeProcesses.clear()
}

// Register cleanup on process exit
process.on('exit', cleanupAllProcesses)
process.on('SIGINT', cleanupAllProcesses)
process.on('SIGTERM', cleanupAllProcesses)


export async function runCli(params: string[], appId: string, logOutput = false, overwriteApiKey?: string, overwriteSupaHost?: boolean, noFolder?: boolean): Promise<string> {
  const basePath = noFolder ? cwd() : tempFileFolder(appId)

  // Use the main project's CLI directly - most reliable approach
  const mainProjectCliPath = join(cwd(), 'node_modules', '@capgo', 'cli', 'dist', 'index.js')
  
  let localCliPath = env.LOCAL_CLI_PATH
  if (localCliPath === 'true') {
    // For easy local testing, we can set the LOCAL_CLI_PATH to true and the CLI folder will be used
    localCliPath = '../../../CLI/dist/index.js'
  }
  if (localCliPath) {
    if (noFolder) {
      // remove ../../ from the path as the running path is not in subfolder
      localCliPath = localCliPath.replace('../../', '')
    }
  }

  // Determine the command to use
  let executable: string
  let cliPath: string

  if (localCliPath) {
    executable = env.NODE_PATH ?? 'node'
    cliPath = localCliPath
  }
  else if (existsSync(mainProjectCliPath)) {
    // Use the main project's CLI installation directly - fastest and most reliable
    executable = 'node'
    cliPath = mainProjectCliPath
  }
  else {
    throw new Error('CLI not available. Install @capgo/cli as devDependency')
  }

  const command = [
    executable,
    cliPath,
    ...params,
    ...((overwriteApiKey === undefined || overwriteApiKey.length > 0) ? ['--apikey', overwriteApiKey ?? APIKEY_TEST_ALL] : []),
    ...(overwriteSupaHost ? ['--supa-host', env.SUPABASE_URL ?? '', '--supa-anon', env.SUPABASE_ANON_KEY ?? ''] : []),
  ]

  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: basePath,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...env, FORCE_COLOR: '1' },
      timeout: 30000, // 30 second timeout
    })

    // Track the process
    activeProcesses.add(child)

    let stdout = ''
    let stderr = ''
    let finished = false

    const cleanup = () => {
      if (!finished) {
        finished = true
        activeProcesses.delete(child)
      }
    }

    child.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('close', (_code) => {
      cleanup()
      const output = stdout || stderr

      if (logOutput) {
        console.log(output)
      }

      resolve(output) // Always resolve with output for consistent error checking
    })

    child.on('error', (error) => {
      cleanup()
      reject(error)
    })

    // Handle timeout explicitly
    child.on('exit', (code, signal) => {
      if (signal === 'SIGTERM') {
        cleanup()
        reject(new Error(`Process terminated: ${signal}`))
      }
    })
  })
}

// Batch CLI operations to reduce setup overhead
export async function batchRunCli(
  operations: Array<{
    params: string[]
    expectedOutput?: string
    appId: string
    overwriteApiKey?: string
    overwriteSupaHost?: boolean
    noFolder?: boolean
  }>,
): Promise<string[]> {
  // Execute operations sequentially to avoid conflicts
  const results: string[] = []

  for (const op of operations) {
    const result = await runCli(
      op.params,
      op.appId,
      false,
      op.overwriteApiKey,
      op.overwriteSupaHost,
      op.noFolder,
    )
    results.push(result)
  }

  return results
}

// Helper for common CLI test patterns
export async function testCliCommand(
  params: string[],
  appId: string,
  expectedOutput: string,
  shouldContain = true,
  overwriteApiKey?: string,
): Promise<string> {
  const output = await runCli(params, appId, false, overwriteApiKey, true, true)

  if (shouldContain) {
    if (!output.includes(expectedOutput)) {
      throw new Error(`Expected output to contain "${expectedOutput}", but got: ${output}`)
    }
  }
  else {
    if (output.includes(expectedOutput)) {
      throw new Error(`Expected output NOT to contain "${expectedOutput}", but got: ${output}`)
    }
  }

  return output
}
