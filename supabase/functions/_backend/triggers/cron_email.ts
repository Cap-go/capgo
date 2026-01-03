import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { EmailPreferenceKey, EmailPreferences } from '../utils/org_email_notifications.ts'
import { Hono } from 'hono/tiny'
import { trackBentoEvent } from '../utils/bento.ts'
import { BRES, middlewareAPISecret, parseBody, simpleError } from '../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../utils/logging.ts'
import { findBestPlan } from '../utils/plans.ts'
import { readStatsVersion } from '../utils/stats.ts'
import { getCurrentPlanNameOrg, supabaseAdmin } from '../utils/supabase.ts'

/**
 * Check if a user has a specific email preference enabled.
 * Defaults to true if preference is not set.
 */
async function isEmailPreferenceEnabled(
  c: Context,
  email: string,
  preferenceKey: EmailPreferenceKey,
): Promise<boolean> {
  // email_preferences is a JSONB column added in migration 20251228065406
  const { data: user, error } = await supabaseAdmin(c)
    .from('users')
    .select('*')
    .eq('email', email)
    .single()

  if (error || !user) {
    // Default to true if user not found (shouldn't happen)
    return true
  }

  const prefs = ((user as any).email_preferences as EmailPreferences | null) ?? {}
  const prefValue = prefs[preferenceKey]
  return prefValue === undefined ? true : prefValue
}

const thresholds = {
  // Number of updates in plain number
  updates: [
    100,
    1000,
    10000,
  ],
  // Percentage in decimal form (0.9 ==== 90%)
  failRate: [
    0.80,
    0.90,
    0.95,
  ],
  // Number of app opens in plain number
  appOpen: [
    500,
    1500,
    5000,
  ],
}

const funComparisons = {
  updates: [
    'a cupcake to every student in a small school!',
    'a pizza to every resident of a small town!',
    'a burger to everyone in a big city!',
  ],
  failRate: [
    'Even cats don\'t land on their feet that often!',
    'That\'s a success rate higher than the average pass rate of a tough university exam!',
    'That\'s a success rate that even the best basketball players would envy!',
  ],
  appOpen: [
    'Your app was opened more times than a popular local bakery\'s door!',
    'Your app was more popular than the latest episode of a hit TV show!',
    'Your app was opened more times than a blockbuster movie on its opening weekend!',
  ],
}

// Check what threshold does the stat qualify for and return the fun comparison
function getFunComparison(comparison: keyof typeof funComparisons, stat: number): string {
  const thresholdsForComparisons = thresholds[comparison]
  const index = thresholdsForComparisons.findIndex((threshold, index) => {
    const thresholdGreaterThenStat = threshold >= stat
    const lastIndexAndStatGreaterOrEqualThreshold = index === 2 && stat >= threshold

    return thresholdGreaterThenStat ?? lastIndexAndStatGreaterOrEqualThreshold
  })

  if (index === -1 || index >= 3)
    throw new Error(`Cannot find index for fun comparison, ${index}`)

  return funComparisons[comparison][index]
}

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, async (c) => {
  const {
    email,
    appId,
    orgId,
    type,
    deployId,
    versionId,
    versionName,
    channelId,
    channelName,
    platform,
    appName,
    deployedAt,
    cycleStart,
    cycleEnd,
  } = await parseBody<{
    email: string
    appId?: string
    orgId?: string
    type: string
    deployId?: number
    versionId?: number
    versionName?: string
    channelId?: number
    channelName?: string
    platform?: string
    appName?: string
    deployedAt?: string
    cycleStart?: string
    cycleEnd?: string
  }>(c)

  if (!email || !type) {
    return simpleError('missing_email_type', 'Missing email or type', { email, type })
  }

  // billing_period_stats uses orgId instead of appId
  if (type === 'billing_period_stats') {
    if (!orgId) {
      return simpleError('missing_orgId', 'Missing orgId for billing_period_stats', { email, type })
    }
    return await handleBillingPeriodStats(c, email, orgId, cycleStart, cycleEnd)
  }

  // All other types require appId
  if (!appId) {
    return simpleError('missing_appId', 'Missing appId', { email, type })
  }

  // check if email exists
  const { data: user, error: userError } = await supabaseAdmin(c)
    .from('users')
    .select('*')
    .eq('email', email)
    .single()
  if (userError || !user)
    return simpleError('user_not_found', 'User not found', { email, userError })

  if (type === 'weekly_install_stats') {
    return await handleWeeklyInstallStats(c, email, appId)
  }
  else if (type === 'monthly_create_stats') {
    return await handleMonthlyCreateStats(c, email, appId)
  }
  else if (type === 'deploy_install_stats') {
    return await handleDeployInstallStats(c, {
      email,
      appId,
      deployId,
      versionId,
      versionName,
      channelId,
      channelName,
      platform,
      appName,
      deployedAt,
    })
  }
  else {
    return simpleError('invalid_stats_type', 'Invalid stats type', { email, appId, type })
  }
})

