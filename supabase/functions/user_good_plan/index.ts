import { serve } from 'https://deno.land/std@0.158.0/http/server.ts'
import { addEventPerson } from '../_utils/crisp.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import type { definitions } from '../_utils/types_supabase.ts'
import { sendRes } from '../_utils/utils.ts'
import { findBestPlan, getCurrentPlanName, StatsV2 } from '../_utils/plans.ts'

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
    const { data: users } = await supabaseAdmin
      .from<definitions['users']>('users')
      .select()

    if (!users || !users.length)
      return sendRes({ status: 'error', message: 'no apps' })
    // explore all apps
    const all = []
    // find all trial users
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
          // try {
          const { data: is_good_plan, error } = await supabaseAdmin
            .rpc<boolean>('is_good_plan', { userid: user.id })
            .single()
          if (error) {
            console.log('is_good_plan error', user.id, error)
            return Promise.resolve()
          }
          console.log('is_good_plan', user.id, is_good_plan)
          if (!is_good_plan) {
            // create dateid var with yyyy-mm with dayjs
            const dateid = new Date().toISOString().slice(0, 7)
            const { data: get_max_stats } = await supabaseAdmin
              .rpc<StatsV2>('get_total_stats', { userid: user.id, dateid })
              .single()
              const current_plan = await getCurrentPlanName(user.id)
              if (get_max_stats) {
                const best_plan = await findBestPlan(get_max_stats)
                const bestPlanKey = best_plan.toLowerCase().replace(' ', '_')
                if (best_plan === 'Free')
                  all.push(addEventPerson(user.email, {}, 'user:need_more_time', 'blue'))
                else if (best_plan !== current_plan) 
                  all.push(addEventPerson(user.email, {}, `user:upgrade_to_${bestPlanKey}`, 'red'))
              } 
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
