import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { BRES, simpleError } from '../../utils/hono.ts'
import { cloudlogErr } from '../../utils/logging.ts'
import { checkPermission } from '../../utils/rbac.ts'
import { supabaseApikey, updateOrCreateChannel } from '../../utils/supabase.ts'
import { isValidAppId } from '../../utils/utils.ts'

interface ChannelSet {
  app_id: string
  channel: string
  version?: string
  public?: boolean
  disableAutoUpdateUnderNative?: boolean
  disableAutoUpdate?: Database['public']['Enums']['disable_update']
  ios?: boolean
  android?: boolean
  electron?: boolean
  allow_device_self_set?: boolean
  allow_emulator?: boolean
  allow_device?: boolean
  allow_dev?: boolean
  allow_prod?: boolean
  rolloutVersion?: string | null
  rolloutPercentage?: number
  rolloutPercentageBps?: number
  rolloutEnabled?: boolean
  rolloutPaused?: boolean
  rolloutPauseReason?: string | null
  rolloutCacheTtlSeconds?: number
  rollback?: boolean
  promoteToStable?: boolean
  autoPauseEnabled?: boolean
  autoPauseWindowMinutes?: number
  autoPauseFailureRateBps?: number | null
  autoPauseConfidence?: number
  autoPauseMinAttempts?: number | null
  autoPauseMinFailures?: number | null
  autoPauseAction?: 'pause' | 'rollback' | 'notify'
  autoPauseCooldownMinutes?: number
}

async function findVersion(c: Context, appID: string, version: string, ownerOrg: string, apikey: Database['public']['Tables']['apikeys']['Row']) {
  const { data, error: vError } = await supabaseApikey(c, apikey.key)
    .from('app_versions')
    .select('id')
    .eq('app_id', appID)
    .eq('name', version)
    .eq('owner_org', ownerOrg)
    .eq('deleted', version === 'unknown')
    .single()
  if (vError || !data) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot find version', data: { appID, version, ownerOrg, vError } })
    return Promise.reject(new Error(vError?.message ?? 'Cannot find version'))
  }
  return data.id
}

