import { serve } from 'https://deno.land/std@0.149.0/http/server.ts'
import { addEventPerson } from '../_utils/crisp.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import type { definitions } from '../_utils/types_supabase.ts'
import { sendRes } from '../_utils/utils.ts'
import type { Stats } from '../_utils/plans.ts'

serve(async (event: Request) => {
  const supabase = supabaseAdmin
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
    const { data: users } = await supabase
      .from<definitions['users']>('users')
      .select()

    if (!users || !users.length)
      return sendRes({ status: 'error', message: 'no apps' })
    // explore all apps
    const all = []
    for (const user of users) {
      all.push(supabaseAdmin
        .rpc<boolean>('is_trial', { userid: user.id })
        .single()
        .then(async (res) => {
          if (res.data) {
            return supabaseAdmin
              .from<definitions['stripe_info']>('stripe_info')
              .update({ is_good_plan: true })
              .eq('customer_id', user.customer_id)
              .then()
          }
          const { data: is_good_plan } = await supabaseAdmin
            .rpc<boolean>('is_good_plan', { userid: user.id })
            .single()
          console.log('is_good_plan', user.id, is_good_plan)
          if (!is_good_plan) {
            // create dateid var with yyyy-mm with dayjs
            const dateid = new Date().toISOString().slice(0, 7)
            const { data: get_max_stats } = await supabaseAdmin
              .rpc<Stats>('get_max_stats', { userid: user.id, dateid })
              .single()
            if (get_max_stats && get_max_stats?.max_device > 100)
              all.push(addEventPerson(user.email, {}, 'user:need_upgrade', 'red'))
            else if (get_max_stats)
              all.push(addEventPerson(user.email, {}, 'user:need_more_time', 'blue'))
          }
          return supabaseAdmin
            .from<definitions['stripe_info']>('stripe_info')
            .update({ is_good_plan: !!is_good_plan })
            .eq('customer_id', user.customer_id)
            .then()
        }))
    }
    await Promise.all(all)
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
