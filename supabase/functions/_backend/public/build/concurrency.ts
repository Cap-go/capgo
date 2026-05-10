import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { quickError, simpleError } from '../../utils/hono.ts'
import { cloudlog } from '../../utils/logging.ts'
import { closeClient, getPgClient, logPgError } from '../../utils/pg.ts'
import { getCurrentPlanNameOrg } from '../../utils/supabase.ts'

export const NATIVE_BUILD_TERMINAL_STATUSES = ['succeeded', 'failed', 'expired', 'released', 'cancelled', 'canceled'] as const
const NON_ACTIVE_NATIVE_BUILD_STATUSES = ['pending', ...NATIVE_BUILD_TERMINAL_STATUSES] as const

const NATIVE_BUILD_CONCURRENCY_LIMITS: Record<string, number> = {
  Solo: 2,
  Maker: 3,
  Team: 4,
  Enterprise: 6,
}

interface PgClient {
  query: <T extends Record<string, unknown> = Record<string, unknown>>(query: string, params?: unknown[]) => Promise<{
    rowCount?: number | null
    rows: T[]
  }>
  release: () => void
}

interface ReserveNativeBuildSlotInput {
  buildRequestId: string
  orgId: string
  appId: string
  jobId: string
}

export interface NativeBuildSlotReservation {
  activeBuilds: number
  limit: number
  planName: string
  status: string
}

export function getNativeBuildConcurrencyLimit(planName: string | null | undefined): number {
  return NATIVE_BUILD_CONCURRENCY_LIMITS[planName ?? ''] ?? NATIVE_BUILD_CONCURRENCY_LIMITS.Solo
}

export async function reserveNativeBuildSlot(
  c: Context,
  input: ReserveNativeBuildSlotInput,
): Promise<NativeBuildSlotReservation> {
  let planName = 'Solo'
  let limit = getNativeBuildConcurrencyLimit(planName)
  let pgPool: ReturnType<typeof getPgClient> | null = null
  let client: PgClient | null = null

  try {
    planName = await getCurrentPlanNameOrg(c, input.orgId)
    limit = getNativeBuildConcurrencyLimit(planName)
    pgPool = getPgClient(c)
    client = await pgPool.connect() as PgClient
    await client.query('BEGIN')

    const orgLock = await client.query(
      'SELECT id FROM public.orgs WHERE id = $1 FOR UPDATE',
      [input.orgId],
    )
    if ((orgLock.rowCount ?? 0) !== 1) {
      throw simpleError('not_found', 'Organization not found')
    }

    const activeBuildsResult = await client.query<{ active_count: string }>(
      `
        SELECT COUNT(*)::text AS active_count
        FROM public.build_requests
        WHERE owner_org = $1
          AND id <> $2::uuid
          AND NOT (status = ANY($3::varchar[]))
      `,
      [input.orgId, input.buildRequestId, NON_ACTIVE_NATIVE_BUILD_STATUSES],
    )
    const activeBuilds = Number(activeBuildsResult.rows[0]?.active_count ?? 0)

    if (activeBuilds >= limit) {
      throw quickError(429, 'native_build_concurrency_limit_exceeded', 'Native build concurrency limit reached for your plan', {
        activeBuilds,
        limit,
        planName,
      })
    }

    const reservation = await client.query<{ status: string }>(
      `
        UPDATE public.build_requests
        SET
          status = CASE
            WHEN status = 'pending' THEN 'starting'
            ELSE status
          END,
          updated_at = now()
        WHERE id = $1::uuid
          AND owner_org = $2
          AND app_id = $3
          AND builder_job_id = $4
          AND NOT (status = ANY($5::varchar[]))
        RETURNING status
      `,
      [input.buildRequestId, input.orgId, input.appId, input.jobId, NATIVE_BUILD_TERMINAL_STATUSES],
    )

    if ((reservation.rowCount ?? 0) !== 1) {
      throw simpleError('invalid_request', 'Build request is not startable')
    }

    await client.query('COMMIT')

    const status = reservation.rows[0]?.status ?? 'starting'
    cloudlog({
      requestId: c.get('requestId'),
      message: 'Reserved native build slot',
      orgId: input.orgId,
      jobId: input.jobId,
      planName,
      limit,
      activeBuilds,
      status,
    })

    return {
      activeBuilds,
      limit,
      planName,
      status,
    }
  }
  catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK')
      }
      catch {
        // Preserve the original error.
      }
    }
    if (error instanceof HTTPException) {
      throw error
    }
    logPgError(c, 'reserve_native_build_slot', error)
    throw simpleError('internal_error', 'Unable to reserve native build slot', { error: (error as Error)?.message })
  }
  finally {
    client?.release()
    if (pgPool)
      await closeClient(c, pgPool)
  }
}
