import { serve } from 'https://deno.land/std@0.154.0/http/server.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import { currentPaymentstatus } from '../_utils/plans.ts'
import type { definitions } from '../_utils/types_supabase.ts'
import { sendOptionsRes, sendRes } from '../_utils/utils.ts'

serve(async (event: Request) => {
  if (event.method === 'OPTIONS')
    return sendOptionsRes()
  const authorization = event.headers.get('authorization')
  if (!authorization)
    return sendRes({ status: 'Cannot find authorization' }, 400)
  try {
    const { user: auth, error } = await supabaseAdmin.auth.api.getUser(
      authorization?.split('Bearer ')[1],
    )

    if (error || !auth)
      return sendRes({ status: 'not authorize' }, 400)
    // get user from users
    const { data: user } = await supabaseAdmin
      .from<definitions['users']>('users')
      .select()
      .eq('id', auth.id)
      .single()
    if (!user)
      return Promise.reject(Error('no user found'))
    const paymentStatus = await currentPaymentstatus(user)

    return sendRes(paymentStatus)
  }
  catch (e) {
    console.log('Error', e)
    return sendRes({
      status: 'Error unknown',
      error: JSON.stringify(e),
    }, 500)
  }
})
