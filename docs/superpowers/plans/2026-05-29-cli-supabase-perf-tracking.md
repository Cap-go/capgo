# CLI Supabase Performance Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit a fire-and-forget `Supabase Call` performance event for every Supabase REST/RPC request the CLI makes, carrying duration, HTTP status, a categorized failure reason, and three "where" dimensions (operation, command, source), so we can see who hits Supabase latency/timeouts and where.

**Architecture:** A timed `global.fetch` injected into `createSupabaseClient` instruments all 110 call sites at once. It is gated to the CLI/MCP entrypoints (the SDK bundle, which transitively imports `createSupabaseClient`, stays on the plain fetch). A new leaf module `supabase-perf.ts` holds the `AsyncLocalStorage` source labels, operation parsing, the enable flag, and the timed fetch; `track.ts` injects the event-builder (`recordSupabaseCall`) into it to avoid an import cycle. Events route through the existing `trackEvent`, inheriting its fire-and-forget dispatch, flush-on-exit, and abort-on-flush.

**Tech Stack:** TypeScript, Bun (build + test runner), `@supabase/supabase-js`, `commander`, `node:async_hooks`. Tests are `bun`-run `.mjs` files using the existing `globalThis.fetch` stub pattern.

**Spec:** `docs/superpowers/specs/2026-05-29-cli-supabase-perf-tracking-design.md`

**Working directory for all commands:** `cli/` (i.e. `/Users/michaltremblay/Developer/capgo-new/.claude/worktrees/strange-shaw-3b11a2/cli`). All `src/...` and `test/...` paths below are relative to `cli/`.

---

## File Structure

**Create:**
- `cli/src/analytics/supabase-perf.ts` — leaf module: `AsyncLocalStorage` source store (`withSupabaseSource`/`getSupabaseSource`), `deriveSupabaseOperation`, `SLOW_THRESHOLD_MS`, the enable flag (`enableSupabaseInstrumentation`/`isSupabaseInstrumentationEnabled`), the injected recorder hook (`setSupabaseCallRecorder` + `SupabaseCallInfo`), and `createTimedFetch`. Depends only on `node:async_hooks`.
- `cli/test/test-supabase-perf.mjs` — unit + integration tests, built up across Tasks 2/3/4/6.

**Modify:**
- `cli/src/analytics/error-category.ts` — add `rate_limited` to `CliErrorCategory`; add `categorizeHttpStatus`.
- `cli/src/analytics/track.ts` — `recordSupabaseCall` + `setSupabaseCallRecorder(recordSupabaseCall)` wiring; module-level `currentCommandPath` set by `trackCommandInvoked`; `setCurrentCommandPath`; MCP command-path in `withMcpToolTracking`; re-export `withSupabaseSource`.
- `cli/src/utils.ts` — `createSupabaseClient` gains `instrument = true`; injects the timed fetch when `isSupabaseInstrumentationEnabled() && instrument`.
- `cli/src/analytics/org-resolver.ts` — pass `instrument: false` (recursion guard).
- `cli/src/index.ts` — call `enableSupabaseInstrumentation()` at startup.
- `cli/src/mcp/server.ts` — call `enableSupabaseInstrumentation()` at startup.
- `cli/src/app/list.ts` — wrap the apps query with `withSupabaseSource('apps.list', …)`.
- `cli/src/channel/currentBundle.ts` — wrap the channels query with `withSupabaseSource('channels.currentBundle', …)`.
- `cli/package.json` — register `test:supabase-perf` and add it to the `test` script.

**Dependency direction (no cycle):** `utils.ts → supabase-perf.ts` (leaf); `track.ts → supabase-perf.ts` and `track.ts → utils.ts`. `supabase-perf.ts` imports nothing from `track.ts`/`utils.ts`.

---

### Task 1: HTTP-status error categorization

**Files:**
- Modify: `cli/src/analytics/error-category.ts`
- Test: `cli/test/test-analytics-error-category.mjs`

- [ ] **Step 1: Write the failing test**

