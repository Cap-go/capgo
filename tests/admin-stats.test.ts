import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, fetchWithRetry, getAuthHeadersForCredentials, getEndpointUrl, getSupabaseClient, PRODUCT_ID, TEST_EMAIL, USER_ADMIN_EMAIL, USER_ID } from './test-utils.ts'

const DAY_IN_MS = 24 * 60 * 60 * 1000
const NOW = Date.now()

const TRIAL_ORG_ID = randomUUID()
const TRIAL_CUSTOMER_ID = `cus_admin_stats_trial_${TRIAL_ORG_ID.slice(0, 8)}`
const TRIAL_APP_ID = `com.admin.stats.trial.${TRIAL_ORG_ID.slice(0, 8)}`
const TRIAL_ORG_CREATED_AT = new Date(NOW).toISOString()
const TRIAL_END_DATE = new Date(NOW + (45 * DAY_IN_MS)).toISOString()
const TRIAL_LAST_UPLOAD_AT = new Date(NOW - DAY_IN_MS).toISOString()
const TRIAL_BUILTIN_UPLOAD_AT = new Date(NOW - (12 * 60 * 60 * 1000)).toISOString()
const INSIGHTS_DATE = '2026-04-10'
const INSIGHTS_START = '2026-04-01T00:00:00.000Z'
const INSIGHTS_END = '2026-04-30T23:59:59.000Z'
const INSIGHTS_UPLOAD_AT = '2026-04-10T10:00:00.000Z'
const INSIGHTS_LAST_BUILD_AT = '2026-04-11T12:00:00.000Z'
const INSIGHTS_BUILD_ID = `admin-stats-build-${TRIAL_ORG_ID.slice(0, 8)}`
const ATTENTION_SORT_HEALTHY_ORG_ID = randomUUID()
const ATTENTION_SORT_HEALTHY_CUSTOMER_ID = `cus_admin_stats_attention_sort_${ATTENTION_SORT_HEALTHY_ORG_ID.slice(0, 8)}`
const ATTENTION_SORT_TOKEN = `attention-sort-${TRIAL_ORG_ID.slice(0, 8)}`
const ATTENTION_SORT_HEALTHY_ORG_CREATED_AT = new Date(NOW + DAY_IN_MS).toISOString()

const CANCELLED_YEARLY_ORG_ID = randomUUID()
const CANCELLED_YEARLY_CUSTOMER_ID = `cus_admin_stats_cancelled_yearly_${CANCELLED_YEARLY_ORG_ID.slice(0, 8)}`
const CANCELLED_YEARLY_PAID_AT = '2025-02-10T12:00:00.000Z'

const CANCELLED_MONTHLY_ORG_ID = randomUUID()
const CANCELLED_MONTHLY_CUSTOMER_ID = `cus_admin_stats_cancelled_monthly_${CANCELLED_MONTHLY_ORG_ID.slice(0, 8)}`

const ONBOARDING_ORG_ID = randomUUID()
const ONBOARDING_CUSTOMER_ID = `cus_admin_stats_onboarding_${ONBOARDING_ORG_ID.slice(0, 8)}`
const ONBOARDING_APP_ID = `com.admin.stats.onboarding.${ONBOARDING_ORG_ID.slice(0, 8)}`
const ONBOARDING_ORG_CREATED_AT = '2026-02-01T10:00:00.000Z'
const ONBOARDING_APP_CREATED_AT = '2026-02-02T10:00:00.000Z'
const ONBOARDING_CHANNEL_CREATED_AT = '2026-02-03T10:00:00.000Z'
const ONBOARDING_BUNDLE_CREATED_AT = '2026-02-04T10:00:00.000Z'
const ONBOARDING_PAID_AT = '2026-02-05T10:00:00.000Z'

const ONBOARDING_NO_BUNDLE_ORG_ID = randomUUID()
const ONBOARDING_NO_BUNDLE_CUSTOMER_ID = `cus_admin_stats_onboarding_nobundle_${ONBOARDING_NO_BUNDLE_ORG_ID.slice(0, 8)}`
const ONBOARDING_NO_BUNDLE_CREATED_AT = '2026-02-01T12:00:00.000Z'
const ONBOARDING_NO_BUNDLE_PAID_AT = '2026-02-06T10:00:00.000Z'

