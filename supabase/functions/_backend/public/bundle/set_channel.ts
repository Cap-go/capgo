import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { HTTPException } from 'hono/http-exception'
import { simpleError } from '../../utils/hono.ts'
import { closeClient, getPgClient, logPgError } from '../../utils/pg.ts'
import { checkPermission } from '../../utils/rbac.ts'
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

  let channelName: string | null = null
  let channelOwnerOrg: string | null = null
  let versionName: string | null = null
  const effectiveApikey = apikey.key ?? c.get('capgkey')
  if (!effectiveApikey) {
    throw simpleError('cannot_set_bundle_to_channel', 'Cannot set bundle to channel', { error: 'Missing API key context for audit logging' })
  }

  // Update the channel to set the new version
  // Keep the supported write-scoped /bundle flow working after explicit RBAC
  // and ownership checks while preserving API-key identity for audit triggers.
  const pgClient = getPgClient(c)
  let dbClient: {
    query: <TRow = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<{ rowCount?: number | null, rows: TRow[] }>
    release: () => void
  } | null = null
  let transactionStarted = false
  try {
    dbClient = await pgClient.connect()

    const channelResult = await dbClient.query<{ name: string, owner_org: string }>(
      `SELECT name, owner_org
       FROM public.channels
       WHERE id = $1
         AND app_id = $2`,
      [body.channel_id, body.app_id],
    )

    const channel = (channelResult.rowCount ?? 0) === 1 ? channelResult.rows[0] : null
    const canPromoteTargetChannel = channel !== null && await checkPermission(c, 'channel.promote_bundle', { appId: body.app_id, channelId: body.channel_id })
    const canPromoteAppChannels = canPromoteTargetChannel || (channel === null && await checkPermission(c, 'channel.promote_bundle', { appId: body.app_id }))
    if (!canPromoteAppChannels) {
      throw simpleError('cannot_access_app', 'You can\'t access this app', { app_id: body.app_id, channel_id: body.channel_id })
    }

    const versionResult = await dbClient.query<{ name: string }>(
      `SELECT name
       FROM public.app_versions
       WHERE id = $1
         AND app_id = $2
         AND deleted = false`,
      [body.version_id, body.app_id],
    )

    if ((versionResult.rowCount ?? 0) !== 1) {
      throw simpleError('cannot_find_version', 'Cannot find version')
    }
    versionName = versionResult.rows[0].name

    if (!channel) {
      throw simpleError('cannot_find_channel', 'Cannot find channel')
    }
    channelName = channel.name
    channelOwnerOrg = channel.owner_org

    await dbClient.query('BEGIN')
    transactionStarted = true
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
      [body.version_id, body.channel_id, body.app_id, channelOwnerOrg],
    )

    if ((updateResult.rowCount ?? 0) !== 1) {
      throw new Error('Channel update affected 0 rows')
    }

    await dbClient.query('COMMIT')
  }
  catch (error) {
    if (dbClient && transactionStarted) {
      try {
        await dbClient.query('ROLLBACK')
      }
      catch {
        // Ignore rollback failures to preserve the original database error.
      }
    }
    if (error instanceof HTTPException)
      throw error
    logPgError(c, 'set_channel_update', error)
    throw simpleError('cannot_set_bundle_to_channel', 'Cannot set bundle to channel', { error: (error as Error)?.message })
  }
  finally {
    dbClient?.release()
    await closeClient(c, pgClient)
  }

  return c.json({
    status: 'success',
    message: `Bundle ${versionName} set to channel ${channelName}`,
  })
}
