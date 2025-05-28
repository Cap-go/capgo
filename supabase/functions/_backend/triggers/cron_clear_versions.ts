import type { Context } from '@hono/hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../utils/loggin.ts'
import { getPath, s3 } from '../utils/s3.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

export const app = new Hono<MiddlewareKeyVariables>()

function errorOut(c: Context, error: string) {
  console.error(error)
  return c.json({ status: error }, 500)
}

app.post('/', middlewareAPISecret, async (c) => {
  try {
    // unsafe parse the body
    const body = await c.req.json<{ version: Database['public']['Tables']['app_versions']['Row'] }>()
    cloudlog({ requestId: c.get('requestId'), message: 'post body cron_clear_versions', body })

    // Let's start with the metadata
    const supabase = supabaseAdmin(c as any)

    const version = body.version
    if (version.user_id === null) {
      // find the user_id from the app_id
      const { data: app, error: errorApp } = await supabaseAdmin(c as any)
        .from('apps')
        .select('user_id')
        .eq('app_id', version.app_id)
        .single()
      if (errorApp)
        return errorOut(c as any, `Cannot find user_id for app_id ${version.app_id} because of error: ${errorApp}`)
      if (!app)
        return errorOut(c as any, `Cannot find user_id for app_id ${version.app_id} because of no app found`)
      version.user_id = app.user_id
    }

    let notFound = false
    try {
      const v2Path = await getPath(c as any, version)
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
      const size = await s3.getSize(c as any, v2Path).catch((e) => {
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
      const { data: appVersion, error: errorAppVersion } = await supabaseAdmin(c as any)
        .from('app_versions')
        .select('checksum')
        .eq('id', version.id)
        .single()
      if (errorAppVersion)
        return errorOut(c as any, `Cannot find checksum for app_versions id ${version.id} because of error: ${errorAppVersion}`)
      if (!appVersion)
        return errorOut(c as any, `Cannot find checksum for app_versions id ${version.id} because of no app_versions found`)
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
        return errorOut(c as any, `Cannot check channel count for ${version.id} because of error: ${error}`)

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
            return errorOut(c as any, `Cannot find unknow version for app_id ${version.app_id} because of error: ${errorUnknowVersion}`)
          if (!unknowVersion)
            return errorOut(c as any, `Cannot find unknow version for app_id ${version.app_id} because of no unknow version found`)
          await supabase.from('channels')
            .update({ version: unknowVersion.id })
            .eq('version', version.id)
        }
        else {
          return errorOut(c as any, `cannot delete failed version ${version.id}, linked in some channels (${data.map(d => d.id).join(', ')})`)
        }
      }

      const { error: error1 } = await supabase.from('app_versions')
        .delete()
        .eq('id', version.id)

      if (error1)
        errorOut(c as any, `Cannot delete version ${version.id} because of the error: ${error1}`)
    }
    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot cleanup versions', error: JSON.stringify(e) }, 500)
  }
})
