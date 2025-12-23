import type { Context } from 'hono'
import type { PlanUsage } from './supabase.ts'
import type { Database } from './supabase.types.ts'
import { quickError } from './hono.ts'
import { cloudlog, cloudlogErr } from './logging.ts'
import { logsnag } from './logsnag.ts'
import { sendNotifOrg } from './notifications.ts'
import { recordUsage, setThreshold, syncSubscriptionData } from './stripe.ts'
import {
  getCurrentPlanNameOrg,
  getPlanUsagePercent,
  getTotalStats,
  isGoodPlanOrg,
  isOnboardedOrg,
  isOnboardingNeeded,
  isTrialOrg,
  set_bandwidth_exceeded,
  set_build_time_exceeded,
  set_mau_exceeded,
  set_storage_exceeded,
  supabaseAdmin,
} from './supabase.ts'

type CreditMetric = Database['public']['Enums']['credit_metric_type']

interface BillingCycleInfo {
  subscription_anchor_start: string | null
  subscription_anchor_end: string | null
}

interface CreditApplicationResult {
  overage_amount: number
  credits_required: number
  credits_applied: number
  credits_remaining: number
  overage_covered: number
  overage_unpaid: number
  credit_step_id: number | null
}

async function getBillingCycleRange(c: Context, orgId: string): Promise<BillingCycleInfo | null> {
  try {
    const { data } = await supabaseAdmin(c)
      .rpc('get_cycle_info_org', { orgid: orgId })
      .single()
    return data ?? null
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'getBillingCycleRange error', orgId, error })
    return null
  }
}

async function applyCreditsForMetric(
  c: Context,
  orgId: string,
  metric: CreditMetric,
  overageAmount: number,
  planId: string | undefined,
  usage: number,
  limit: number | null | undefined,
  billingCycle: BillingCycleInfo | null,
): Promise<CreditApplicationResult | null> {
  if (overageAmount <= 0)
    return null

  if (!planId || !billingCycle?.subscription_anchor_start || !billingCycle?.subscription_anchor_end) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'applyCreditsForMetric missing plan or billing cycle context',
      orgId,
      metric,
      planId,
      billingCycle,
    })
    return {
      overage_amount: overageAmount,
      credits_required: 0,
      credits_applied: 0,
      credits_remaining: 0,
      overage_covered: 0,
      overage_unpaid: overageAmount,
      credit_step_id: null,
    }
  }
  try {
    const { data, error } = await supabaseAdmin(c)
      .rpc('apply_usage_overage', {
        p_org_id: orgId,
        p_metric: metric,
        p_overage_amount: overageAmount,
        p_billing_cycle_start: billingCycle.subscription_anchor_start,
        p_billing_cycle_end: billingCycle.subscription_anchor_end,
        p_details: {
          usage,
          limit: limit ?? 0,
        },
      })
      .single()

    if (error) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'apply_usage_overage error', orgId, metric, overageAmount, error })
      return {
        overage_amount: overageAmount,
        credits_required: 0,
        credits_applied: 0,
        credits_remaining: 0,
        overage_covered: 0,
        overage_unpaid: overageAmount,
        credit_step_id: null,
      }
    }

    return {
      overage_amount: Number(data?.overage_amount ?? overageAmount),
      credits_required: Number(data?.credits_required ?? 0),
      credits_applied: Number(data?.credits_applied ?? 0),
      credits_remaining: Number(data?.credits_remaining ?? 0),
      overage_covered: Number(data?.overage_covered ?? 0),
      overage_unpaid: Number(data?.overage_unpaid ?? overageAmount),
      credit_step_id: data?.credit_step_id ?? null,
    }
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'applyCreditsForMetric exception', orgId, metric, overageAmount, error })
    return {
      overage_amount: overageAmount,
      credits_required: 0,
      credits_applied: 0,
      credits_remaining: 0,
      overage_covered: 0,
      overage_unpaid: overageAmount,
      credit_step_id: null,
    }
  }
}

function planToInt(plan: string) {
  switch (plan) {
    case 'Solo':
      return 1
    case 'Maker':
      return 2
    case 'Team':
      return 3
    case 'Enterprise':
      return 4
    default:
      return 1
  }
}

interface FindBestPlanArgs {
  mau: number
  bandwidth: number
  storage: number
  build_time_unit?: number
}

