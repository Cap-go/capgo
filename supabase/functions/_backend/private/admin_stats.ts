import type Stripe from 'stripe'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { z } from 'zod/mini'
import { getAdminAppsTrend, getAdminBandwidthTrend, getAdminBundlesTrend, getAdminDistributionMetrics, getAdminFailureMetrics, getAdminMauTrend, getAdminOrgMetrics, getAdminPlatformOverview, getAdminStorageTrend, getAdminSuccessRate, getAdminSuccessRateTrend, getAdminUploadMetrics } from '../utils/cloudflare.ts'
import { middlewareAuth, parseBody, simpleError, useCors } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { getAdminCancelledOrganizations, getAdminCustomerCountryBreakdown, getAdminDeploymentsTrend, getAdminEmailTypeBreakdown, getAdminGlobalStatsTrend, getAdminOnboardingFunnel, getAdminPluginBreakdown, getAdminTrialOrganizations } from '../utils/pg.ts'
import { getCancellationDetails } from '../utils/stripe.ts'
import { supabaseClient as useSupabaseClient } from '../utils/supabase.ts'

export const MAX_ADMIN_STATS_LIMIT = 50_000
export const MAX_ADMIN_STATS_OFFSET = 100_000
const ISO_UTC_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/
const INVALID_ADMIN_STATS_DATE = 'Expected ISO 8601 UTC datetime string'

export const adminStatsBodySchema = z.object({
  metric_category: z.enum(['uploads', 'distribution', 'failures', 'success_rate', 'platform_overview', 'org_metrics', 'mau_trend', 'success_rate_trend', 'apps_trend', 'bundles_trend', 'deployments_trend', 'storage_trend', 'bandwidth_trend', 'global_stats_trend', 'plugin_breakdown', 'trial_organizations', 'onboarding_funnel', 'cancelled_users', 'email_type_breakdown', 'customer_country_breakdown']),
  start_date: z.string().check(z.minLength(1), z.regex(ISO_UTC_DATETIME_REGEX, { message: INVALID_ADMIN_STATS_DATE })),
  end_date: z.string().check(z.minLength(1), z.regex(ISO_UTC_DATETIME_REGEX, { message: INVALID_ADMIN_STATS_DATE })),
  app_id: z.optional(z.string().check(z.minLength(1))),
  org_id: z.optional(z.string().check(z.minLength(1))),
  limit: z.optional(z.number().check(z.int(), z.minimum(1), z.maximum(MAX_ADMIN_STATS_LIMIT))),
  offset: z.optional(z.number().check(z.int(), z.minimum(0), z.maximum(MAX_ADMIN_STATS_OFFSET))),
})

interface AdminStatsBody {
  metric_category: string
  start_date: string
  end_date: string
  app_id?: string
  org_id?: string
  limit?: number
  offset?: number
}

type CancellationDetails = Stripe.Subscription.CancellationDetails

const cancellationFeedbackLabels: Record<string, string> = {
  customer_service: 'Customer service',
  low_quality: 'Low quality',
  missing_features: 'Missing features',
  other: 'Other',
  switched_service: 'Switched service',
  too_complex: 'Too complex',
  too_expensive: 'Too expensive',
  unused: 'Unused',
}

const cancellationReasonLabels: Record<string, string> = {
  cancellation_requested: 'Cancellation requested',
  payment_disputed: 'Payment disputed',
  payment_failed: 'Payment failed',
}

/**
 * Formats Stripe cancellation details into a short, human-readable label.
 */
function formatCancellationReason(details: CancellationDetails | null): string | null {
  if (!details)
    return null

  const feedback = details.feedback ? (cancellationFeedbackLabels[details.feedback] ?? details.feedback) : null
  const reason = details.reason ? (cancellationReasonLabels[details.reason] ?? details.reason) : null
  const comment = details.comment?.trim()

  let base = feedback || reason || null
  if (comment)
    base = base ? `${base} — ${comment}` : comment

  return base
}

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.post('/', middlewareAuth, async (c) => {
  const authToken = c.req.header('authorization')

  if (!authToken)
    throw simpleError('not_authorized', 'Not authorized')

  const body = await parseBody<AdminStatsBody>(c)
  const parsedBodyResult = adminStatsBodySchema.safeParse(body)
  if (!parsedBodyResult.success) {
    throw simpleError('invalid_json_body', 'Invalid json body', { body, parsedBodyResult })
  }

  // Verify user is admin
  const supabaseClient = useSupabaseClient(c, authToken)
  const { data: isAdmin, error: adminError } = await supabaseClient.rpc('is_platform_admin')

  if (adminError) {
    cloudlog({ requestId: c.get('requestId'), message: 'is_admin_error', error: adminError })
    throw simpleError('is_admin_error', 'Is admin error', { adminError })
  }

  if (!isAdmin) {
    cloudlog({ requestId: c.get('requestId'), message: 'not_admin', body })
    throw simpleError('not_admin', 'Not admin - only admin users can access platform statistics')
  }

  const { metric_category, start_date, end_date, app_id, org_id, limit, offset } = parsedBodyResult.data

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

      case 'plugin_breakdown':
        result = await getAdminPluginBreakdown(c, start_date, end_date)
        break

      case 'trial_organizations':
        result = await getAdminTrialOrganizations(c, limit || 20, offset || 0)
        break

      case 'cancelled_users': {
        const canceledOrgs = await getAdminCancelledOrganizations(c, start_date, end_date, limit || 20, offset || 0)
        const detailsCache = new Map<string, CancellationDetails | null>()
        const organizations = await Promise.all(
          canceledOrgs.organizations.map(async (org) => {
            let details: CancellationDetails | null = null
            if (org.subscription_id) {
              if (detailsCache.has(org.subscription_id)) {
                details = detailsCache.get(org.subscription_id) ?? null
              }
              else {
                details = await getCancellationDetails(c, org.subscription_id)
                detailsCache.set(org.subscription_id, details)
              }
            }
            return {
              org_id: org.org_id,
              org_name: org.org_name,
              management_email: org.management_email,
              canceled_at: org.canceled_at,
              plan_name: org.plan_name,
              billing_type: org.billing_type,
              subscription_or_signup_date: org.subscription_or_signup_date,
              cancellation_reason: formatCancellationReason(details),
            }
          }),
        )
        result = {
          organizations,
          total: canceledOrgs.total,
        }
        break
      }

      case 'onboarding_funnel':
        result = await getAdminOnboardingFunnel(c, start_date, end_date)
        break

      case 'email_type_breakdown':
        result = await getAdminEmailTypeBreakdown(c, start_date, end_date)
        break

      case 'customer_country_breakdown':
        result = await getAdminCustomerCountryBreakdown(c, start_date, end_date)
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
