import type { Context } from '@hono/hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import ky from 'ky'
import { readActiveAppsCF, readLastMonthDevicesCF, readLastMonthUpdatesCF } from '../utils/cloudflare.ts'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../utils/loggin.ts'
import { logsnag, logsnagInsights } from '../utils/logsnag.ts'
import { countAllApps, countAllUpdates, countAllUpdatesExternal } from '../utils/stats.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

interface PlanTotal { [key: string]: number }
interface Actives { users: number, apps: number }
interface CustomerCount { total: number, yearly: number, monthly: number }
interface GlobalStats {
  apps: PromiseLike<number>
  updates: PromiseLike<number>
  updates_external: PromiseLike<number>
  updates_last_month: PromiseLike<number>
  users: PromiseLike<number>
  orgs: PromiseLike<number>
  stars: Promise<number>
  onboarded: PromiseLike<number>
  need_upgrade: PromiseLike<number>
  customers: PromiseLike<CustomerCount>
  plans: PromiseLike<PlanTotal>
  actives: Promise<Actives>
  devices_last_month: PromiseLike<number>
}

async function getGithubStars(): Promise<number> {
  const json = await ky.get('https://api.github.com/repos/Cap-go/capacitor-updater', {
    headers: {
      'User-Agent': 'capgo-app', // GitHub API rate limit
    },
  }).json<{ stargazers_count: number }>()
  return json.stargazers_count
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
    customers: supabase.rpc('get_customer_counts', {}).single().then((res) => {
      if (res.error || !res.data)
        cloudlog({ requestId: c.get('requestId'), message: 'get_customer_counts', error: res.error })
      return res.data ?? { total: 0, yearly: 0, monthly: 0 }
    }),
    onboarded: supabase.rpc('count_all_onboarded', {}).single().then((res) => {
      if (res.error || !res.data)
        cloudlog({ requestId: c.get('requestId'), message: 'count_all_onboarded', error: res.error })
      return res.data ?? 0
    }),
    need_upgrade: supabase.rpc('count_all_need_upgrade', {}).single().then((res) => {
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
  }
}

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, async (c) => {
  try {
    const res = getStats(c as any)
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
    ])
    const not_paying = users - customers.total - plans.Trial
    cloudlog({ requestId: c.get('requestId'), message: 'All Promises', apps, updates, updates_external, users, stars, customers, onboarded, need_upgrade, plans })
    // cloudlog(c.get('requestId'), 'app', app.app_id, downloads, versions, shared, channels)
    // create var date_id with yearn-month-day
    const date_id = new Date().toISOString().slice(0, 10)
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
    }
    cloudlog({ requestId: c.get('requestId'), message: 'newData', newData })
    const { error } = await supabaseAdmin(c as any)
      .from('global_stats')
      .upsert(newData)
    if (error)
      cloudlogErr({ requestId: c.get('requestId'), message: 'insert global_stats error', error })
    await logsnag(c as any).track({
      channel: 'updates-stats',
      event: 'Updates last month',
      user_id: 'admin',
      tags: {
        updates_last_month,
      },
      icon: '📲',
    }).catch((e: any) => {
      cloudlogErr({ requestId: c.get('requestId'), message: 'insights error', e })
    })
    await logsnagInsights(c as any, [
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
    return c.json(BRES)
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'general insights error', e })
    return c.json({ status: 'Cannot process insights', error: JSON.stringify(e) }, 500)
  }
})
