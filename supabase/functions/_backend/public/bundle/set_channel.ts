import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { quickError, simpleError } from '../../utils/hono.ts'
import { closeClient, getPgClient, logPgError } from '../../utils/pg.ts'
import { checkPermission } from '../../utils/rbac.ts'
import { supabaseApikey } from '../../utils/supabase.ts'
import { isValidAppId } from '../../utils/utils.ts'

interface SetChannelBody {
  app_id: string
  version_id: number
  channel_id: number
}

export async function setChannel(c: Context<MiddlewareKeyVariables>, body: SetChannelBody, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!body.app_id || !body.version_id || !body.channel_id) {
    throw simpleError('missing_required_fields', 'Missing required fields', { app_id: body.app_id, version_id: body.version_id, channel_id: body.channel_id })
  }

  if (!isValidAppId(body.app_id)) {
    throw simpleError('invalid_app_id', 'App ID must be a reverse domain string', { app_id: body.app_id })
  }

  // Auth context is already set by middlewareKey
  if (!(await checkPermission(c, 'channel.promote_bundle', { appId: body.app_id }))) {
    throw simpleError('cannot_access_app', 'You can\'t access this app', { app_id: body.app_id })
  }

  // Get organization info
  const { data: org, error: orgError } = await supabaseApikey(c, apikey.key)
    .from('apps')
    .select('owner_org')
    .eq('app_id', body.app_id)
    .single()

  if (orgError || !org) {
    throw quickError(404, 'cannot_find_app', 'Cannot find app', { supabaseError: orgError })
  }

  // Verify the bundle exists and belongs to the app
  const { data: version, error: versionError } = await supabaseApikey(c, apikey.key)
    .from('app_versions')
    .select('*')
    .eq('app_id', body.app_id)
    .eq('id', body.version_id)
    .eq('owner_org', org.owner_org)
    .eq('deleted', false)
    .single()

  if (versionError || !version) {
    throw simpleError('cannot_find_version', 'Cannot find version', { supabaseError: versionError })
  }

  // Verify the channel exists and belongs to the app
  const { data: channel, error: channelError } = await supabaseApikey(c, apikey.key)
    .from('channels')
    .select('*')
    .eq('app_id', body.app_id)
    .eq('id', body.channel_id)
    .eq('owner_org', org.owner_org)
    .single()

  if (channelError || !channel) {
    throw simpleError('cannot_find_channel', 'Cannot find channel', { supabaseError: channelError })
  }

  const effectiveApikey = apikey.key ?? c.get('capgkey')
  if (!effectiveApikey) {
    throw simpleError('cannot_set_bundle_to_channel', 'Cannot set bundle to channel', { error: 'Missing API key context for audit logging' })
  }

  // Update the channel to set the new version
  // Keep the supported write-scoped /bundle flow working after explicit RBAC
  // and ownership checks while preserving API-key identity for audit triggers.
  const pgClient = getPgClient(c)
  let dbClient: {
    query: (text: string, params?: unknown[]) => Promise<{ rowCount?: number | null }>
    release: () => void
  } | null = null
  try {
    dbClient = await pgClient.connect()
    await dbClient.query('BEGIN')
    await dbClient.query(
      'SELECT set_config(\'request.headers\', $1, true)',
      [JSON.stringify({ capgkey: effectiveApikey })],
    )

    const updateResult = await dbClient.query(
      `UPDATE public.channels
       SET version = $1
       WHERE id = $2
         AND app_id = $3
         AND owner_org = $4
       RETURNING id`,
      [body.version_id, body.channel_id, body.app_id, org.owner_org],
    )

    if ((updateResult.rowCount ?? 0) !== 1) {
      throw new Error('Channel update affected 0 rows')
    }

    await dbClient.query('COMMIT')
  }
  catch (error) {
    if (dbClient) {
      try {
        await dbClient.query('ROLLBACK')
      }
      catch {
        // Ignore rollback failures to preserve the original database error.
      }
    }
    logPgError(c, 'set_channel_update', error)
    throw simpleError('cannot_set_bundle_to_channel', 'Cannot set bundle to channel', { error: (error as Error)?.message })
  }
  finally {
    dbClient?.release()
    await closeClient(c, pgClient)
  }

  return c.json({
    status: 'success',
    message: `Bundle ${version.name} set to channel ${channel.name}`,
  })
}