const ONBOARDING_LATE_SUBSCRIPTION_ORG_ID = randomUUID()
const ONBOARDING_LATE_SUBSCRIPTION_CUSTOMER_ID = `cus_admin_stats_onboarding_latesub_${ONBOARDING_LATE_SUBSCRIPTION_ORG_ID.slice(0, 8)}`
const ONBOARDING_LATE_SUBSCRIPTION_APP_ID = `com.admin.stats.onboarding.latesub.${ONBOARDING_LATE_SUBSCRIPTION_ORG_ID.slice(0, 8)}`
const ONBOARDING_LATE_SUBSCRIPTION_CREATED_AT = '2026-02-01T14:00:00.000Z'
const ONBOARDING_LATE_SUBSCRIPTION_APP_CREATED_AT = '2026-02-02T14:00:00.000Z'
const ONBOARDING_LATE_SUBSCRIPTION_CHANNEL_CREATED_AT = '2026-02-03T14:00:00.000Z'
const ONBOARDING_LATE_SUBSCRIPTION_BUNDLE_CREATED_AT = '2026-02-04T14:00:00.000Z'
const ONBOARDING_LATE_SUBSCRIPTION_PAID_AT = '2026-02-10T14:00:00.000Z'
const GLOBAL_STATS_TREND_DATES = ['2099-12-30', '2099-12-31'] as const

let adminHeaders: Record<string, string>
let soloPlan: {
  name: string
  price_m_id: string
  price_y_id: string
  stripe_id: string
} | null = null
let creatorUserCreatedAt = ''