async function handleWeeklyInstallStats(c: Context, email: string, appId: string) {
  // Check if user has weekly_stats preference enabled
  const isEnabled = await isEmailPreferenceEnabled(c, email, 'weekly_stats')
  if (!isEnabled) {
    cloudlog({ requestId: c.get('requestId'), message: 'Weekly stats email disabled for user', email, appId })
    return c.json({ status: 'Email preference disabled' }, 200)
  }

  const supabase = await supabaseAdmin(c)

  const { data: weeklyStats, error: generateStatsError } = await supabase.rpc('get_weekly_stats', {
    app_id: appId,
  }).single()

  if (!weeklyStats || generateStatsError) {
    return simpleError('cannot_generate_stats', 'Cannot generate stats', { error: generateStatsError })
  }

  if (weeklyStats.all_updates === 0) {
    return c.json({ status: 'No updates this week' }, 200)
  }

  const successUpdates = weeklyStats.all_updates - weeklyStats.failed_updates
  if (successUpdates < 0) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot send email for app, successUpdates < 0', error: weeklyStats, metadata: { app_id: appId, email } })
    cloudlogErr({ requestId: c.get('requestId'), message: 'Invalid stats detected', error: weeklyStats, metadata: { app_id: appId, email } })
    return c.json({ status: 'No valid stats available' }, 200)
  }

  const successPercentage = Math.round((successUpdates / weeklyStats.all_updates) * 10_000) / 10_000

  const metadata = {
    app_id: appId,
    weekly_updates: (weeklyStats.all_updates).toString(),
    fun_comparison: getFunComparison('updates', weeklyStats.all_updates),
    weekly_install: successUpdates.toString(),
    weekly_install_success: (successPercentage * 100).toString(),
    fun_comparison_2: getFunComparison('failRate', successPercentage),
    weekly_fail: (weeklyStats.failed_updates).toString(),
    weekly_open: (weeklyStats.open_app).toString(),
    fun_comparison_3: getFunComparison('appOpen', weeklyStats.open_app),
  }

  await trackBentoEvent(c, email, metadata, 'user:weekly_stats')

  return c.json(BRES)
}

