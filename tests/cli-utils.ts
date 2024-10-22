import type { ExecSyncOptions } from 'node:child_process'
import type { Readable } from 'node:stream'
import { execSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cwd, env } from 'node:process'
import { sync } from 'rimraf'
import { APIKEY_TEST, BASE_URL } from './test-utils'

export const TEMP_DIR_NAME = 'temp_cli_test'
export const BASE_PACKAGE_JSON = `{
  "name": "test-cli-app",
  "version": "1.0.0",
  "description": "An Amazing Test App",
  "dependencies": %DEPENDENCIES%,
  "devDependencies": {
    "@capacitor/cli": "^5.4.1",
    "typescript": "^5.2.2"
  },
  "author": ""
}`
export const BASE_DEPENDENCIES = {
  '@capacitor/android': '^6.0.0',
}
export const tempFileFolder = join(cwd(), TEMP_DIR_NAME)

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

export function setDependencies(dependencies: Record<string, string>) {
  // write package.json
  const pathPack = join(tempFileFolder, 'package.json')
  const res = BASE_PACKAGE_JSON.replace('%DEPENDENCIES%', JSON.stringify(dependencies, null, 2))
  writeFileSync(pathPack, res)
}

export async function prepareCli(appId: string) {
  const defaultConfig = generateCliConfig(appId)
  // clean up temp folder
  if (existsSync(tempFileFolder)) {
    sync(tempFileFolder)
  }
  mkdirSync(tempFileFolder, { recursive: true })

  const capacitorConfigPath = join(tempFileFolder, 'capacitor.config.ts')
  writeFileSync(capacitorConfigPath, defaultConfig)

  mkdirSync(join(tempFileFolder, 'dist'), { recursive: true })
  writeFileSync(join(tempFileFolder, 'dist', 'index.js'), 'import { CapacitorUpdater } from \'@capgo/capacitor-updater\';\nconsole.log("Hello world!!!");\nCapacitorUpdater.notifyAppReady();')
  writeFileSync(join(tempFileFolder, 'dist', 'index.html'), '')
  setDependencies(BASE_DEPENDENCIES)

  npmInstall()
}

function npmInstall() {
  try {
    execSync(`${env.BUN_PATH ?? 'bun'} install`, { cwd: tempFileFolder, stdio: 'inherit' })
  }
  catch (error) {
    console.error('bun install failed', error)
    throw error
  }
}

export async function runCliWithStdIn(params: string[], handleOutput: (dataIn: string) => string) {
  let localCliPath = env.LOCAL_CLI_PATH
  if (localCliPath === 'true') {
    localCliPath = '../../CLI/dist/index.js'
  }
  const toResolve = Promise.withResolvers<string>()
  let outData = ''
  const child = spawn(localCliPath ? (env.NODE_PATH ?? 'node') : 'bunx', [localCliPath || '@capgo/cli', ...params], {
    stdio: ['pipe', 'pipe', 'pipe'], // Ensure you have access to stdin, stdout, stderr
  })

  // Collect data from stdout
  child.stdout.on('data', (data) => {
    outData += data.toString()
    const inData = handleOutput(data.toString())
    if (inData) {
      child.stdin.write(inData)
    }
  })

  // Collect data from stderr
  child.stderr.on('data', (data) => {
    outData += data.toString()
    const inData = handleOutput(data.toString())
    if (inData) {
      child.stdin.write(inData)
    }
  })

  child.on('close', (code) => {
    if (code === 0) {
      toResolve.resolve(outData)
    }
    else {
      toResolve.reject(outData)
    }
  })

  return toResolve.promise
}

export function runCli(params: string[], logOutput = false, overwriteApiKey?: string): string {
  // console.log(params)
  let localCliPath = env.LOCAL_CLI_PATH
  if (localCliPath === 'true') {
    localCliPath = '../../CLI/dist/index.js'
  }
  // console.log('localCliPath', localCliPath)
  const command = [
    localCliPath ? (env.NODE_PATH ?? 'node') : 'bunx',
    localCliPath || '@capgo/cli',
    ...params,
    ...((overwriteApiKey === undefined || overwriteApiKey.length > 0) ? ['--apikey', overwriteApiKey ?? APIKEY_TEST] : []),
  ].join(' ')

  const options: ExecSyncOptions = {
    cwd: tempFileFolder!,
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
    console.error(localCliPath ? 'Local CLI execution failed' : 'CLI execution failed', errorOutput)

    if (logOutput)
      console.log(errorOutput)

    return errorOutput
  }
}
