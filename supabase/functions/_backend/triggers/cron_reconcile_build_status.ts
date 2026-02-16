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
const BATCH_LIMIT = 50

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

  for (const build of staleBuilds) {
    if (!build.builder_job_id) {
      const createdAt = new Date(build.created_at).getTime()
      const orphanCutoff = Date.now() - ORPHAN_THRESHOLD_HOURS * 60 * 60 * 1000
      if (createdAt < orphanCutoff) {
        const { error: updateError } = await supabase
          .from('build_requests')
          .update({
            status: 'failed',
            last_error: 'Build request was never submitted to builder',
            updated_at: new Date().toISOString(),
          })
          .eq('id', build.id)

        if (updateError) {
          cloudlogErr({ requestId: c.get('requestId'), message: 'Failed to mark orphan build as failed', buildId: build.id, error: updateError.message })
          errors++
        }
        else {
          orphaned++
        }
      }
      continue
    }

    try {
      const response = await fetch(`${builderUrl}/jobs/${build.builder_job_id}`, {
        method: 'GET',
        headers: { 'x-api-key': builderApiKey },
      })

      if (!response.ok) {
        cloudlogErr({ requestId: c.get('requestId'), message: 'Builder status fetch failed', buildId: build.id, jobId: build.builder_job_id, status: response.status })
        errors++
        continue
      }

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

      if (updateError) {
        cloudlogErr({ requestId: c.get('requestId'), message: 'Failed to update build_requests status', buildId: build.id, error: updateError.message })
        errors++
        continue
      }

      reconciled++

      if (
        TERMINAL_STATUSES.has(jobStatus)
        && builderJob.job.started_at
        && builderJob.job.completed_at
      ) {
        const buildTimeSeconds = Math.floor((builderJob.job.completed_at - builderJob.job.started_at) / 1000)
        const resolvedPlatform = (build.platform === 'ios' || build.platform === 'android')
          ? build.platform
          : 'ios'

        await recordBuildTime(
          c,
          build.owner_org,
          build.requested_by,
          build.builder_job_id,
          resolvedPlatform as 'ios' | 'android',
          buildTimeSeconds,
        )
      }
    }
    catch (err) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'Error reconciling build', buildId: build.id, jobId: build.builder_job_id, error: String(err) })
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