Append inside the existing test file `cli/test/test-analytics-error-category.mjs`, immediately before its final success `console.log(...)` line:

```js
import { categorizeHttpStatus } from '../src/analytics/error-category.ts'

assert.equal(categorizeHttpStatus(401), 'unauthorized')
assert.equal(categorizeHttpStatus(403), 'forbidden')
assert.equal(categorizeHttpStatus(404), 'not_found')
assert.equal(categorizeHttpStatus(408), 'timeout')
assert.equal(categorizeHttpStatus(504), 'timeout')
assert.equal(categorizeHttpStatus(413), 'payload_too_large')
assert.equal(categorizeHttpStatus(429), 'rate_limited')
assert.equal(categorizeHttpStatus(400), 'validation_error')
assert.equal(categorizeHttpStatus(422), 'validation_error')
assert.equal(categorizeHttpStatus(500), 'server_error')
assert.equal(categorizeHttpStatus(503), 'server_error')
assert.equal(categorizeHttpStatus(418), 'unknown')
console.log('✅ categorizeHttpStatus tests passed')
```

> Note: `import` must be at the top of the `.mjs` file, not mid-file. Move the `import { categorizeHttpStatus } ...` line up next to the existing imports; keep the `assert.*` block where shown.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test/test-analytics-error-category.mjs`
Expected: FAIL — `categorizeHttpStatus` is not exported.

- [ ] **Step 3: Add `rate_limited` to the enum**

In `cli/src/analytics/error-category.ts`, change the union type (currently ends `| 'commander' | 'unknown'`) to include `rate_limited`:

```ts
export type CliErrorCategory
  = | 'network_error'
    | 'timeout'
    | 'unauthorized'
    | 'forbidden'
    | 'not_found'
    | 'payload_too_large'
    | 'rate_limited'
    | 'validation_error'
    | 'server_error'
    | 'commander'
    | 'unknown'
```

- [ ] **Step 4: Implement `categorizeHttpStatus`**

Append to `cli/src/analytics/error-category.ts`:

```ts
/**
 * Maps a non-2xx HTTP status to the same closed enum, for Supabase responses
 * where we have a status code but no thrown Error. Never leaks response bodies.
 */
