import { serve } from 'https://deno.land/std@0.179.0/http/server.ts'
import type { Database } from '../_utils/supabase.types.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import { getEnv, methodJson, sendRes } from '../_utils/utils.ts'
import { insights } from '../_utils/logsnag.ts'
import type { BaseHeaders } from '../_utils/types.ts'

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

const getGithubStars = async (): Promise<number> => {
  const res = await fetch('https://api.github.com/repos/Cap-go/capacitor-updater')
  const json = await res.json()
  return json.stargazers_count
}

const getStats = (): GlobalStats => {
  const supabase = supabaseAdmin()
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
    plans: supabase.from('plans').select('name, id').then(({ data: planNames, error }) => {
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
          const name = planNames.find(p => p.id === plan.product_id)?.name
          if (name)
            plans[name] = plan.count
        }
        return res.data || {}
      })
    }),
  }
}

const main = async (url: URL, headers: BaseHeaders, method: string, body: any) => {
  const API_SECRET = getEnv('API_SECRET')
  const authorizationSecret = headers.apisecret
  if (!authorizationSecret)
    return sendRes({ status: 'Cannot find authorization secret' }, 400)

  if (!authorizationSecret || !API_SECRET || authorizationSecret !== API_SECRET)
    return sendRes({ message: 'Fail Authorization', authorizationSecret, API_SECRET }, 400)

  try {
    const res = getStats()
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
    console.log('All Promises',
      apps,
      updates,
      users,
      stars,
      trial,
      paying,
      onboarded,
      need_upgrade,
      plans)
    await insights([
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
    ]).catch()
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
    const { error } = await supabaseAdmin()
      .from('global_stats')
      .upsert(newData)
    if (error)
      console.error('insert global_stats error', error)
    return sendRes()
  }
  catch (e) {
    console.error('global_stats error', e)
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
}

serve(async (event: Request) => {
  try {
    const url: URL = new URL(event.url)
    const headers: BaseHeaders = Object.fromEntries(event.headers.entries())
    const method: string = event.method
    const body: any = methodJson.includes(method) ? await event.json() : Object.fromEntries(url.searchParams.entries())
    return main(url, headers, method, body)
  }
  catch (e) {
    return sendRes({ status: 'Error', error: JSON.stringify(e) }, 500)
  }
})