beforeAll(async () => {
  const supabase = getSupabaseClient()

  adminHeaders = await getAuthHeadersForCredentials(USER_ADMIN_EMAIL, 'adminadmin')

  const [{ data: planRow, error: planError }, { data: userRow, error: userError }] = await Promise.all([
    supabase.from('plans').select('name, price_m_id, price_y_id, stripe_id').eq('stripe_id', PRODUCT_ID).single(),
    supabase.from('users').select('created_at').eq('id', USER_ID).single(),
  ])

  if (planError)
    throw planError
  if (userError)
    throw userError
  if (!planRow)
    throw new Error('Expected Solo plan to exist for admin stats tests')
  if (!userRow?.created_at)
    throw new Error('Expected creator user to exist for admin stats tests')

  soloPlan = planRow
  creatorUserCreatedAt = new Date(userRow.created_at).toISOString()

  const { error: globalStatsError } = await supabase.from('global_stats').upsert([
    {
      date_id: GLOBAL_STATS_TREND_DATES[0],
      apps: 10,
      apps_active: 7,
      users: 20,
      users_active: 8,
      paying: 4,
      org_conversion_rate: 20,
      trial: 2,
      not_paying: 14,
      updates: 100,
      updates_external: 5,
      success_rate: 98.5,
      bundle_storage_gb: 1.25,
      plan_solo: 1,
      plan_maker: 2,
      plan_team: 1,
      plan_enterprise: 0,
      registers_today: 3,
      devices_last_month: 9,
      stars: 1,
      need_upgrade: 0,
      paying_yearly: 1,
      paying_monthly: 3,
      new_paying_orgs: 1,
      canceled_orgs: 0,
      upgraded_orgs: 0,
      trial_extended_orgs: 1,
      trial_extended_subscribed_orgs: 0,
      mrr: 120,
      total_revenue: 1440,
      revenue_solo: 120,
      revenue_maker: 240,
      revenue_team: 1080,
      revenue_enterprise: 0,
    },
    {
      date_id: GLOBAL_STATS_TREND_DATES[1],
      apps: 11,
      apps_active: 8,
      users: 22,
      users_active: 9,
      paying: 5,
      org_conversion_rate: 22.7,
      trial: 2,
      not_paying: 15,
      updates: 150,
      updates_external: 10,
      success_rate: 99.1,
      bundle_storage_gb: 1.5,
      plan_solo: 2,
      plan_maker: 2,
      plan_team: 1,
      plan_enterprise: 0,
      registers_today: 4,
      devices_last_month: 12,
      stars: 2,
      need_upgrade: 1,
      paying_yearly: 2,
      paying_monthly: 3,
      new_paying_orgs: 2,
      canceled_orgs: 1,
      upgraded_orgs: 1,
      trial_extended_orgs: 3,
      trial_extended_subscribed_orgs: 2,
      mrr: 240,
      total_revenue: 2880,
      revenue_solo: 240,
      revenue_maker: 480,
      revenue_team: 2160,
      revenue_enterprise: 0,
    },
  ], { onConflict: 'date_id' })
  if (globalStatsError)
    throw globalStatsError

  const { error: stripeError } = await supabase.from('stripe_info').insert([
    {
      customer_id: TRIAL_CUSTOMER_ID,
      status: 'created',
      product_id: soloPlan.stripe_id,
      price_id: soloPlan.price_m_id,
      trial_at: TRIAL_END_DATE,
      is_good_plan: false,
      plan_usage: 2,
      subscription_anchor_start: '2026-04-01T00:00:00.000Z',
      subscription_anchor_end: '2026-05-01T00:00:00.000Z',
    },
    {
      customer_id: ATTENTION_SORT_HEALTHY_CUSTOMER_ID,
      status: 'created',
      product_id: soloPlan.stripe_id,
      price_id: soloPlan.price_m_id,
      trial_at: TRIAL_END_DATE,
      is_good_plan: false,
      plan_usage: 2,
      subscription_anchor_start: '2026-04-01T00:00:00.000Z',
      subscription_anchor_end: '2026-05-01T00:00:00.000Z',
    },
    {
      customer_id: CANCELLED_YEARLY_CUSTOMER_ID,
      status: 'canceled',
      product_id: soloPlan.stripe_id,
      price_id: soloPlan.price_y_id,
      subscription_id: null,
      trial_at: '2025-03-01T00:00:00.000Z',
      canceled_at: '2026-03-25T14:00:00.000Z',
      paid_at: CANCELLED_YEARLY_PAID_AT,
      is_good_plan: true,
      plan_usage: 2,
      subscription_anchor_start: '2025-02-10T00:00:00.000Z',
      subscription_anchor_end: '2025-03-10T00:00:00.000Z',
    },
    {
      customer_id: CANCELLED_MONTHLY_CUSTOMER_ID,
      status: 'canceled',
      product_id: soloPlan.stripe_id,
      price_id: soloPlan.price_m_id,
      subscription_id: null,
      trial_at: '2026-03-01T00:00:00.000Z',
      canceled_at: '2026-03-20T08:00:00.000Z',
      paid_at: null,
      is_good_plan: true,
      plan_usage: 2,
      subscription_anchor_start: '2026-02-15T00:00:00.000Z',
      subscription_anchor_end: '2026-03-15T00:00:00.000Z',
    },
    {
      customer_id: ONBOARDING_CUSTOMER_ID,
      status: 'succeeded',
      product_id: soloPlan.stripe_id,
      price_id: soloPlan.price_m_id,
      subscription_id: null,
      trial_at: '2026-02-20T00:00:00.000Z',
      paid_at: ONBOARDING_PAID_AT,
      is_good_plan: true,
      plan_usage: 2,
      subscription_anchor_start: '2026-02-05T00:00:00.000Z',
      subscription_anchor_end: '2026-03-05T00:00:00.000Z',
    },
    {
      customer_id: ONBOARDING_NO_BUNDLE_CUSTOMER_ID,
      status: 'succeeded',
      product_id: soloPlan.stripe_id,
      price_id: soloPlan.price_m_id,
      subscription_id: null,
      trial_at: '2026-02-20T00:00:00.000Z',
      paid_at: ONBOARDING_NO_BUNDLE_PAID_AT,
      is_good_plan: true,
      plan_usage: 2,
      subscription_anchor_start: '2026-02-06T00:00:00.000Z',
      subscription_anchor_end: '2026-03-06T00:00:00.000Z',
    },
    {
      customer_id: ONBOARDING_LATE_SUBSCRIPTION_CUSTOMER_ID,
      status: 'succeeded',
      product_id: soloPlan.stripe_id,
      price_id: soloPlan.price_m_id,
      subscription_id: null,
      trial_at: '2026-02-20T00:00:00.000Z',
      paid_at: ONBOARDING_LATE_SUBSCRIPTION_PAID_AT,
      is_good_plan: true,
      plan_usage: 2,
      subscription_anchor_start: '2026-02-10T00:00:00.000Z',
      subscription_anchor_end: '2026-03-10T00:00:00.000Z',
    },
  ])
  if (stripeError)
    throw stripeError

  const { error: orgError } = await supabase.from('orgs').insert([
    {
      id: TRIAL_ORG_ID,
      name: `Admin Stats Trial ${ATTENTION_SORT_TOKEN}`,
      created_by: USER_ID,
      management_email: TEST_EMAIL,
      customer_id: TRIAL_CUSTOMER_ID,
      created_at: TRIAL_ORG_CREATED_AT,
    },
    {
      id: ATTENTION_SORT_HEALTHY_ORG_ID,
      name: `Admin Stats Healthy ${ATTENTION_SORT_TOKEN}`,
      created_by: USER_ID,
      management_email: TEST_EMAIL,
      customer_id: ATTENTION_SORT_HEALTHY_CUSTOMER_ID,
      created_at: ATTENTION_SORT_HEALTHY_ORG_CREATED_AT,
    },
    {
      id: CANCELLED_YEARLY_ORG_ID,
      name: `Admin Stats Cancelled Yearly ${CANCELLED_YEARLY_ORG_ID.slice(0, 8)}`,
      created_by: USER_ID,
      management_email: TEST_EMAIL,
      customer_id: CANCELLED_YEARLY_CUSTOMER_ID,
    },
    {
      id: CANCELLED_MONTHLY_ORG_ID,
      name: `Admin Stats Cancelled Monthly ${CANCELLED_MONTHLY_ORG_ID.slice(0, 8)}`,
      created_by: USER_ID,
      management_email: TEST_EMAIL,
      customer_id: CANCELLED_MONTHLY_CUSTOMER_ID,
    },
    {
      id: ONBOARDING_ORG_ID,
      name: `Admin Stats Onboarding ${ONBOARDING_ORG_ID.slice(0, 8)}`,
      created_by: USER_ID,
      management_email: TEST_EMAIL,
      customer_id: ONBOARDING_CUSTOMER_ID,
      created_at: ONBOARDING_ORG_CREATED_AT,
    },
    {
      id: ONBOARDING_NO_BUNDLE_ORG_ID,
      name: `Admin Stats Onboarding No Bundle ${ONBOARDING_NO_BUNDLE_ORG_ID.slice(0, 8)}`,
      created_by: USER_ID,
      management_email: TEST_EMAIL,
      customer_id: ONBOARDING_NO_BUNDLE_CUSTOMER_ID,
      created_at: ONBOARDING_NO_BUNDLE_CREATED_AT,
    },
    {
      id: ONBOARDING_LATE_SUBSCRIPTION_ORG_ID,
      name: `Admin Stats Onboarding Late Subscription ${ONBOARDING_LATE_SUBSCRIPTION_ORG_ID.slice(0, 8)}`,
      created_by: USER_ID,
      management_email: TEST_EMAIL,
      customer_id: ONBOARDING_LATE_SUBSCRIPTION_CUSTOMER_ID,
      created_at: ONBOARDING_LATE_SUBSCRIPTION_CREATED_AT,
    },
  ])
  if (orgError)
    throw orgError

  const { error: appError } = await supabase.from('apps').insert({
    owner_org: TRIAL_ORG_ID,
    name: 'Admin Stats Trial App',
    app_id: TRIAL_APP_ID,
    icon_url: 'https://example.com/icon.png',
  })
  if (appError)
    throw appError

  const { error: onboardingAppError } = await supabase.from('apps').insert({
    owner_org: ONBOARDING_ORG_ID,
    name: 'Admin Stats Onboarding App',
    app_id: ONBOARDING_APP_ID,
    icon_url: 'https://example.com/icon.png',
    created_at: ONBOARDING_APP_CREATED_AT,
  })
  if (onboardingAppError)
    throw onboardingAppError

  const { error: onboardingLateSubscriptionAppError } = await supabase.from('apps').insert({
    owner_org: ONBOARDING_LATE_SUBSCRIPTION_ORG_ID,
    name: 'Admin Stats Onboarding Late Subscription App',
    app_id: ONBOARDING_LATE_SUBSCRIPTION_APP_ID,
    icon_url: 'https://example.com/icon.png',
    created_at: ONBOARDING_LATE_SUBSCRIPTION_APP_CREATED_AT,
  })
  if (onboardingLateSubscriptionAppError)
    throw onboardingLateSubscriptionAppError

  const { data: versionRows, error: versionError } = await supabase.from('app_versions').insert([
    {
      app_id: TRIAL_APP_ID,
      name: '1.0.0',
      owner_org: TRIAL_ORG_ID,
      user_id: USER_ID,
      storage_provider: 'r2-direct',
      created_at: TRIAL_LAST_UPLOAD_AT,
    },
    {
      app_id: TRIAL_APP_ID,
      name: 'builtin',
      owner_org: TRIAL_ORG_ID,
      user_id: USER_ID,
      storage_provider: 'r2-direct',
      created_at: TRIAL_BUILTIN_UPLOAD_AT,
    },
    {
      app_id: TRIAL_APP_ID,
      name: '2.0.0',
      owner_org: TRIAL_ORG_ID,
      user_id: USER_ID,
      storage_provider: 'r2-direct',
      created_at: INSIGHTS_UPLOAD_AT,
    },
    {
      app_id: ONBOARDING_APP_ID,
      name: '1.0.0',
      owner_org: ONBOARDING_ORG_ID,
      user_id: USER_ID,
      storage_provider: 'r2-direct',
      created_at: ONBOARDING_BUNDLE_CREATED_AT,
    },
    {
      app_id: ONBOARDING_LATE_SUBSCRIPTION_APP_ID,
      name: '1.0.0',
      owner_org: ONBOARDING_LATE_SUBSCRIPTION_ORG_ID,
      user_id: USER_ID,
      storage_provider: 'r2-direct',
      created_at: ONBOARDING_LATE_SUBSCRIPTION_BUNDLE_CREATED_AT,
    },
  ]).select('id, app_id, name')
  if (versionError)
    throw versionError

  const onboardingVersion = versionRows?.find(version => version.app_id === ONBOARDING_APP_ID && version.name === '1.0.0')
  if (!onboardingVersion)
    throw new Error('Expected onboarding app version to be created')

  const onboardingLateSubscriptionVersion = versionRows?.find(version => version.app_id === ONBOARDING_LATE_SUBSCRIPTION_APP_ID && version.name === '1.0.0')
  if (!onboardingLateSubscriptionVersion)
    throw new Error('Expected onboarding late subscription app version to be created')

  const insightsVersion = versionRows?.find(version => version.app_id === TRIAL_APP_ID && version.name === '2.0.0')
  if (!insightsVersion)
    throw new Error('Expected organization insights app version to be created')

  const { error: channelError } = await supabase.from('channels').insert([
    {
      name: 'production',
      app_id: ONBOARDING_APP_ID,
      version: onboardingVersion.id,
      created_by: USER_ID,
      owner_org: ONBOARDING_ORG_ID,
      created_at: ONBOARDING_CHANNEL_CREATED_AT,
    },
    {
      name: 'production',
      app_id: ONBOARDING_LATE_SUBSCRIPTION_APP_ID,
      version: onboardingLateSubscriptionVersion.id,
      created_by: USER_ID,
      owner_org: ONBOARDING_LATE_SUBSCRIPTION_ORG_ID,
      created_at: ONBOARDING_LATE_SUBSCRIPTION_CHANNEL_CREATED_AT,
    },
  ])
  if (channelError)
    throw channelError

  const { error: dailyMauError } = await supabase.from('daily_mau').insert({
    app_id: TRIAL_APP_ID,
    date: INSIGHTS_DATE,
    mau: 7,
  })
  if (dailyMauError)
    throw dailyMauError

  const { error: dailyVersionError } = await supabase.from('daily_version').insert({
    app_id: TRIAL_APP_ID,
    date: INSIGHTS_DATE,
    version_id: insightsVersion.id,
    version_name: '2.0.0',
    get: 5,
    fail: 2,
    install: 8,
    uninstall: 0,
  })
  if (dailyVersionError)
    throw dailyVersionError

  const { error: buildLogError } = await supabase.from('build_logs').insert({
    org_id: TRIAL_ORG_ID,
    user_id: USER_ID,
    build_id: INSIGHTS_BUILD_ID,
    platform: 'ios',
    billable_seconds: 180,
    build_time_unit: 180,
    app_id: TRIAL_APP_ID,
    created_at: INSIGHTS_LAST_BUILD_AT,
  })
  if (buildLogError)
    throw buildLogError

  const { error: orgUserError } = await supabase.from('org_users').insert({
    org_id: TRIAL_ORG_ID,
    user_id: USER_ID,
    rbac_role_name: 'org_admin',
  })
  if (orgUserError)
    throw orgUserError
}, 90000)