export function categorizeHttpStatus(status: number): CliErrorCategory {
  if (status === 401)
    return 'unauthorized'
  if (status === 403)
    return 'forbidden'
  if (status === 404)
    return 'not_found'
  if (status === 408 || status === 504)
    return 'timeout'
  if (status === 413)
    return 'payload_too_large'
  if (status === 429)
    return 'rate_limited'
  if (status === 400 || status === 422)
    return 'validation_error'
  if (status >= 500)
    return 'server_error'
  return 'unknown'
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test/test-analytics-error-category.mjs`
Expected: PASS — including `✅ categorizeHttpStatus tests passed`.

- [ ] **Step 6: Commit**

```bash
git add src/analytics/error-category.ts test/test-analytics-error-category.mjs
git commit -m "feat(cli): add categorizeHttpStatus + rate_limited error category"
```

---

### Task 2: `supabase-perf.ts` leaf module (ALS source, operation parsing, enable flag, timed fetch)

**Files:**
- Create: `cli/src/analytics/supabase-perf.ts`
- Create: `cli/test/test-supabase-perf.mjs`
- Modify: `cli/package.json`

- [ ] **Step 1: Write the failing test**

Create `cli/test/test-supabase-perf.mjs`:

```js
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

  console.log('✅ supabase-perf tests passed')
}
finally {
  globalThis.fetch = originalFetch
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test/test-supabase-perf.mjs`
Expected: FAIL — cannot resolve `../src/analytics/supabase-perf.ts`.

- [ ] **Step 3: Create the module**

Create `cli/src/analytics/supabase-perf.ts`:

```ts
import { AsyncLocalStorage } from 'node:async_hooks'

// --- explicit call-site labels, async-safe across awaits and Promise.all ---
const sourceStore = new AsyncLocalStorage<string>()

/** Tags every Supabase call made inside `fn` with `source`. */
export function withSupabaseSource<T>(source: string, fn: () => T): T {
  return sourceStore.run(source, fn)
}

export function getSupabaseSource(): string | undefined {
  return sourceStore.getStore()
}

// --- instrumentation gate: off unless a CLI/MCP entrypoint enables it, so the
//     SDK bundle (which transitively imports createSupabaseClient) stays clean.
let instrumentationEnabled = false

export function enableSupabaseInstrumentation(): void {
  instrumentationEnabled = true
}

export function isSupabaseInstrumentationEnabled(): boolean {
  return instrumentationEnabled
}

// --- the event recorder is injected by track.ts to avoid an import cycle ---
export interface SupabaseCallInfo {
  url: string
  method: string
  status: number
  ok: boolean
  durationMs: number
  source?: string
  error?: unknown
}

export type SupabaseCallRecorder = (info: SupabaseCallInfo) => void

let recorder: SupabaseCallRecorder | undefined

export function setSupabaseCallRecorder(fn: SupabaseCallRecorder): void {
  recorder = fn
}

/** A Supabase call slower than this is flagged `slow` regardless of status. */
export const SLOW_THRESHOLD_MS = 5000

/**
 * Parses a Supabase REST/RPC URL into a low-cardinality operation label.
 * Query strings are discarded so filter values never leak and cardinality
 * stays bounded. `/rest/v1/rpc/get_user_id` => `rpc:get_user_id`;
 * `/rest/v1/apps?...` => `GET apps`.
 */
export function deriveSupabaseOperation(url: string, method: string): string {
  let pathname: string
  try {
    pathname = new URL(url).pathname
  }
  catch {
    pathname = url.split('?')[0]
  }
  const marker = '/rest/v1/'
  const idx = pathname.indexOf(marker)
  const after = idx >= 0 ? pathname.slice(idx + marker.length) : pathname.replace(/^\//, '')
  if (after.startsWith('rpc/')) {
    const fn = after.slice('rpc/'.length).split('/')[0]
    return `rpc:${fn}`
  }
  const table = after.split('/')[0] || pathname
  return `${method} ${table}`
}

/**
 * A `fetch` wrapper for supabase-js's `global.fetch`. Times the real request
 * (which runs regardless), captures the active source label, and hands the
 * result to the injected recorder. Returns the real Response / rethrows the
 * real error so supabase-js behavior is never altered. Calls `globalThis.fetch`
 * dynamically (not a captured ref) so it is testable and never self-recurses.
 */
export function createTimedFetch(): typeof fetch {
  const timedFetch = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const method = (init?.method ?? 'GET').toUpperCase()
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const source = getSupabaseSource()
    const start = Date.now()
    try {
      const response = await globalThis.fetch(input, init)
      recorder?.({ url, method, status: response.status, ok: response.ok, durationMs: Date.now() - start, source })
      return response
    }
    catch (error) {
      recorder?.({ url, method, status: 0, ok: false, durationMs: Date.now() - start, source, error })
      throw error
    }
  }
  return timedFetch as typeof fetch
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test/test-supabase-perf.mjs`
Expected: PASS — `✅ supabase-perf tests passed`.

- [ ] **Step 5: Register the test in package.json**

In `cli/package.json`, add a script next to the other `test:analytics*` scripts:

```json
"test:supabase-perf": "bun test/test-supabase-perf.mjs",
```

Then add `&& bun run test:supabase-perf` to the long `"test"` script, immediately after `bun run test:analytics-org-resolver`.

- [ ] **Step 6: Commit**

```bash
git add src/analytics/supabase-perf.ts test/test-supabase-perf.mjs package.json
git commit -m "feat(cli): add supabase-perf module (timed fetch, source labels, operation parsing)"
```

---

### Task 3: `recordSupabaseCall` + recorder wiring + command-path ownership in `track.ts`

**Files:**
- Modify: `cli/src/analytics/track.ts`
- Test: `cli/test/test-supabase-perf.mjs`

- [ ] **Step 1: Write the failing test**

In `cli/test/test-supabase-perf.mjs`, insert this block immediately **before** the `console.log('✅ supabase-perf tests passed')` line (inside the `try`):

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test/test-supabase-perf.mjs`
Expected: FAIL — no `Supabase Call` event is produced (the real recorder is not wired yet, so `findPerfEvent(...)` is `undefined` and `.init` throws).

- [ ] **Step 3: Add imports to `track.ts`**

At the top of `cli/src/analytics/track.ts`, after the existing `import { resolveOwnerOrgId } from './org-resolver'` line, add:

```ts
import { categorizeCliError, categorizeHttpStatus } from './error-category'
import { deriveSupabaseOperation, setSupabaseCallRecorder, SLOW_THRESHOLD_MS, withSupabaseSource } from './supabase-perf'
import type { SupabaseCallInfo } from './supabase-perf'
```

- [ ] **Step 4: Add command-path state, the recorder, and the re-export**

In `cli/src/analytics/track.ts`, find the lifecycle section that begins:

```ts
// --- universal command lifecycle ---
const CLI_USAGE_CHANNEL = 'cli-usage'

let commandStartedAt = 0
```

Replace it with (adds `currentCommandPath` + setter):

```ts
// --- universal command lifecycle ---
const CLI_USAGE_CHANNEL = 'cli-usage'

let commandStartedAt = 0
// The active command path ('bundle upload', or 'mcp:<tool>'), read by perf
// events. One command per CLI process, so a module-level value is sufficient.
let currentCommandPath = ''

export function setCurrentCommandPath(path: string): void {
  currentCommandPath = path
}
```

In the same file, inside `trackCommandInvoked`, add `currentCommandPath = commandPath` as the first line of the function body (right after `commandStartedAt = Date.now()`):

```ts
export function trackCommandInvoked(commandPath: string, ctx: CommandContext): void {
  commandStartedAt = Date.now()
  currentCommandPath = commandPath
  void trackEvent({
    channel: CLI_USAGE_CHANNEL,
    event: 'CLI Command Invoked',
    icon: '⚡',
    tags: {
      command_path: commandPath,
      flags: ctx.flags.join(','),
      flags_count: ctx.flags.length,
      positional_arg_count: ctx.positional_arg_count,
    },
  })
}
```

At the very end of `cli/src/analytics/track.ts`, append the perf-event recorder, its wiring, and the re-export:

```ts
// --- Supabase performance events ---
const CLI_PERF_CHANNEL = 'cli-perf'

/**
 * Turns a raw timed-fetch observation into a fire-and-forget `Supabase Call`
 * event. Injected into supabase-perf so that module stays a leaf (no cycle).
 */
function recordSupabaseCall(info: SupabaseCallInfo): void {
  const tags: Record<string, string | number | boolean> = {
    operation: deriveSupabaseOperation(info.url, info.method),
    method: info.method,
    status_code: info.status,
    duration_ms: info.durationMs,
    ok: info.ok,
    slow: info.durationMs > SLOW_THRESHOLD_MS,
  }
  if (info.source)
    tags.source = info.source
  if (currentCommandPath)
    tags.command_path = currentCommandPath
  if (!info.ok) {
    tags.error_category = info.error !== undefined
      ? categorizeCliError(info.error)
      : categorizeHttpStatus(info.status)
  }
  void trackEvent({ channel: CLI_PERF_CHANNEL, event: 'Supabase Call', icon: '⏱️', tags })
}

setSupabaseCallRecorder(recordSupabaseCall)

// Re-export so call sites can `import { withSupabaseSource } from '../analytics/track'`.
export { withSupabaseSource }
```

- [ ] **Step 5: Set the command path for MCP tool calls**

In `cli/src/analytics/track.ts`, inside `withMcpToolTracking`, set the command path at the start of the wrapped handler so Supabase calls during a tool are attributable. Change the start of the `wrapped` function from:

```ts
  const wrapped = async (...args: Parameters<H>) => {
    const start = Date.now()
    let success = true
```

to:

```ts
  const wrapped = async (...args: Parameters<H>) => {
    const start = Date.now()
    currentCommandPath = `mcp:${toolName}`
    let success = true
```

- [ ] **Step 6: Run test to verify it passes**

Run: `bun test/test-supabase-perf.mjs`
Expected: PASS — `✅ supabase-perf tests passed`.

- [ ] **Step 7: Run the existing analytics suite to confirm no regression**

Run: `bun test/test-analytics.mjs && bun test/test-mcp-analytics.mjs`
Expected: PASS for both.

- [ ] **Step 8: Commit**

```bash
git add src/analytics/track.ts test/test-supabase-perf.mjs
git commit -m "feat(cli): emit Supabase Call perf events via recordSupabaseCall"
```

---

### Task 4: Inject the timed fetch in `createSupabaseClient` (gated) + recursion guard

**Files:**
- Modify: `cli/src/utils.ts:642`
- Modify: `cli/src/analytics/org-resolver.ts:24`
- Test: `cli/test/test-supabase-perf.mjs`

- [ ] **Step 1: Write the failing test**

In `cli/test/test-supabase-perf.mjs`, add these imports at the top (next to the existing imports):

```js
import { createSupabaseClient } from '../src/utils.ts'
import { resolveOwnerOrgId } from '../src/analytics/org-resolver.ts'
import { enableSupabaseInstrumentation } from '../src/analytics/supabase-perf.ts'
```

Then insert this block immediately **before** the `console.log('✅ supabase-perf tests passed')` line:

```js
  // --- Task 4: createSupabaseClient gate + recursion guard ---
  process.env.CAPGO_TOKEN = 'perf-key'
  delete process.env.CAPGO_DISABLE_TELEMETRY
  delete process.env.CAPGO_DISABLE_POSTHOG

  const stubClient = () => {
    const reqs = []
    globalThis.fetch = async (url, init) => {
      reqs.push({ url: String(url), init })
      if (String(url).endsWith('/private/config'))
        return new Response(JSON.stringify({ supaHost: 'https://db.co', supaKey: 'anon' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (String(url).includes('/rest/v1/'))
        return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
      return new Response('{}', { status: 200 })
    }
    return reqs
  }
  const findPerf = reqs => reqs.find(r => r.url.endsWith('/private/events') && JSON.parse(r.init.body).event === 'Supabase Call')

  // disabled (default): no timed fetch attached → no Supabase Call event
  let creqs = stubClient()
  let sb = await createSupabaseClient('perf-key', 'https://db.co', 'anon')
  await sb.from('demo').select('*')
  await flushAnalytics()
  assert.equal(findPerf(creqs), undefined, 'disabled => no perf event')

  // enabled: timed fetch attached → Supabase Call event with operation
  enableSupabaseInstrumentation()
  creqs = stubClient()
  sb = await createSupabaseClient('perf-key', 'https://db.co', 'anon')
  await sb.from('demo').select('*')
  await flushAnalytics()
  const cev = findPerf(creqs)
  assert.ok(cev, 'enabled => perf event')
  assert.equal(JSON.parse(cev.init.body).tags.operation, 'GET demo')

  // recursion guard: org-resolver must build an UNinstrumented client
  let capturedInstrument
  const chain = {
    from: () => chain,
    select: () => chain,
    eq: () => chain,
    abortSignal: () => chain,
    maybeSingle: async () => ({ data: { owner_org: 'org-x' } }),
  }
  const orgId = await resolveOwnerOrgId('recursion-key', 'com.recursion.test', {
    createClient: async (_apikey, _host, _key, _silent, instrument) => {
      capturedInstrument = instrument
      return chain
    },
  })
  assert.equal(orgId, 'org-x')
  assert.equal(capturedInstrument, false, 'org-resolver must create an uninstrumented client')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test/test-supabase-perf.mjs`
Expected: FAIL — `createSupabaseClient` ignores the new 5th param / does not attach a timed fetch, so the "enabled => perf event" assertion fails; and `capturedInstrument` is `undefined` (org-resolver passes only 4 args).

- [ ] **Step 3: Add the timed-fetch injection to `createSupabaseClient`**

In `cli/src/utils.ts`, add an import near the other internal imports at the top of the file:

```ts
import { createTimedFetch, isSupabaseInstrumentationEnabled } from './analytics/supabase-perf'
```

Change the `createSupabaseClient` signature (currently at `cli/src/utils.ts:642`) to add the `instrument` parameter:

```ts
export async function createSupabaseClient(apikey: string, supaHost?: string, supaKey?: string, silent = false, instrument = true) {
```

Change its `return createClient<Database>(...)` block to merge a timed fetch into `global` when instrumentation is enabled:

```ts
  return createClient<Database>(normalizedSupaHost, config.supaKey, { // NOSONAR
    auth: {
      persistSession: false,
    },
    global: {
      headers: {
        capgkey: apikey,
      },
      ...(isSupabaseInstrumentationEnabled() && instrument ? { fetch: createTimedFetch() } : {}),
    },
  })
```

- [ ] **Step 4: Add the recursion guard to `org-resolver.ts`**

In `cli/src/analytics/org-resolver.ts`, change line 24 from:

```ts
      const supabase = await create(apikey, undefined, undefined, true)
```

to (pass `instrument: false` so telemetry's own org lookup is never measured and cannot re-enter the perf path):

```ts
      const supabase = await create(apikey, undefined, undefined, true, false)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test/test-supabase-perf.mjs`
Expected: PASS — `✅ supabase-perf tests passed`.

- [ ] **Step 6: Run the org-resolver suite to confirm no regression**

Run: `bun test/test-analytics-org-resolver.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/utils.ts src/analytics/org-resolver.ts test/test-supabase-perf.mjs
git commit -m "feat(cli): instrument createSupabaseClient with the timed fetch (gated)"
```

---

### Task 5: Enable instrumentation at the CLI and MCP entrypoints

**Files:**
- Modify: `cli/src/index.ts`
- Modify: `cli/src/mcp/server.ts`

> No new automated test: enabling is a one-line entrypoint side-effect already covered behaviorally by Task 4's gate test. Verified here via typecheck + a build smoke check.

- [ ] **Step 1: Enable in the CLI entrypoint**

In `cli/src/index.ts`, add an import after the existing analytics imports (the `import { ... } from './analytics/track'` line, line 6):

```ts
import { enableSupabaseInstrumentation } from './analytics/supabase-perf'
```

Then add the call at module top level. Find this block (around line 63–68):

```ts
program
  .name(pack.name)
  .description(`📦 Manage packages and bundle versions in Capgo Cloud`)
  .version(pack.version, '-v, --version', `output the current version`)

let currentCommandPath = 'unknown'
```

Insert the enable call between the `program` block and `let currentCommandPath`:

```ts
program
  .name(pack.name)
  .description(`📦 Manage packages and bundle versions in Capgo Cloud`)
  .version(pack.version, '-v, --version', `output the current version`)

// Turn on client-side Supabase perf tracking for the CLI. (Off by default so
// the SDK bundle, which transitively imports createSupabaseClient, stays clean.)
enableSupabaseInstrumentation()

let currentCommandPath = 'unknown'
```

- [ ] **Step 2: Enable in the MCP entrypoint**

In `cli/src/mcp/server.ts`, add `enableSupabaseInstrumentation` to the existing analytics import (line 6):

```ts
import { enableSupabaseInstrumentation, setInvocationSource, trackMcpServerStarted, withMcpToolTracking } from '../analytics/track'
```

> This requires `track.ts` to re-export `enableSupabaseInstrumentation`. Add to the end of `cli/src/analytics/track.ts` (next to the existing `export { withSupabaseSource }`):
>
> ```ts
> export { enableSupabaseInstrumentation } from './supabase-perf'
> ```
>

In `cli/src/mcp/server.ts`, find the line `setInvocationSource('mcp')` (line 39) and add the enable call right after it:

```ts
  setInvocationSource('mcp')
  enableSupabaseInstrumentation()
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: PASS (no type errors).

- [ ] **Step 4: Build smoke check**

Run: `bun run build`
Expected: `✅ Built CLI and SDK successfully`.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts src/mcp/server.ts src/analytics/track.ts
git commit -m "feat(cli): enable Supabase perf tracking at CLI + MCP entrypoints"
```

---

### Task 6: Add `source` labels to the high-value table queries

**Files:**
- Modify: `cli/src/app/list.ts:22-26`
- Modify: `cli/src/channel/currentBundle.ts:53-58`
- Test: `cli/test/test-supabase-perf.mjs`

> Only genuine `.from()` table reads need labels — RPC calls (e.g. `exist_app_v2`, `get_user_id`) already self-name via `operation`. We label the two clearest within-command table reads here; more can be added later by the same pattern.

- [ ] **Step 1: Write the failing test**

In `cli/test/test-supabase-perf.mjs`, insert this block immediately **before** the `console.log('✅ supabase-perf tests passed')` line. It asserts the label flows end-to-end and verifies the exact `getActiveApps` call shape we are about to wrap:

```js
  // --- Task 6: source label flows into the event ---
  process.env.CAPGO_TOKEN = 'perf-key'
  let lreqs = stubClient()
  enableSupabaseInstrumentation()
  const lsb = await createSupabaseClient('perf-key', 'https://db.co', 'anon')
  await withSupabaseSource('apps.list', () => lsb
    .from('apps')
    .select()
    .order('created_at', { ascending: false }))
  await flushAnalytics()
  const lev = findPerf(lreqs)
  assert.ok(lev, 'labeled query emits a perf event')
  const ltags = JSON.parse(lev.init.body).tags
  assert.equal(ltags.source, 'apps.list')
  assert.equal(ltags.operation, 'GET apps')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test/test-supabase-perf.mjs`
Expected: FAIL — `findPerf` / `stubClient` are reused from Task 4 so they exist, but if Task 4's `stubClient`/`findPerf` are scoped correctly this should already pass for the helper; it exercises `withSupabaseSource` which exists. If it passes immediately, that is acceptable (it locks in the labeled shape); proceed to wrap the real call sites in Step 3 so production actually emits the label.

> If `stubClient`/`findPerf` are not in scope at this point in the file, define them once near the top of the `try` block (copy the definitions from Task 4) so all sections share them.

- [ ] **Step 3: Wrap the `apps.list` query**

In `cli/src/app/list.ts`, find `getActiveApps` (lines 22–35):

```ts
async function getActiveApps(supabase: SupabaseClient<Database>, silent: boolean) {
  const { data, error } = await supabase
    .from('apps')
    .select()
    .order('created_at', { ascending: false })
```

Add the import at the top of `cli/src/app/list.ts` (next to its existing imports):

```ts
import { withSupabaseSource } from '../analytics/track'
```

Wrap the query:

```ts
async function getActiveApps(supabase: SupabaseClient<Database>, silent: boolean) {
  const { data, error } = await withSupabaseSource('apps.list', () => supabase
    .from('apps')
    .select()
    .order('created_at', { ascending: false }))
```

- [ ] **Step 4: Wrap the `channels.currentBundle` query**

In `cli/src/channel/currentBundle.ts`, find (lines 53–58):

```ts
  const { data: supabaseChannel, error } = await supabase
    .from('channels')
    .select('version ( name )')
    .eq('name', channel)
    .eq('app_id', appId)
    .limit(1)
```

Add the import at the top of `cli/src/channel/currentBundle.ts` (next to its existing imports):

```ts
import { withSupabaseSource } from '../analytics/track'
```

Wrap the query:

```ts
  const { data: supabaseChannel, error } = await withSupabaseSource('channels.currentBundle', () => supabase
    .from('channels')
    .select('version ( name )')
    .eq('name', channel)
    .eq('app_id', appId)
    .limit(1))
```

- [ ] **Step 5: Run test + typecheck**

Run: `bun test/test-supabase-perf.mjs && bun run typecheck`
Expected: PASS — `✅ supabase-perf tests passed` and no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/list.ts src/channel/currentBundle.ts test/test-supabase-perf.mjs
git commit -m "feat(cli): label apps.list and channels.currentBundle Supabase queries"
```

---

### Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full CLI test suite**

Run: `bun run test`
Expected: every suite passes, including `test:supabase-perf`, `test:analytics`, `test:analytics-error-category`, `test:mcp-analytics`, `test:analytics-org-resolver`. (This script runs `bun run build` first.)

- [ ] **Step 2: Lint**

Run: `bun run lint`
Expected: no errors. If oxlint reports issues in the touched files, fix them and re-run.

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: no type errors.

- [ ] **Step 4: Manual smoke (optional, requires a logged-in CLI)**

Run a logged-in command with a local dump of events, e.g. set `CAPGO_DISABLE_TELEMETRY` unset and run `node dist/index.js app list`. Confirm no latency regression and that the command behaves identically. (Events go to PostHog only once a published build ships — see the spec's dashboard note.)

- [ ] **Step 5: Final commit (if any lint/type fixes were made)**

```bash
git add -A
git commit -m "chore(cli): lint + type fixes for Supabase perf tracking"
```

---

## Self-Review

**Spec coverage:**
- Generic timed fetch (one injection point) → Task 2 (`createTimedFetch`) + Task 4 (injection). ✓
- Instrumentation gate (CLI/MCP only, SDK excluded) → Task 2 (flag) + Task 5 (enable at entrypoints). ✓
- Three "where" dimensions: `operation` (Task 2 `deriveSupabaseOperation`), `command_path` (Task 3), `source` (Task 2 ALS + Task 6 labels). ✓
- Event shape `Supabase Call` on `cli-perf` with the exact tag set → Task 3 `recordSupabaseCall`. ✓
- Failure model (no body reads; status + duration; `categorizeHttpStatus`; `categorizeCliError` for throws; `rate_limited`) → Task 1 + Task 3. ✓
- Recursion guard (`instrument:false` on org-resolver) → Task 4. ✓
- Leaf module / no import cycle → Task 2 (leaf) + Task 3 (recorder injection). ✓
- Performance guarantees (fire-and-forget via existing `trackEvent`, abort-on-flush) → inherited; Task 3 uses `void trackEvent`. ✓
- Privacy (query strings stripped, closed enums) → Task 2 `deriveSupabaseOperation` + Task 1. ✓
- Tests for all of the above → Tasks 1–6 each add tests. ✓
- Dashboard insights → deferred to PostHog MCP after a build ships (spec §Dashboard), not code. Not a plan task.

**Placeholder scan:** No TBD/TODO; every code step shows complete code; commands have expected output. ✓

**Type/name consistency:** `SupabaseCallInfo`/`SupabaseCallRecorder`/`setSupabaseCallRecorder`/`createTimedFetch`/`deriveSupabaseOperation`/`getSupabaseSource`/`withSupabaseSource`/`enableSupabaseInstrumentation`/`isSupabaseInstrumentationEnabled`/`SLOW_THRESHOLD_MS` are defined in Task 2 and used with the same names in Tasks 3–6. `categorizeHttpStatus`/`rate_limited` defined in Task 1, used in Task 3. `setCurrentCommandPath`/`currentCommandPath` defined in Task 3. `createSupabaseClient(..., instrument = true)` defined in Task 4, relied on by org-resolver's 5-arg call. ✓

**Note on shared test helpers:** `stubClient`/`findPerf`/`flushAnalytics` are introduced in Tasks 3–4 and reused in Task 6 within the same `try` block. If executing tasks out of order, define the helpers once near the top of the `try` block.