async function handleMonthlyCreateStats(c: Context, email: string, appId: string) {
  // Check if user has monthly_stats preference enabled
  const isEnabled = await isEmailPreferenceEnabled(c, email, 'monthly_stats')
  if (!isEnabled) {
    cloudlog({ requestId: c.get('requestId'), message: 'Monthly stats email disabled for user', email, appId })
    return c.json({ status: 'Email preference disabled' }, 200)
  }

  const supabase = await supabaseAdmin(c)
  // Fetch additional stats for bundle creation, channel creation, and publishing
  const { data: appVersions, error: _appVersionsError } = await supabase
    .from('app_versions')
    .select('id, created_at')
    .eq('app_id', appId)
    .gte('created_at', new Date(new Date().setFullYear(new Date().getFullYear(), new Date().getMonth() - 1)).toISOString())
    .lte('created_at', new Date().toISOString())

  const { data: channels, error: _channelsError } = await supabase
    .from('channels')
    .select('id, created_at')
    .eq('app_id', appId)
    .gte('created_at', new Date(new Date().setFullYear(new Date().getFullYear(), new Date().getMonth() - 1)).toISOString())
    .lte('created_at', new Date().toISOString())

  const { data: deployHistory, error: _deployHistoryError } = await supabase
    .from('deploy_history')
    .select('id, deployed_at')
    .eq('app_id', appId)
    .gte('deployed_at', new Date(new Date().setFullYear(new Date().getFullYear(), new Date().getMonth() - 1)).toISOString())
    .lte('deployed_at', new Date().toISOString())

  const bundleCount = appVersions?.length ?? 0
  const channelCount = channels?.length ?? 0
  const publishCount = deployHistory?.length ?? 0

  const metadata = {
    app_id: appId,
    monthly_bundles_created: bundleCount.toString(),
    monthly_channels_created: channelCount.toString(),
    monthly_publishes: publishCount.toString(),
  }

  await trackBentoEvent(c, email, metadata, 'org:monthly_create_stats')

  return c.json(BRES)
}

async function handleDeployInstallStats(
  c: Context,
  payload: {
    email: string
    appId: string
    deployId?: number
    versionId?: number
    versionName?: string
    channelId?: number
    channelName?: string
    platform?: string
    appName?: string
    deployedAt?: string
  },
) {
  const {
    email,
    appId,
    deployId,
    versionId,
    versionName,
    channelId,
    channelName,
    platform,
    appName,
    deployedAt,
  } = payload

  // Check if user has deploy_stats_24h preference enabled
  const isEnabled = await isEmailPreferenceEnabled(c, email, 'deploy_stats_24h')
  if (!isEnabled) {
    cloudlog({ requestId: c.get('requestId'), message: 'Deploy install stats email disabled for user', email, appId })
    return c.json({ status: 'Email preference disabled' }, 200)
  }

  if (!versionId) {
    return simpleError('missing_version_id', 'Missing versionId', { appId, deployId })
  }

  let deployTime = deployedAt ? new Date(deployedAt) : null
  if (!deployTime || Number.isNaN(deployTime.getTime())) {
    if (deployId) {
      const { data: deploy, error: deployError } = await supabaseAdmin(c)
        .from('deploy_history')
        .select('deployed_at')
        .eq('id', deployId)
        .single()
      if (deployError || !deploy?.deployed_at) {
        return simpleError('missing_deployed_at', 'Missing deployedAt', { appId, deployId, deployError })
      }
      deployTime = new Date(deploy.deployed_at)
    }
    else {
      return simpleError('missing_deployed_at', 'Missing deployedAt', { appId, deployId, versionId })
    }
  }

  const windowStart = deployTime.toISOString()
  const windowEnd = new Date(deployTime.getTime() + 24 * 60 * 60 * 1000).toISOString()
  const versionStats = await readStatsVersion(c, appId, windowStart, windowEnd)
  const installs = versionStats
    .filter(row => Number(row.version_id) === Number(versionId))
    .reduce((sum, row) => sum + (row.install ?? 0), 0)

  const metadata = {
    app_id: appId,
    app_name: appName ?? '',
    deploy_id: deployId?.toString(),
    version_id: versionId?.toString(),
    version_name: versionName ?? '',
    channel_id: channelId?.toString(),
    channel_name: channelName ?? '',
    platform: platform ?? '',
    deployed_at: windowStart,
    install_count_24h: installs.toString(),
    window_hours: '24',
  }

  if (install_count_24h > 1) {
    await trackBentoEvent(c, email, metadata, 'bundle:install_stats_24h')
  }

  return c.json(BRES)
}

/**
 * Format bytes to human readable format (e.g., 1.5 GB, 250 MB)
 */
