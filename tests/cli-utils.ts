import type { ExecSyncOptions } from 'node:child_process'
import { exec, execSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cwd, env } from 'node:process'
import { promisify } from 'node:util'
import { sync as rimrafSync } from 'rimraf'
import { APIKEY_TEST_ALL, BASE_URL } from './test-utils'

const execAsync = promisify(exec)

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

export async function prepareCli(appId: string, old = false) {
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
  setDependencies(old ? BASE_DEPENDENCIES_OLD : BASE_DEPENDENCIES, appId)

  await npmInstall(appId)
  preparedApps.add(appId)
}

// cleanup CLI
export function cleanupCli(appId: string) {
  deleteTempFolders(appId)
}

export async function npmInstall(appId: string) {
  try {
    await execAsync('bun install', { cwd: tempFileFolder(appId) })
  }
  catch (error) {
    console.error('bun install failed', error)
    throw error
  }
}

export async function runCli(params: string[], appId: string, logOutput = false, overwriteApiKey?: string, overwriteSupaHost?: boolean, noFolder?: boolean): Promise<string> {
  const basePath = noFolder ? cwd() : tempFileFolder(appId)

  // When noFolder is true, always use bunx @capgo/cli@latest
  // When noFolder is false, check for local CLI setup
  let localCliPath = env.LOCAL_CLI_PATH
  if (!noFolder && localCliPath === 'true') {
    localCliPath = '../../../CLI/dist/index.js'
  }

  const command = [
    (!noFolder && localCliPath) ? (env.NODE_PATH ?? 'node') : 'bunx',
    (!noFolder && localCliPath) ? localCliPath : '@capgo/cli@latest',
    ...params,
    ...((overwriteApiKey === undefined || overwriteApiKey.length > 0) ? ['--apikey', overwriteApiKey ?? APIKEY_TEST_ALL] : []),
    ...(overwriteSupaHost ? ['--supa-host', env.SUPABASE_URL ?? '', '--supa-anon', env.SUPABASE_ANON_KEY ?? ''] : []),
  ]

  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: basePath,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...env, FORCE_COLOR: '1' },
      timeout: 15000, // 15 second timeout
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('close', (_code) => {
      const output = stdout || stderr

      if (logOutput) {
        console.log(output)
      }

      resolve(output) // Always resolve with output for consistent error checking
    })

    child.on('error', (error) => {
      reject(error)
    })
  })
}

// Keep sync version for compatibility
export function runCliSync(params: string[], appId: string, logOutput = false, overwriteApiKey?: string, overwriteSupaHost?: boolean, noFolder?: boolean): string {
  const basePath = noFolder ? cwd() : tempFileFolder(appId)

  // When noFolder is true, always use bunx @capgo/cli@latest
  // When noFolder is false, check for local CLI setup
  let localCliPath = env.LOCAL_CLI_PATH
  if (!noFolder && localCliPath === 'true') {
    localCliPath = '../../../CLI/dist/index.js'
  }

  const command = [
    (!noFolder && localCliPath) ? (env.NODE_PATH ?? 'node') : 'bunx',
    (!noFolder && localCliPath) ? localCliPath : '@capgo/cli@latest',
    ...params,
    ...((overwriteApiKey === undefined || overwriteApiKey.length > 0) ? ['--apikey', overwriteApiKey ?? APIKEY_TEST_ALL] : []),
    ...(overwriteSupaHost ? ['--supa-host', env.SUPABASE_URL ?? '', '--supa-anon', env.SUPABASE_ANON_KEY ?? ''] : []),
  ].join(' ')

  const options: ExecSyncOptions = {
    cwd: basePath,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...env, FORCE_COLOR: '1' },
    timeout: 15000, // 15 second timeout
  }

  try {
    const output = execSync(command, options)
    if (logOutput) {
      console.log(output)
    }
    return output.toString()
  }
  catch (error: any) {
    if (logOutput) {
      console.error('CLI execution failed')
      console.error(error.stdout)
    }
    return error.stdout?.toString() ?? error.stderr?.toString() ?? error.message
  }
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
  // Group operations by appId to reuse setup
  const grouped = operations.reduce((acc, op) => {
    if (!acc[op.appId]) {
      acc[op.appId] = []
    }
    acc[op.appId].push(op)
    return acc
  }, {} as Record<string, typeof operations>)

  // Execute operations in parallel by appId
  const promises = Object.entries(grouped).map(async ([_appId, ops]) => {
    const appResults: string[] = []
    for (const op of ops) {
      const result = await runCli(
        op.params,
        op.appId,
        false,
        op.overwriteApiKey,
        op.overwriteSupaHost,
        op.noFolder,
      )
      appResults.push(result)
    }
    return appResults
  })

  const groupedResults = await Promise.all(promises)
  return groupedResults.flat()
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
