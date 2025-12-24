import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { trackBentoEvent } from '../utils/bento.ts'
import { BRES, middlewareAPISecret, parseBody, simpleError } from '../utils/hono.ts'
import { cloudlogErr } from '../utils/logging.ts'
import { readStatsVersion } from '../utils/stats.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

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
    type,
    deployId,
    versionId,
    versionName,
    channelId,
    channelName,
    platform,
    appName,
    deployedAt,
  } = await parseBody<{
    email: string
    appId: string
    type: string
    deployId?: number
    versionId?: number
    versionName?: string
    channelId?: number
    channelName?: string
    platform?: string
    appName?: string
    deployedAt?: string
  }>(c)

  if (!email || !appId || !type) {
    return simpleError('missing_email_appId_type', 'Missing email, appId, or type', { email, appId, type })
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

  await trackBentoEvent(c, email, metadata, 'bundle:install_stats_24h')

  return c.json(BRES)
}
