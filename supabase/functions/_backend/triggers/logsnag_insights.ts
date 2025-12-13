import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { readActiveAppsCF, readLastMonthDevicesCF, readLastMonthUpdatesCF } from '../utils/cloudflare.ts'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../utils/logging.ts'
import { logsnag, logsnagInsights } from '../utils/logsnag.ts'
import { countAllApps, countAllUpdates, countAllUpdatesExternal, getUpdateStats } from '../utils/stats.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

interface PlanTotal { [key: string]: number }
interface Actives { users: number, apps: number }
interface CustomerCount { total: number, yearly: number, monthly: number }
interface PlanRevenue {
  mrrr: number
  total_revenue: number
  revenue_solo: number
  revenue_maker: number
  revenue_team: number
  plan_solo_monthly: number
  plan_solo_yearly: number
  plan_maker_monthly: number
  plan_maker_yearly: number
  plan_team_monthly: number
  plan_team_yearly: number
}
interface GlobalStats {
  apps: PromiseLike<number>
  updates: PromiseLike<number>
  updates_external: PromiseLike<number>
  updates_last_month: PromiseLike<number>
  users: PromiseLike<number>
  orgs: PromiseLike<number>
  stars: Promise<number>
  onboarded: PromiseLike<number>
  success_rate: PromiseLike<number>
  need_upgrade: PromiseLike<number>
  customers: PromiseLike<CustomerCount>
  plans: PromiseLike<PlanTotal>
  actives: Promise<Actives>
  devices_last_month: PromiseLike<number>
  registers_today: PromiseLike<number>
  bundle_storage_gb: PromiseLike<number>
  revenue: PromiseLike<PlanRevenue>
  new_paying_orgs: PromiseLike<number>
  canceled_orgs: PromiseLike<number>
  credits_bought: PromiseLike<number>
  credits_consumed: PromiseLike<number>
}

function getTodayDateId(): string {
  const today = new Date()
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())).toISOString().slice(0, 10)
}