export async function post(c: Context<MiddlewareKeyVariables>, body: ChannelSet, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!body.app_id) {
    throw simpleError('missing_app_id', 'Missing app_id', { body })
  }
  if (!isValidAppId(body.app_id)) {
    throw simpleError('invalid_app_id', 'App ID must be a reverse domain string', { app_id: body.app_id })
  }
  // Auth context is already set by middlewareKey
  if (!(await checkPermission(c, 'app.create_channel', { appId: body.app_id }))) {
    throw simpleError('cannot_access_app', 'You can\'t access this app', { app_id: body.app_id })
  }
  const { data: org, error } = await supabaseApikey(c, apikey.key).from('apps').select('owner_org').eq('app_id', body.app_id).single()
  if (error || !org) {
    throw simpleError('invalid_app_id', 'You can\'t access this app', { app_id: body.app_id })
  }
  const inferredElectron = body.electron ?? (body.public && body.ios !== body.android ? false : undefined)
  const rolloutPercentageBps = body.rolloutPercentageBps ?? (body.rolloutPercentage == null ? undefined : Math.round(body.rolloutPercentage * 100))
  if (rolloutPercentageBps != null && (rolloutPercentageBps < 0 || rolloutPercentageBps > 10000)) {
    throw simpleError('invalid_rollout_percentage', 'Rollout percentage must be between 0 and 10000 basis points', { rolloutPercentageBps })
  }
  if (body.autoPauseAction && !['pause', 'rollback', 'notify'].includes(body.autoPauseAction)) {
    throw simpleError('invalid_auto_pause_action', 'Auto-pause action must be pause, rollback, or notify', { autoPauseAction: body.autoPauseAction })
  }
  const shouldLoadExistingChannel = body.version === undefined || body.promoteToStable
  let existingChannelVersion: number | null = null
  let existingRolloutVersion: number | null = null
  if (shouldLoadExistingChannel) {
    const { data: existingChannel } = await supabaseApikey(c, apikey.key)
      .from('channels')
      .select('version, rollout_version')
      .eq('app_id', body.app_id)
      .eq('name', body.channel)
      .maybeSingle()
    existingChannelVersion = existingChannel?.version ?? null
    existingRolloutVersion = existingChannel?.rollout_version ?? null
  }
  const channel: Database['public']['Tables']['channels']['Insert'] = {
    created_by: apikey.user_id,
    app_id: body.app_id,
    name: body.channel,
    ...(body.public == null ? {} : { public: body.public }),
    ...(body.disableAutoUpdateUnderNative == null ? {} : { disable_auto_update_under_native: body.disableAutoUpdateUnderNative }),
    ...(body.disableAutoUpdate == null ? {} : { disable_auto_update: body.disableAutoUpdate }),
    ...(body.allow_device_self_set == null ? {} : { allow_device_self_set: body.allow_device_self_set }),
    ...(body.allow_emulator == null ? {} : { allow_emulator: body.allow_emulator }),
    ...(body.allow_device == null ? {} : { allow_device: body.allow_device }),
    ...(body.allow_dev == null ? {} : { allow_dev: body.allow_dev }),
    ...(body.allow_prod == null ? {} : { allow_prod: body.allow_prod }),
    ...(body.ios == null ? {} : { ios: body.ios }),
    ...(body.android == null ? {} : { android: body.android }),
    ...(inferredElectron == null ? {} : { electron: inferredElectron }),
    ...(rolloutPercentageBps == null ? {} : { rollout_percentage_bps: rolloutPercentageBps }),
    ...(body.rolloutEnabled == null ? {} : { rollout_enabled: body.rolloutEnabled }),
    ...(body.rolloutCacheTtlSeconds == null ? {} : { rollout_cache_ttl_seconds: body.rolloutCacheTtlSeconds }),
    ...(body.rolloutPauseReason === undefined ? {} : { rollout_pause_reason: body.rolloutPauseReason }),
    ...(body.rolloutPaused == null ? {} : { rollout_paused_at: body.rolloutPaused ? new Date().toISOString() : null, ...(body.rolloutPaused ? {} : { rollout_pause_reason: null }) }),
    ...(body.autoPauseEnabled == null ? {} : { auto_pause_enabled: body.autoPauseEnabled }),
    ...(body.autoPauseWindowMinutes == null ? {} : { auto_pause_window_minutes: body.autoPauseWindowMinutes }),
    ...(body.autoPauseFailureRateBps === undefined ? {} : { auto_pause_failure_rate_bps: body.autoPauseFailureRateBps }),
    ...(body.autoPauseConfidence == null ? {} : { auto_pause_confidence: body.autoPauseConfidence as any }),
    ...(body.autoPauseMinAttempts === undefined ? {} : { auto_pause_min_attempts: body.autoPauseMinAttempts }),
    ...(body.autoPauseMinFailures === undefined ? {} : { auto_pause_min_failures: body.autoPauseMinFailures }),
    ...(body.autoPauseAction == null ? {} : { auto_pause_action: body.autoPauseAction }),
    ...(body.autoPauseCooldownMinutes == null ? {} : { auto_pause_cooldown_minutes: body.autoPauseCooldownMinutes }),
    version: -1,
    owner_org: org.owner_org,
  }

  channel.version = body.version === undefined && existingChannelVersion !== null
    ? existingChannelVersion
    : await findVersion(c, body.app_id, body.version ?? 'unknown', org.owner_org, apikey)

  if (body.rolloutVersion !== undefined) {
    channel.rollout_version = body.rolloutVersion ? await findVersion(c, body.app_id, body.rolloutVersion, org.owner_org, apikey) : null
  }

  if (body.rollback) {
    channel.rollout_version = null
    channel.rollout_enabled = false
    channel.rollout_percentage_bps = 0
    channel.rollout_paused_at = null
    channel.rollout_pause_reason = null
  }

  if (body.promoteToStable) {
    const promotedVersion = channel.rollout_version ?? existingRolloutVersion
    if (!promotedVersion) {
      throw simpleError('missing_rollout_version', 'Cannot promote without a rollout version', { app_id: body.app_id, channel: body.channel })
    }
    channel.version = promotedVersion
    channel.rollout_version = null
    channel.rollout_enabled = false
    channel.rollout_percentage_bps = 0
    channel.rollout_paused_at = null
    channel.rollout_pause_reason = null
  }

  await updateOrCreateChannel(c, channel)
  return c.json(BRES)
}
