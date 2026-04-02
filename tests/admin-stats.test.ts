import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, fetchWithRetry, getAuthHeadersForCredentials, getSupabaseClient, PRODUCT_ID, TEST_EMAIL, USER_ADMIN_EMAIL, USER_ID } from './test-utils.ts'

const DAY_IN_MS = 24 * 60 * 60 * 1000
const NOW = Date.now()

const TRIAL_ORG_ID = randomUUID()
const TRIAL_CUSTOMER_ID = `cus_admin_stats_trial_${TRIAL_ORG_ID.slice(0, 8)}`
const TRIAL_APP_ID = `com.admin.stats.trial.${TRIAL_ORG_ID.slice(0, 8)}`
const TRIAL_END_DATE = new Date(NOW + (45 * DAY_IN_MS)).toISOString()
const TRIAL_LAST_UPLOAD_AT = new Date(NOW - DAY_IN_MS).toISOString()
const TRIAL_BUILTIN_UPLOAD_AT = new Date(NOW - (12 * 60 * 60 * 1000)).toISOString()

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
      name: `Admin Stats Trial ${TRIAL_ORG_ID.slice(0, 8)}`,
      created_by: USER_ID,
      management_email: TEST_EMAIL,
      customer_id: TRIAL_CUSTOMER_ID,
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
}, 30000)

afterAll(async () => {
  const supabase = getSupabaseClient()

  await supabase.from('channels').delete().in('app_id', [ONBOARDING_APP_ID, ONBOARDING_LATE_SUBSCRIPTION_APP_ID])
  await supabase.from('app_versions').delete().in('app_id', [TRIAL_APP_ID, ONBOARDING_APP_ID, ONBOARDING_LATE_SUBSCRIPTION_APP_ID])
  await supabase.from('apps').delete().in('app_id', [TRIAL_APP_ID, ONBOARDING_APP_ID, ONBOARDING_LATE_SUBSCRIPTION_APP_ID])
  await supabase.from('orgs').delete().in('id', [TRIAL_ORG_ID, CANCELLED_YEARLY_ORG_ID, CANCELLED_MONTHLY_ORG_ID, ONBOARDING_ORG_ID, ONBOARDING_NO_BUNDLE_ORG_ID, ONBOARDING_LATE_SUBSCRIPTION_ORG_ID])
  await supabase.from('stripe_info').delete().in('customer_id', [TRIAL_CUSTOMER_ID, CANCELLED_YEARLY_CUSTOMER_ID, CANCELLED_MONTHLY_CUSTOMER_ID, ONBOARDING_CUSTOMER_ID, ONBOARDING_NO_BUNDLE_CUSTOMER_ID, ONBOARDING_LATE_SUBSCRIPTION_CUSTOMER_ID])
})

describe('/private/admin_stats', () => {
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
          last_bundle_upload_at: string | null
        }>
      }
    }

    expect(payload.success).toBe(true)
    const organization = payload.data.organizations.find(org => org.org_id === TRIAL_ORG_ID)
    expect(organization).toBeTruthy()
    expect(organization?.last_bundle_upload_at).toBe(TRIAL_LAST_UPLOAD_AT)
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
})