export async function findBestPlan(c: Context, stats: Database['public']['Functions']['find_best_plan_v3']['Args'] | FindBestPlanArgs): Promise<string> {
  const buildTimeSeconds = 'build_time_unit' in stats ? stats.build_time_unit : 0

  const { data, error } = await supabaseAdmin(c)
    .rpc('find_best_plan_v3', {
      mau: stats.mau ?? 0,
      bandwidth: stats.bandwidth,
      storage: stats.storage,
      build_time_unit: buildTimeSeconds ?? 0,
    })
    .single()
  if (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'findBestPlan', error })
    throw new Error(error.message)
  }

  return data ?? 'Team'
}

export async function getMeterdUsage(c: Context, orgId: string): Promise<Database['public']['CompositeTypes']['stats_table']> {
  const { data, error } = await supabaseAdmin(c)
    .rpc('get_metered_usage', { orgid: orgId })

  if (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'getMeterdUsage', error })
    throw new Error(error.message)
  }

  return {
    mau: data?.mau ?? 0,
    storage: data?.storage ?? 0,
    bandwidth: data?.bandwidth ?? 0,
  }
}
interface Prices {
  mau: string
  storage: string
  bandwidth: string
}

async function setMetered(c: Context, customer_id: string | null, orgId: string) {
  if (customer_id === null)
    return Promise.resolve()
  cloudlog({ requestId: c.get('requestId'), message: 'setMetered', customer_id, orgId })
  // return await Promise.resolve({} as Prices)
  const { data } = await supabaseAdmin(c)
    .from('stripe_info')
    .select()
    .eq('customer_id', customer_id)
    .single()
  if (data?.subscription_metered && Object.keys(data.subscription_metered).length > 0) {
    try {
      await setThreshold(c, customer_id)
    }
    catch (error) {
      cloudlog({ requestId: c.get('requestId'), message: 'error setThreshold', error })
    }
    const prices = data.subscription_metered as any as Prices
    const get_metered_usage = await getMeterdUsage(c, orgId)
    if (get_metered_usage.mau && get_metered_usage.mau > 0 && prices.mau)
      await recordUsage(c, customer_id, prices.mau, get_metered_usage.mau)
    if (get_metered_usage.storage && get_metered_usage.storage > 0)
      await recordUsage(c, customer_id, prices.storage, get_metered_usage.storage)
    if (get_metered_usage.bandwidth && get_metered_usage.bandwidth > 0)
      await recordUsage(c, customer_id, prices.bandwidth, get_metered_usage.bandwidth)
    // Note: build_minutes uses credits-only billing, not Stripe metered pricing
  }
}

