import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../utils/logging.ts'
import { recordBuildTime, supabaseAdmin } from '../utils/supabase.ts'
import { getEnv } from '../utils/utils.ts'

interface BuilderStatusResponse {
  job: {
    status: string
    started_at: number | null
    completed_at: number | null
    error: string | null
  }
  machine: Record<string, unknown> | null
  uploadUrl?: string
}

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'expired', 'released', 'cancelled'])
const STALE_THRESHOLD_MINUTES = 5
const ORPHAN_THRESHOLD_HOURS = 1
const BATCH_LIMIT = 500

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, async (c) => {
  const startTime = Date.now()
  let reconciled = 0
  let orphaned = 0
  let errors = 0

  const supabase = supabaseAdmin(c)
  const builderUrl = getEnv(c, 'BUILDER_URL')
  const builderApiKey = getEnv(c, 'BUILDER_API_KEY')

  if (!builderUrl || !builderApiKey) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Missing BUILDER_URL or BUILDER_API_KEY env var, skipping reconciliation' })
    return c.json(BRES)
  }

  const { data: staleBuilds, error: queryError } = await supabase
    .from('build_requests')
    .select('id, builder_job_id, app_id, owner_org, requested_by, platform, status, created_at')
    .not('status', 'in', `(${[...TERMINAL_STATUSES].join(',')})`)
    .lt('updated_at', new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000).toISOString())
    .order('updated_at', { ascending: true })
    .limit(BATCH_LIMIT)

  if (queryError) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Failed to query stale build_requests', error: queryError.message })
    return c.json(BRES)
  }

  if (!staleBuilds || staleBuilds.length === 0) {
    cloudlog({ requestId: c.get('requestId'), message: 'No stale builds to reconcile' })
    return c.json(BRES)
  }

  cloudlog({ requestId: c.get('requestId'), message: `Found ${staleBuilds.length} stale builds to reconcile` })

  const orphanCutoff = Date.now() - ORPHAN_THRESHOLD_HOURS * 60 * 60 * 1000
  const orphanBuilds = staleBuilds.filter(b => !b.builder_job_id && new Date(b.created_at).getTime() < orphanCutoff)
  const builderBuilds = staleBuilds.filter(b => !!b.builder_job_id)

  const orphanResults = await Promise.allSettled(
    orphanBuilds.map(async (build) => {
      const { error: updateError } = await supabase
        .from('build_requests')
        .update({
          status: 'failed',
          last_error: 'Build request was never submitted to builder',
          updated_at: new Date().toISOString(),
        })
        .eq('id', build.id)

      if (updateError)
        throw new Error(updateError.message)
    }),
  )

  for (let i = 0; i < orphanResults.length; i++) {
    if (orphanResults[i].status === 'fulfilled') {
      orphaned++
    }
    else {
      cloudlogErr({ requestId: c.get('requestId'), message: 'Failed to mark orphan build as failed', buildId: orphanBuilds[i].id, error: (orphanResults[i] as PromiseRejectedResult).reason })
      errors++
    }
  }

  const builderResults = await Promise.allSettled(
    builderBuilds.map(async (build) => {
      const response = await fetch(`${builderUrl}/jobs/${build.builder_job_id}`, {
        method: 'GET',
        headers: { 'x-api-key': builderApiKey },
      })

      if (!response.ok)
        throw new Error(`Builder status fetch failed: ${response.status}`)

      const builderJob = await response.json() as BuilderStatusResponse
      const jobStatus = builderJob.job.status

      const { error: updateError } = await supabase
        .from('build_requests')
        .update({
          status: jobStatus,
          last_error: builderJob.job.error || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', build.id)

      if (updateError)
        throw new Error(updateError.message)

      if (
        TERMINAL_STATUSES.has(jobStatus)
        && builderJob.job.started_at
        && builderJob.job.completed_at
      ) {
        const buildTimeSeconds = Math.floor((builderJob.job.completed_at - builderJob.job.started_at) / 1000)

        if (build.platform !== 'ios' && build.platform !== 'android') {
          cloudlogErr({ requestId: c.get('requestId'), message: 'Unexpected platform, skipping recordBuildTime', buildId: build.id, platform: build.platform })
        }
        else {
          await recordBuildTime(
            c,
            build.owner_org,
            build.requested_by,
            build.builder_job_id!,
            build.platform,
            buildTimeSeconds,
            builderJob.job.completed_at,
            build.app_id,
          )
        }
      }
    }),
  )

  for (let i = 0; i < builderResults.length; i++) {
    if (builderResults[i].status === 'fulfilled') {
      reconciled++
    }
    else {
      cloudlogErr({ requestId: c.get('requestId'), message: 'Error reconciling build', buildId: builderBuilds[i].id, jobId: builderBuilds[i].builder_job_id, error: String((builderResults[i] as PromiseRejectedResult).reason) })
      errors++
    }
  }

  cloudlog({
    requestId: c.get('requestId'),
    message: 'Build status reconciliation completed',
    duration_ms: Date.now() - startTime,
    total: staleBuilds.length,
    reconciled,
    orphaned,
    errors,
  })

  return c.json(BRES)
})
