import { exists } from 'https://deno.land/std@0.202.0/fs/mod.ts'
import {
  mergeReadableStreams,
} from 'https://deno.land/std@0.201.0/streams/merge_readable_streams.ts'
import { BlobReader, TextWriter, ZipReader } from 'https://deno.land/x/zipjs/index.js'
import { type RunnableTest, type SupabaseType, assert } from '../../utils.ts'
import { getSupabaseSecret, getUpdateBaseData, responseOk, sendUpdate, testPlaywright } from '../../utils.ts'

let cliPath: string | null = null
let appPath: string | null = null
let semver = `1.0.${Date.now()}`

// This comes from seed.sql
const defaultApiKey = 'ae6e7458-c46d-4c00-aa3b-153b0b8520ea'
const defaultPackageJson = `{
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
const indexJsCode
= `console.log('Hello world!!!');
notifyAppReady();\n`

let tempFileFolder = ''
let dependencies = {} as Record<string, string>

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
      {
        name: 'Test selectable disallow upload',
        test: testSelectableDisallow,
        timesToExecute: 1,
      },
      {
        name: 'Test compatibility table',
        test: testCompatibilityTable,
        timesToExecute: 1,
      },
    ],
  }
}

async function prepareCli(backendBaseUrl: URL, supabase: SupabaseType) {
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
  tempFileFolder = await Deno.makeTempDir()
  const capacitorConfigPath = `${tempFileFolder}/capacitor.config.ts`
  await Deno.writeTextFile(capacitorConfigPath, defaultConfig)
  await Deno.mkdir(`${tempFileFolder}/dist`)
  await Deno.writeTextFile(`${tempFileFolder}/dist/index.js`, indexJsCode)
  await Deno.writeTextFile(`${tempFileFolder}/dist/index.html`, '')
  await Deno.writeTextFile(`${tempFileFolder}/package.json`, defaultPackageJson.replace('%DEPENDENCIES%', JSON.stringify(dependencies)))

  appPath = tempFileFolder

  await pnpmInstall()

  // We set the channel update scheme to major
  // id 22 = production
  const { error } = await supabase.from('channels').update({ disableAutoUpdate: 'major' }).eq('id', 22)

  assert(error === null, `Supabase channel update error ${JSON.stringify(error)} is not null`)
}

async function pnpmInstall() {
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
}

async function runCli(params: string[], logOutput = false): Promise<string> {
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

  if (logOutput)
    console.log(`final CLI output: \n\n${finalString}}`)
  return finalString
}

async function uploadToCloud(_backendBaseUrl: URL, _supabase: SupabaseType) {
  // We do not care about the output, if it fails the runCli will throw an error
  // Also we log output
  await runCli(['bundle', 'upload', '-b', semver, '-c', 'production'], true)
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

  assert(entries.length === 2, `Zip file does not have 2 entries! (${entries.length} entries)`)
  const entry = entries.find(e => e.filename.includes('index.js'))
  assert(entry !== undefined, 'Zip file does not have index.js entry!')
  const firstEntryText = await entry!.getData!(new TextWriter())
  await zipReader.close()

  assert(firstEntryText === indexJsCode, `Zip file entry (${firstEntryText}) is not equal to ${indexJsCode}`)
}

async function testSelectableDisallow(_backendBaseUrl: URL, supabase: SupabaseType) {
  // We set the channel update scheme to version_number, then will revert it back to major
  // 22 = channel 'production'
  const { error } = await supabase.from('channels').update({ disableAutoUpdate: 'version_number' }).eq('id', 22)

  assert(error === null, `Supabase channel update error ${JSON.stringify(error)} is not null`)

  try {
    // Test if the cli will fail without metadata
    const cliOutput1 = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production'])
    assert(cliOutput1.includes('to provide a min-update-version'), `CLI output does not include 'to provide a min-update-version'. CLI output:\n${cliOutput1}`)

    // Test if the cli will fail if the metadata does not follow semver
    const cliOutput2 = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--min-update-version', 'invalid'])
    assert(cliOutput2.includes('should follow semver convention'), `CLI output does not include 'should follow semver convention'. CLI output:\n${cliOutput2}`)
  }
  finally {
    // We set the channel update scheme to major
    const { error } = await supabase.from('channels').update({ disableAutoUpdate: 'major' }).eq('id', 22)

    assert(error === null, `Supabase channel update error (2) ${JSON.stringify(error)} is not null`)
  }
}

async function testCompatibilityTable(_backendBaseUrl: URL, _supabase: SupabaseType) {
  dependencies = {
    '@capacitor/android': '^4.5.0',
  }
  await Deno.writeTextFile(`${tempFileFolder}/package.json`, defaultPackageJson.replace('%DEPENDENCIES%', JSON.stringify(dependencies)))

  await pnpmInstall()

  let cliTableOutput = await runCli(['bundle', 'compatibility', '-c', 'production'])
  let androidPackage = cliTableOutput.split('\n').find(l => l.includes('@capacitor/android'))

  assert(androidPackage !== undefined, 'Android package is not found in compatibility table')
  let androidPackageSplit = androidPackage!.split('│').slice(2, -1)
  assert(androidPackageSplit.length === 4, `Android package does not have 4 columns (It has ${androidPackageSplit.length} columns)`)

  assert(androidPackageSplit[1].includes('4.5.0'), `Android local package version is not 4.5.0 (It is ${androidPackageSplit[1]})`)
  assert(androidPackageSplit[0].includes('@capacitor/android'), `Android package name is not @capacitor/android (It is ${androidPackageSplit[0]})`)
  assert(androidPackageSplit[2].includes('None'), `Android remote package version is not none (It is ${androidPackageSplit[2]})`)
  assert(androidPackageSplit[3].includes('❌'), `Android compatible is not a red cross (It is ${androidPackageSplit[3]})`)

  // Let's upload now a new version
  const lastNumber = Number.parseInt(semver.charAt(semver.length - 1))
  const newSemver = `${semver.slice(0, -1)}${(lastNumber + 1).toString()}`

  semver = newSemver
  const uploadCli = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production'])
  assert(uploadCli.includes('Time to share your update to the world'), `CLI output does not include 'Time to share your update to the world'. CLI output:\n${uploadCli}`)

  // Let's re run the compatibility table
  cliTableOutput = await runCli(['bundle', 'compatibility', '-c', 'production'])
  androidPackage = cliTableOutput.split('\n').find(l => l.includes('@capacitor/android'))

  assert(androidPackage !== undefined, 'Android package is not found in compatibility table')
  androidPackageSplit = androidPackage!.split('│').slice(2, -1)
  assert(androidPackageSplit.length === 4, `Android package does not have 4 columns (It has ${androidPackageSplit.length} columns)`)

  assert(androidPackageSplit[1].includes('4.5.0'), `Android local package version is not 4.5.0 (It is ${androidPackageSplit[1]})`)
  assert(androidPackageSplit[0].includes('@capacitor/android'), `Android package name is not @capacitor/android (It is ${androidPackageSplit[0]})`)
  assert(androidPackageSplit[2].includes('4.5.0'), `Android remote package version is not none (It is ${androidPackageSplit[2]})`)
  assert(androidPackageSplit[3].includes('✅'), `Android compatible is not a red cross (It is ${androidPackageSplit[3]})`)

  // Now let's remove the package and run the compatibility table again
  dependencies = {}
  await Deno.writeTextFile(`${tempFileFolder}/package.json`, defaultPackageJson.replace('%DEPENDENCIES%', JSON.stringify(dependencies)))

  cliTableOutput = await runCli(['bundle', 'compatibility', '-c', 'production'])
  androidPackage = cliTableOutput.split('\n').find(l => l.includes('@capacitor/android'))

  assert(androidPackage !== undefined, 'Android package is not found in compatibility table')
  androidPackageSplit = androidPackage!.split('│').slice(2, -1)
  assert(androidPackageSplit.length === 4, `Android package does not have 4 columns (It has ${androidPackageSplit.length} columns)`)

  assert(androidPackageSplit[1].includes('None'), `Android local package version is not 4.5.0 (It is ${androidPackageSplit[1]})`)
  assert(androidPackageSplit[0].includes('@capacitor/android'), `Android package name is not @capacitor/android (It is ${androidPackageSplit[0]})`)
  assert(androidPackageSplit[2].includes('4.5.0'), `Android remote package version is not none (It is ${androidPackageSplit[2]})`)
  assert(androidPackageSplit[3].includes('❌'), `Android compatible is not a red cross (It is ${androidPackageSplit[3]})`)
}

async function testFrontend(_backendBaseUrl: URL, _supabase: SupabaseType) {
  await testPlaywright('bundle.spec.ts', {
    BUNDLE: semver,
  })
}
