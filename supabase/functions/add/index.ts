import { serve } from 'https://deno.land/std@0.139.0/http/server.ts'
import { isAllowInMyPlan } from '../_utils/plan.ts'
import { checkAppOwner, supabaseAdmin } from '../_utils/supabase.ts'
import type { definitions } from '../_utils/types_supabase.ts'
import { checkKey, sendRes } from '../_utils/utils.ts'

interface AppAdd {
  appid: string
  name: string
  icon: string
  iconType: string
}

serve(async(event: Request) => {
  const supabase = supabaseAdmin
  const authorization = event.headers.get('apikey')
  if (!authorization)
    return sendRes({ status: 'Cannot find authorization' }, 400)
  const apikey: definitions['apikeys'] | null = await checkKey(authorization, supabase, ['upload', 'all', 'write'])
  if (!apikey || !event.body)
    return sendRes({ status: 'Cannot Verify User' }, 400)
  try {
    const body = (await event.json()) as AppAdd
    if (!(await isAllowInMyPlan(apikey.user_id)))
      return sendRes({ status: `Your reached the limit of your plan, upgrade to continue ${Deno.env.get('WEBAPP_URL')}/usage` }, 400)

    if (await checkAppOwner(apikey.user_id, body.appid))
      return sendRes({ status: 'App exist already' }, 400)
    const fileName = `icon_${globalThis.crypto.randomUUID()}`
    let signedURL = 'https://xvwzpoazmxkqosrdewyv.supabase.in/storage/v1/object/public/images/capgo.png'
    if (body.icon && body.iconType) {
      const buff = Buffer.from(body.icon, 'base64')
      const { error } = await supabase.storage
        .from(`images/${apikey.user_id}/${body.appid}`)
        .upload(fileName, buff, {
          contentType: body.iconType,
        })
      if (error)
        return sendRes({ status: 'Cannot Add App', error }, 400)

      const res = await supabase
        .storage
        .from(`images/${apikey.user_id}/${body.appid}`)
        .getPublicUrl(fileName)
      signedURL = res.data?.publicURL || signedURL
    }

    const { error: dbError } = await supabase
      .from('apps')
      .insert({
        icon_url: signedURL,
        user_id: apikey.user_id,
        name: body.name,
        app_id: body.appid,
      })
    if (dbError)
      return sendRes({ status: 'Cannot Add App', error: JSON.stringify(dbError) }, 400)
    return sendRes()
  }
  catch (e) {
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
