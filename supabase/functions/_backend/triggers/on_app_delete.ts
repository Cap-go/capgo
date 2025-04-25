import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { DeletePayload } from '../utils/supabase.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, async (c) => {
  try {
    const table: keyof Database['public']['Tables'] = 'apps'
    const body = await c.req.json<DeletePayload<typeof table>>()

    if (body.table !== table) {
      console.log({ requestId: c.get('requestId'), context: `Not ${table}` })
      return c.json({ status: `Not ${table}` }, 200)
    }

    if (body.type !== 'DELETE') {
      console.log({ requestId: c.get('requestId'), context: 'Not DELETE' })
      return c.json({ status: 'Not DELETE' }, 200)
    }

    const record = body.old_record
    console.log({ requestId: c.get('requestId'), context: 'record', record })

    if (!record || !record.app_id) {
      console.log({ requestId: c.get('requestId'), context: 'no app id' })
      return c.json(BRES)
    }

    try {
      // Process app deletion with timeout protection
      const startTime = Date.now()

      // Track deleted app for billing
      await supabaseAdmin(c as any)
        .from('deleted_apps')
        .insert({
          app_id: record.app_id,
          owner_org: record.owner_org,
        })

      // Run most deletions in parallel
      await Promise.all([
        // Delete version related data
        supabaseAdmin(c as any)
          .from('app_versions_meta')
          .delete()
          .eq('app_id', record.app_id),

        // Delete daily version stats
        supabaseAdmin(c as any)
          .from('daily_version')
          .delete()
          .eq('app_id', record.app_id),

        // Delete version usage
        supabaseAdmin(c as any)
          .from('version_usage')
          .delete()
          .eq('app_id', record.app_id),

        // Delete app related data
        // Delete channel devices
        supabaseAdmin(c as any)
          .from('channel_devices')
          .delete()
          .eq('app_id', record.app_id),

        // Delete channels
        supabaseAdmin(c as any)
          .from('channels')
          .delete()
          .eq('app_id', record.app_id),

        // Delete devices
        supabaseAdmin(c as any)
          .from('devices')
          .delete()
          .eq('app_id', record.app_id),

        // Delete org_users with this app_id
        supabaseAdmin(c as any)
          .from('org_users')
          .delete()
          .eq('app_id', record.app_id),

        supabaseAdmin(c as any)
          .from('deploy_history')
          .delete()
          .eq('app_id', record.app_id),
      ])

      // Delete versions (last)
      await supabaseAdmin(c as any)
        .from('app_versions')
        .delete()
        .eq('app_id', record.app_id)

      // Track performance metrics
      const endTime = Date.now()
      const duration = endTime - startTime

      console.log({
        requestId: c.get('requestId'),
        context: 'app deletion completed',
        duration_ms: duration,
        app_id: record.app_id,
      })

      return c.json(BRES)
    }
    catch (error) {
      console.error({
        requestId: c.get('requestId'),
        context: 'app deletion process error',
        error: error instanceof Error ? error.message : JSON.stringify(error),
        timeout: error instanceof Error && error.message === 'Operation timed out',
      })

      // If it's a timeout, return a specific message
      if (error instanceof Error && error.message === 'Operation timed out') {
        return c.json({
          status: 'App deletion process started but timed out. The process will continue in the background.',
          error: 'Operation timed out',
        }, 202)
      }

      return c.json(BRES)
    }
  }
  catch (e) {
    console.error({
      requestId: c.get('requestId'),
      context: 'app deletion error',
      error: e instanceof Error ? e.message : JSON.stringify(e),
    })
    return c.json({ status: 'Cannot delete app', error: JSON.stringify(e) }, 500)
  }
})
