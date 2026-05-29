#!/usr/bin/env node
import assert from 'node:assert/strict'
import {
  createTimedFetch,
  deriveSupabaseOperation,
  getSupabaseSource,
  isSupabaseInstrumentationEnabled,
  setSupabaseCallRecorder,
  SLOW_THRESHOLD_MS,
  withSupabaseSource,
} from '../src/analytics/supabase-perf.ts'

console.log('🧪 Testing supabase-perf...\n')

const originalFetch = globalThis.fetch

try {
  // 1. deriveSupabaseOperation: query strings stripped, rpc vs table
  assert.equal(deriveSupabaseOperation('https://db.co/rest/v1/rpc/get_user_id', 'POST'), 'rpc:get_user_id')
  assert.equal(deriveSupabaseOperation('https://db.co/rest/v1/apps?select=*&app_id=eq.com.x', 'GET'), 'GET apps')
  assert.equal(deriveSupabaseOperation('https://db.co/rest/v1/app_versions', 'POST'), 'POST app_versions')
  assert.equal(deriveSupabaseOperation('not a url', 'GET'), 'GET not a url')

  // 2. enable flag defaults off
  assert.equal(isSupabaseInstrumentationEnabled(), false)

  // 3. SLOW_THRESHOLD_MS is a positive number
  assert.equal(typeof SLOW_THRESHOLD_MS, 'number')
  assert.ok(SLOW_THRESHOLD_MS > 0)

  // 4. withSupabaseSource is async-safe across Promise.all (no cross-talk)
  const tick = () => new Promise(r => setTimeout(r, 1))
  const labels = await Promise.all([
    withSupabaseSource('a', async () => { await tick(); return getSupabaseSource() }),
    withSupabaseSource('b', async () => { await tick(); return getSupabaseSource() }),
  ])
  assert.deepEqual(labels, ['a', 'b'])
  assert.equal(getSupabaseSource(), undefined, 'no source outside a scope')

  // 5. timed fetch records raw info, returns the real response, captures source
  const recorded = []
  setSupabaseCallRecorder(info => recorded.push(info))
  globalThis.fetch = async () => new Response('{}', { status: 200 })
  const tf = createTimedFetch()
  const res = await withSupabaseSource('apps.list', () => tf('https://db.co/rest/v1/apps?select=*', { method: 'GET' }))
  assert.equal(res.status, 200, 'returns the real response')
  assert.equal(recorded.length, 1)
  assert.equal(recorded[0].method, 'GET')
  assert.equal(recorded[0].ok, true)
  assert.equal(recorded[0].status, 200)
  assert.equal(recorded[0].source, 'apps.list')
  assert.equal(typeof recorded[0].durationMs, 'number')

  // 6. timed fetch rethrows the real error and records a failure
  globalThis.fetch = async () => { throw new Error('boom') }
  await assert.rejects(() => tf('https://db.co/rest/v1/apps', { method: 'GET' }), /boom/)
  assert.equal(recorded[1].ok, false)
  assert.equal(recorded[1].status, 0)

  // --- Task 3: full `Supabase Call` event via the wired real recorder ---
  const { flushAnalytics, trackCommandInvoked } = await import('../src/analytics/track.ts')
  const originalToken = process.env.CAPGO_TOKEN
  const originalDisable = process.env.CAPGO_DISABLE_TELEMETRY
  const originalDisablePosthog = process.env.CAPGO_DISABLE_POSTHOG
  delete process.env.CAPGO_DISABLE_TELEMETRY
  delete process.env.CAPGO_DISABLE_POSTHOG
  process.env.CAPGO_TOKEN = 'perf-key'

  const stubPerf = () => {
    const reqs = []
    globalThis.fetch = async (url, init) => {
      reqs.push({ url: String(url), init })
      if (String(url).includes('/rest/v1/'))
        return new Response('{}', { status: 200 })
      if (String(url).endsWith('/private/config'))
        return new Response('', { status: 500 })
      return new Response('{}', { status: 200 })
    }
    return reqs
  }
  const findPerfEvent = reqs => reqs.find(r => r.url.endsWith('/private/events') && JSON.parse(r.init.body).event === 'Supabase Call')

  // success path → ok:true, operation, channel cli-perf, command_path
  trackCommandInvoked('bundle upload', { flags: [], positional_arg_count: 0 })
  let reqs = stubPerf()
  const tf3 = createTimedFetch()
  await withSupabaseSource('apps.list', () => tf3('https://db.co/rest/v1/apps?select=*', { method: 'GET' }))
  await flushAnalytics()
  let ev = JSON.parse(findPerfEvent(reqs).init.body)
  assert.equal(ev.event, 'Supabase Call')
  assert.equal(ev.channel, 'cli-perf')
  assert.equal(ev.tags.operation, 'GET apps')
  assert.equal(ev.tags.ok, true)
  assert.equal(ev.tags.source, 'apps.list')
  assert.equal(ev.tags.command_path, 'bundle upload')
  assert.equal(ev.tags.error_category, undefined, 'no error_category on success')

  // HTTP failure path → ok:false, error_category from status (504 => timeout)
  reqs = []
  globalThis.fetch = async (url, init) => {
    reqs.push({ url: String(url), init })
    if (String(url).includes('/rest/v1/'))
      return new Response('', { status: 504 })
    return new Response('{}', { status: 200 })
  }
  await tf3('https://db.co/rest/v1/rpc/get_user_id', { method: 'POST' })
  await flushAnalytics()
  ev = JSON.parse(findPerfEvent(reqs).init.body)
  assert.equal(ev.tags.ok, false)
  assert.equal(ev.tags.operation, 'rpc:get_user_id')
  assert.equal(ev.tags.error_category, 'timeout')

  process.env.CAPGO_TOKEN = originalToken
  if (originalDisable !== undefined) process.env.CAPGO_DISABLE_TELEMETRY = originalDisable
  if (originalDisablePosthog !== undefined) process.env.CAPGO_DISABLE_POSTHOG = originalDisablePosthog

  console.log('✅ supabase-perf tests passed')
}
finally {
  globalThis.fetch = originalFetch
}
