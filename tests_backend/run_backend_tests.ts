// We make some assumtion when running these tests:
// - We have a supabase instance running on localhost:5432

import {
  mergeReadableStreams,
} from 'https://deno.land/std@0.201.0/streams/merge_readable_streams.ts'

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@^2.38.5'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@^2.38.5'

import * as p from 'npm:@clack/prompts@0.7.0'

import type { Database } from '../supabase/functions/_backend/utils/supabase.types.ts'
import { setSupabaseSecrets } from './utils.ts'
import type { RunnableTest, SupabaseType, Test } from './utils.ts'

let supabaseProcess: Deno.ChildProcess | null = null
let joined: ReadableStream<Uint8Array> | null = null
let supabase: SupabaseClient<Database> | null = null
let functionsUrl: URL | null = null
let tempEnvFilePath: string | null = null
const envFilePath = await getEnvFile()

async function getAdminSupabaseTokens(): Promise<{ url: string, serviceKey: string, anonToken: string, postgressRawUrl: string }> {
  const command = new Deno.Command('supabase', {
    args: [
      'status',
    ],
  })

  const { code, stdout, stderr: _ } = await command.output()
  if (code !== 0)
    p.log.error('Cannot get supabase tokens')

  const output = new TextDecoder().decode(stdout)
  const separateLines = output.split(/\r?\n|\r|\n/g)
  let adminToken = separateLines.find(line => line.includes('service_role'))
  let url = separateLines.find(line => line.includes('API URL'))
  let anonToken = separateLines.find(line => line.includes('anon'))
  let postgressRawUrl = separateLines.find(line => line.includes('DB URL'))

  if (!adminToken || !url || !anonToken || !postgressRawUrl) {
    p.log.error('Cannot get supabase tokens')
    console.log('output\n', output)
    Deno.exit(1)
  }

  adminToken = adminToken.replace('service_role key: ', '').trim()
  url = url.replace('API URL: ', '').trim()
  anonToken = anonToken.replace('anon key: ', '').trim()
  postgressRawUrl = postgressRawUrl.replace('DB URL: ', '').trim()

  return {
    serviceKey: adminToken,
    url,
    anonToken,
    postgressRawUrl,
  }
}

async function genTempEnvFile(): Promise<string> {
  const tempFilePath = await Deno.makeTempFile()
  const exampleEnvFile = await Deno.readTextFile('supabase/.env.example')
  let tempEnvFile = `${exampleEnvFile}\n`

  const minioUrl = Deno.env.get('MINIO_URL')
  if (minioUrl)
    tempEnvFile = tempEnvFile.replace('host.docker.internal', minioUrl)

  await Deno.writeTextFile(tempFilePath, tempEnvFile)
  return tempFilePath
}

async function getEnvFile() {
  const envFilePath = `./supabase/.env.example`

  const minioUrl = Deno.env.get('MINIO_URL')
  if (minioUrl) {
    p.log.info(`Minio URL is not null (${minioUrl}), creating a new env file...`)
    const tempEnvFile = await Deno.makeTempFile()
    const readEnvFile = await Deno.readTextFile(envFilePath)
    const fileContent = readEnvFile.replace('host.docker.internal', minioUrl)
    await Deno.writeTextFile(tempEnvFile, fileContent)
    return tempEnvFile
  }

  return envFilePath
}

export async function connectToSupabase() {
  try {
    const { serviceKey, url, anonToken, postgressRawUrl } = await getAdminSupabaseTokens()
    setSupabaseSecrets(serviceKey, anonToken, url, postgressRawUrl)
    const options = {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    }
    supabase = createClient<Database>(url, serviceKey, options)
  }
  // deno-lint-ignore no-explicit-any
  catch (e: any) {
    console.error('Cannot create supabase client', e.stack)
    Deno.exit(1)
  }
}

