import { exists } from 'https://deno.land/std@0.202.0/fs/mod.ts'
import {
  mergeReadableStreams,
} from 'https://deno.land/std@0.201.0/streams/merge_readable_streams.ts'
import { BlobReader, TextWriter, ZipReader } from 'https://deno.land/x/zipjs/index.js'
import { type RunnableTest, type SupabaseType, assert } from '../../utils.ts'
import { getSupabaseSecret, getUpdateBaseData, responseOk, sendUpdate, testPlaywright } from '../../utils.ts'

let cliPath: string | null = null
let appPath: string | null = null
const semver = `1.0.${Date.now()}`

// This comes from seed.sql
const defaultApiKey = 'ae6e7458-c46d-4c00-aa3b-153b0b8520ea'
const defaultPackageJson = `{
  "name": "test-cli-app",
  "version": "1.0.0",
  "description": "An Amazing Test App",
  "dependencies": {
  },
  "devDependencies": {
    "@capacitor/cli": "^5.4.1",
    "typescript": "^5.2.2"
  },
  "author": ""
}`
const indexJsCode
= `console.log('Hello world!!!');
notifyAppReady();\n`

function generateDefaultJsonCliConfig(baseUrl: URL) {
  return {
    appId: 'com.demo.app',
    appName: 'demoApp',
    webDir: 'dist',
    bundledWebRuntime: false,
    plugins: {
      CapacitorUpdater: {
        autoUpdate: true,
        localS3: true,
        localHost: 'http://localhost:5173',
        localWebHost: 'http://localhost:5173',
        localSupa: `http://${baseUrl.host}`,
        localSupaAnon: getSupabaseSecret(),
        statsUrl: new URL('stats', baseUrl).toString(),
        channelUrl: new URL('channel_self', baseUrl).toString(),
        updateUrl: new URL('updates', baseUrl).toString(),
      },
    },
  }
}

function generateCliConfig(baseUrl: URL): string {
  return `import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = ${JSON.stringify(generateDefaultJsonCliConfig(baseUrl), null, 2)};

export default config;\n`
}

export function getTest(): RunnableTest {
  return {
    fullName: 'Test cli',
    testWithRedis: false,
    tests: [
      {
        name: 'Prepare cli',
        test: prepareCli,
        timesToExecute: 1,
      },
      {
        name: 'Upload bundle to cloud',
        test: uploadToCloud,
        timesToExecute: 1,
      },
      {
        name: 'Downlaod from upload endpoint',
        test: checkDownload,
        timesToExecute: 1,
      },
      {
        name: 'Test frontend',
        test: testFrontend,
        timesToExecute: 1,
      },
    ],
  }
}

async function prepareCli(backendBaseUrl: URL, _supabase: SupabaseType) {
  const path = Deno.env.get('CLI_PATH')
  assert(path !== undefined, 'CLI_PATH is not defined')

  const indexPathRelative = `${path}/dist/index.js`
  const fileExists = await exists(indexPathRelative, {
    isReadable: true,
    isFile: true,
  })
  assert(fileExists, `File ${indexPathRelative} does not exist`)

  cliPath = await Deno.realPath(indexPathRelative)

  const defaultConfig = generateCliConfig(backendBaseUrl)
  const tempFileFolder = await Deno.makeTempDir()
  const capacitorConfigPath = `${tempFileFolder}/capacitor.config.ts`
  await Deno.writeTextFile(capacitorConfigPath, defaultConfig)
  await Deno.mkdir(`${tempFileFolder}/dist`)
  await Deno.writeTextFile(`${tempFileFolder}/dist/index.js`, indexJsCode)
  await Deno.writeTextFile(`${tempFileFolder}/dist/index.html`, '')
  await Deno.writeTextFile(`${tempFileFolder}/package.json`, defaultPackageJson)

  const pnpmInstallCommand = new Deno.Command('pnpm', {
    args: ['install'],
    cwd: tempFileFolder,
  })

  const result = await pnpmInstallCommand.output()

  if (result.code !== 0) {
    const textDecoder = new TextDecoder()
    const stdout = textDecoder.decode(result.stdout)
    const stderr = textDecoder.decode(result.stderr)

    console.log('stdout', stdout)
    console.log('stderr', stderr)
    throw new Error('pnpm install failed')
  }

  appPath = tempFileFolder
}

async function runCli(params: string[]): Promise<string> {
  const command = new Deno.Command('node', {
    args: [cliPath!, ...params, '--apikey', defaultApiKey],
    cwd: appPath!,
    stdout: 'piped',
    stderr: 'piped',
  })

  const subprocess = command.spawn()
  const joinedStream = mergeReadableStreams(
    subprocess.stdout,
    subprocess.stderr,
  )

  const _ = await subprocess.status
  const reader = joinedStream.getReader()
  let finalString = ''

  while (true) {
    const chunk = await reader.read()
    if (chunk.done)
      break

    const string = new TextDecoder('utf-8').decode(chunk.value)
    finalString += string
  }

  console.log(`final CLI output: \n\n${finalString}}`)
  return finalString
}

async function uploadToCloud(_backendBaseUrl: URL, _supabase: SupabaseType) {
  // We do not care about the output, if it fails the runCli will throw an error
  await runCli(['bundle', 'upload', '-b', semver, '-c', 'production'])
}

async function checkDownload(backendBaseUrl: URL, _supabase: SupabaseType) {
  const baseData = getUpdateBaseData()
  const response = await sendUpdate(backendBaseUrl, baseData)
  await responseOk(response, 'Update new bundle')

  const responseJson = await response.json()
  assert(responseJson.url !== undefined, `Response ${JSON.stringify(responseJson)} has no url`)
  assert(responseJson.version !== undefined, `Response ${JSON.stringify(responseJson)} has no version`)
  assert(responseJson.version === semver, `Response ${JSON.stringify(responseJson)} version is not equal to ${semver}`)

  const downloadUrl = responseJson.url
  const downloadResponse = await fetch(downloadUrl)
  await responseOk(downloadResponse, 'Download new bundle')
  const file = await downloadResponse.blob()

  const zipFileReader = new BlobReader(file)
  const zipReader = new ZipReader(zipFileReader)
  const entries = await zipReader.getEntries()

  assert(entries.length === 1, `Zip file has more than one entry: ${entries.length}`)
  const entry = entries[0]
  const firstEntryText = await entry.getData!(new TextWriter())
  await zipReader.close()

  assert(firstEntryText === indexJsCode, `Zip file entry (${firstEntryText}) is not equal to ${indexJsCode}`)
}

async function testFrontend(_backendBaseUrl: URL, _supabase: SupabaseType) {
  await testPlaywright('bundle.spec.ts', {
    BUNDLE: semver,
  })
}