async function userAbovePlan(c: Context, org: {
  customer_id: string | null
  stripe_info: {
    subscription_id: string | null
  } | null
}, orgId: string, is_good_plan: boolean): Promise<boolean> {
  cloudlog({ requestId: c.get('requestId'), message: 'userAbovePlan', orgId, is_good_plan })
  const totalStats = await getTotalStats(c, orgId)
  const currentPlanName = await getCurrentPlanNameOrg(c, orgId)
  if (!totalStats) {
    return false
  }

  const { data: currentPlan, error: currentPlanError } = await supabaseAdmin(c)
    .from('plans')
    .select('*')
    .eq('name', currentPlanName)
    .single()
  if (currentPlanError) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'currentPlanError', error: currentPlanError })
  }

  await setMetered(c, org.customer_id, orgId)

  const billingCycle = await getBillingCycleRange(c, orgId)
  const planId = currentPlan?.id

  const metrics: Array<{ key: CreditMetric, usage: number, limit: number | null | undefined }> = [
    { key: 'mau', usage: Number(totalStats.mau ?? 0), limit: currentPlan?.mau },
    { key: 'storage', usage: Number(totalStats.storage ?? 0), limit: currentPlan?.storage },
    { key: 'bandwidth', usage: Number(totalStats.bandwidth ?? 0), limit: currentPlan?.bandwidth },
    { key: 'build_time', usage: Number(totalStats.build_time_unit ?? 0), limit: currentPlan?.build_time_unit },
  ]

  const creditResults: Record<CreditMetric, CreditApplicationResult | null> = {
    mau: null,
    storage: null,
    bandwidth: null,
    build_time: null,
  }

  let hasUnpaidOverage = false

  for (const metric of metrics) {
    const planLimit = Number(metric.limit ?? 0)
    const overage = metric.usage - planLimit
    if (overage > 0) {
      const creditResult = await applyCreditsForMetric(c, orgId, metric.key, overage, planId, metric.usage, metric.limit, billingCycle)
      creditResults[metric.key] = creditResult
      const unpaid = creditResult?.overage_unpaid ?? overage
      if (metric.key === 'mau') {
        await set_mau_exceeded(c, orgId, unpaid > 0)
      }
      else if (metric.key === 'storage') {
        await set_storage_exceeded(c, orgId, unpaid > 0)
      }
      else if (metric.key === 'bandwidth') {
        await set_bandwidth_exceeded(c, orgId, unpaid > 0)
      }
      else if (metric.key === 'build_time') {
        await set_build_time_exceeded(c, orgId, unpaid > 0)
      }
      if (unpaid > 0)
        hasUnpaidOverage = true
    }
    else {
      if (metric.key === 'mau')
        await set_mau_exceeded(c, orgId, false)
      else if (metric.key === 'storage')
        await set_storage_exceeded(c, orgId, false)
      else if (metric.key === 'bandwidth')
        await set_bandwidth_exceeded(c, orgId, false)
      else if (metric.key === 'build_time')
        await set_build_time_exceeded(c, orgId, false)
    }
  }

  if (!hasUnpaidOverage) {
    cloudlog({ requestId: c.get('requestId'), message: 'Overage fully covered by credits', orgId, creditResults })
    return false
  }

  const bestPlan = await findBestPlan(c, {
    mau: totalStats.mau,
    storage: totalStats.storage,
    bandwidth: totalStats.bandwidth,
    build_time_unit: totalStats.build_time_unit,
  })

  // If the calculated best plan ranks lower than the current one, the org is over-provisioned, so skip upgrade nudges.
  if (planToInt(bestPlan) < planToInt(currentPlanName)) {
    return true
  }

  const bestPlanKey = bestPlan.toLowerCase().replace(' ', '_')
  const sent = await sendNotifOrg(c, `user:upgrade_to_${bestPlanKey}`, { best_plan: bestPlanKey, plan_name: currentPlanName }, orgId, orgId, '0 0 * * 1')
  if (sent) {
    cloudlog({ requestId: c.get('requestId'), message: `user:upgrade_to_${bestPlanKey}`, orgId })
    await logsnag(c).track({
      channel: 'usage',
      event: `User need upgrade to ${bestPlanKey}`,
      icon: '⚠️',
      user_id: orgId,
      notify: false,
    }).catch()
  }

  return true
}

async function userIsAtPlanUsage(c: Context, orgId: string, percentUsage: PlanUsage) {
  // Reset exceeded flags if plan is good
  await set_mau_exceeded(c, orgId, false)
  await set_storage_exceeded(c, orgId, false)
  await set_bandwidth_exceeded(c, orgId, false)
  await set_build_time_exceeded(c, orgId, false)

  // check if user is at more than 90%, 50% or 70% of plan usage
  if (percentUsage.total_percent >= 90) {
    // cron every month * * * * 1
    const sent = await sendNotifOrg(c, 'user:usage_90_percent_of_plan', { percent: percentUsage }, orgId, orgId, '0 0 1 * *')
    if (sent) {
      // await addEventPerson(user.email, {}, 'user:90_percent_of_plan', 'red')
      await logsnag(c).track({
        channel: 'usage',
        event: 'User is at 90% of plan usage',
        icon: '⚠️',
        user_id: orgId,
        notify: false,
      }).catch()
    }
  }
  else if (percentUsage.total_percent >= 70) {
    // cron every month * * * * 1
    const sent = await sendNotifOrg(c, 'user:usage_70_percent_of_plan', { percent: percentUsage }, orgId, orgId, '0 0 1 * *')
    if (sent) {
      // await addEventPerson(user.email, {}, 'user:70_percent_of_plan', 'orange')
      await logsnag(c).track({
        channel: 'usage',
        event: 'User is at 70% of plan usage',
        icon: '⚠️',
        user_id: orgId,
        notify: false,
      }).catch()
    }
  }
  else if (percentUsage.total_percent >= 50) {
    const sent = await sendNotifOrg(c, 'user:usage_50_percent_of_plan', { percent: percentUsage }, orgId, orgId, '0 0 1 * *')
    if (sent) {
      // await addEventPerson(user.email, {}, 'user:70_percent_of_plan', 'orange')
      await logsnag(c).track({
        channel: 'usage',
        event: 'User is at 50% of plan usage',
        icon: '⚠️',
        user_id: orgId,
        notify: false,
      }).catch()
    }
  }
}

