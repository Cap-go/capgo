import { serve } from 'https://deno.land/std@0.198.0/http/server.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import { sendOptionsRes, sendRes } from '../_utils/utils.ts'
import { getBundleUrl } from '../_utils/downloadUrl.ts'

interface dataDemo {
  app_id: string
  storage_provider: string
  bucket_id: string
}

serve(async (event: Request) => {
  if (event.method === 'OPTIONS')
    return sendOptionsRes()
  const authorization = event.headers.get('authorization')
  if (!authorization)
    return sendRes({ status: 'Cannot find authorization' }, 400)
  // TODO: fix for admin
  try {
    const { data: auth, error } = await supabaseAdmin().auth.getUser(
      authorization?.split('Bearer ')[1],
    )
    // console.log('auth', auth)
    if (error || !auth || !auth.user)
      return sendRes({ status: 'not authorize' }, 400)

    const body = (await event.json()) as dataDemo
    console.log('body', body)
    const url = await getBundleUrl(body.storage_provider, `apps/${auth.user.id}/${body.app_id}/versions`, body.bucket_id)
    if (!url)
      return sendRes({ status: 'Error unknow' }, 500)
    return sendRes({ url })
  }
  catch (e) {
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
