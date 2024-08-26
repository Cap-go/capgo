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
async function fetchBundle(appId: string) {
  const params = new URLSearchParams({ app_id: appId })
  const response = await fetch(`${BASE_URL}/bundle?${params.toString()}`, {
    method: 'GET',
    headers,
  })
  return { response, data: await response.json() }
}
await resetAndSeedData()

Deno.test('GET /bundle operations', async (t) => {
  await Promise.all([
    t.step({
      name: 'Valid app_id',
      fn: async () => {
        const { response, data } = await fetchBundle('com.demo.app')
        assertEquals(response.status, 200)
        assert(Array.isArray(data))
      },
      sanitizeOps: false,
      sanitizeResources: false,
      sanitizeExit: false,
    }),

    t.step({
      name: 'Invalid app_id',
      fn: async () => {
        const { response } = await fetchBundle('invalid_app')
        assertEquals(response.status, 400)
      },
      sanitizeOps: false,
      sanitizeResources: false,
      sanitizeExit: false,
    }),
  ])
})

Deno.test('DELETE /bundle operations', async (t) => {
  await Promise.all([
    t.step({
      name: 'Invalid version',
      fn: async () => {
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
      },
      sanitizeOps: false,
      sanitizeResources: false,
      sanitizeExit: false,
    }),

    t.step({
      name: 'Invalid app_id',
      fn: async () => {
        const response = await fetch(`${BASE_URL}/bundle`, {
          method: 'DELETE',
          headers,
          body: JSON.stringify({
            app_id: 'invalid_app',
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
      name: 'Delete specific bundle',
      fn: async () => {
        const deleteBundle = await fetch(`${BASE_URL}/bundle`, {
          method: 'DELETE',
          headers,
          body: JSON.stringify({
            app_id: 'com.demo.app',
            version: '1.0.1',
          }),
        })
        const deleteBundleData = await deleteBundle.json()
        assertEquals(deleteBundle.status, 200)
        assertEquals(deleteBundleData.status, 'ok')
      },
      sanitizeOps: false,
      sanitizeResources: false,
      sanitizeExit: false,
    }),
  ])

  // Valid operations

  await t.step({
    name: 'Delete all bundles for an app',
    fn: async () => {
      const deleteAllBundles = await fetch(`${BASE_URL}/bundle`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({
          app_id: 'com.demo.app',
        }),
      })

      const deleteAllBundlesData = await deleteAllBundles.json()
      assertEquals(deleteAllBundles.status, 200)
      assertEquals(deleteAllBundlesData.status, 'ok')
    },
  })
})
