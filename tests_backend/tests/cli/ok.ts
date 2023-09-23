import { exists } from 'https://deno.land/std@0.202.0/fs/mod.ts'
import {
  mergeReadableStreams,
} from 'https://deno.land/std@0.201.0/streams/merge_readable_streams.ts'
import { type RunnableTest, type SupabaseType, assert } from '../../utils.ts'

let cliPath: string | null = null

// This comes from seed.sql
const defaultApiKey = 'ae6e7458-c46d-4c00-aa3b-153b0b8520ea'

export function getTest(): RunnableTest {
  return {
    fullName: 'Test cli',
    testWithRedis: false,
    tests: [
      {
        name: 'Prepare cli',
        test: prepareCli,
        execute: 1,
      },
      {
        name: 'Test cli OK',
        test: testCliOK,
        execute: 1,
      },
    ],
  }
}

async function prepareCli(_backendBaseUrl: URL, _supabase: SupabaseType) {
  const path = Deno.env.get('CLI_PATH')
  assert(path !== undefined, 'CLI_PATH is not defined')

  const indexPathRelative = `${path}/dist/index.js`
  const fileExists = await exists(indexPathRelative, {
    isReadable: true,
    isFile: true,
  })
  assert(fileExists, `File ${indexPathRelative} does not exist`)

  cliPath = await Deno.realPath(indexPathRelative)
  console.log('cliPath', cliPath)
  console.log('args', [cliPath!].concat(['--help']))
  await runCli(['--help'])
}

async function runCli(params: string[]) {
  const command = new Deno.Command('node', {
    args: [cliPath!].concat(params),
    stdout: 'piped',
    stderr: 'piped',
  })

  const subprocess = command.spawn()
  const joinedStream = mergeReadableStreams(
    subprocess.stdout,
    subprocess.stderr,
  )

  const reader = joinedStream.getReader()
  let finalString = ''

  while (true) {
    const chunk = await reader.read()
    if (chunk.done)
      break

    const string = new TextDecoder('utf-8').decode(chunk.value)
    finalString += string
  }

  console.log(finalString)
}

async function testCliOK(_backendBaseUrl: URL, _supabase: SupabaseType) {
  console.log('test cli: OK')
}
