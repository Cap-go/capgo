import { serve } from 'https://deno.land/std@0.139.0/http/server.ts'
import { createPortal } from '../_utils/stripe.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import type { definitions } from '../_utils/types_supabase.ts'
import { sendRes } from '../_utils/utils.ts'

interface PortalData {
  callbackUrl: string
}

serve(async(event: Request) => {
  const supabase = supabaseAdmin
  const authorization = event.headers.get('authorization')
  if (!authorization)
    return sendRes({ status: 'Cannot find authorization' }, 400)
  try {
    const body = (await event.json()) as PortalData
    const { user: auth, error } = await supabase.auth.api.getUser(
      authorization,
    )
    // eslint-disable-next-line no-console
    // console.log('auth', auth)
    if (error || !auth)
      return sendRes({ status: 'not authorize' }, 400)
    // get user from users
    const { data: users, error: dbError } = await supabase
      .from<definitions['users']>('users')
      .select()
      .eq('id', auth.id)
    if (dbError || !users || !users.length)
      return sendRes({ status: 'not authorize' }, 400)
    const user = users[0]
    if (!user.customer_id)
      return sendRes({ status: 'no customer' }, 400)
    // eslint-disable-next-line no-console
    // console.log('user', user)
    const link = await createPortal(Deno.env.get('STRIPE_SECRET_KEY') || '', user.customer_id, body.callbackUrl || 'https://web.capgo.app/app/usage')
    return sendRes({ url: link.url })
  }
  catch (e) {
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
