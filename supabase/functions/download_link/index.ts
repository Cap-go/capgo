import { serve } from 'https://deno.land/std@0.200.0/http/server.ts'
import { isAdmin, supabaseAdmin, verifyUser } from '../_utils/supabase.ts'
import { sendOptionsRes, sendRes } from '../_utils/utils.ts'
import { getBundleUrl } from '../_utils/downloadUrl.ts'

interface DataDownload {
  app_id: string
  storage_provider: string
  user_id?: string
  bucket_id: string
  api_key?: string
}

serve(async (event: Request) => {
  if (event.method === 'OPTIONS')
    return sendOptionsRes()

  const authorization = event.headers.get('authorization')
  if (!authorization) {
    return sendRes({ status: 'Cannot find authorization token in header' }, 400)
  }
    
  // TODO: fix for admin
  try {
    const { data: auth, error } = await supabaseAdmin().auth.getUser(
      authorization?.split('Bearer ')[1],
    )

    // console.log('auth', auth)
    let cliUserId = undefined
    const body = (await event.json()) as DataDownload
    if (error || !auth || !auth.user) {
      if (body.api_key) {
        cliUserId = await verifyUser(body.api_key)
        if (cliUserId) {
          console.assert(body.user_id == cliUserId)
        } else {
          return sendRes({ status: 'Not authorized. The API key is invalid' }, 401)
        }
      } else {
        return sendRes({ status: 'Not authorized' }, 401)
      }
    }
    const admin = cliUserId ? false: await isAdmin(auth.user.id)
    const userId = (admin && body.user_id) ? body.user_id : cliUserId ? cliUserId : auth.user.id
    console.log('body', body)
    const url = await getBundleUrl(body.storage_provider, `apps/${userId}/${body.app_id}/versions`, body.bucket_id)
    if (!url)
      return sendRes({ status: 'Error: the download URL is invalid (undefined)' }, 500)
    return sendRes({ url })
  }
  catch (e) {
    return sendRes({
      status: 'Error unknown',
      error: JSON.stringify(e),
    }, 500)
  }
})