async function startSupabaseBackend(
  envFile?: string,
) {
  const command = new Deno.Command('supabase', {
    args: [
      'functions',
      'serve',
      '--env-file',
      envFilePath,
    ],
    stdout: 'piped',
    stderr: 'piped',
  })

  supabaseProcess = command.spawn()

  const joinedStream = mergeReadableStreams(
    supabaseProcess.stdout,
    supabaseProcess.stderr,
  )

  const [first, second] = joinedStream.tee()
  joined = first

  const reader = second.getReader()
  let totalOut = ''
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) {
      if (!functionsUrl) {
        p.log.error('Something went wrong, functions url are not defined!')
        const string = new TextDecoder('utf-8').decode(chunk.value)
        console.log(`Last output: ${string}`)
      }
      break
    }

    const string = new TextDecoder('utf-8').decode(chunk.value)
    console.log('out', string)
    totalOut = `${totalOut}|${string}`
    if (string.includes('Serving functions on')) {
      p.log.success('Supabase backend started')
      const split = string.split(' ')
      functionsUrl = new URL(split[split.length - 1].trim().replace('<function-name>', ''))
      break
    }

    // await delay(10_000)
  }
}

function killSupabase() {
  if (!supabaseProcess || !joined) {
    console.error('supabase process not running or joined stream is null')
    return
  }

  p.log.info('Killing supabase with SIGTERM')
  supabaseProcess.kill('SIGTERM')
}

function killSupabaseAndOutput() {
  killSupabase()

  p.log.info('Supabase output:')
  joined?.pipeTo(Deno.stdout.writable)
}

async function testLoop(functionsUrl: URL, supabase: SupabaseType, tests: Test[]): Promise<boolean> {
  let ok = true
  for (const test of tests) {
    for (let i = 0; i < test.timesToExecute; i++) {
      p.log.info(`Running test (${i + 1}/${test.timesToExecute}): \"${test.name}\"`)

      try {
        await test.test(functionsUrl, supabase)
      }
      // deno-lint-ignore no-explicit-any
      catch (e: any) {
        ok = false
        p.log.error(`Test ${test.name} failed with error:\n ${e.stack}`)
        await killSupabaseAndOutput()

        // One second before exiting so that the output is printed

        await new Promise((_resolve) => {
          setTimeout(() => {
            Deno.exit(1)
          }, 1000)
        })
      }

      if (ok)
        p.log.success(`Test \"${test.name}\" passed (${i + 1}/${test.timesToExecute})`)
    }
  }
  return ok
}

async function runTestsForFolder(folder: string, shortName: string, _firstArg: string) {
  p.log.info('Generating temp ENV file for test...')
  tempEnvFilePath = await genTempEnvFile()
  p.log.info(`Temp ENV file generated at ${tempEnvFilePath}`)

  for await (const dirEntry of Deno.readDir(folder)) {
    const firstArg = Deno.args[0]

    // this last conditions checks if we are supposed to run all tests or just the specific one
    // Like /test cli will run only tests from the cli folder
    if (dirEntry.isDirectory || !dirEntry.name.endsWith('.ts') || (firstArg !== 'all' && shortName !== firstArg))
      continue
    await startSupabaseBackend(tempEnvFilePath)
    const path = await Deno.realPath(`${folder}/${dirEntry.name}`)
    const imported = await import(path)

    const importedTest: RunnableTest = imported.getTest()

    if (!functionsUrl) {
      p.log.error('No functions URL, cannot run tests')
      Deno.exit(1)
    }

    if (!supabase) {
      p.log.error('No supabase connection, cannot run tests')
      Deno.exit(1)
    }

    p.log.info(`Running tests \"${importedTest.fullName}\" (${dirEntry.name})`)
    // let ok = await testLoop(new URL('http://localhost:7777'), supabase, importedTest.tests)
    let ok = await testLoop(functionsUrl, supabase, importedTest.tests)

    // This is likely unreacheble
    if (!ok)
      Deno.exit(1)

  }
}

p.log.info('Connecting to supabase...')
await connectToSupabase()

const firstArg = Deno.args[0]
if (!firstArg) {
  p.log.error('Missing argument, please specify \'cli\' or \'backend\' or \'all\'')
  Deno.exit(1)
}
else {
  await runTestsForFolder('./tests_backend/tests/backend', 'backend', firstArg)
  await runTestsForFolder('./tests_backend/tests/cli', 'cli', firstArg)
  await runTestsForFolder('./tests_backend/tests/selectable_disallow', 'selectable_disallow', firstArg)
  await runTestsForFolder('./tests_backend/tests/organization', 'organization', firstArg)
  Deno.exit(0)
}

// setTimeout(killSupabaseAndOutput, 10000)
