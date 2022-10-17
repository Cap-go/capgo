import { serve } from 'https://deno.land/std@0.160.0/http/server.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import type { definitions } from '../_utils/types_supabase.ts'
import { sendRes } from '../_utils/utils.ts'
import { logsnag } from '../_utils/_logsnag.ts'

interface UserStats {
  users: number
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
            trial: 0,
            need_upgrade: 0,
            paying: 0,
          } as UserStats
        }
        const data: UserStats = {
          users: res.data.length,
          trial: 0,
          need_upgrade: 0,
          not_paying: 0,
          paying: 0,
        }
        const all = []
        for (const user of res.data) {
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
        await logsnag.insight([
          {
            title: 'User Count',
            value: data.users,
            icon: '👨',
          },
          {
            title: 'User need upgrade',
            value: data.need_upgrade,
            icon: '🤒',
          },
          {
            title: 'User trial',
            value: data.trial,
            icon: '👶',
          },
          {
            title: 'User paying',
            value: data.paying,
            icon: '💰',
          },
          {
            title: 'User not paying',
            value: data.not_paying,
            icon: '🥲',
          }])
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
