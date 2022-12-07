import { serve } from 'https://deno.land/std@0.167.0/http/server.ts'
import { createPortal } from '../_utils/stripe.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import { sendOptionsRes, sendRes } from '../_utils/utils.ts'

interface PortalData {
  callbackUrl: string
}

serve(async (event: Request) => {
  console.log('method', event.method)
  if (event.method === 'OPTIONS')
    return sendOptionsRes()
  const authorization = event.headers.get('authorization')
  if (!authorization)
    return sendRes({ status: 'Cannot find authorization' }, 400)
  try {
    let body: PortalData = { callbackUrl: `${Deno.env.get('WEBAPP_URL')}/app/usage` }
    body = (await event.json()) as PortalData
    const { data: auth, error } = await supabaseAdmin().auth.getUser(
      authorization?.split('Bearer ')[1],
    )

    if (error || !auth || !auth.user)
      return sendRes({ status: 'not authorize' }, 400)
    // get user from users
    console.log('auth', auth.user.id)
    const { data: user, error: dbError } = await supabaseAdmin()
      .from('users')
      .select()
      .eq('id', auth.user.id)
      .single()
    if (dbError || !user)
      return sendRes({ status: 'not authorize' }, 400)
    if (!user.customer_id)
      return sendRes({ status: 'no customer' }, 400)

    console.log('user', user)
    const link = await createPortal(user.customer_id, body.callbackUrl)
    return sendRes({ url: link.url })
  }
  catch (e) {
    console.log('Error', e)
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
