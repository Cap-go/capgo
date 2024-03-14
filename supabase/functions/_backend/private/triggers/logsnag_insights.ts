import { Hono } from 'hono/tiny'
import type { Context } from 'hono'
import { BRES, middlewareAPISecret } from '../../utils/hono.ts'
import { supabaseAdmin } from '../../utils/supabase.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { logsnag } from '../../utils/logsnag.ts'
import { reactActiveApps } from '../../utils/clickhouse.ts';

interface PlanTotal { [key: string]: number }
interface Actives { users: number, apps: number}
interface GlobalStats {
  apps: PromiseLike<number>
  updates: PromiseLike<number>
  users: PromiseLike<number>
  stars: Promise<number>
  onboarded: PromiseLike<number>
  need_upgrade: PromiseLike<number>
  paying: PromiseLike<number>
  plans: PromiseLike<PlanTotal>
  actives: Promise<Actives>
}

async function getGithubStars(): Promise<number> {
  const res = await fetch('https://api.github.com/repos/Cap-go/capacitor-updater')
  const json = await res.json() as any
  return json.stargazers_count
}

function getStats(c: Context): GlobalStats {
  const supabase = supabaseAdmin(c)
  return {
    apps: supabase.rpc('count_all_apps', {}).single().then((res) => {
      if (res.error || !res.data)
        console.log('count_all_apps', res.error)
      return res.data || 0
    }),
    updates: supabase.rpc('count_all_updates', {}).single().then((res) => {
      if (res.error || !res.data)
        console.log('count_all_updates', res.error)
      return res.data || 0
    }),
    users: supabase
      .from('users')
      .select('*', { count: 'exact' })
      .then(res => res.count || 0),
    stars: getGithubStars(),
    paying: supabase.rpc('count_all_paying', {}).single().then((res) => {
      if (res.error || !res.data)
        console.log('count_all_paying', res.error)
      return res.data || 0
    }),
    onboarded: supabase.rpc('count_all_onboarded', {}).single().then((res) => {
      if (res.error || !res.data)
        console.log('count_all_onboarded', res.error)
      return res.data || 0
    }),
    need_upgrade: supabase.rpc('count_all_need_upgrade', {}).single().then((res) => {
      if (res.error || !res.data)
        console.log('count_all_need_upgrade', res.error)
      return res.data || 0
    }),
    plans: supabase.rpc('count_all_plans_v2').then((res) => {
      if (res.error || !res.data)
        console.log('count_all_plans_v2', res.error)
      return res.data || {}
    }).then((data: any) => {
      const total: PlanTotal = {}
      for (const plan of data)
        total[plan.plan_name] = plan.count

      return total
    }),
    actives: reactActiveApps(c).then(async(res) => {
      try {
        const app_ids = res.data.map((app) => app.app_id)
        console.log('app_ids', app_ids)
        const res2 = await supabase.rpc('count_active_users', { app_ids }).single()
        return { apps: res.rows, users: res2.data || 0 }
      } catch (e) {
        console.error('count_active_users error', e)
      }
      return { apps: res.rows, users: 0 }
    }),
  }
}

export const app = new Hono()

app.post('/', middlewareAPISecret, async (c: Context) => {
  try {
    const LogSnag = logsnag(c)
    const res = getStats(c)
    const [
      apps,
      updates,
      users,
      stars,
      paying,
      onboarded,
      need_upgrade,
      plans,
      actives,
    ] = await Promise.all([
      res.apps,
      res.updates,
      res.users,
      res.stars,
      res.paying,
      res.onboarded,
      res.need_upgrade,
      res.plans,
      res.actives,
    ])
    const not_paying = users - paying
    console.log('All Promises', apps, updates, users, stars, paying, onboarded, need_upgrade, plans)
    // console.log('app', app.app_id, downloads, versions, shared, channels)
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
      paying,
      onboarded,
      need_upgrade,
      not_paying,
    }
    console.log('newData', newData)
    const { error } = await supabaseAdmin(c)
      .from('global_stats')
      .upsert(newData)
    if (error)
      console.error('insert global_stats error', error)
    await LogSnag.insights([
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
        value: paying,
        icon: '💰',
      },
      {
        title: 'User not paying',
        value: not_paying,
        icon: '🥲',
      },
      {
        title: 'Free plan',
        value: plans.Free,
        icon: '🆓',
      },
      {
        title: 'Solo Plan',
        value: plans.Solo,
        icon: '🎸',
      },
      {
        title: 'Maker Plan',
        value: plans.Maker,
        icon: '🤝',
      },
      {
        title: 'Team plan',
        value: plans.Team,
        icon: '👏',
      },
      {
        title: 'Pay as you go plan',
        value: plans['Pay as you go'],
        icon: '📈',
      },
    ]).catch((e) => {
      console.error('insights error', e)
    })
    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot process insights', error: JSON.stringify(e) }, 500)
  }
})