function formatBytes(bytes: number): string {
  if (bytes === 0)
    return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}

/**
 * Format large numbers with commas (e.g., 1,234,567)
 */
function formatNumber(num: number): string {
  return num.toLocaleString('en-US')
}

async function handleBillingPeriodStats(c: Context, email: string, orgId: string, cycleStart?: string, cycleEnd?: string) {
  // Check if user has billing_period_stats preference enabled
  const isEnabled = await isEmailPreferenceEnabled(c, email, 'billing_period_stats')
  if (!isEnabled) {
    cloudlog({ requestId: c.get('requestId'), message: 'Billing period stats email disabled for user', email, orgId })
    return c.json({ status: 'Email preference disabled' }, 200)
  }

  const supabase = await supabaseAdmin(c)

  // Get organization info
  const { data: org, error: orgError } = await supabase
    .from('orgs')
    .select('id, name')
    .eq('id', orgId)
    .single()

  if (orgError || !org) {
    return simpleError('org_not_found', 'Organization not found', { orgId, orgError })
  }

  // Use cycle dates passed from the SQL function if available,
  // otherwise fall back to get_cycle_info_org (for backwards compatibility)
  let startDate: string
  let endDate: string

  if (cycleStart && cycleEnd) {
    // Use dates passed from the SQL function (guaranteed to be the completed billing period)
    startDate = new Date(cycleStart).toISOString().split('T')[0]
    endDate = new Date(cycleEnd).toISOString().split('T')[0]
  }
  else {
    // Fallback: get cycle info from RPC
    const { data: cycleInfo, error: cycleError } = await supabase
      .rpc('get_cycle_info_org', { orgid: orgId })
      .single()

    if (cycleError || !cycleInfo) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot get cycle info', error: cycleError, metadata: { orgId, email } })
      return simpleError('cannot_get_cycle_info', 'Cannot get cycle info', { error: cycleError })
    }

    startDate = new Date(cycleInfo.subscription_anchor_start).toISOString().split('T')[0]
    endDate = new Date(cycleInfo.subscription_anchor_end).toISOString().split('T')[0]
  }

  // Get total metrics for the billing period
  const { data: metrics, error: metricsError } = await supabase
    .rpc('get_total_metrics', {
      org_id: orgId,
      start_date: startDate,
      end_date: endDate,
    })
    .single()

  if (metricsError) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot get total metrics', error: metricsError, metadata: { orgId, email } })
    return simpleError('cannot_get_metrics', 'Cannot get metrics', { error: metricsError })
  }

  // Get credits used in the billing period
  let creditsUsed = 0
  const { data: credits } = await supabase
    .from('usage_credit_consumptions')
    .select('credits_used')
    .eq('org_id', orgId)
    .gte('applied_at', startDate)
    .lt('applied_at', endDate)

  if (credits) {
    creditsUsed = credits.reduce((sum, row) => sum + Number(row.credits_used || 0), 0)
  }

  // Format the metrics for the email
  const mau = metrics?.mau ?? 0
  const bandwidth = metrics?.bandwidth ?? 0
  const storage = metrics?.storage ?? 0
  const buildTimeUnit = metrics?.build_time_unit ?? 0

  // Get current plan and find the best plan for this usage
  const currentPlanName = await getCurrentPlanNameOrg(c, orgId)

  // Get current plan limits
  const { data: currentPlan } = await supabase
    .from('plans')
    .select('mau, bandwidth, storage, build_time_unit')
    .eq('name', currentPlanName)
    .single()

  // Find the best plan for the actual usage
  const bestPlanName = await findBestPlan(c, {
    mau,
    bandwidth,
    storage,
    build_time_unit: buildTimeUnit,
  })

  // Calculate usage percentages against current plan limits
  const mauPercent = currentPlan?.mau ? Math.round((mau / currentPlan.mau) * 100) : 0
  const bandwidthPercent = currentPlan?.bandwidth ? Math.round((bandwidth / currentPlan.bandwidth) * 100) : 0
  const storagePercent = currentPlan?.storage ? Math.round((storage / currentPlan.storage) * 100) : 0
  const buildTimePercent = currentPlan?.build_time_unit ? Math.round((buildTimeUnit / currentPlan.build_time_unit) * 100) : 0

  // The highest usage percentage determines if we should recommend an upgrade
  const maxUsagePercent = Math.max(mauPercent, bandwidthPercent, storagePercent, buildTimePercent)

  // Determine if the user should consider upgrading
  // If usage is >= 90% of any limit, or if the best plan is higher than current plan
  const planOrder = ['Solo', 'Maker', 'Team', 'Enterprise']
  const rawCurrentPlanIndex = planOrder.indexOf(currentPlanName)
  const rawBestPlanIndex = planOrder.indexOf(bestPlanName)

  // Handle unknown plan names (e.g., Free, custom plans, legacy plans)
  // Treat unknown plans as lowest tier (index 0) for comparison purposes
  const currentPlanIndex = rawCurrentPlanIndex === -1 ? 0 : rawCurrentPlanIndex
  const bestPlanIndex = rawBestPlanIndex === -1 ? 0 : rawBestPlanIndex

  // Should upgrade if:
  // 1. Best plan is higher tier than current plan (user exceeded their plan), OR
  // 2. Usage is >= 90% of any metric limit (user is close to exceeding)
  const exceededPlan = bestPlanIndex > currentPlanIndex
  const nearingLimits = maxUsagePercent >= 90
  const shouldUpgrade = exceededPlan || nearingLimits

  // If should upgrade, recommend the best plan for their usage
  // If best plan equals current (user is within limits but near 90%), recommend next tier
  let recommendedPlan = currentPlanName
  if (shouldUpgrade) {
    if (exceededPlan) {
      // User already exceeded their plan, recommend the best fitting plan
      recommendedPlan = bestPlanName
    }
    else if (nearingLimits && currentPlanIndex < planOrder.length - 1) {
      // User is near limits but hasn't exceeded, recommend next tier up
      recommendedPlan = planOrder[currentPlanIndex + 1]
    }
  }

  // Determine which metrics are at high usage (>= 90%)
  const highUsageMetrics: string[] = []
  if (mauPercent >= 90)
    highUsageMetrics.push('MAU')
  if (bandwidthPercent >= 90)
    highUsageMetrics.push('Bandwidth')
  if (storagePercent >= 90)
    highUsageMetrics.push('Storage')
  if (buildTimePercent >= 90)
    highUsageMetrics.push('Build Time')

  const metadata = {
    org_id: orgId,
    org_name: org.name ?? '',
    monthly_active_users: formatNumber(mau),
    bandwidth_used: formatBytes(bandwidth),
    storage_used: formatBytes(storage),
    credits_used: formatNumber(Math.round(creditsUsed * 100) / 100),
    // Raw values for potential use in email templates
    mau_raw: mau.toString(),
    bandwidth_raw: bandwidth.toString(),
    storage_raw: storage.toString(),
    credits_raw: creditsUsed.toString(),
    // Include period dates for context
    period_start: startDate,
    period_end: endDate,
    // Plan information
    current_plan: currentPlanName,
    recommended_plan: recommendedPlan,
    should_upgrade: shouldUpgrade ? 'true' : 'false',
    // Upgrade reason details
    exceeded_plan: exceededPlan ? 'true' : 'false',
    nearing_limits: nearingLimits ? 'true' : 'false',
    high_usage_metrics: highUsageMetrics.join(', ') || 'none',
    // Usage percentages
    mau_percent: mauPercent.toString(),
    bandwidth_percent: bandwidthPercent.toString(),
    storage_percent: storagePercent.toString(),
    max_usage_percent: maxUsagePercent.toString(),
  }

  await trackBentoEvent(c, email, metadata, 'org:billing_period_stats')

  return c.json(BRES)
}
