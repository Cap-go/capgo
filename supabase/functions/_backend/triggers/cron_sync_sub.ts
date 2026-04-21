import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { HTTPException } from 'hono/http-exception'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret, parseBody, simpleError } from '../utils/hono.ts'
import { cloudlog, cloudlogErr, serializeError } from '../utils/logging.ts'
import { closeClient, getDrizzleClient, getPgClient } from '../utils/pg.ts'
import { syncSubscriptionAndEvents } from '../utils/plans.ts'
import { retryWithBackoff } from '../utils/retry.ts'

interface OrgToGet {
  orgId?: string
  customerId?: string
}

const SYNC_RETRY_ATTEMPTS = 3
const SYNC_RETRY_DELAY_MS = 500

function getRetryableStatus(error: unknown): number | null {
  if (error instanceof HTTPException)
    return error.status

  if (error && typeof error === 'object') {
    if ('status' in error && typeof (error as { status?: unknown }).status === 'number')
      return (error as { status: number }).status

    if ('message' in error && typeof (error as { message?: unknown }).message === 'string') {
      const match = /error code:\s*(\d{3})/i.exec((error as { message: string }).message)
      if (match)
        return Number.parseInt(match[1], 10)
    }
  }

  return null
}

function getErrorCode(error: unknown): string | null {
  const cause = error instanceof HTTPException
    ? error.cause
    : (error && typeof error === 'object' && 'cause' in error ? (error as { cause?: unknown }).cause : undefined)

  if (cause && typeof cause === 'object' && 'error' in cause && typeof (cause as { error?: unknown }).error === 'string')
    return (cause as { error: string }).error

  return null
}

function isRetryableCronSyncError(error: unknown): boolean {
  const status = getRetryableStatus(error)
  return status !== null && status >= 500 && status < 600
}

function isMissingOrgError(error: unknown): boolean {
  return getRetryableStatus(error) === 404 && getErrorCode(error) === 'org_not_found'
}

async function syncSubscriptionAndEventsWithRetry(
  c: Parameters<typeof syncSubscriptionAndEvents>[0],
  orgId: string,
  drizzleClient: Parameters<typeof syncSubscriptionAndEvents>[2],
) {
  const { result, attempts } = await retryWithBackoff(async () => {
    try {
      await syncSubscriptionAndEvents(c, orgId, drizzleClient)
      return { ok: true as const, error: null as unknown }
    }
    catch (error) {
      return { ok: false as const, error }
    }
  }, {
    attempts: SYNC_RETRY_ATTEMPTS,
    baseDelayMs: SYNC_RETRY_DELAY_MS,
    shouldRetry: current => !current.ok && isRetryableCronSyncError(current.error),
  })

  if (!result)
    return { attempts, error: null as unknown }

  return { attempts, error: result.ok ? null : result.error }
}

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, async (c) => {
  const body = await parseBody<OrgToGet>(c)
  cloudlog({ requestId: c.get('requestId'), message: 'post cron_sync_sub body', body })
  if (!body.orgId)
    throw simpleError('no_orgId', 'No orgId', { body })

  const pgClient = getPgClient(c, true)
  const drizzleClient = getDrizzleClient(pgClient)
  try {
    const { error, attempts } = await syncSubscriptionAndEventsWithRetry(c, body.orgId, drizzleClient)
    if (error) {
      if (isMissingOrgError(error)) {
        cloudlog({ requestId: c.get('requestId'), message: 'cron_sync_sub skipping missing org', body, attempts })
        return c.json({ status: 'skipped', reason: 'org_not_found' })
      }

      cloudlogErr({
        requestId: c.get('requestId'),
        message: 'cron_sync_sub failed after retries',
        body,
        attempts,
        error: serializeError(error),
      })

      throw error
    }

    return c.json(BRES)
  }
  finally {
    closeClient(c, pgClient)
  }
})
