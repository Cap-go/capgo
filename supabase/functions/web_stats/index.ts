import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import type { Database } from '../_utils/supabase.types.ts'
import { isGoodPlan, isOnboarded, isPaying, isTrial, supabaseAdmin } from '../_utils/supabase.ts'
import { getEnv, sendRes } from '../_utils/utils.ts'
import { insights } from '../_utils/logsnag.ts'

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
  onboarded: number
  not_paying: number
  paying: number
}
interface GlobalStats {
  apps: PromiseLike<number>
  updates: PromiseLike<number>
  stars: Promise<number>
  users: PromiseLike<UserStats>
}

const getGithubStars = async (): Promise<number> => {
  const res = await fetch('https://api.github.com/repos/Cap-go/capacitor-updater')
  const json = await res.json()
  return json.stargazers_count
}

const defaultStats: UserStats = {
  users: 0,
  plans: {
    'Free': 0,
    'Solo': 0,
    'Maker': 0,
    'Team': 0,
    'Pay as you go': 0,
  },
  trial: 0,
  onboarded: 0,
  need_upgrade: 0,
  not_paying: 0,
  paying: 0,
}

const getStats = (): GlobalStats => {
  return {
    apps: supabaseAdmin().rpc('count_all_apps', {}).single().then((res) => {
      if (res.error || !res.data)
        console.log('count_all_apps', res.error)
      return res.data || 0
    }),
    updates: supabaseAdmin().rpc('count_all_updates', {}).single().then((res) => {
      if (res.error || !res.data)
        console.log('count_all_updates', res.error)
      return res.data || 0
    }),
    users: supabaseAdmin()
      .from('users')
      .select()
      .then(async (res) => {
        if (res.error || !res.data) {
          console.log('get users', res.error)
          return defaultStats
        }
        const data: UserStats = defaultStats
        data.users = res.data.length
        const all = []
        for (const user of res.data) {
          all.push(supabaseAdmin()
            .from('stripe_info')
            .select(`
              customer_id,
              status,
              product_id (
                id,
                name
              )
            `)
            .eq('customer_id', user.customer_id)
            .single()
            .then((res) => {
              if (res.error)
                console.error('stripe_info error', user.customer_id, res.error)
              if (!res.data)
                console.error('stripe_info no body', user.customer_id)
              const product = res.data?.product_id as Database['public']['Tables']['plans']['Row']
              const name = product.name as keyof typeof data.plans
              // console.log('stripe_info name', name, res.data?.status, res.data)
              if (name && Object.prototype.hasOwnProperty.call(data.plans, name))
                data.plans[name] += res.data?.status === 'succeeded' || name === 'Free' ? 1 : 0
            }))
          all.push(isTrial(user.id)
            .then((res) => {
              data.trial += res ? 1 : 0
            }))
          all.push(isOnboarded(user.id)
            .then((res) => {
              data.onboarded += res ? 1 : 0
            }))
          all.push(isPaying(user.id)
            .then((res) => {
              data.paying += res ? 1 : 0
              data.not_paying += res ? 0 : 1
              if (res) {
                all.push(isGoodPlan(user.id)
                  .then((res) => {
                    data.need_upgrade += res ? 0 : 1
                  }))
              }
            }))
        }
        console.log('all', all.length)
        await Promise.all(all)
        console.log('all done')
        data.not_paying -= data.trial
        data.plans.Free -= data.trial
        return data
      }),
    stars: getGithubStars(),
  }
}
serve(async (event: Request) => {
  const API_SECRET = getEnv('API_SECRET')
  const authorizationSecret = event.headers.get('apisecret')
  if (!authorizationSecret)
    return sendRes({ status: 'Cannot find authorization secret' }, 400)

  if (!authorizationSecret || !API_SECRET || authorizationSecret !== API_SECRET)
    return sendRes({ message: 'Fail Authorization', authorizationSecret, API_SECRET }, 400)

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
        title: 'User onboarded',
        value: users.onboarded,
        icon: '✅',
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
    ]).catch()
    // console.log('app', app.app_id, downloads, versions, shared, channels)
    // create var date_id with yearn-month-day
    const date_id = new Date().toISOString().slice(0, 10)
    const details = { ...users }
    details.plans = undefined as any
    const newData: Database['public']['Tables']['global_stats']['Insert'] = {
      date_id,
      apps,
      updates,
      stars,
      ...details,
    }
    // console.log('newData', newData)
    const { error } = await supabaseAdmin()
      .from('global_stats')
      .upsert(newData)
    if (error)
      console.error('global_stats error', error)
    return sendRes()
  }
  catch (e) {
    console.error('global_stats error', e)
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
