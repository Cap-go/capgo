import type { Handler } from '@netlify/functions'
import { v4 as uuidv4 } from 'uuid'
import { useSupabase } from '../services/supabase'
import { checkKey, sendRes } from './../services/utils'
import type { definitions } from '~/types/supabase'

interface AppAdd {
  appid: string
  name: string
  icon: string
  iconType: string
}
export const handler: Handler = async(event) => {
  console.log(event.httpMethod)
  if (event.httpMethod === 'OPTIONS')
    return sendRes()

  const supabase = useSupabase()
  const apikey: definitions['apikeys'] | null = await checkKey(event.headers.authorization, supabase, ['read', 'upload'])
  if (!apikey || !event.body)
    return sendRes({ status: 'Cannot Verify User' }, 400)

  try {
    const body = JSON.parse(event.body || '{}') as AppAdd
    const fileName = `icon_${uuidv4()}`
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
  }
  catch (e) {
    return sendRes({ status: 'Cannot Add App', error: e }, 500)
  }
  return sendRes()
}
