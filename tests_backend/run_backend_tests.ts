// We make some assumtion when running these tests:
// - We have a supabase instance running on localhost:5432
// - We have redis running on localhost:6379

import {
  mergeReadableStreams,
} from 'https://deno.land/std@0.201.0/streams/merge_readable_streams.ts'

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@^2.2.3'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@^2.2.3'

import * as p from 'npm:@clack/prompts@0.7.0'

import type { Database } from '../supabase/functions/_utils/supabase.types.ts'
import { setSupabaseSecrets } from './utils.ts'
import type { RunnableTest, SupabaseType, Test } from './utils.ts'

let supabaseProcess: Deno.ChildProcess | null = null
let joined: ReadableStream<Uint8Array> | null = null
let supabase: SupabaseClient<Database> | null = null
let functionsUrl: URL | null = null
let tempUpstashEnvFilePath: string | null = null
let backendType: 'none' | 'local' | 'upstash' | null = null
const noRedisEnvFilePath = await getEnvFile('none')
const localRedisEnvFilePath = await getEnvFile('local')

async function getAdminSupabaseTokens(): Promise<{ url: string; serviceKey: string; anonToken: string }> {
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

  if (!adminToken || !url || !anonToken) {
    p.log.error('Cannot get supabase tokens')
    console.log('output\n', output)
    Deno.exit(1)
  }

  adminToken = adminToken.replace('service_role key: ', '').trim()
  url = url.replace('API URL: ', '').trim()
  anonToken = anonToken.replace('anon key: ', '').trim()

  return {
    serviceKey: adminToken,
    url,
    anonToken,
  }
}

async function genTempUpstashEnvFile(upstashToken: string, upstashUrl: string): Promise<string> {
  const tempFilePath = await Deno.makeTempFile()
  const exampleEnvFile = await Deno.readTextFile('supabase/.env.example')
  let tempEnvFile = `${exampleEnvFile}\nREDIS_CONNECTION_TYPE=upstash\nREDIS_TOKEN=${upstashToken}\nREDIS_URL=${upstashUrl}`

  const minioUrl = Deno.env.get('MINIO_URL')
  if (minioUrl)
    tempEnvFile = tempEnvFile.replace('host.docker.internal', minioUrl)

  await Deno.writeTextFile(tempFilePath, tempEnvFile)
  return tempFilePath
}

async function getEnvFile(redis: 'none' | 'local') {
  const envFilePath = `./supabase/.env.example${redis === 'local' ? '.redis' : ''}`

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
    const { serviceKey, url, anonToken } = await getAdminSupabaseTokens()
    setSupabaseSecrets(serviceKey, anonToken, url)
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
  redis: 'none' | 'local' | 'upstash' = 'none',
  envFile?: string,
) {
  backendType = redis

  if (redis === 'upstash' && !envFile) {
    p.log.error('Cannot start upstash backend without env file')
    Deno.exit(1)
  }

  const command = new Deno.Command('supabase', {
    args: [
      'functions',
      'serve',
      '--env-file',
      (redis !== 'upstash' || !envFile) ? (redis === 'none' ? noRedisEnvFilePath : localRedisEnvFilePath) : envFile,
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
  while (true) {
    const chunk = await reader.read()
    if (chunk.done)
      break

    const string = new TextDecoder('utf-8').decode(chunk.value)
    if (string.includes('Serving functions on')) {
      p.log.success('Supabase backend started')
      const split = string.split(' ')
      functionsUrl = new URL(split[split.length - 1].trim().replace('<function-name>', ''))
      break
    }
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

  if (tempUpstashEnvFilePath) {
    p.log.info(`Removing temp upstash ENV file at ${tempUpstashEnvFilePath}`)
    Deno.removeSync(tempUpstashEnvFilePath)
  }

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

async function runTestsForFolder(folder: string, shortName: string, firstArg: string) {
  const useLocalRedis = Deno.env.get('USE_LOCAL_REDIS') === 'true'
  const upstashToken = Deno.env.get('UPSTASH_TOKEN')
  const upstashUrl = Deno.env.get('UPSTASH_URL')

  if (upstashToken && upstashUrl) {
    p.log.info('Generating temp ENV file for upstash...')
    tempUpstashEnvFilePath = await genTempUpstashEnvFile(upstashToken, upstashUrl)
    p.log.info(`Temp ENV file generated at ${tempUpstashEnvFilePath}`)
  }

  for await (const dirEntry of Deno.readDir(folder)) {
    const firstArg = Deno.args[0]

    // this last conditions checks if we are supposed to run all tests or just the specific one
    // Like /test cli will run only tests from the cli folder
    if (dirEntry.isDirectory || !dirEntry.name.endsWith('.ts') || (firstArg !== 'all' && shortName !== firstArg))
      continue

    // Make sure the first time we always have "normal" backend
    if (backendType !== 'none') {
      // Only if backend !== null
      if (backendType) {
        p.log.info('Killing supabase...')
        killSupabase()
      }

      p.log.info('Starting normal backend...')
      // None means no redis is not going to be configured
      // This is here to check what happens if redis fails or is disabled for whatever reason
      await startSupabaseBackend('none')
    }

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
    let ok = await testLoop(functionsUrl, supabase, importedTest.tests)

    // This is likely unreacheble
    if (!ok)
      Deno.exit(1)

    // Test with redis if needed
    if (importedTest.testWithRedis) {
      if (useLocalRedis) {
        p.log.info('Running with redis')
        killSupabase()
        p.log.info('Starting supabase backend with local redis...')

        // Local means redis is running on localhost
        await startSupabaseBackend('local')
        ok = await testLoop(functionsUrl, supabase, importedTest.tests)

        if (!ok)
          Deno.exit(1)
      }

      else { p.log.warn('Skipping running with redis') }

      if (upstashToken && upstashUrl) {
        p.log.info('Running with upstash')
        killSupabase()

        p.log.info('Starting supabase backend with upstash...')

        // upstash means redis is running remotly and is being hostend by upstash
        await startSupabaseBackend('upstash', tempUpstashEnvFilePath!)
        ok = await testLoop(functionsUrl, supabase, importedTest.tests)

        if (!ok)
          Deno.exit(1)
      }

      else { p.log.warn('Skipping running with upstash') }
    }
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
