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

interface PgQueryClient {
  query: <TRow = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<{ rowCount?: number | null, rows: TRow[] }>
  release: () => void
}

interface ChannelRow { name: string, owner_org: string }

function validateSetChannelBody(body: SetChannelBody) {
  if (!body.app_id || !body.version_id || !body.channel_id) {
    throw simpleError('missing_required_fields', 'Missing required fields', { app_id: body.app_id, version_id: body.version_id, channel_id: body.channel_id })
  }

  if (!isValidAppId(body.app_id)) {
    throw simpleError('invalid_app_id', 'App ID must be a reverse domain string', { app_id: body.app_id })
  }
}

function getEffectiveApikey(c: Context<MiddlewareKeyVariables>, apikey: Database['public']['Tables']['apikeys']['Row']) {
  const effectiveApikey = apikey.key ?? c.get('capgkey')
  if (!effectiveApikey) {
    throw simpleError('cannot_set_bundle_to_channel', 'Cannot set bundle to channel', { error: 'Missing API key context for audit logging' })
  }
  return effectiveApikey
}

async function fetchTargetChannel(dbClient: PgQueryClient, body: SetChannelBody) {
  const channelResult = await dbClient.query<ChannelRow>(
    `SELECT name, owner_org
     FROM public.channels
     WHERE id = $1
       AND app_id = $2`,
    [body.channel_id, body.app_id],
  )

  return (channelResult.rowCount ?? 0) === 1 ? channelResult.rows[0] : null
}

async function assertCanPromoteChannel(c: Context<MiddlewareKeyVariables>, body: SetChannelBody, channel: ChannelRow | null) {
  const canPromoteTargetChannel = channel !== null && await checkPermission(c, 'channel.promote_bundle', { appId: body.app_id, channelId: body.channel_id })
  const canPromoteAppChannels = channel === null && await checkPermission(c, 'channel.promote_bundle', { appId: body.app_id })

  if (!canPromoteTargetChannel && !canPromoteAppChannels) {
    throw simpleError('cannot_access_app', 'You can\'t access this app', { app_id: body.app_id, channel_id: body.channel_id })
  }
}

async function fetchVersionName(dbClient: PgQueryClient, body: SetChannelBody) {
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
  return versionResult.rows[0].name
}

async function updateChannelVersion(dbClient: PgQueryClient, body: SetChannelBody, channelOwnerOrg: string) {
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
}

export async function setChannel(c: Context<MiddlewareKeyVariables>, body: SetChannelBody, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  validateSetChannelBody(body)

  let channelName: string | null = null
  let versionName: string | null = null
  const effectiveApikey = getEffectiveApikey(c, apikey)

  const pgClient = getPgClient(c)
  let dbClient: PgQueryClient | null = null
  let transactionStarted = false
  try {
    dbClient = await pgClient.connect()

    const channel = await fetchTargetChannel(dbClient, body)
    await assertCanPromoteChannel(c, body, channel)
    versionName = await fetchVersionName(dbClient, body)

    if (!channel) {
      throw simpleError('cannot_find_channel', 'Cannot find channel')
    }
    channelName = channel.name

    await dbClient.query('BEGIN')
    transactionStarted = true
    await dbClient.query(
      'SELECT set_config(\'request.headers\', $1, true)',
      [JSON.stringify({ capgkey: effectiveApikey })],
    )
    await updateChannelVersion(dbClient, body, channel.owner_org)
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
