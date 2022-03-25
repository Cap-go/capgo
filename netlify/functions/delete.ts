import type { Handler } from '@netlify/functions'
import { useSupabase } from '../services/supabase'
import { checkKey, sendRes } from './../services/utils'
import type { definitions } from '~/types/supabase'

interface AppDelete {
  appid: string
  version?: string
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
    const body = JSON.parse(event.body || '{}') as AppDelete
    if (body.version) {
      const { data: versionId, error: versionIdError } = await supabase
        .from<definitions['app_versions']>('app_versions')
        .select('id')
        .eq('name', body.version)
      if (versionId && versionId.length) {
        const { error: delDevicesVersionError } = await supabase
          .from<definitions['devices']>('devices')
          .delete()
          .eq('version', versionId[0].id)

        if (delDevicesVersionError || versionIdError)
          return sendRes({ status: `Something went wrong when trying to delete ${body.appid}@${body.version}`, error: delDevicesVersionError }, 400)
      }
      const { error: delAppStatsVersionError } = await supabase
        .from<definitions['stats']>('stats')
        .delete()
        .eq('app_id', body.appid)
        .eq('version_build', body.version)
      // Delete only a specific version
      const { error: delAppSpecVersionError } = await supabase
        .from<definitions['app_versions']>('app_versions')
        .delete()
        .eq('app_id', body.appid)
        .eq('name', body.version)
        .eq('user_id', apikey.user_id)
      if (delAppSpecVersionError || delAppStatsVersionError)
        return sendRes({ status: `App ${body.appid}@${body.version} not found in database`, error: delAppSpecVersionError }, 400)
      return sendRes()
    }
    const { data, error: vError } = await supabase
      .from<definitions['app_versions']>('app_versions')
      .select()
      .eq('app_id', body.appid)
      .eq('user_id', apikey.user_id)

    if (!data || !data.length || vError)
      return sendRes({ status: `App ${body.appid} not found in database`, error: vError }, 400)

    const { error: delChanError } = await supabase
      .from<definitions['channels']>('channels')
      .delete()
      .eq('app_id', body.appid)

    if (delChanError)
      return sendRes({ status: `Cannot delete channel version for app ${body.appid} from database`, error: delChanError }, 400)

    if (data && data.length) {
      const filesToRemove = (data as definitions['app_versions'][]).map(x => `${apikey.user_id}/${body.appid}/versions/${x.bucket_id}`)
      const { error: delError } = await supabase
        .storage
        .from('apps')
        .remove(filesToRemove)
      if (delError)
        return sendRes({ status: `Cannot delete stored version for app ${body.appid} from storage`, error: delError }, 400)
    }
    const { error: delAppStatsVersionError } = await supabase
      .from<definitions['stats']>('stats')
      .delete()
      .eq('app_id', body.appid)
    const { error: delAppVersionError } = await supabase
      .from<definitions['app_versions']>('app_versions')
      .delete()
      .eq('app_id', body.appid)
      .eq('user_id', apikey.user_id)

    if (delAppVersionError || delAppStatsVersionError)
      return sendRes({ status: `Cannot delete version for app ${body.appid} from database`, error: delAppVersionError }, 400)

    const { error: dbAppError } = await supabase
      .from<definitions['apps']>('apps')
      .delete()
      .eq('app_id', body.appid)
      .eq('user_id', apikey.user_id)

    if (dbAppError)
      return sendRes({ status: 'Cannot delete version from database', error: dbAppError }, 400)
  }
  catch (e) {
    return sendRes({ status: 'Cannot delete', error: e }, 500)
  }
  return sendRes()
}
