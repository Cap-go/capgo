import { assert, assertEquals } from 'https://deno.land/std@0.224.0/testing/asserts.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1'

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
  const { error: error2 } = await supabase.rpc('reset_and_seed_stats_data')
  if (error2)
    throw error2
}

Deno.test('POST /device - Link device', async () => {
  await resetAndSeedData()

  const response = await fetch(`${BASE_URL}/device`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      app_id: 'com.demo.app',
      device_id: 'test_device',
      version_id: '1.0.0',
      channel: 'no_access',
    }),
  })

  const data = await response.json()
  assertEquals(response.status, 200)
  assertEquals(data.status, 'ok')
})

Deno.test('POST /device - Invalid app_id', async () => {
  await resetAndSeedData()

  const response = await fetch(`${BASE_URL}/device`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      app_id: 'invalid_app',
      device_id: 'test_device',
    }),
  })
  await response.arrayBuffer()
  assertEquals(response.status, 400)
})

Deno.test('GET /device - Get devices', async () => {
  await resetAndSeedData()

  const params = new URLSearchParams()
  params.append('app_id', 'com.demo.app')

  const response = await fetch(`${BASE_URL}/device?${params.toString()}&api=v2`, {
    method: 'GET',
    headers,
  })

  const data = await response.json()
  assertEquals(response.status, 200)
  assert(Array.isArray(data))
})

Deno.test('GET /device - Get specific device', async () => {
  await resetAndSeedData()

  const params = new URLSearchParams()
  params.append('app_id', 'com.demo.app')
  params.append('device_id', '00000000-0000-0000-0000-000000000000')

  const response = await fetch(`${BASE_URL}/device?${params.toString()}&api=v2`, {
    method: 'GET',
    headers,
  })

  const data = await response.json()
  assertEquals(response.status, 200)
  assertEquals(data.device_id, '00000000-0000-0000-0000-000000000000')
})

Deno.test('GET /device - Invalid app_id', async () => {
  await resetAndSeedData()

  const params = new URLSearchParams()
  params.append('app_id', 'invalid_app')

  const response = await fetch(`${BASE_URL}/device?${params.toString()}&api=v2`, {
    method: 'GET',
    headers,
  })
  await response.arrayBuffer()
  assertEquals(response.status, 400)
})

Deno.test('GET /device - Invalid device_id', async () => {
  await resetAndSeedData()

  const params = new URLSearchParams()
  params.append('app_id', 'com.demo.app')
  params.append('device_id', 'invalid_device')

  const response = await fetch(`${BASE_URL}/device?${params.toString()}`, {
    method: 'GET',
    headers,
  })
  await response.arrayBuffer()
  assertEquals(response.status, 400)
})

Deno.test('DELETE /device - Unlink device', async () => {
  await resetAndSeedData()

  const response = await fetch(`${BASE_URL}/device`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({
      device_id: 'test_device',
      app_id: 'com.demo.app',
    }),
  })

  const data = await response.json()
  assertEquals(response.status, 200)
  assertEquals(data.status, 'ok')
})

Deno.test('DELETE /device - Invalid device_id', async () => {
  await resetAndSeedData()

  const response = await fetch(`${BASE_URL}/device`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({
      device_id: 'invalid_device',
      app_id: 'com.demo.app',
    }),
  })
  const data = await response.json()
  assertEquals(response.status, 200)
  assertEquals(data.status, 'ok')
})
