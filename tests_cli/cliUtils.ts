import type { ExecSyncOptions } from 'node:child_process'
import type { Readable } from 'node:stream'
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import rimraf from 'rimraf'

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
  '@capacitor/android': '^4.5.0',
}
const tempFileFolder = path.join(process.cwd(), TEMP_DIR_NAME)

const defaultApiKey = 'ae6e7458-c46d-4c00-aa3b-153b0b8520ea'

function generateDefaultJsonCliConfig(baseUrl: URL) {
  return {
    appId: 'com.demo.app',
    appName: 'demoApp',
    webDir: 'dist',
    plugins: {
      CapacitorUpdater: {
        autoUpdate: true,
        statsUrl: new URL(`${baseUrl.href}/stats`, baseUrl).toString(),
        channelUrl: new URL(`${baseUrl.href}/channel_self`, baseUrl).toString(),
        updateUrl: new URL(`${baseUrl.href}/updates`, baseUrl).toString(),
        localS3: true,
        localHost: 'http://localhost:5173',
        localWebHost: 'http://localhost:5173',
        localSupa: 'http://localhost:54321',
        localSupaAnon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
        localApiFiles: 'http://localhost:54321/functions/v1',
      },
    },
  }
}

function generateCliConfig(baseUrl: URL): string {
  return `import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = ${JSON.stringify(generateDefaultJsonCliConfig(baseUrl), null, 2)};

export default config;\n`
}

export function setDependencies(dependencies: Record<string, string>) {
  // write package.json
  const pathPack = path.join(tempFileFolder, 'package.json')
  const res = BASE_PACKAGE_JSON.replace('%DEPENDENCIES%', JSON.stringify(dependencies, null, 2))
  writeFileSync(pathPack, res)
}

export async function prepareCli(backendBaseUrl: URL) {
  const defaultConfig = generateCliConfig(backendBaseUrl)
  // clean up temp folder
  if (existsSync(tempFileFolder)) {
    rimraf.sync(tempFileFolder)
  }
  mkdirSync(tempFileFolder, { recursive: true })

  const capacitorConfigPath = path.join(tempFileFolder, 'capacitor.config.ts')
  writeFileSync(capacitorConfigPath, defaultConfig)

  mkdirSync(path.join(tempFileFolder, 'dist'), { recursive: true })
  writeFileSync(path.join(tempFileFolder, 'dist', 'index.js'), 'import { CapacitorUpdater } from \'@capgo/capacitor-updater\';\nconsole.log("Hello world!!!");\nCapacitorUpdater.notifyAppReady();')
  writeFileSync(path.join(tempFileFolder, 'dist', 'index.html'), '')
  setDependencies(BASE_DEPENDENCIES)

  await npmInstall()
}

function npmInstall() {
  try {
    execSync('bun install', { cwd: tempFileFolder, stdio: 'inherit' })
  }
  catch (error) {
    console.error('bun install failed', error)
    throw error
  }
}

export function runCli(params: string[], logOutput = false, overwriteApiKey?: string): string {
  let localCliPath = process.env.LOCAL_CLI_PATH
  if (localCliPath === 'true') {
    localCliPath = '../../CLI/dist/index.js'
  }
  console.log('localCliPath', localCliPath)
  const command = [
    localCliPath ? 'node' : 'npx',
    localCliPath || '@capgo/cli',
    ...params,
    '--apikey',
    overwriteApiKey ?? defaultApiKey,
  ].join(' ')

  const options: ExecSyncOptions = {
    cwd: tempFileFolder!,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '1' },
  }

  try {
    const output = execSync(command, options)

    if (logOutput)
      console.log(output)

    return output.toString()
  }
  catch (error) {
    const errorOutput = (error as { stdout: Readable }).stdout?.toString() ?? JSON.stringify(error)
    console.error(useLocalCli ? 'Local CLI execution failed' : 'CLI execution failed', errorOutput)

    if (logOutput)
      console.log(errorOutput)

    return errorOutput
  }
}
