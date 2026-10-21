import type { FunctionInvokeOptions, FunctionsError, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type { ConsoleDataClient, ConsoleQuery } from '../../supabase/functions/_backend/utils/console_contract'
import type { Database } from '~/types/supabase.types'
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'

/**
 * Console transport to the Capgo API (VITE_API_HOST).
 *
 * Data (`from`/`rpc`), storage, realtime and function calls are sent to
 * `/private/console/*` and executed server-side with the caller's session, so
 * the browser never talks to Supabase for data. `auth` is still the Supabase
 * auth client for now; swapping it is the only step left to leave Supabase Auth.
 */
// Same option and result shapes as supabase-js functions.invoke, so a real
// SupabaseClient still structurally satisfies ConsoleClient (tests rely on this).
export type ConsoleInvokeOptions = FunctionInvokeOptions & { signal?: AbortSignal }

export type ConsoleInvokeResult<T> = { data: T | null, error: null } | { data: null, error: FunctionsError }

function resolveBaseURL() {
  const configured = ((import.meta.env.VITE_API_HOST as string | undefined) ?? '').replace(/\/$/, '')
  return configured.startsWith('/') ? new URL(configured, location.origin).href.replace(/\/$/, '') : configured
}

const EVENTS_MAX_BACKOFF_MS = 30_000
const QUERY_RETRIES = 2
const MUTATIONS = new Set(['insert', 'update', 'upsert', 'delete'])

// A request that never reached the API (network drop) or hit a booting/overloaded
// edge (503) can be replayed safely for reads; mutations are never replayed.
function isTransientQueryFailure(error: Error): boolean {
  if (error instanceof FunctionsFetchError)
    return true
  return error instanceof FunctionsHttpError && error.context instanceof Response && error.context.status === 503
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function createConsoleClient(authClient: Pick<SupabaseClient<Database>, 'auth'>) {
  const baseURL = resolveBaseURL()

  async function bearer(): Promise<string | null> {
    const { data } = await authClient.auth.getSession()
    return data.session?.access_token ?? null
  }

  async function invoke<T = any>(path: string, opts: ConsoleInvokeOptions = {}): Promise<ConsoleInvokeResult<T>> {
    try {
      const headers = new Headers(opts.headers)
      const token = await bearer()
      if (token && !headers.has('Authorization'))
        headers.set('Authorization', `Bearer ${token}`)
      const binary = opts.body instanceof Blob || opts.body instanceof FormData || opts.body instanceof ArrayBuffer
      if (opts.body != null && !binary && !headers.has('Content-Type'))
        headers.set('Content-Type', 'application/json')
      const response = await fetch(`${baseURL}/${path.replace(/^\//, '')}`, {
        method: opts.method ?? 'POST',
        headers,
        signal: opts.signal,
        body: opts.body == null ? undefined : binary || typeof opts.body === 'string' ? opts.body as BodyInit : JSON.stringify(opts.body),
      })
      if (!response.ok)
        return { data: null, error: new FunctionsHttpError(response) }
      const contentType = response.headers.get('content-type') ?? ''
      const data = contentType.includes('application/json') ? await response.json() : await response.text()
      return { data: data as T, error: null }
    }
    catch (error) {
      return { data: null, error: new FunctionsFetchError(error) }
    }
  }

  // Records the PostgREST builder chain and sends it in one request when awaited.
  function query(kind: ConsoleQuery['kind'], name: string, args: unknown[]) {
    const request: ConsoleQuery = { kind, name, args, operations: [] }
    let execution: Promise<unknown> | undefined
    let signal: AbortSignal | undefined
    const builder: any = new Proxy({}, {
      get(_target, method: string) {
        if (method === 'then') {
          execution ??= (async () => {
            const retries = request.operations.some(operation => MUTATIONS.has(operation.method)) ? 0 : QUERY_RETRIES
            let result = await invoke<any>('private/console/query', { body: request, signal })
            for (let attempt = 0; attempt < retries; attempt++) {
              if (!result.error || !isTransientQueryFailure(result.error) || signal?.aborted)
                break
              await sleep(300 * 2 ** attempt)
              result = await invoke<any>('private/console/query', { body: request, signal })
            }
            return result
          })().then((result) => {
            const throws = request.operations.some(operation => operation.method === 'throwOnError')
            if (result.error) {
              if (throws)
                throw result.error
              return { data: null, error: result.error, count: null, status: result.error instanceof FunctionsHttpError ? result.error.context.status : 0 }
            }
            const value = result.data as { data: unknown, error: { message: string } | null, count: number | null, status: number }
            const error = value.error ? Object.assign(new Error(value.error.message), value.error) : null
            if (error && throws)
              throw error
            return { ...value, error }
          })
          return execution.then.bind(execution)
        }
        if (method === 'abortSignal') {
          return (value: AbortSignal) => {
            signal = value
            return builder
          }
        }
        return (...operationArgs: unknown[]) => {
          // JSON turns undefined into null, which would defeat SDK default parameters on the server.
          const args = [...operationArgs]
          while (args.length && args[args.length - 1] === undefined)
            args.pop()
          request.operations.push({ method, args })
          return builder
        }
      },
    })
    return builder
  }

  // Org-scoped CLI activity as server-sent events, exposing the realtime channel shape the console uses.
  function channel(name: string): RealtimeChannel {
    const orgId = name.replace(/^cli-events:org:/, '')
    let handler: (message: { payload: unknown }) => void = () => {}
    const controller = new AbortController()
    const subscription = {
      on(_kind: string, _filter: unknown, callback: (message: { payload: unknown }) => void) {
        handler = callback
        return subscription
      },
      subscribe(callback: (status: string) => void) {
        void (async () => {
          let failures = 0
          while (!controller.signal.aborted) {
            try {
              const token = await bearer()
              const response = await fetch(`${baseURL}/private/console/events?org_id=${encodeURIComponent(orgId)}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                signal: controller.signal,
              })
              if (response.status === 503) {
                // No events backend (local Supabase runtime): report once and stop.
                callback('CHANNEL_ERROR')
                return
              }
              if (!response.ok || !response.body)
                throw new Error('Cannot subscribe to console events')
              failures = 0
              callback('SUBSCRIBED')
              const reader = response.body.getReader()
              const decoder = new TextDecoder()
              let buffer = ''
              try {
                for (;;) {
                  const { value, done } = await reader.read()
                  if (done)
                    break
                  buffer += decoder.decode(value, { stream: true })
                  for (let end = buffer.indexOf('\n\n'); end >= 0; end = buffer.indexOf('\n\n')) {
                    const event = buffer.slice(0, end)
                    buffer = buffer.slice(end + 2)
                    if (event.startsWith('data: '))
                      handler({ payload: JSON.parse(event.slice(6)) })
                  }
                }
              }
              finally {
                reader.releaseLock()
              }
            }
            catch {
              if (!controller.signal.aborted)
                callback('CHANNEL_ERROR')
              failures++
            }
            if (!controller.signal.aborted)
              await new Promise(resolve => setTimeout(resolve, Math.min(EVENTS_MAX_BACKOFF_MS, 1000 * 2 ** failures)))
          }
          callback('CLOSED')
        })()
        return subscription
      },
      track: async (_presence: unknown) => 'ok',
      unsubscribe: async () => {
        controller.abort()
        return 'ok'
      },
    }
    return subscription as unknown as RealtimeChannel
  }

  async function storageResult<T>(path: string, options: ConsoleInvokeOptions): Promise<{ data: T | null, error: Error | null }> {
    const result = await invoke<{ data: T | null, error: Error | null }>(path, options)
    if (result.error)
      return { data: null, error: result.error }
    return result.data ?? { data: null, error: new Error('Empty storage response') }
  }

  return {
    auth: authClient.auth,
    from: ((name: string) => query('table', name, [])) as ConsoleDataClient['from'],
    rpc: ((name: string, ...args: unknown[]) => query('rpc', name, args)) as ConsoleDataClient['rpc'],
    functions: { invoke },
    channel,
    removeChannel: async (subscription: RealtimeChannel) => subscription.unsubscribe(),
    storage: {
      from(bucket: string) {
        if (bucket !== 'images')
          throw new Error('Unsupported console storage bucket')
        return {
          createSignedUrl: (path: string, expiresIn: number) => storageResult<{ signedUrl: string }>('private/console/images/sign', { body: { path, expiresIn } }),
          remove: (paths: string[]) => storageResult<unknown>('private/console/images/remove', { body: { paths } }),
          upload: (path: string, file: Blob | ArrayBuffer, options?: { contentType?: string, upsert?: boolean }) => storageResult<{ path: string }>('private/console/images/upload', {
            body: file,
            headers: { 'x-image-path': path, 'x-image-upsert': String(options?.upsert ?? false), 'Content-Type': options?.contentType ?? 'application/octet-stream' },
          }),
        }
      },
    },
  }
}

export type ConsoleClient<T = Database> = ConsoleDataClient<T> & Pick<ReturnType<typeof createConsoleClient>, 'auth' | 'functions' | 'storage' | 'channel' | 'removeChannel'>
