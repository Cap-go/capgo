import { assert, assertEquals } from 'https://deno.land/std@0.192.0/testing/asserts.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.8.0'

const BASE_URL = 'http://localhost:54321/functions/v1'
const headers = {
  'Content-Type': 'application/json',
  'Authorization': 'ae6e7458-c46d-4c00-aa3b-153b0b8520ea',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_KEY') ?? ''
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function resetAndSeedData() {
  const { error } = await supabase.rpc('reset_and_seed_data')
  if (error)
    throw error
}

Deno.test('POST /channel - Create channel', async () => {
  await resetAndSeedData()

  const response = await fetch(`${BASE_URL}/channel`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      app_id: 'com.demo.app',
      channel: 'test_channel',
      public: true,
    }),
  })

  const data = await response.json()
  assertEquals(response.status, 200)
  assertEquals(data.status, 'ok')
})

Deno.test('POST /channel - Update channel', async () => {
  await resetAndSeedData()

  const response = await fetch(`${BASE_URL}/channel`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      app_id: 'com.demo.app',
      channel: 'production',
      disableAutoUpdateUnderNative: false,
    }),
  })

  const data = await response.json()
  assertEquals(response.status, 200)
  assertEquals(data.status, 'ok')
})

Deno.test('POST /channel - Invalid app_id', async () => {
  await resetAndSeedData()

  const response = await fetch(`${BASE_URL}/channel`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      app_id: 'invalid_app',
      channel: 'test_channel',
    }),
  })
  await response.arrayBuffer()
  assertEquals(response.status, 400)
})

Deno.test('GET /channel - Get channels', async () => {
  await resetAndSeedData()

  const params = new URLSearchParams()
  params.append('app_id', 'com.demo.app')

  const response = await fetch(`${BASE_URL}/channel?${params.toString()}`, {
    method: 'GET',
    headers,
  })

  const data = await response.json()
  assertEquals(response.status, 200)
  assert(Array.isArray(data))
})

Deno.test('GET /channel - Get specific channel', async () => {
  await resetAndSeedData()

  const params = new URLSearchParams()
  params.append('app_id', 'com.demo.app')
  params.append('channel', 'production')

  const response = await fetch(`${BASE_URL}/channel?${params.toString()}`, {
    method: 'GET',
    headers,
  })

  const data = await response.json()
  assertEquals(response.status, 200)
  assertEquals(data.name, 'production')
})

Deno.test('GET /channel - Invalid app_id', async () => {
  await resetAndSeedData()

  const params = new URLSearchParams()
  params.append('app_id', 'invalid_app')

  const response = await fetch(`${BASE_URL}/channel?${params.toString()}`, {
    method: 'GET',
    headers,
  })
  await response.arrayBuffer()
  assertEquals(response.status, 400)
})

Deno.test('DELETE /channel - Delete channel', async () => {
  await resetAndSeedData()

  const response = await fetch(`${BASE_URL}/channel`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({
      channel: 'production',
      app_id: 'com.demo.app',
    }),
  })

  const data = await response.json()
  assertEquals(response.status, 200)
  assertEquals(data.status, 'ok')
})

Deno.test('DELETE /channel - Invalid channel', async () => {
  await resetAndSeedData()

  const response = await fetch(`${BASE_URL}/channel`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({
      channel: 'invalid_channel',
      app_id: 'com.demo.app',
    }),
  })
  await response.arrayBuffer()
  assertEquals(response.status, 400)
})
