import { assert, assertEquals } from '@std/assert'
import { createClient } from '@supabase/supabase-js'

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
// eslint-disable-next-line antfu/no-top-level-await
await resetAndSeedData()

Deno.test('GET /channel operations', async (t) => {
  await Promise.all([
    t.step({
      name: 'Get channels',
      fn: async () => {
        const params = new URLSearchParams()
        params.append('app_id', 'com.demo.app')

        const response = await fetch(`${BASE_URL}/channel?${params.toString()}`, {
          method: 'GET',
          headers,
        })

        const data = await response.json()
        assertEquals(response.status, 200)
        assert(Array.isArray(data))
      },
      sanitizeOps: false,
      sanitizeResources: false,
      sanitizeExit: false,
    }),

    t.step({
      name: 'Get specific channel',
      fn: async () => {
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
      },
      sanitizeOps: false,
      sanitizeResources: false,
      sanitizeExit: false,
    }),

    t.step({
      name: 'Invalid app_id',
      fn: async () => {
        const params = new URLSearchParams()
        params.append('app_id', 'invalid_app')

        const response = await fetch(`${BASE_URL}/channel?${params.toString()}`, {
          method: 'GET',
          headers,
        })
        await response.arrayBuffer()
        assertEquals(response.status, 400)
      },
      sanitizeOps: false,
      sanitizeResources: false,
      sanitizeExit: false,
    }),
  ])
})

Deno.test('POST /channel operations', async (t) => {
  await Promise.all([
    t.step({
      name: 'Create channel',
      fn: async () => {
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
      },
      sanitizeOps: false,
      sanitizeResources: false,
      sanitizeExit: false,
    }),

    t.step({
      name: 'Update channel',
      fn: async () => {
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
      },
      sanitizeOps: false,
      sanitizeResources: false,
      sanitizeExit: false,
    }),

    t.step({
      name: 'Invalid app_id',
      fn: async () => {
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
      },
      sanitizeOps: false,
      sanitizeResources: false,
      sanitizeExit: false,
    }),
  ])
})

Deno.test('DELETE /channel operations', async (t) => {
  await Promise.all([
    t.step({
      name: 'Invalid channel',
      fn: async () => {
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
      },
      sanitizeOps: false,
      sanitizeResources: false,
      sanitizeExit: false,
    }),

    t.step({
      name: 'Delete channel',
      fn: async () => {
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
      },
      sanitizeOps: false,
      sanitizeResources: false,
      sanitizeExit: false,
    }),
  ])
})