afterAll(async () => {
  const supabase = getSupabaseClient()

  await supabase.from('org_users').delete().eq('org_id', TRIAL_ORG_ID).eq('user_id', USER_ID)
  await supabase.from('build_logs').delete().eq('org_id', TRIAL_ORG_ID).eq('build_id', INSIGHTS_BUILD_ID)
  await supabase.from('daily_build_time').delete().eq('app_id', TRIAL_APP_ID).eq('date', INSIGHTS_DATE)
  await supabase.from('daily_version').delete().eq('app_id', TRIAL_APP_ID).eq('date', INSIGHTS_DATE)
  await supabase.from('daily_mau').delete().eq('app_id', TRIAL_APP_ID).eq('date', INSIGHTS_DATE)
  await supabase.from('global_stats').delete().in('date_id', [...GLOBAL_STATS_TREND_DATES])
  await supabase.from('channels').delete().in('app_id', [ONBOARDING_APP_ID, ONBOARDING_LATE_SUBSCRIPTION_APP_ID])
  await supabase.from('app_versions').delete().in('app_id', [TRIAL_APP_ID, ONBOARDING_APP_ID, ONBOARDING_LATE_SUBSCRIPTION_APP_ID])
  await supabase.from('apps').delete().in('app_id', [TRIAL_APP_ID, ONBOARDING_APP_ID, ONBOARDING_LATE_SUBSCRIPTION_APP_ID])
  await supabase.from('orgs').delete().in('id', [TRIAL_ORG_ID, ATTENTION_SORT_HEALTHY_ORG_ID, CANCELLED_YEARLY_ORG_ID, CANCELLED_MONTHLY_ORG_ID, ONBOARDING_ORG_ID, ONBOARDING_NO_BUNDLE_ORG_ID, ONBOARDING_LATE_SUBSCRIPTION_ORG_ID])
  await supabase.from('stripe_info').delete().in('customer_id', [TRIAL_CUSTOMER_ID, ATTENTION_SORT_HEALTHY_CUSTOMER_ID, CANCELLED_YEARLY_CUSTOMER_ID, CANCELLED_MONTHLY_CUSTOMER_ID, ONBOARDING_CUSTOMER_ID, ONBOARDING_NO_BUNDLE_CUSTOMER_ID, ONBOARDING_LATE_SUBSCRIPTION_CUSTOMER_ID])
}, 90000)

