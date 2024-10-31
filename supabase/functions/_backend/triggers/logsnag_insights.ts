import type { Context } from '@hono/hono'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import ky from 'ky'
import { readActiveAppsCF, readLastMonthUpdatesCF } from '../utils/cloudflare.ts'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { logsnag, logsnagInsights } from '../utils/logsnag.ts'
import { countAllApps, countAllUpdates } from '../utils/stats.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

interface PlanTotal { [key: string]: number }
interface Actives { users: number, apps: number }
interface CustomerCount { total: number, yearly: number, monthly: number }
interface GlobalStats {
  apps: PromiseLike<number>
  updates: PromiseLike<number>
  updates_last_month: PromiseLike<number>
  users: PromiseLike<number>
  stars: Promise<number>
  onboarded: PromiseLike<number>
  need_upgrade: PromiseLike<number>
  customers: PromiseLike<CustomerCount>
  plans: PromiseLike<PlanTotal>
  actives: Promise<Actives>
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
    users: supabase
      .from('users')
      .select('*', { count: 'exact' })
      .then(res => res.count || 0),
    stars: getGithubStars(),
    customers: supabase.rpc('get_customer_counts', {}).single().then((res) => {
      if (res.error || !res.data)
        console.log({ requestId: c.get('requestId'), context: 'get_customer_counts', error: res.error })
      return res.data || { total: 0, yearly: 0, monthly: 0 }
    }),
    onboarded: supabase.rpc('count_all_onboarded', {}).single().then((res) => {
      if (res.error || !res.data)
        console.log({ requestId: c.get('requestId'), context: 'count_all_onboarded', error: res.error })
      return res.data || 0
    }),
    need_upgrade: supabase.rpc('count_all_need_upgrade', {}).single().then((res) => {
      if (res.error || !res.data)
        console.log({ requestId: c.get('requestId'), context: 'count_all_need_upgrade', error: res.error })
      return res.data || 0
    }),
    plans: supabase.rpc('count_all_plans_v2').then((res) => {
      if (res.error || !res.data)
        console.log({ requestId: c.get('requestId'), context: 'count_all_plans_v2', error: res.error })
      return res.data || {}
    }).then((data: any) => {
      const total: PlanTotal = {}
      for (const plan of data)
        total[plan.plan_name] = plan.count

      return total
    }),
    actives: readActiveAppsCF(c).then(async (app_ids) => {
      try {
        const res2 = await supabase.rpc('count_active_users', { app_ids }).single()
        return { apps: app_ids.length, users: res2.data || 0 }
      }
      catch (e) {
        console.error({ requestId: c.get('requestId'), context: 'count_active_users error', error: e })
      }
      return { apps: app_ids.length, users: 0 }
    }),
    updates_last_month: readLastMonthUpdatesCF(c),
  }
}

export const app = new Hono()

app.post('/', middlewareAPISecret, async (c: Context) => {
  try {
    const res = getStats(c)
    const [
      apps,
      updates,
      users,
      stars,
      customers,
      onboarded,
      need_upgrade,
      plans,
      actives,
      updates_last_month,
    ] = await Promise.all([
      res.apps,
      res.updates,
      res.users,
      res.stars,
      res.customers,
      res.onboarded,
      res.need_upgrade,
      res.plans,
      res.actives,
      res.updates_last_month,
    ])
    const not_paying = users - customers.total
    console.log({ requestId: c.get('requestId'), context: 'All Promises', apps, updates, users, stars, customers, onboarded, need_upgrade, plans })
    // console.log(c.get('requestId'), 'app', app.app_id, downloads, versions, shared, channels)
    // create var date_id with yearn-month-day
    const date_id = new Date().toISOString().slice(0, 10)
    const newData: Database['public']['Tables']['global_stats']['Insert'] = {
      date_id,
      apps,
      trial: plans.Trial,
      users,
      updates,
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
    }
    console.log({ requestId: c.get('requestId'), context: 'newData', newData })
    const { error } = await supabaseAdmin(c)
      .from('global_stats')
      .upsert(newData)
    if (error)
      console.error({ requestId: c.get('requestId'), context: 'insert global_stats error', error })
    await logsnag(c).track({
      channel: 'updates-stats',
      event: 'Updates last month',
      user_id: 'admin',
      tags: {
        updates_last_month,
      },
      icon: '📲',
    }).catch((e) => {
      console.error({ requestId: c.get('requestId'), context: 'insights error', e })
    })
    await logsnagInsights(c, [
      {
        title: 'Apps',
        value: apps,
        icon: '📱',
      },
      {
        title: 'Apps actives',
        value: actives.apps,
        icon: '💃',
      },
      {
        title: 'Updates',
        value: updates,
        icon: '📲',
      },
      {
        title: 'Updates last month',
        value: updates_last_month,
        icon: '📲',
      },
      {
        title: 'User Count',
        value: users,
        icon: '👨',
      },
      {
        title: 'Users actives',
        value: actives.users,
        icon: '🎉',
      },
      {
        title: 'User need upgrade',
        value: need_upgrade,
        icon: '🤒',
      },
      {
        title: 'User onboarded',
        value: onboarded,
        icon: '✅',
      },
      {
        title: 'User trial',
        value: plans.Trial,
        icon: '👶',
      },
      {
        title: 'User paying',
        value: customers.total,
        icon: '💰',
      },
      {
        title: 'User yearly',
        value: `${(customers.yearly * 100 / customers.total).toFixed(0)}% - ${customers.yearly}`,
        icon: '🧧',
      },
      {
        title: 'User monthly',
        value: `${(customers.monthly * 100 / customers.total).toFixed(0)}% - ${customers.monthly}`,
        icon: '🗓️',
      },
      {
        title: 'User not paying',
        value: not_paying,
        icon: '🥲',
      },
      {
        title: 'Solo Plan',
        value: `${(plans.Solo * 100 / customers.total).toFixed(0)}% - ${plans.Solo}`,
        icon: '🎸',
      },
      {
        title: 'Maker Plan',
        value: `${(plans.Maker * 100 / customers.total).toFixed(0)}% - ${plans.Maker}`,
        icon: '🤝',
      },
      {
        title: 'Team plan',
        value: `${(plans.Team * 100 / customers.total).toFixed(0)}% - ${plans.Team}`,
        icon: '👏',
      },
      {
        title: 'Pay as you go plan',
        value: `${(plans['Pay as you go'] * 100 / customers.total).toFixed(0)}% - ${plans['Pay as you go']}`,
        icon: '📈',
      },
    ]).catch((e) => {
      console.error({ requestId: c.get('requestId'), context: 'insights error', e })
    })
    console.log({ requestId: c.get('requestId'), context: 'Sent to logsnag done' })
    return c.json(BRES)
  }
  catch (e) {
    console.error({ requestId: c.get('requestId'), context: 'general insights error', e })
    return c.json({ status: 'Cannot process insights', error: JSON.stringify(e) }, 500)
  }
})