async function calculateRevenue(c: Context): Promise<PlanRevenue> {
  const supabase = supabaseAdmin(c)

  try {
    // Get plan prices from database
    const { data: plansData, error: plansError } = await supabase
      .from('plans')
      .select('name, price_m, price_y, price_m_id, price_y_id')
      .in('name', ['Solo', 'Maker', 'Team'])

    if (plansError || !plansData) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'Failed to fetch plan prices', error: plansError })
      return {
        mrrr: 0,
        total_revenue: 0,
        revenue_solo: 0,
        revenue_maker: 0,
        revenue_team: 0,
        plan_solo_monthly: 0,
        plan_solo_yearly: 0,
        plan_maker_monthly: 0,
        plan_maker_yearly: 0,
        plan_team_monthly: 0,
        plan_team_yearly: 0,
      }
    }

    // Build price map
    const priceMap = new Map<string, { price_m: number, price_y: number, price_m_id: string, price_y_id: string }>()
    for (const plan of plansData) {
      priceMap.set(plan.name.toLowerCase(), {
        price_m: (Number(plan.price_m) || 0) / 100, // Convert cents to dollars
        price_y: (Number(plan.price_y) || 0) / 100,
        price_m_id: plan.price_m_id || '',
        price_y_id: plan.price_y_id || '',
      })
    }

    // Get subscription counts from stripe_info
    const { data: subsData, error: subsError } = await supabase
      .from('stripe_info')
      .select(`
        price_id,
        plans!stripe_info_product_id_fkey(name)
      `)
      .eq('status', 'succeeded')
      .eq('is_good_plan', true)

    if (subsError || !subsData) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'Failed to fetch subscriptions', error: subsError })
      return {
        mrrr: 0,
        total_revenue: 0,
        revenue_solo: 0,
        revenue_maker: 0,
        revenue_team: 0,
        plan_solo_monthly: 0,
        plan_solo_yearly: 0,
        plan_maker_monthly: 0,
        plan_maker_yearly: 0,
        plan_team_monthly: 0,
        plan_team_yearly: 0,
      }
    }

    // Count subscriptions by plan and billing period
    const subCountMap = new Map<string, { monthly: number, yearly: number }>()
    for (const sub of subsData) {
      const planName = (sub.plans as any)?.name?.toLowerCase()
      if (!planName || !['solo', 'maker', 'team'].includes(planName)) continue

      const priceId = sub.price_id
      if (!subCountMap.has(planName)) {
        subCountMap.set(planName, { monthly: 0, yearly: 0 })
      }

      const planPrices = priceMap.get(planName)
      if (planPrices) {
        if (priceId === planPrices.price_m_id) {
          subCountMap.get(planName)!.monthly++
        }
        else if (priceId === planPrices.price_y_id) {
          subCountMap.get(planName)!.yearly++
        }
      }
    }

    // Calculate MRR and ARR
    const solo = subCountMap.get('solo') || { monthly: 0, yearly: 0 }
    const maker = subCountMap.get('maker') || { monthly: 0, yearly: 0 }
    const team = subCountMap.get('team') || { monthly: 0, yearly: 0 }

    const soloPrices = priceMap.get('solo') || { price_m: 0, price_y: 0, price_m_id: '', price_y_id: '' }
    const makerPrices = priceMap.get('maker') || { price_m: 0, price_y: 0, price_m_id: '', price_y_id: '' }
    const teamPrices = priceMap.get('team') || { price_m: 0, price_y: 0, price_m_id: '', price_y_id: '' }

    // MRR = (monthly subs × monthly price) + (yearly subs × yearly price / 12)
    const soloMRR = (solo.monthly * soloPrices.price_m) + (solo.yearly * soloPrices.price_y / 12)
    const makerMRR = (maker.monthly * makerPrices.price_m) + (maker.yearly * makerPrices.price_y / 12)
    const teamMRR = (team.monthly * teamPrices.price_m) + (team.yearly * teamPrices.price_y / 12)
    const totalMRR = soloMRR + makerMRR + teamMRR

    // ARR = MRR × 12
    const soloARR = soloMRR * 12
    const makerARR = makerMRR * 12
    const teamARR = teamMRR * 12
    const totalARR = totalMRR * 12

    return {
      mrrr: totalMRR,
      total_revenue: totalARR,
      revenue_solo: soloARR,
      revenue_maker: makerARR,
      revenue_team: teamARR,
      plan_solo_monthly: solo.monthly,
      plan_solo_yearly: solo.yearly,
      plan_maker_monthly: maker.monthly,
      plan_maker_yearly: maker.yearly,
      plan_team_monthly: team.monthly,
      plan_team_yearly: team.yearly,
    }
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'calculateRevenue error', error: e })
    return {
      mrrr: 0,
      total_revenue: 0,
      revenue_solo: 0,
      revenue_maker: 0,
      revenue_team: 0,
      plan_solo_monthly: 0,
      plan_solo_yearly: 0,
      plan_maker_monthly: 0,
      plan_maker_yearly: 0,
      plan_team_monthly: 0,
      plan_team_yearly: 0,
    }
  }
}

async function getGithubStars(): Promise<number> {
  try {
    const response = await fetch('https://api.github.com/repos/Cap-go/capacitor-updater', {
      headers: {
        'User-Agent': 'capgo-app', // GitHub API rate limit
      },
    })

    if (!response.ok) {
      throw new Error(`GitHub API error: HTTP ${response.status}`)
    }

    const json = await response.json() as { stargazers_count: number }
    return json.stargazers_count
  }
  catch (e) {
    throw new Error(`getGithubStars error: ${e instanceof Error ? e.message : String(e)}`)
  }
}

