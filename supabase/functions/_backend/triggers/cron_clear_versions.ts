import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret, simpleError } from '../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../utils/loggin.ts'
import { getPath, s3 } from '../utils/s3.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

export const app = new Hono<MiddlewareKeyVariables>()
app.post('/', middlewareAPISecret, async (c) => {
  // unsafe parse the body
  const body = await c.req.json<{ version: Database['public']['Tables']['app_versions']['Row'] }>()
    .catch((e) => {
      throw simpleError('invalid_json_body', 'Invalid JSON body', { e })
    })
  cloudlog({ requestId: c.get('requestId'), message: 'post body cron_clear_versions', body })

  // Let's start with the metadata
  const supabase = supabaseAdmin(c)

  const version = body.version
  if (version.user_id === null) {
    // find the user_id from the app_id
    const { data: app, error: errorApp } = await supabaseAdmin(c)
      .from('apps')
      .select('user_id')
      .eq('app_id', version.app_id)
      .single()
    if (errorApp)
      throw simpleError('cannot_find_user_id', 'Cannot find user_id for app_id', { error: errorApp })
    if (!app)
      throw simpleError('cannot_find_user_id', 'Cannot find user_id for app_id', { error: 'no app found' })
    version.user_id = app.user_id
  }

  let notFound = false
  try {
    const v2Path = await getPath(c, version)
      .catch((e) => {
        cloudlog({ requestId: c.get('requestId'), message: 'error getPath', error: e })
        // if error is rate limit this terminate the function
        if (e.message.includes('Rate limit exceeded')) {
          throw new Error('Rate limit exceeded')
        }
        return null
      })
    cloudlog({ requestId: c.get('requestId'), message: 'v2Path', v2Path })
    if (!v2Path) {
      notFound = true
      throw new Error(`no_path ${version.id}`)
    }
    const size = await s3.getSize(c, v2Path).catch((e) => {
      cloudlog({ requestId: c.get('requestId'), message: 'error getSize', error: e })
      // if error is rate limit this terminate the function
      if (e.message.includes('Rate limit exceeded')) {
        throw new Error('Rate limit exceeded')
      }
      return null
    })
    if (!size) {
      cloudlog({ requestId: c.get('requestId'), message: `No size for ${v2Path}, ${size}` })
      // throw error to trigger the deletion
      notFound = true
      throw new Error(`no_size ${version.id} ${v2Path}`)
    }
    // get checksum from table app_versions
    const { data: appVersion, error: errorAppVersion } = await supabaseAdmin(c)
      .from('app_versions')
      .select('checksum')
      .eq('id', version.id)
      .single()
    if (errorAppVersion)
      throw simpleError('cannot_find_checksum', 'Cannot find checksum for app_versions id', { error: errorAppVersion })
    if (!appVersion)
      throw simpleError('cannot_find_checksum', 'Cannot find checksum for app_versions id', { error: 'no app_versions found' })
    const checksum = appVersion.checksum
    if (!checksum) {
      cloudlog({ requestId: c.get('requestId'), message: `No checksum for ${v2Path}, ${checksum}` })
    }

    cloudlog({ requestId: c.get('requestId'), message: `Upsert app_versions_meta (version id: ${version.id}) to: ${size}` })

    await supabase.from('app_versions_meta')
      .upsert({
        id: version.id,
        app_id: version.app_id,
        checksum: checksum ?? '',
        size,
        owner_org: version.owner_org,
      }, { onConflict: 'id' })
  }
  catch (errorSize) {
    if (errorSize instanceof Error && errorSize.message.includes('Rate limit exceeded')) {
      cloudlog({ requestId: c.get('requestId'), message: 'Rate limit exceeded', error: errorSize })
      return c.json({ status: 'Rate limit exceeded' }, 429)
    }
    cloudlogErr({ requestId: c.get('requestId'), message: 'errorSize', notFound, error: errorSize })
    // Ensure that the version is not linked anywhere
    const { count, error, data } = await supabase.from('channels')
      .select('id', { count: 'exact' })
      .eq('version', version.id)

    if (error)
      throw simpleError('cannot_check_channel_count', 'Cannot check channel count', { error })

    if ((count ?? 0) > 0) {
      if (notFound) {
        // set channel to unknow version where version is currently set
        // find id of unknow version
        const { data: unknowVersion, error: errorUnknowVersion } = await supabase.from('app_versions')
          .select('id')
          .eq('app_id', version.app_id)
          .eq('name', 'unknown')
          .single()
        if (errorUnknowVersion)
          throw simpleError('cannot_find_unknow_version', 'Cannot find unknow version for app_id', { error: errorUnknowVersion })
        if (!unknowVersion)
          throw simpleError('cannot_find_unknow_version', 'Cannot find unknow version for app_id', { error: 'no unknow version found' })
        await supabase.from('channels')
          .update({ version: unknowVersion.id })
          .eq('version', version.id)
      }
      else {
        throw simpleError('cannot_delete_failed_version', 'Cannot delete failed version', { error: `linked in some channels (${data.map(d => d.id).join(', ')})` })
      }
    }

    const { error: error1 } = await supabase.from('app_versions')
      .delete()
      .eq('id', version.id)

    if (error1)
      throw simpleError('cannot_delete_version', 'Cannot delete version', { error: error1 })
  }
  return c.json(BRES)
})
