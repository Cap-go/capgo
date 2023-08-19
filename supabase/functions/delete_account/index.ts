import { serve } from 'https://deno.land/std@0.198.0/http/server.ts'
import { createPortal } from '../_utils/stripe.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import { sendOptionsRes, sendRes } from '../_utils/utils.ts'
import { Sha256 } from "https://deno.land/std@0.119.0/hash/sha256.ts";


serve(async (event: Request) => {
  if (event.method === 'OPTIONS')
    return sendOptionsRes()
  const authorization = event.headers.get('authorization')
  if (!authorization)
    return sendRes({ status: 'Cannot find authorization' }, 400)
  try {

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

    // user
    await supabaseAdmin()
      .from('users')
      .delete()
      .eq('id', auth.user.id)

    // billing
    await supabaseAdmin()
      .from('stripe_info')
      .delete()
      .eq('customer_id', user.customer_id)

    const supabaseAdminClient = supabaseAdmin();

    await supabaseAdminClient.auth.admin.deleteUser(auth.user.id)

    const hash = new Sha256();
    hash.update(auth.user.email);
    const hashedEmail = hash.hex();

    await supabaseAdminClient
    .from('deleted_account')
    .insert({
      email: hashedEmail,
    })

    if (dbError || !user)
      return sendRes({ status: 'not authorize' }, 400)
    if (!user.id)
      return sendRes({ status: 'no user' }, 400)

    return sendRes({ status: 'success' })
  }
  catch (e) {
    console.log(e);
    
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
