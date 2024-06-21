import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import rimraf from 'rimraf'

let appPath: string | null = null
let tempFileFolder = ''

const defaultApiKey = 'ae6e7458-c46d-4c00-aa3b-153b0b8520ea'

function generateDefaultJsonCliConfig(baseUrl: URL) {
  return {
    appId: 'com.demo.app',
    appName: 'demoApp',
    webDir: 'dist',
    plugins: {
      CapacitorUpdater: {
        autoUpdate: true,
        statsUrl: new URL('stats', baseUrl).toString(),
        channelUrl: new URL('channel_self', baseUrl).toString(),
        updateUrl: new URL('updates', baseUrl).toString(),
        localS3: true,
        localHost: 'http://localhost:5173',
        localWebHost: 'http://localhost:5173',
        localSupa: 'http://127.0.0.1:54321',
        localSupaAnon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
      },
    },
  }
}

function generateCliConfig(baseUrl: URL): string {
  return `import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = ${JSON.stringify(generateDefaultJsonCliConfig(baseUrl), null, 2)};

export default config;\n`
}

export async function prepareCli(backendBaseUrl: URL) {
  const defaultConfig = generateCliConfig(backendBaseUrl)
  // clean up temp folder
  tempFileFolder = path.join(process.cwd(), 'temp_cli_test')
  if (existsSync(tempFileFolder)) {
    rimraf.sync(tempFileFolder)
  }
  mkdirSync(tempFileFolder, { recursive: true })

  const capacitorConfigPath = path.join(tempFileFolder, 'capacitor.config.ts')
  writeFileSync(capacitorConfigPath, defaultConfig)

  mkdirSync(path.join(tempFileFolder, 'dist'), { recursive: true })
  writeFileSync(path.join(tempFileFolder, 'dist', 'index.js'), 'import { CapacitorUpdater } from \'@capgo/capacitor-updater\';\nconsole.log("Hello world!!!");\nCapacitorUpdater.notifyAppReady();')
  writeFileSync(path.join(tempFileFolder, 'dist', 'index.html'), '')

  appPath = tempFileFolder

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
  const command = [
    'npx',
    '@capgo/cli',
    ...params,
    '--ignore-metadata-check',
    '--apikey',
    overwriteApiKey ?? defaultApiKey,
  ].join(' ')

  try {
    const output = execSync(command, { cwd: appPath!, encoding: 'utf-8' })
    if (logOutput) {
      console.log(`CLI output:\n\n${output}`)
    }
    return output
  }
  catch (error) {
    console.error('CLI execution failed', error)
    throw error
  }
}
