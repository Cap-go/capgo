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
