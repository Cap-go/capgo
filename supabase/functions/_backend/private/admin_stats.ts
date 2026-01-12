import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { z } from 'zod/mini'
import { getAdminAppsTrend, getAdminBandwidthTrend, getAdminBundlesTrend, getAdminDistributionMetrics, getAdminFailureMetrics, getAdminMauTrend, getAdminOrgMetrics, getAdminPlatformOverview, getAdminStorageTrend, getAdminSuccessRate, getAdminSuccessRateTrend, getAdminUploadMetrics } from '../utils/cloudflare.ts'
import { middlewareAuth, parseBody, simpleError, useCors } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { getAdminDeploymentsTrend, getAdminGlobalStatsTrend } from '../utils/pg.ts'
import { supabaseClient as useSupabaseClient } from '../utils/supabase.ts'

const bodySchema = z.object({
  metric_category: z.enum(['uploads', 'distribution', 'failures', 'success_rate', 'platform_overview', 'org_metrics', 'mau_trend', 'success_rate_trend', 'apps_trend', 'bundles_trend', 'deployments_trend', 'storage_trend', 'bandwidth_trend', 'global_stats_trend']),
  start_date: z.string().check(z.minLength(1)),
  end_date: z.string().check(z.minLength(1)),
})

interface AdminStatsBody {
  metric_category: string
  start_date: string
  end_date: string
  app_id?: string
  org_id?: string
  limit?: number
}

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.post('/', middlewareAuth, async (c) => {
  const authToken = c.req.header('authorization')

  if (!authToken)
    throw simpleError('not_authorized', 'Not authorized')

  const body = await parseBody<AdminStatsBody>(c)
  const parsedBodyResult = bodySchema.safeParse(body)
  if (!parsedBodyResult.success) {
    throw simpleError('invalid_json_body', 'Invalid json body', { body, parsedBodyResult })
  }

  // Verify user is admin
  const supabaseClient = useSupabaseClient(c, authToken)
  const { data: isAdmin, error: adminError } = await supabaseClient.rpc('is_admin')

  if (adminError) {
    cloudlog({ requestId: c.get('requestId'), message: 'is_admin_error', error: adminError })
    throw simpleError('is_admin_error', 'Is admin error', { adminError })
  }

  if (!isAdmin) {
    cloudlog({ requestId: c.get('requestId'), message: 'not_admin', body })
    throw simpleError('not_admin', 'Not admin - only admin users can access platform statistics')
  }

  // Use body directly since it has the full interface type
  const { metric_category, start_date, end_date, app_id, org_id, limit } = body

  cloudlog({
    requestId: c.get('requestId'),
    message: 'admin_stats request',
    metric_category,
    start_date,
    end_date,
    app_id,
    org_id,
  })

  try {
    let result

    switch (metric_category) {
      case 'uploads':
        result = await getAdminUploadMetrics(c, start_date, end_date, app_id)
        break

      case 'distribution':
        result = await getAdminDistributionMetrics(c, start_date, end_date, app_id)
        break

      case 'failures':
        result = await getAdminFailureMetrics(c, start_date, end_date, app_id)
        break

      case 'success_rate':
        result = await getAdminSuccessRate(c, start_date, end_date, app_id)
        break

      case 'platform_overview':
        result = await getAdminPlatformOverview(c, start_date, end_date, org_id)
        break

      case 'org_metrics':
        result = await getAdminOrgMetrics(c, start_date, end_date, limit || 100)
        break

      case 'mau_trend':
        result = await getAdminMauTrend(c, start_date, end_date, org_id)
        break

      case 'success_rate_trend':
        result = await getAdminSuccessRateTrend(c, start_date, end_date, app_id)
        break

      case 'apps_trend':
        result = await getAdminAppsTrend(c, start_date, end_date)
        break

      case 'bundles_trend':
        result = await getAdminBundlesTrend(c, start_date, end_date)
        break

      case 'deployments_trend':
        result = await getAdminDeploymentsTrend(c, start_date, end_date, app_id)
        break

      case 'storage_trend':
        result = await getAdminStorageTrend(c, start_date, end_date, app_id)
        break

      case 'bandwidth_trend':
        result = await getAdminBandwidthTrend(c, start_date, end_date, app_id)
        break

      case 'global_stats_trend':
        result = await getAdminGlobalStatsTrend(c, start_date, end_date)
        break

      default:
        throw simpleError('invalid_metric_category', 'Invalid metric category', { metric_category })
    }

    return c.json({
      success: true,
      metric_category,
      data: result,
      period: {
        start: start_date,
        end: end_date,
      },
    })
  }
  catch (error) {
    cloudlog({ requestId: c.get('requestId'), message: 'admin_stats_error', error })
    throw simpleError('admin_stats_error', 'Error fetching admin statistics', { error })
  }
})
