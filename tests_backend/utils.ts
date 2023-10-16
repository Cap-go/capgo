import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@^2.2.3'
import { isEqual } from 'https://esm.sh/lodash-es@^4.17.21'
import { mergeReadableStreams } from 'https://deno.land/std@0.201.0/streams/merge_readable_streams.ts'
import * as p from 'npm:@clack/prompts@0.7.0'
import type { Database } from '../supabase/functions/_utils/supabase.types.ts'

export const defaultUserId = '6aa76066-55ef-4238-ade6-0b32334a4097'
let supabaseSecret: string | null = null
let supabaseAnonToken: string | null = null
let supabaseUrl: string | null = null

export interface Test {
  name: string
  // How much time run the test
  timesToExecute: number
  test: (backendBaseUrl: URL, supabase: SupabaseType) => Promise<void>
}

export interface RunnableTest {
  fullName: string
  tests: Test[]
  testWithRedis: boolean
}

export function setSupabaseSecrets(secret: string, anonToken: string, url: string) {
  supabaseSecret = secret
  supabaseAnonToken = anonToken
  supabaseUrl = url
}

export function getSupabaseSecret() {
  return supabaseSecret
}

export function assert(condition: boolean, conditionAsString: string) {
  if (!condition)
    throw new Error(`Assertion failed for condition: ${conditionAsString}`)
}

export function assertEquals(first: any, second: any, message: string) {
  return assert(isEqual(first, second), `Assertion equal failed for: ${message}`)
}

export function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export const updateAndroidBaseData = {
  platform: 'android',
  device_id: '00009a6b-eefe-490a-9c60-8e965132ae51',
  app_id: 'com.demo.app',
  custom_id: '',
  version_build: '1.0',
  version_code: '1',
  version_os: '13',
  version_name: '1.0.0',
  plugin_version: '5.2.1',
  is_emulator: false,
  is_prod: true,
}

export async function responseOk(response: Response, requestName: string) {
  const cloneResponse = response.clone()
  assert(cloneResponse.ok, `${requestName} response not ok: ${cloneResponse.status} ${cloneResponse.statusText} ${await cloneResponse.text()}`)
}

export async function sendUpdate(baseUrl: URL, data: typeof updateAndroidBaseData): Promise<Response> {
  return await fetch(new URL('updates', baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })
}

export async function getResponseError(response: Response): Promise<string> {
  const json = await response.json()
  assert(json.error !== undefined, `Response ${JSON.stringify(json)} has no error`)

  return json.error
}

export function getUpdateBaseData(): typeof updateAndroidBaseData {
  return structuredClone(updateAndroidBaseData)
}

export async function testPlaywright(spec: string, env: { [key: string]: string }) {
  const playwrightCommand = new Deno.Command('npx', {
    args: [
      'playwright',
      'test',
      spec,
    ],
    stdout: 'piped',
    stderr: 'piped',
    env: {
      SKIP_BACKEND: 'true',
      SUPABASE_ANON: supabaseAnonToken!,
      SUPABASE_URL: supabaseUrl!,
      ...env,
    },
  })

  await runSubprocess(playwrightCommand, 'Playwright')
}

export async function runSubprocess(command: Deno.Command, commandName: string) {
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

  const stausCode = await subprocess.status
  if (stausCode.code !== 0) {
    p.log.error(`${commandName} output:`)
    console.log(finalString)
    throw new Error(`${commandName} failed`)
  }
}

export type SupabaseType = SupabaseClient<Database>
