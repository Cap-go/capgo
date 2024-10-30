import type { ExecSyncOptions } from 'node:child_process'
import type { Readable } from 'node:stream'
import { execSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cwd, env } from 'node:process'
import { sync as rimrafSync } from 'rimraf'
import { APIKEY_TEST, BASE_URL } from './test-utils'

export const TEMP_DIR_NAME = 'temp_cli_test'
export const BASE_PACKAGE_JSON = `{
  "name": "%APPID%",
  "version": "1.0.0",
  "description": "An Amazing Test App",
  "dependencies": %DEPENDENCIES%,
  "devDependencies": {
    "@capacitor/cli": "^6.1.2",
    "typescript": "^5.2.2"
  },
  "author": ""
}`
export const BASE_DEPENDENCIES = {
  '@capacitor/android': '^6.0.0',
}
export const tempFileFolder = (id: string) => join(cwd(), TEMP_DIR_NAME, id)

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

export function setDependencies(dependencies: Record<string, string>, id: string, appId: string) {
  // write package.json
  const pathPack = join(tempFileFolder(id), 'package.json')
  const res = BASE_PACKAGE_JSON.replace('%APPID%', appId).replace('%DEPENDENCIES%', JSON.stringify(dependencies, null, 2))
  writeFileSync(pathPack, res)
}
export function deleteAllTempFolders() {
  console.log('Deleting all temp folders')
  rimrafSync(TEMP_DIR_NAME)
}
export async function prepareCli(appId: string, id: string) {
  const defaultConfig = generateCliConfig(appId)
  // clean up temp folder
  if (existsSync(tempFileFolder(id))) {
    rimrafSync(tempFileFolder(id))
  }
  mkdirSync(tempFileFolder(id), { recursive: true })

  const capacitorConfigPath = join(tempFileFolder(id), 'capacitor.config.ts')
  writeFileSync(capacitorConfigPath, defaultConfig)

  mkdirSync(join(tempFileFolder(id), 'dist'), { recursive: true })
  writeFileSync(join(tempFileFolder(id), 'dist', 'index.js'), 'import { CapacitorUpdater } from \'@capgo/capacitor-updater\';\nconsole.log("Hello world!!!");\nCapacitorUpdater.notifyAppReady();')
  writeFileSync(join(tempFileFolder(id), 'dist', 'index.html'), '')
  setDependencies(BASE_DEPENDENCIES, id, appId)

  npmInstall(id)
}

function npmInstall(id: string) {
  try {
    execSync('bun install', { cwd: tempFileFolder(id), stdio: 'inherit' })
  }
  catch (error) {
    console.error('bun install failed', error)
    throw error
  }
}

export function runCli(params: string[], id: string, logOutput = false, overwriteApiKey?: string): string {
  let localCliPath = env.LOCAL_CLI_PATH
  if (localCliPath === 'true') {
    localCliPath = '../../../CLI/dist/index.js'
  }
  const command = [
    localCliPath ? (env.NODE_PATH ?? 'node') : 'bunx',
    localCliPath || '\'@capgo/cli\'',
    ...params,
    ...((overwriteApiKey === undefined || overwriteApiKey.length > 0) ? ['--apikey', overwriteApiKey ?? APIKEY_TEST] : []),
  ].join(' ')

  const options: ExecSyncOptions = {
    cwd: tempFileFolder(id),
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...env, FORCE_COLOR: '1' },
  }

  try {
    const output = execSync(command, options)

    if (logOutput)
      console.log(output)

    return output.toString()
  }
  catch (error) {
    const errorOutput = (error as { stdout: Readable }).stdout?.toString() ?? JSON.stringify(error)
    if (logOutput)
      console.error(errorOutput)

    return errorOutput
  }
}
