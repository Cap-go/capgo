import type { Context } from 'hono'
import { quickError } from './hono.ts'
import { isTransientPgError } from './pg_errors.ts'

export type PgAuthLookupResult<T> =
  | { kind: 'ok', value: T }
  | { kind: 'not_found' }
  | { kind: 'db_error', error: unknown }

export function throwDatabaseUnavailable(c: Context, _source: string, _error: unknown, moreInfo: Record<string, unknown> = {}): never {
  quickError(
    503,
    'database_unavailable',
    'Database temporarily unavailable',
    { retryAfterSeconds: 2, ...moreInfo },
    undefined,
    { alert: false },
  )
}

/**
 * Transient connection/timeout failures become a quiet retryable 503.
 * Anything else (schema drift, bad query) keeps alerting so bugs are not muted.
 */
export function throwDatabaseLookupError(c: Context, source: string, error: unknown, moreInfo: Record<string, unknown> = {}): never {
  if (isTransientPgError(error))
    throwDatabaseUnavailable(c, source, error, moreInfo)
  quickError(503, 'upstream_unavailable', 'Database lookup failed', { source, ...moreInfo }, error)
}
