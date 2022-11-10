import { serve } from 'https://deno.land/std@0.163.0/http/server.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import type { definitions } from '../_utils/types_supabase.ts'
import { sendRes } from '../_utils/utils.ts'
import { insights } from '../_utils/_logsnag.ts'

interface UserStats {
  users: number
  plans: {
    Free: number
    Solo: number
    Maker: number
    Team: number
    'Pay as you go': number
  }
  trial: number
  need_upgrade: number
  not_paying: number
  paying: number
}
interface GlobalStats {
  apps: PromiseLike<number>
  updates: PromiseLike<number>
  stars: Promise<number>
  users: PromiseLike<UserStats>
}

interface StripePlan {
  product_id: definitions['plans']
}

const getGithubStars = async (): Promise<number> => {
  const res = await fetch('https://api.github.com/repos/Cap-go/capacitor-updater')
  const json = await res.json()
  return json.stargazers_count
}

const getStats = (): GlobalStats => {
  return {
    apps: supabaseAdmin.rpc<number>('count_all_apps', {}).single().then((res) => {
      if (res.error || !res.data)
        console.log('count_all_apps', res.error)
      return res.data || 0
    }),
    updates: supabaseAdmin.rpc<number>('count_all_updates', {}).single().then((res) => {
      if (res.error || !res.data)
        console.log('count_all_updates', res.error)
      return res.data || 0
    }),
    users: supabaseAdmin.from<definitions['users']>('users')
      .select().then(async (res) => {
        if (res.error || !res.data) {
          console.log('get users', res.error)
          return {
            users: 0,
            plans: {
              'Free': 0,
              'Solo': 0,
              'Maker': 0,
              'Team': 0,
              'Pay as you go': 0,
            },
            trial: 0,
            need_upgrade: 0,
            not_paying: 0,
            paying: 0,
          } as UserStats
        }
        const data: UserStats = {
          users: res.data.length,
          plans: {
            'Free': 0,
            'Solo': 0,
            'Maker': 0,
            'Team': 0,
            'Pay as you go': 0,
          },
          trial: 0,
          need_upgrade: 0,
          not_paying: 0,
          paying: 0,
        }
        const all = []
        for (const user of res.data) {
          all.push(supabaseAdmin
            .from<definitions['stripe_info'] & StripePlan>('stripe_info')
            .select(`
              customer_id,
              status,
              product_id (
                name
              )
            `)
            .eq('customer_id', user.customer_id)
            .single()
            .then((res) => {
              if (res.error)
                console.error('stripe_info error', res.error)
              if (!res.body)
                console.error('stripe_info no body', user.customer_id)
              const name = res.body?.product_id.name as keyof typeof data.plans
              console.log('stripe_info name', name, res.body?.status, res.body)
              if (name && Object.prototype.hasOwnProperty.call(data.plans, name))
                data.plans[name] += res.body?.status === 'succeeded' || name === 'Free' ? 1 : 0
            }))
          all.push(supabaseAdmin
            .rpc<boolean>('is_trial', { userid: user.id })
            .single().then((res) => {
              data.trial += res.data ? 1 : 0
            }))
          all.push(supabaseAdmin
            .rpc<boolean>('is_good_plan_v2', { userid: user.id })
            .single().then((res) => {
              data.need_upgrade += res.data ? 0 : 1
            }))
          all.push(supabaseAdmin
            .rpc<boolean>('is_paying', { userid: user.id })
            .single().then((res) => {
              data.paying += res.data ? 1 : 0
              data.not_paying += res.data ? 0 : 1
            }))
        }
        await Promise.all(all)
        data.need_upgrade -= data.not_paying
        data.not_paying -= data.trial
        return data
      }),
    stars: getGithubStars(),
  }
}
serve(async (event: Request) => {
  const API_SECRET = Deno.env.get('API_SECRET')
  const authorizationSecret = event.headers.get('apisecret')
  if (!authorizationSecret) {
    console.log('Cannot find authorization secret')
    return sendRes({ status: 'Cannot find authorization secret' }, 400)
  }
  if (!authorizationSecret || !API_SECRET || authorizationSecret !== API_SECRET) {
    console.log('Fail Authorization', authorizationSecret, API_SECRET)
    return sendRes({ message: 'Fail Authorization', authorizationSecret, API_SECRET }, 400)
  }
  try {
    const res = getStats()
    const [apps, updates, stars, users] = await Promise.all([res.apps, res.updates, res.stars, res.users])
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
        value: users.users,
        icon: '👨',
      },
      {
        title: 'User need upgrade',
        value: users.need_upgrade,
        icon: '🤒',
      },
      {
        title: 'User trial',
        value: users.trial,
        icon: '👶',
      },
      {
        title: 'User paying',
        value: users.paying,
        icon: '💰',
      },
      {
        title: 'User not paying',
        value: users.not_paying,
        icon: '🥲',
      },
      {
        title: 'Free plan',
        value: users.plans.Free,
        icon: '🆓',
      },
      {
        title: 'Solo Plan',
        value: users.plans.Solo,
        icon: '🎸',
      },
      {
        title: 'Maker Plan',
        value: users.plans.Maker,
        icon: '🤝',
      },
      {
        title: 'Team plan',
        value: users.plans.Team,
        icon: '👏',
      },
      {
        title: 'Pay as you go plan',
        value: users.plans['Pay as you go'],
        icon: '📈',
      },
    ])
    // console.log('app', app.app_id, downloads, versions, shared, channels)
    // create var date_id with yearn-month-day
    const date_id = new Date().toISOString().slice(0, 10)
    const newData: definitions['global_stats'] = {
      date_id,
      apps,
      updates,
      stars,
      ...users,
    }
    // console.log('newData', newData)
    await supabaseAdmin
      .from<definitions['global_stats']>('global_stats')
      .upsert(newData)
    return sendRes()
  }
  catch (e) {
    console.log('Error', e)
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