// Get org data with customer info
export async function getOrgWithCustomerInfo(c: Context, orgId: string) {
  const { data: org, error: userError } = await supabaseAdmin(c)
    .from('orgs')
    .select('customer_id, stripe_info(subscription_id, subscription_anchor_start, subscription_anchor_end)')
    .eq('id', orgId)
    .single()
  if (userError || !org)
    return quickError(404, 'org_not_found', 'Org not found', { orgId, userError })
  return org
}

// Sync subscription data with Stripe
export async function syncOrgSubscriptionData(c: Context, org: any): Promise<void> {
  if (org.customer_id) {
    await syncSubscriptionData(c, org.customer_id, org?.stripe_info?.subscription_id ?? null)
  }
}

// Handle trial organization logic
export async function handleTrialOrg(c: Context, orgId: string, org: any): Promise<boolean> {
  if (await isTrialOrg(c, orgId)) {
    const { error } = await supabaseAdmin(c)
      .from('stripe_info')
      .update({ is_good_plan: true })
      .eq('customer_id', org.customer_id!)
      .then()
    if (error)
      cloudlogErr({ requestId: c.get('requestId'), message: 'update stripe info', error })
    return true // Trial handled
  }
  return false // Not a trial
}

// Calculate plan status and usage
export async function calculatePlanStatus(c: Context, orgId: string) {
  const is_good_plan = await isGoodPlanOrg(c, orgId)
  const percentUsage = await getPlanUsagePercent(c, orgId)
  return { is_good_plan, percentUsage }
}

// Handle notifications and events based on org status
export async function handleOrgNotificationsAndEvents(c: Context, org: any, orgId: string, is_good_plan: boolean, percentUsage: PlanUsage): Promise<boolean> {
  const is_onboarded = await isOnboardedOrg(c, orgId)
  const is_onboarding_needed = await isOnboardingNeeded(c, orgId)

  let finalIsGoodPlan = is_good_plan

  if (!is_good_plan && is_onboarded) {
    const needsUpgrade = await userAbovePlan(c, org, orgId, is_good_plan)
    finalIsGoodPlan = !needsUpgrade
  }
  else if (!is_onboarded && is_onboarding_needed) {
    const sent = await sendNotifOrg(c, 'user:need_onboarding', {}, orgId, orgId, '0 0 1 * *')
    if (sent) {
      await logsnag(c).track({
        channel: 'usage',
        event: 'User need onboarding',
        icon: '🥲',
        user_id: orgId,
        notify: false,
      }).catch()
    }
  }
  else if (is_good_plan && is_onboarded) {
    await userIsAtPlanUsage(c, orgId, percentUsage)
    finalIsGoodPlan = true
  }

  return finalIsGoodPlan
}

// Update stripe_info with plan status
export async function updatePlanStatus(c: Context, org: any, is_good_plan: boolean, percentUsage: PlanUsage): Promise<void> {
  await supabaseAdmin(c)
    .from('stripe_info')
    .update({
      is_good_plan,
      plan_usage: Math.round(percentUsage.total_percent),
    })
    .eq('customer_id', org.customer_id!)
    .then()
}

// New function for cron_stat_org - handles is_good_plan + plan % + exceeded flags
export async function checkPlanStatusOnly(c: Context, orgId: string): Promise<void> {
  const org = await getOrgWithCustomerInfo(c, orgId)

  // Handle trial organizations
  if (await handleTrialOrg(c, orgId, org)) {
    return // Trial handled, exit early
  }

  // Calculate plan status and usage
  const { is_good_plan, percentUsage } = await calculatePlanStatus(c, orgId)

  // Update plan status in database
  const finalIsGoodPlan = await handleOrgNotificationsAndEvents(c, org, orgId, is_good_plan, percentUsage)
  await updatePlanStatus(c, org, finalIsGoodPlan, percentUsage)
}

// New function for cron_sync_sub - handles subscription sync + events
export async function syncSubscriptionAndEvents(c: Context, orgId: string): Promise<void> {
  const org = await getOrgWithCustomerInfo(c, orgId)

  // Sync subscription data with Stripe
  await syncOrgSubscriptionData(c, org)

  // Handle trial organizations
  if (await handleTrialOrg(c, orgId, org)) {
    return // Trial handled, exit early
  }

  // Calculate plan status and usage for notifications
  const { is_good_plan, percentUsage } = await calculatePlanStatus(c, orgId)

  // Handle notifications and events
  await handleOrgNotificationsAndEvents(c, org, orgId, is_good_plan, percentUsage)
}
