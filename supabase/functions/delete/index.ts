import { serve } from 'https://deno.land/std@0.139.0/http/server.ts'
import { checkAppOwner, supabaseAdmin } from '../_utils/supabase.ts'
import type { definitions } from '../_utils/types_supabase.ts'
import { checkKey, sendRes } from '../_utils/utils.ts'

interface AppDelete {
  appid: string
  version?: string
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
    const body = (await event.json()) as AppDelete
    if (!(await checkAppOwner(apikey.user_id, body.appid)))
      return sendRes({ status: 'You can\'t edit this app' }, 400)
    if (body.version) {
      const { data: versions, error: versionIdError } = await supabase
        .from<definitions['app_versions']>('app_versions')
        .select()
        .eq('app_id', body.appid)
        .eq('user_id', apikey.user_id)
        .eq('name', body.version)
        .eq('deleted', false)
      if (!versions || !versions.length || versionIdError)
        return sendRes({ status: `Version ${body.appid}@${body.version} don't exist`, error: versionIdError }, 400)
      const { data: channelFound, error: errorChannel } = await supabase
        .from<definitions['channels']>('channels')
        .select()
        .eq('app_id', body.appid)
        .eq('created_by', apikey.user_id)
        .eq('version', versions[0].id)
      if ((channelFound && channelFound.length) || errorChannel)
        return sendRes({ status: `Version ${body.appid}@${body.version} is used in a channel, unlink it first`, error: errorChannel }, 400)
      const { data: deviceFound, error: errorDevice } = await supabase
        .from<definitions['devices_override']>('devices_override')
        .select()
        .eq('app_id', body.appid)
        .eq('version', versions[0].id)
      if ((deviceFound && deviceFound.length) || errorDevice)
        return sendRes({ status: `Version ${body.appid}@${body.version} is used in a device override, unlink it first`, error: errorChannel }, 400)
      // Delete only a specific version in storage
      const { error: delError } = await supabase
        .storage
        .from('apps')
        .remove([`${apikey.user_id}/${body.appid}/versions/${versions[0].bucket_id}`])
      if (delError)
        return sendRes({ status: `Something went wrong when trying to delete ${body.appid}@${body.version}`, error: delError }, 400)

      const { error: delAppSpecVersionError } = await supabase
        .from<definitions['app_versions']>('app_versions')
        .update({
          deleted: true,
        })
        .eq('app_id', body.appid)
        .eq('name', body.version)
        .eq('user_id', apikey.user_id)
      if (delAppSpecVersionError)
        return sendRes({ status: `App ${body.appid}@${body.version} not found in database`, error: delAppSpecVersionError }, 400)
      return sendRes()
    }

    const { data, error: vError } = await supabase
      .from<definitions['app_versions']>('app_versions')
      .select()
      .eq('app_id', body.appid)
      .eq('user_id', apikey.user_id)

    if (vError)
      return sendRes({ status: `App ${body.appid} not found in database`, error: vError }, 400)

    if (data && data.length) {
      const filesToRemove = data.map(x => `${apikey.user_id}/${body.appid}/versions/${x.bucket_id}`)
      const { error: delError } = await supabase
        .storage
        .from('apps')
        .remove(filesToRemove)
      if (delError)
        return sendRes({ status: `Cannot delete stored version for app ${body.appid} from storage`, error: delError }, 400)
    }

    const { error: delAppVersionError } = await supabase
      .from<definitions['app_versions']>('app_versions')
      .delete()
      .eq('app_id', body.appid)
      .eq('user_id', apikey.user_id)

    if (delAppVersionError)
      return sendRes({ status: `Cannot delete version for app ${body.appid} from database`, error: delAppVersionError }, 400)

    const { error: dbAppError } = await supabase
      .from<definitions['apps']>('apps')
      .delete()
      .eq('app_id', body.appid)
      .eq('user_id', apikey.user_id)

    if (dbAppError)
      return sendRes({ status: 'Cannot delete version from database', error: dbAppError }, 400)
    return sendRes()
  }
  catch (e) {
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