describe('/private/admin_stats', () => {
  it.concurrent('returns global stats trend rows from the self-joined global_stats table', async () => {
    const response = await fetchWithRetry(`${BASE_URL}/private/admin_stats`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        metric_category: 'global_stats_trend',
        start_date: '2099-12-30T00:00:00.000Z',
        end_date: '2099-12-31T23:59:59.000Z',
      }),
    })

    expect(response.status).toBe(200)
    const payload = await response.json() as {
      success: boolean
      data: Array<{
        date: string
        apps: number
        updates: number
        updates_external: number
        previous_mrr: number
        trial_extended_orgs: number
        trial_extended_subscribed_orgs: number
      }>
    }

    expect(payload.success).toBe(true)
    expect(payload.data).toHaveLength(2)

    const latest = payload.data.find(row => row.date === GLOBAL_STATS_TREND_DATES[1])
    expect(latest).toBeTruthy()
    expect(latest?.apps).toBe(11)
    expect(latest?.updates).toBe(150)
    expect(latest?.updates_external).toBe(10)
    expect(latest?.previous_mrr).toBe(120)
    expect(latest?.trial_extended_orgs).toBe(3)
    expect(latest?.trial_extended_subscribed_orgs).toBe(2)
  })

  it.concurrent('returns last bundle upload for trial organizations and excludes builtin versions', async () => {
    const response = await fetchWithRetry(`${BASE_URL}/private/admin_stats`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        metric_category: 'trial_organizations',
        start_date: '2026-04-02T00:00:00.000Z',
        end_date: '2026-04-02T00:00:00.000Z',
        limit: 100,
        offset: 0,
      }),
    })

    expect(response.status).toBe(200)
    const payload = await response.json() as {
      success: boolean
      data: {
        organizations: Array<{
          org_id: string
          plan_name: string | null
          last_bundle_upload_at: string | null
          trial_extension_count: number
        }>
      }
    }

    expect(payload.success).toBe(true)
    const organization = payload.data.organizations.find(org => org.org_id === TRIAL_ORG_ID)
    expect(organization).toBeTruthy()
    expect(organization?.plan_name).toBe(soloPlan?.name)
    expect(organization?.last_bundle_upload_at).toBe(TRIAL_LAST_UPLOAD_AT)
    expect(organization?.trial_extension_count).toBe(2)
  })

  it.concurrent('returns organization insights with plan filtering and preprocessed period usage', async () => {
    if (!soloPlan)
      throw new Error('Expected Solo plan to be loaded')

    const response = await fetchWithRetry(`${BASE_URL}/private/admin_stats`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        metric_category: 'organization_insights',
        start_date: INSIGHTS_START,
        end_date: INSIGHTS_END,
        plan_name: soloPlan.name,
        billing_type: 'monthly',
        limit: 100,
        offset: 0,
      }),
    })

    expect(response.status).toBe(200)
    const payload = await response.json() as {
      success: boolean
      data: {
        organizations: Array<{
          org_id: string
          plan_name: string | null
          billing_type: 'monthly' | 'yearly' | null
          upload_count: number
          build_count: number
          failed_update_count: number
          install_count: number
          update_attempt_count: number
          needs_attention: boolean
          fail_rate: number
          mau: number
          members_count: number
          last_build_at: string | null
        }>
        plan_options: string[]
      }
    }

    expect(payload.success).toBe(true)
    expect(payload.data.plan_options).toContain(soloPlan.name)

    const organization = payload.data.organizations.find(org => org.org_id === TRIAL_ORG_ID)
    expect(organization).toBeTruthy()
    expect(organization?.plan_name).toBe(soloPlan.name)
    expect(organization?.billing_type).toBe('monthly')
    expect(organization?.upload_count).toBe(1)
    expect(organization?.build_count).toBe(1)
    expect(organization?.failed_update_count).toBe(2)
    expect(organization?.install_count).toBe(8)
    expect(organization?.update_attempt_count).toBe(10)
    expect(organization?.needs_attention).toBe(true)
    expect(organization?.fail_rate).toBe(20)
    expect(organization?.mau).toBe(7)
    expect(organization?.members_count).toBe(1)
    expect(organization?.last_build_at).toBe(INSIGHTS_LAST_BUILD_AT)

    const paidOnlyResponse = await fetchWithRetry(`${BASE_URL}/private/admin_stats`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        metric_category: 'organization_insights',
        start_date: INSIGHTS_START,
        end_date: INSIGHTS_END,
        plan_name: soloPlan.name,
        billing_type: 'monthly',
        paid_only: true,
        search: TRIAL_ORG_ID,
        limit: 100,
        offset: 0,
      }),
    })

    expect(paidOnlyResponse.status).toBe(200)
    const paidOnlyPayload = await paidOnlyResponse.json() as {
      success: boolean
      data: {
        organizations: Array<{ org_id: string }>
        total: number
      }
    }

    expect(paidOnlyPayload.success).toBe(true)
    expect(paidOnlyPayload.data.organizations).toEqual([])
    expect(paidOnlyPayload.data.total).toBe(0)
  })

  it.concurrent('prioritizes organizations needing attention before pagination', async () => {
    if (!soloPlan)
      throw new Error('Expected Solo plan to be loaded')

    const response = await fetchWithRetry(getEndpointUrl('/private/admin_stats'), {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        metric_category: 'organization_insights',
        start_date: INSIGHTS_START,
        end_date: INSIGHTS_END,
        plan_name: soloPlan.name,
        billing_type: 'monthly',
        search: ATTENTION_SORT_TOKEN,
        limit: 1,
        offset: 0,
      }),
    })

    expect(response.status).toBe(200)
    const payload = await response.json() as {
      success: boolean
      data: {
        organizations: Array<{
          org_id: string
          needs_attention: boolean
        }>
        total: number
      }
    }

    expect(payload.success).toBe(true)
    expect(payload.data.total).toBe(2)
    expect(payload.data.organizations).toHaveLength(1)
    expect(payload.data.organizations[0]?.org_id).toBe(TRIAL_ORG_ID)
    expect(payload.data.organizations[0]?.needs_attention).toBe(true)
  })

  it.concurrent('returns cancellation billing metadata and subscription-or-signup dates', async () => {
    const response = await fetchWithRetry(`${BASE_URL}/private/admin_stats`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        metric_category: 'cancelled_users',
        start_date: '2026-01-01T00:00:00.000Z',
        end_date: '2026-12-31T23:59:59.000Z',
        limit: 100,
        offset: 0,
      }),
    })

    expect(response.status).toBe(200)
    const payload = await response.json() as {
      success: boolean
      data: {
        organizations: Array<{
          org_id: string
          plan_name: string | null
          billing_type: 'monthly' | 'yearly' | null
          subscription_or_signup_date: string
        }>
      }
    }

    expect(payload.success).toBe(true)

    const yearlyOrganization = payload.data.organizations.find(org => org.org_id === CANCELLED_YEARLY_ORG_ID)
    expect(yearlyOrganization).toBeTruthy()
    expect(yearlyOrganization?.plan_name).toBe('Solo')
    expect(yearlyOrganization?.billing_type).toBe('yearly')
    expect(yearlyOrganization?.subscription_or_signup_date).toBe(CANCELLED_YEARLY_PAID_AT)

    const monthlyOrganization = payload.data.organizations.find(org => org.org_id === CANCELLED_MONTHLY_ORG_ID)
    expect(monthlyOrganization).toBeTruthy()
    expect(monthlyOrganization?.plan_name).toBe('Solo')
    expect(monthlyOrganization?.billing_type).toBe('monthly')
    expect(monthlyOrganization?.subscription_or_signup_date).toBe(creatorUserCreatedAt)
  })

  it.concurrent('returns subscribed as the last onboarding funnel step without exceeding the bundle cohort', async () => {
    const response = await fetchWithRetry(`${BASE_URL}/private/admin_stats`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        metric_category: 'onboarding_funnel',
        start_date: '2026-02-01T00:00:00.000Z',
        end_date: '2026-02-02T00:00:00.000Z',
      }),
    })

    expect(response.status).toBe(200)
    const payload = await response.json() as {
      success: boolean
      data: {
        total_orgs: number
        orgs_with_app: number
        orgs_with_channel: number
        orgs_with_bundle: number
        orgs_subscribed: number
        subscription_conversion_rate: number
        trend: Array<{
          date: string
          new_orgs: number
          orgs_subscribed: number
        }>
      }
    }

    expect(payload.success).toBe(true)
    expect(payload.data.total_orgs).toBe(3)
    expect(payload.data.orgs_with_app).toBe(2)
    expect(payload.data.orgs_with_channel).toBe(2)
    expect(payload.data.orgs_with_bundle).toBe(2)
    expect(payload.data.orgs_subscribed).toBe(1)
    expect(payload.data.subscription_conversion_rate).toBe(50)
    expect(payload.data.trend).toHaveLength(1)
    expect(payload.data.trend[0]).toMatchObject({
      date: '2026-02-01',
      new_orgs: 3,
      orgs_subscribed: 1,
    })
  })

  it.concurrent('returns daily new trial organizations grouped by plan', async () => {
    const response = await fetchWithRetry(getEndpointUrl('/private/admin_stats'), {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        metric_category: 'trial_plan_breakdown',
        start_date: '2026-02-01T00:00:00.000Z',
        end_date: '2026-02-02T00:00:00.000Z',
      }),
    })

    expect(response.status).toBe(200)
    const payload = await response.json() as {
      success: boolean
      data: {
        totals: Array<{ plan_name: string, total: number }>
        trend: Array<{
          date: string
          total: number
          plans: Record<string, number>
        }>
      }
    }

    expect(payload.success).toBe(true)
    expect(payload.data.trend).toHaveLength(1)
    expect(payload.data.trend[0]?.date).toBe('2026-02-01')
    expect(payload.data.trend[0]?.total).toBe(3)
    expect(payload.data.trend[0]?.plans[soloPlan?.name ?? 'Solo']).toBe(3)
    expect(payload.data.totals.find(plan => plan.plan_name === (soloPlan?.name ?? 'Solo'))?.total).toBe(3)
  })
})
