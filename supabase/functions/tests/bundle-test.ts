import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.44.3'

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

Deno.test('GET /bundle - Get bundles', async () => {
  await resetAndSeedData()

  const params = new URLSearchParams()
  params.append('app_id', 'com.demo.app')

  const response = await fetch(`${BASE_URL}/bundle?${params.toString()}`, {
    method: 'GET',
    headers,
  })

  const data = await response.json()
  assertEquals(response.status, 200)
  assert(Array.isArray(data))
})

Deno.test('GET /bundle - Invalid app_id', async () => {
  await resetAndSeedData()

  const params = new URLSearchParams()
  params.append('app_id', 'invalid_app')

  const response = await fetch(`${BASE_URL}/bundle?${params.toString()}`, {
    method: 'GET',
    headers,
  })
  await response.arrayBuffer()

  assertEquals(response.status, 400)
})

Deno.test('DELETE /bundle - Delete bundle', async () => {
  await resetAndSeedData()

  const response = await fetch(`${BASE_URL}/bundle`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({
      app_id: 'com.demo.app',
      version: '1.0.1',
    }),
  })

  const data = await response.json()
  assertEquals(response.status, 200)
  assertEquals(data.status, 'ok')
})

Deno.test('DELETE /bundle - Invalid version', async () => {
  await resetAndSeedData()

  const response = await fetch(`${BASE_URL}/bundle`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({
      app_id: 'com.demo.app',
      version: 'invalid_version',
    }),
  })
  await response.arrayBuffer()
  assertEquals(response.status, 400)
})

Deno.test('DELETE /bundle - Delete all bundles', async () => {
  await resetAndSeedData()

  const response = await fetch(`${BASE_URL}/bundle`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({
      app_id: 'com.demo.app',
    }),
  })

  const data = await response.json()
  assertEquals(response.status, 200)
  assertEquals(data.status, 'ok')
})

Deno.test('DELETE /bundle - Invalid app_id', async () => {
  await resetAndSeedData()

  const response = await fetch(`${BASE_URL}/bundle`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({
      app_id: 'invalid_app',
    }),
  })
  await response.arrayBuffer()
  assertEquals(response.status, 400)
})
