import { Hono } from 'https://deno.land/x/hono@v3.12.7/mod.ts'
import type { Context } from 'https://deno.land/x/hono@v3.12.7/mod.ts'
import { BRES, middlewareAPISecret } from '../../_utils/hono.ts';
import { supabaseAdmin } from '../../_utils/supabase.ts';
import { Database } from '../../_utils/supabase.types.ts';
import { logsnag } from '../../_utils/logsnag.ts';

interface PlanTotal { [key: string]: number }
interface GlobalStats {
  apps: PromiseLike<number>
  updates: PromiseLike<number>
  users: PromiseLike<number>
  stars: Promise<number>
  trial: PromiseLike<number>
  onboarded: PromiseLike<number>
  need_upgrade: PromiseLike<number>
  paying: PromiseLike<number>
  plans: PromiseLike<PlanTotal>
}

async function getGithubStars(): Promise<number> {
  const res = await fetch('https://api.github.com/repos/Cap-go/capacitor-updater')
  const json = await res.json()
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
    trial: supabase.rpc('count_all_trial', {}).single().then((res) => {
      if (res.error || !res.data)
        console.log('count_all_trial', res.error)
      return res.data || 0
    }),
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
    plans: supabase.from('plans').select('name, stripe_id').then(({ data: planNames, error }) => {
      if (error || !planNames) {
        console.log('get plans', error)
        return {}
      }
      return supabase.rpc('count_all_plans', {}).then((res) => {
        if (res.error || !res.data) {
          console.log('count_all_plan', res.error)
          return {}
        }
        // create object with name and count
        const plans: any = {}
        for (const plan of res.data) {
          const name = planNames.find(p => p.stripe_id === plan.product_id)?.name
          if (name)
            plans[name] = plan.count
        }
        return plans
      })
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
      trial,
      paying,
      onboarded,
      need_upgrade,
      plans,
    ] = await Promise.all([
      res.apps,
      res.updates,
      res.users,
      res.stars,
      res.trial,
      res.paying,
      res.onboarded,
      res.need_upgrade,
      res.plans,
    ])
    const not_paying = users - paying
    console.log('All Promises', apps, updates, users, stars, trial, paying, onboarded, need_upgrade, plans)
    // console.log('app', app.app_id, downloads, versions, shared, channels)
    // create var date_id with yearn-month-day
    const date_id = new Date().toISOString().slice(0, 10)
    const newData: Database['public']['Tables']['global_stats']['Insert'] = {
      date_id,
      apps,
      updates,
      stars,
      trial,
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
        value: trial,
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
  } catch (e) {
    return c.json({ status: 'Cannot process insights', error: JSON.stringify(e) }, 500)
  }
})
