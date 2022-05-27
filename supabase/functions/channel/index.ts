import { serve } from 'https://deno.land/std@0.139.0/http/server.ts'
// import { isAllowInMyPlan } from '../_utils/plan.ts'
import { checkAppOwner, supabaseAdmin, updateOrCreateChannel } from '../_utils/supabase.ts'
import type { definitions } from '../_utils/types_supabase.ts'
import { checkKey, sendRes } from '../_utils/utils.ts'

interface ChannelSet {
  appid: string
  channel: string
  version?: string
  public?: boolean
}

serve(async(event: Request) => {
  const supabase = supabaseAdmin
  const apikey_string = event.headers.get('apikey')
  if (!apikey_string)
    return sendRes({ status: 'Cannot find authorization' }, 400)
  const apikey: definitions['apikeys'] | null = await checkKey(apikey_string, supabase, ['upload', 'all', 'write'])
  if (!apikey || !event.body)
    return sendRes({ status: 'Cannot Verify User' }, 400)
  try {
    const body = (await event.json()) as ChannelSet
    // if (!(await isAllowInMyPlan(apikey.user_id)))
    //   return sendRes({ status: `Your reached the limit of your plan, upgrade to continue ${Deno.env.get('WEBAPP_URL')}/usage` }, 400)

    if (!await checkAppOwner(apikey.user_id, body.appid))
      return sendRes({ status: 'App missing or your are not the owner' }, 400)
    const channel: Partial<definitions['channels']> = {
      created_by: apikey.user_id,
      app_id: body.appid,
      name: body.channel,
    }
    if (body.version) {
      const { data, error: vError } = await supabase
        .from<definitions['app_versions']>('app_versions')
        .select()
        .eq('app_id', body.appid)
        .eq('name', body.version)
        .eq('user_id', apikey.user_id)
        .eq('deleted', false)
      if (vError || !data || !data.length)
        return sendRes({ status: `Cannot find version ${body.version}`, error: JSON.stringify(vError) }, 400)
      channel.version = data[0].id
    }
    if (body.public !== undefined)
      channel.public = body.public
    try {
      const { error: dbError } = await updateOrCreateChannel(channel)
      if (dbError)
        return sendRes({ status: 'Cannot set channels', error: JSON.stringify(dbError) }, 400)
    }
    catch (e) {
      return sendRes({ status: 'Cannot set channels', error: e }, 500)
    }
    return sendRes()
  }
  catch (e) {
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
