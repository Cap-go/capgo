import { serve } from 'https://deno.land/std@0.139.0/http/server.ts'
import { Buffer } from 'https://deno.land/x/node_buffer@1.1.0/index.ts'
// import { isAllowInMyPlan } from '../_utils/plan.ts'
import { checkAppOwner, supabaseClient } from '../_utils/supabase.ts'
import { verify } from "https://deno.land/x/djwt@v2.2/mod.ts";
import { sendRes } from '../_utils/utils.ts'

interface AppAdd {
  appid: string
  name: string
  icon: string
  iconType: string
}

serve(async(event: Request) => {
  const authorization = event.headers.get('authorization') || ''
  console.log('authorization', authorization)
  const session = supabaseClient.auth.setAuth(authorization.replace("Bearer ", ""))
  const checkk = await verify(session.access_token, "61a901f1-72aa-4602-a73e-2c97c1ac2023", 'HS256')
  console.log('session', session, checkk)
  // session.user should be found to allow all supbase to work with the forged token
  if (!event.body)
    return sendRes({ status: 'Cannot find body' }, 400)
  try {
    const body = (await event.json()) as AppAdd
    // if (!(await isAllowInMyPlan(apikey.user_id)))
    //   return sendRes({ status: `Your reached the limit of your plan, upgrade to continue ${Deno.env.get('WEBAPP_URL')}/usage` }, 400)
    const user = supabaseClient.auth.user()
    if (!user)
      return sendRes({ status: 'Cannot Verify User' }, 400)
    if (await checkAppOwner(user.id, body.appid))
      return sendRes({ status: 'App exist already' }, 400)
    const fileName = `icon_${globalThis.crypto.randomUUID()}`
    let signedURL = 'https://xvwzpoazmxkqosrdewyv.supabase.in/storage/v1/object/public/images/capgo.png'
    if (body.icon && body.iconType) {
      const buff = Buffer.from(body.icon, 'base64')
      const { error } = await supabaseClient.storage
        .from(`images/${user.id}/${body.appid}`)
        .upload(fileName, buff, {
          contentType: body.iconType,
        })
      if (error)
        return sendRes({ status: 'Cannot Add App', error }, 400)
      const res = await supabaseClient
        .storage
        .from(`images/${user.id}/${body.appid}`)
        .getPublicUrl(fileName)
      signedURL = res.data?.publicURL || signedURL
    }
    const { error: dbError } = await supabaseClient
      .from('apps')
      .insert({
        icon_url: signedURL,
        user_id: user.id,
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
