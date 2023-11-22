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
      {
        name: 'Test auto minAutoUpdate flag',
        test: testAutoMinVersionFlag,
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
    args: ['install', '--no-frozen-lockfile'],
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

function increaseSemver() {
  const lastNumber = Number.parseInt(semver.charAt(semver.length - 1))
  const newSemver = `${semver.slice(0, -1)}${(lastNumber + 1).toString()}`
  semver = newSemver
}

async function testCompatibilityTable(_backendBaseUrl: URL, _supabase: SupabaseType) {
  dependencies = {
    '@capacitor/android': '^4.5.0',
  }
  await Deno.writeTextFile(`${tempFileFolder}/package.json`, defaultPackageJson.replace('%DEPENDENCIES%', JSON.stringify(dependencies)))

  await pnpmInstall()

  async function assertCompatibilityTableColumns(column1: string, column2: string, column3: string, column4: string) {
    const cliTableOutput = await runCli(['bundle', 'compatibility', '-c', 'production'])
    const androidPackage = cliTableOutput.split('\n').find(l => l.includes('@capacitor/android'))

    assert(androidPackage !== undefined, 'Android package is not found in compatibility table')
    const androidPackageSplit = androidPackage!.split('│').slice(2, -1)
    assert(androidPackageSplit.length === 4, `Android package does not have 4 columns (It has ${androidPackageSplit.length} columns)`)

    assert(androidPackageSplit[0].includes(column1), `Android package name is not ${column1} (It is ${androidPackageSplit[0]})`)
    assert(androidPackageSplit[1].includes(column2), `Android local package version is not ${column2} (It is ${androidPackageSplit[1]})`)
    assert(androidPackageSplit[2].includes(column3), `Android remote package version is not ${column3} (It is ${androidPackageSplit[2]})`)
    assert(androidPackageSplit[3].includes(column4), `Android compatible is not a ${column4} (It is ${androidPackageSplit[3]})`)
  }

  await assertCompatibilityTableColumns('@capacitor/android', '4.5.0', 'None', '❌')

  // Let's upload now a new version
  increaseSemver()

  // Re run the upload
  const uploadCli = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production'])
  assert(uploadCli.includes('Time to share your update to the world'), `CLI output does not include 'Time to share your update to the world'. CLI output:\n${uploadCli}`)

  // Let's re run the compatibility table
  await assertCompatibilityTableColumns('@capacitor/android', '4.5.0', '4.5.0', '✅')

  // Now let's remove the package and run the compatibility table again
  dependencies = {}
  await Deno.writeTextFile(`${tempFileFolder}/package.json`, defaultPackageJson.replace('%DEPENDENCIES%', JSON.stringify(dependencies)))

  await assertCompatibilityTableColumns('@capacitor/android', 'None', '4.5.0', '❌')

  await pnpmInstall()
}

async function testAutoMinVersionFlag(_backendBaseUrl: URL, supabase: SupabaseType) {
  // At this stage the lastest upload has the `@capacitor/android`. We do NOT have this package installed thus the new upload will not be compatible
  // Let's upload now a new version and check if this statement is correct

  async function uploadWithAutoFlagWithAssert(expected: string): Promise<string> {
    const uploadCliOutput = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--auto-min-update-version'])
    const minUpdateVersion = uploadCliOutput.split('\n').find(l => l.includes('Auto set min-update-version'))
    assert(minUpdateVersion !== undefined, `Auto min update version not found in the cli output. CLI output:\n${uploadCliOutput}`)

    assert(minUpdateVersion!.includes(expected), `Auto min update version is not ${expected} (It is ${minUpdateVersion})`)
    return uploadCliOutput
  }

  // Let's upload now a new version
  increaseSemver()
  await uploadWithAutoFlagWithAssert(semver)

  // Now, the next update SHOULD have the min-update-version set to the previous version
  const expected = semver
  increaseSemver()
  await uploadWithAutoFlagWithAssert(expected)

  // Let's continue. We can remove the min_update_version from the channel and check if the auto flag will work
  // PS: It should not

  const { error } = await supabase
    .from('app_versions')
    .update({ minUpdateVersion: null })
    .eq('name', semver)

  assert(error === null, `Supabase set app version error ${JSON.stringify(error)} is not null`)

  // Now let's upload a new version and see if it fails
  const uploadCliOutput = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production', '--auto-min-update-version'])
  assert(uploadCliOutput.includes('skipping auto setting compatibility'), `CLI output does not include 'skipping auto setting compatibility'. CLI output:\n${uploadCliOutput}`)

  // Now let's give back the min_update_version to the version but remove the entire manifest to see if this change is backward compatible
  // 1.0.0 is not important, this is just a placeholder
  const { error: error2 } = await supabase
    .from('app_versions')
    .update({ minUpdateVersion: '1.0.0', native_packages: null })
    .eq('name', semver)

  assert (error2 === null, `Supabase set app version error 2 ${JSON.stringify(error2)} is not null`)

  // Now let's upload a new version and see if it works, but has the warning
  // The expected is the new semver, as without the manifest we assume the update to be breaking
  increaseSemver()
  const uploadCliOutput2 = await uploadWithAutoFlagWithAssert(semver)

  assert(uploadCliOutput2.includes(
    'it\'s your first upload with compatibility check'),
    `CLI output does not include \"it\'s your first upload with compatibility check\". CLI output:\n${uploadCliOutput2}`,
  )
}

async function testFrontend(_backendBaseUrl: URL, _supabase: SupabaseType) {
  await testPlaywright('bundle.spec.ts', {
    BUNDLE: semver,
  })
}