function getStats(c: Context): GlobalStats {
  const supabase = supabaseAdmin(c)
  return {
    apps: countAllApps(c),
    updates: countAllUpdates(c),
    updates_external: countAllUpdatesExternal(c),
    users: supabase
      .from('users')
      .select('*', { count: 'exact' })
      .then(res => res.count ?? 0),
    orgs: supabase
      .from('orgs')
      .select('*', { count: 'exact' })
      .then(res => res.count ?? 0),
    stars: getGithubStars(),
    customers: supabase.rpc('get_customer_counts').single().then((res) => {
      if (res.error || !res.data)
        cloudlog({ requestId: c.get('requestId'), message: 'get_customer_counts', error: res.error })
      return res.data ?? { total: 0, yearly: 0, monthly: 0 }
    }),
    onboarded: supabase.rpc('count_all_onboarded').single().then((res) => {
      if (res.error || !res.data)
        cloudlog({ requestId: c.get('requestId'), message: 'count_all_onboarded', error: res.error })
      return res.data ?? 0
    }),
    need_upgrade: supabase.rpc('count_all_need_upgrade').single().then((res) => {
      if (res.error || !res.data)
        cloudlog({ requestId: c.get('requestId'), message: 'count_all_need_upgrade', error: res.error })
      return res.data ?? 0
    }),
    plans: supabase.rpc('count_all_plans_v2').then((res) => {
      if (res.error || !res.data)
        cloudlog({ requestId: c.get('requestId'), message: 'count_all_plans_v2', error: res.error })
      return res.data ?? {}
    }).then((data: any) => {
      const total: PlanTotal = {}
      for (const plan of data)
        total[plan.plan_name] = plan.count

      return total
    }),
    success_rate: getUpdateStats(c).then((res) => {
      cloudlog({ requestId: c.get('requestId'), message: 'success_rate', success_rate: res.total.success_rate })
      return res.total.success_rate
    }),
    actives: readActiveAppsCF(c).then(async (app_ids) => {
      try {
        const res2 = await supabase.rpc('count_active_users', { app_ids }).single()
        return { apps: app_ids.length, users: res2.data ?? 0 }
      }
      catch (e) {
        cloudlogErr({ requestId: c.get('requestId'), message: 'count_active_users error', error: e })
      }
      return { apps: app_ids.length, users: 0 }
    }),
    updates_last_month: readLastMonthUpdatesCF(c),
    devices_last_month: readLastMonthDevicesCF(c),
    registers_today: supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .then((res) => {
        if (res.error)
          cloudlog({ requestId: c.get('requestId'), message: 'registers_today error', error: res.error })
        return res.count ?? 0
      }),
    bundle_storage_gb: supabase
      .rpc('total_bundle_storage_bytes')
      .then((res) => {
        if (res.error) {
          cloudlog({ requestId: c.get('requestId'), message: 'total_bundle_storage_bytes error', error: res.error })
          return 0
        }
        const bytes = res.data ?? 0
        const gigabytes = bytes / (1024 ** 3)
        return Number.isFinite(gigabytes) ? Number(gigabytes.toFixed(2)) : 0
      }),
    revenue: calculateRevenue(c),
    new_paying_orgs: supabase
      .from('stripe_info')
      .select('customer_id', { count: 'exact', head: false })
      .eq('status', 'succeeded')
      .eq('is_good_plan', true)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .then((res) => {
        if (res.error) {
          cloudlog({ requestId: c.get('requestId'), message: 'new_paying_orgs error', error: res.error })
          return 0
        }
        // Count unique customer_ids (orgs) that started paying today
        const uniqueCustomers = new Set((res.data || []).map(row => row.customer_id))
        return uniqueCustomers.size
      }),
    canceled_orgs: supabase
      .from('stripe_info')
      .select('customer_id', { count: 'exact', head: false })
      .not('canceled_at', 'is', null)
      .gte('canceled_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .then((res) => {
        if (res.error) {
          cloudlog({ requestId: c.get('requestId'), message: 'canceled_orgs error', error: res.error })
          return 0
        }
        // Count unique customer_ids (orgs) that canceled today
        const uniqueCustomers = new Set((res.data || []).map(row => row.customer_id))
        return uniqueCustomers.size
      }),
    credits_bought: supabase
      .from('usage_credit_grants')
      .select('credits_total')
      .gte('granted_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .then((res) => {
        if (res.error) {
          cloudlog({ requestId: c.get('requestId'), message: 'credits_bought error', error: res.error })
          return 0
        }
        return (res.data || []).reduce((sum, row) => sum + (Number(row.credits_total) || 0), 0)
      }),
    credits_consumed: supabase
      .from('usage_credit_consumptions')
      .select('credits_used')
      .gte('applied_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .then((res) => {
        if (res.error) {
          cloudlog({ requestId: c.get('requestId'), message: 'credits_consumed error', error: res.error })
          return 0
        }
        return (res.data || []).reduce((sum, row) => sum + (Number(row.credits_used) || 0), 0)
      }),
  }
}

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, async (c) => {
  const res = getStats(c)
  const [
    apps,
    updates,
    updates_external,
    users,
    orgs,
    stars,
    customers,
    onboarded,
    need_upgrade,
    plans,
    actives,
    updates_last_month,
    devices_last_month,
    registers_today,
    bundle_storage_gb,
    success_rate,
    revenue,
    new_paying_orgs,
    canceled_orgs,
    credits_bought,
    credits_consumed,
  ] = await Promise.all([
    res.apps,
    res.updates,
    res.updates_external,
    res.users,
    res.orgs,
    res.stars,
    res.customers,
    res.onboarded,
    res.need_upgrade,
    res.plans,
    res.actives,
    res.updates_last_month,
    res.devices_last_month,
    res.registers_today,
    res.bundle_storage_gb,
    res.success_rate,
    res.revenue,
    res.new_paying_orgs,
    res.canceled_orgs,
    res.credits_bought,
    res.credits_consumed,
  ])
  const not_paying = users - customers.total - plans.Trial
  cloudlog({
    requestId: c.get('requestId'),
    message: 'All Promises',
    apps,
    updates,
    updates_external,
    users,
    stars,
    customers,
    onboarded,
    need_upgrade,
    plans,
    updates_last_month,
    devices_last_month,
    registers_today,
    bundle_storage_gb,
  })
  // cloudlog(c.get('requestId'), 'app', app.app_id, downloads, versions, shared, channels)
  // create var date_id with yearn-month-day
  const date_id = getTodayDateId()
  const newData: Database['public']['Tables']['global_stats']['Insert'] = {
    date_id,
    apps,
    trial: plans.Trial,
    users,
    updates,
    updates_external,
    apps_active: actives.apps,
    users_active: actives.users,
    stars,
    paying: customers.total,
    paying_yearly: customers.yearly,
    paying_monthly: customers.monthly,
    onboarded,
    need_upgrade,
    not_paying,
    updates_last_month,
    devices_last_month,
    registers_today,
    bundle_storage_gb,
    success_rate,
    plan_solo: plans.Solo,
    plan_maker: plans.Maker,
    plan_team: plans.Team,
    plan_payg: plans['Pay as you go'],
    // Revenue metrics
    mrrr: revenue.mrrr,
    total_revenue: revenue.total_revenue,
    revenue_solo: revenue.revenue_solo,
    revenue_maker: revenue.revenue_maker,
    revenue_team: revenue.revenue_team,
    plan_solo_monthly: revenue.plan_solo_monthly,
    plan_solo_yearly: revenue.plan_solo_yearly,
    plan_maker_monthly: revenue.plan_maker_monthly,
    plan_maker_yearly: revenue.plan_maker_yearly,
    plan_team_monthly: revenue.plan_team_monthly,
    plan_team_yearly: revenue.plan_team_yearly,
    // Subscription flow tracking
    new_paying_orgs,
    canceled_orgs,
    // Credits tracking
    credits_bought,
    credits_consumed,
  }
  cloudlog({ requestId: c.get('requestId'), message: 'newData', newData })
  const { error } = await supabaseAdmin(c)
    .from('global_stats')
    .upsert(newData)
  if (error)
    cloudlogErr({ requestId: c.get('requestId'), message: 'insert global_stats error', error })
  await logsnag(c).track({
    channel: 'updates-stats',
    event: 'Updates last month',
    user_id: 'admin',
    tags: {
      updates_last_month,
      success_rate,
      registers_today,
      storage_gb: bundle_storage_gb,
    },
    icon: '📲',
  }).catch((e: any) => {
    cloudlogErr({ requestId: c.get('requestId'), message: 'insights error', e })
  })
  await logsnagInsights(c, [
    {
      title: 'Apps',
      value: apps,
      icon: '📱',
    },
    {
      title: 'Active Apps',
      value: actives.apps,
      icon: '💃',
    },
    {
      title: 'Updates',
      value: updates,
      icon: '📲',
    },
    {
      title: 'Updates on premises',
      value: updates_external,
      icon: '📲',
    },
    {
      title: 'Updates last month',
      value: updates_last_month,
      icon: '📲',
    },
    {
      title: 'Bundle Storage (GB)',
      value: `${bundle_storage_gb.toFixed(2)} GB`,
      icon: '💾',
    },
    {
      title: 'Total Users',
      value: users,
      icon: '👨',
    },
    {
      title: 'Active Users',
      value: actives.users,
      icon: '🎉',
    },
    {
      title: 'Registrations Today',
      value: registers_today,
      icon: '🆕',
    },
    {
      title: 'User onboarded',
      value: onboarded,
      icon: '✅',
    },
    {
      title: 'Orgs',
      value: orgs,
      icon: '🏢',
    },
    {
      title: 'Orgs with trial',
      value: plans.Trial,
      icon: '👶',
    },
    {
      title: 'Orgs paying',
      value: customers.total,
      icon: '💰',
    },
    {
      title: 'Orgs yearly',
      value: `${(customers.yearly * 100 / customers.total).toFixed(0)}% - ${customers.yearly}`,
      icon: '🧧',
    },
    {
      title: 'Orgs monthly',
      value: `${(customers.monthly * 100 / customers.total).toFixed(0)}% - ${customers.monthly}`,
      icon: '🗓️',
    },
    {
      title: 'Orgs not paying',
      value: not_paying,
      icon: '🥲',
    },
    {
      title: 'Orgs need upgrade',
      value: need_upgrade,
      icon: '🤒',
    },
    {
      title: 'Orgs Solo Plan',
      value: `${(plans.Solo * 100 / customers.total).toFixed(0)}% - ${plans.Solo}`,
      icon: '🎸',
    },
    {
      title: 'Orgs Maker Plan',
      value: `${(plans.Maker * 100 / customers.total).toFixed(0)}% - ${plans.Maker}`,
      icon: '🤝',
    },
    {
      title: 'Orgs Team Plan',
      value: `${(plans.Team * 100 / customers.total).toFixed(0)}% - ${plans.Team}`,
      icon: '👏',
    },
    {
      title: 'Orgs Pay as you go Plan',
      value: `${(plans['Pay as you go'] * 100 / customers.total).toFixed(0)}% - ${plans['Pay as you go']}`,
      icon: '📈',
    },
  ]).catch((e) => {
    cloudlogErr({ requestId: c.get('requestId'), message: 'insights error', e })
  })
  cloudlog({ requestId: c.get('requestId'), message: 'Sent to logsnag done' })

  // Note: Device cleanup is no longer needed as Analytics Engine handles data retention automatically

  return c.json(BRES)
})
