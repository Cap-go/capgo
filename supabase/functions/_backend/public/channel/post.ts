import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { BRES, simpleError } from '../../utils/hono.ts'
import { cloudlogErr } from '../../utils/logging.ts'
import { checkPermission } from '../../utils/rbac.ts'
import { supabaseAdmin, updateOrCreateChannel } from '../../utils/supabase.ts'
import { isInternalVersionName, isValidAppId } from '../../utils/utils.ts'

interface ChannelSet {
  app_id: string
  channel: string
  version?: string | null
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
  rolloutVersion?: string | number | null
  rollout_version?: string | number | null
  rolloutPercentage?: number
  rollout_percentage?: number
  rolloutPercentageBps?: number
  rollout_percentage_bps?: number
  rolloutEnabled?: boolean
  rollout_enabled?: boolean
  rolloutPaused?: boolean
  rollout_paused?: boolean
  rolloutPausedAt?: string | null
  rollout_paused_at?: string | null
  rolloutPauseReason?: string | null
  rollout_pause_reason?: string | null
  rolloutCacheTtlSeconds?: number
  rollout_cache_ttl_seconds?: number
  rollback?: boolean
  promoteToStable?: boolean
  promote_to_stable?: boolean
  autoPauseEnabled?: boolean
  auto_pause_enabled?: boolean
  autoPauseWindowMinutes?: number
  auto_pause_window_minutes?: number
  autoPauseFailureRateBps?: number | null
  auto_pause_failure_rate_bps?: number | null
  autoPauseConfidence?: number
  auto_pause_confidence?: number
  autoPauseMinAttempts?: number | null
  auto_pause_min_attempts?: number | null
  autoPauseMinFailures?: number | null
  auto_pause_min_failures?: number | null
  autoPauseAction?: 'pause' | 'rollback' | 'notify'
  auto_pause_action?: 'pause' | 'rollback' | 'notify'
  autoPauseCooldownMinutes?: number
  auto_pause_cooldown_minutes?: number
}

function definedOrAlias<T>(value: T | undefined, alias: T | undefined): T | undefined {
  return value === undefined ? alias : value
}

function normalizeChannelSet(body: ChannelSet): ChannelSet {
  return {
    ...body,
    rolloutVersion: definedOrAlias(body.rolloutVersion, body.rollout_version),
    rolloutPercentage: definedOrAlias(body.rolloutPercentage, body.rollout_percentage),
    rolloutPercentageBps: definedOrAlias(body.rolloutPercentageBps, body.rollout_percentage_bps),
    rolloutEnabled: definedOrAlias(body.rolloutEnabled, body.rollout_enabled),
    rolloutPaused: definedOrAlias(body.rolloutPaused, body.rollout_paused),
    rolloutPausedAt: definedOrAlias(body.rolloutPausedAt, body.rollout_paused_at),
    rolloutPauseReason: definedOrAlias(body.rolloutPauseReason, body.rollout_pause_reason),
    rolloutCacheTtlSeconds: definedOrAlias(body.rolloutCacheTtlSeconds, body.rollout_cache_ttl_seconds),
    promoteToStable: definedOrAlias(body.promoteToStable, body.promote_to_stable),
    autoPauseEnabled: definedOrAlias(body.autoPauseEnabled, body.auto_pause_enabled),
    autoPauseWindowMinutes: definedOrAlias(body.autoPauseWindowMinutes, body.auto_pause_window_minutes),
    autoPauseFailureRateBps: definedOrAlias(body.autoPauseFailureRateBps, body.auto_pause_failure_rate_bps),
    autoPauseConfidence: definedOrAlias(body.autoPauseConfidence, body.auto_pause_confidence),
    autoPauseMinAttempts: definedOrAlias(body.autoPauseMinAttempts, body.auto_pause_min_attempts),
    autoPauseMinFailures: definedOrAlias(body.autoPauseMinFailures, body.auto_pause_min_failures),
    autoPauseAction: definedOrAlias(body.autoPauseAction, body.auto_pause_action),
    autoPauseCooldownMinutes: definedOrAlias(body.autoPauseCooldownMinutes, body.auto_pause_cooldown_minutes),
  }
}

function validateIntegerRange(value: number | null | undefined, field: string, min: number, max: number) {
  if (value == null)
    return
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < min || value > max) {
    throw simpleError('invalid_rollout_config', `${field} must be an integer between ${min} and ${max}`, { field, value, min, max })
  }
}

function validateConfidence(value: number | undefined) {
  if (value == null)
    return
  if (!Number.isFinite(value) || value <= 0 || value >= 1) {
    throw simpleError('invalid_auto_pause_confidence', 'Auto-pause confidence must be greater than 0 and less than 1', { autoPauseConfidence: value })
  }
}

async function findVersion(c: Context, appID: string, version: string, ownerOrg: string) {
  const { data, error: vError } = await supabaseAdmin(c)
    .from('app_versions')
    .select('id')
    .eq('app_id', appID)
    .eq('name', version)
    .eq('owner_org', ownerOrg)
    .eq('deleted', false)
    .single()
  if (vError || !data) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot find version', data: { appID, version, ownerOrg, vError } })
    return Promise.reject(new Error(vError?.message ?? 'Cannot find version'))
  }
  return data.id
}

async function findVersionId(c: Context, appID: string, versionId: number, ownerOrg: string) {
  const { data, error: vError } = await supabaseAdmin(c)
    .from('app_versions')
    .select('id')
    .eq('id', versionId)
    .eq('app_id', appID)
    .eq('owner_org', ownerOrg)
    .eq('deleted', false)
    .single()
  if (vError || !data) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot find version by id', data: { appID, versionId, ownerOrg, vError } })
    return Promise.reject(new Error(vError?.message ?? 'Cannot find version'))
  }
  return data.id
}

function resolveVersion(c: Context, appID: string, version: string | number, ownerOrg: string) {
  return typeof version === 'number'
    ? findVersionId(c, appID, version, ownerOrg)
    : findVersion(c, appID, version, ownerOrg)
}

export async function post(c: Context<MiddlewareKeyVariables>, body: ChannelSet, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  body = normalizeChannelSet(body)
  if (!body.app_id) {
    throw simpleError('missing_app_id', 'Missing app_id', { body })
  }
  if (!isValidAppId(body.app_id)) {
    throw simpleError('invalid_app_id', 'App ID must be a reverse domain string', { app_id: body.app_id })
  }
  const { data: existingChannel } = await supabaseAdmin(c)
    .from('channels')
    .select('id, version, rollout_version')
    .eq('app_id', body.app_id)
    .eq('name', body.channel)
    .maybeSingle()

  if (existingChannel) {
    const canUpdateChannel = await checkPermission(c, 'channel.update_settings', { appId: body.app_id, channelId: existingChannel.id })
    if (!canUpdateChannel) {
      throw simpleError('cannot_access_app', 'You can\'t access this app', { app_id: body.app_id, channel: body.channel })
    }
  }
  else if (!(await checkPermission(c, 'app.create_channel', { appId: body.app_id }))) {
    throw simpleError('cannot_access_app', 'You can\'t access this app', { app_id: body.app_id })
  }
  const { data: org, error } = await supabaseAdmin(c).from('apps').select('owner_org').eq('app_id', body.app_id).single()
  if (error || !org) {
    throw simpleError('invalid_app_id', 'You can\'t access this app', { app_id: body.app_id })
  }

  const existingChannelVersion = existingChannel?.version ?? null
  const existingRolloutVersion = existingChannel?.rollout_version ?? null
  const existingChannelId = existingChannel?.id ?? null
  let requestedVersionId: number | null | undefined
  if (body.version !== undefined) {
    const requestedVersionName = body.version && !isInternalVersionName(body.version) ? body.version : null
    if (existingChannel) {
      // Do not inspect the current or requested bundle until promotion is proven: a
      // settings-only key can lack channel.read and must not gain a bundle oracle.
      if (!(await checkPermission(c, 'channel.promote_bundle', { appId: body.app_id, channelId: existingChannel.id }))) {
        throw simpleError('cannot_access_app', 'You can\'t access this app', { app_id: body.app_id, channel: body.channel })
      }
      requestedVersionId = requestedVersionName
        ? await findVersion(c, body.app_id, requestedVersionName, org.owner_org)
        : null
    }
    else if (requestedVersionName) {
      if (!(await checkPermission(c, 'channel.promote_bundle', { appId: body.app_id }))) {
        throw simpleError('cannot_access_app', 'You can\'t access this app', { app_id: body.app_id, channel: body.channel })
      }
      requestedVersionId = await findVersion(c, body.app_id, requestedVersionName, org.owner_org)
    }
    else {
      requestedVersionId = null
    }
  }
  const inferredElectron = body.electron ?? (body.public && body.ios !== body.android ? false : undefined)
  if (body.rolloutPercentage != null && (!Number.isFinite(body.rolloutPercentage) || body.rolloutPercentage < 0 || body.rolloutPercentage > 100)) {
    throw simpleError('invalid_rollout_percentage', 'Rollout percentage must be between 0 and 100', { rolloutPercentage: body.rolloutPercentage })
  }
  const rolloutPercentageBps = body.rolloutPercentageBps ?? (body.rolloutPercentage == null ? undefined : Math.round(body.rolloutPercentage * 100))
  validateIntegerRange(rolloutPercentageBps, 'rolloutPercentageBps', 0, 10000)
  validateIntegerRange(body.rolloutCacheTtlSeconds, 'rolloutCacheTtlSeconds', 60, 31536000)
  validateIntegerRange(body.autoPauseWindowMinutes, 'autoPauseWindowMinutes', 1, 10080)
  validateIntegerRange(body.autoPauseFailureRateBps, 'autoPauseFailureRateBps', 0, 10000)
  validateConfidence(body.autoPauseConfidence)
  validateIntegerRange(body.autoPauseMinAttempts, 'autoPauseMinAttempts', 0, Number.MAX_SAFE_INTEGER)
  validateIntegerRange(body.autoPauseMinFailures, 'autoPauseMinFailures', 0, Number.MAX_SAFE_INTEGER)
  validateIntegerRange(body.autoPauseCooldownMinutes, 'autoPauseCooldownMinutes', 0, 10080)
  if (body.autoPauseAction && !['pause', 'rollback', 'notify'].includes(body.autoPauseAction)) {
    throw simpleError('invalid_auto_pause_action', 'Auto-pause action must be pause, rollback, or notify', { autoPauseAction: body.autoPauseAction })
  }
  const changesRolloutTarget = body.rolloutVersion !== undefined || !!body.rollback || !!body.promoteToStable
  if (changesRolloutTarget) {
    if (existingChannelId === null) {
      throw simpleError('cannot_find_channel', 'Cannot find channel', { app_id: body.app_id, channel: body.channel })
    }
    if (!(await checkPermission(c, 'channel.promote_bundle', { appId: body.app_id, channelId: existingChannelId }))) {
      throw simpleError('cannot_promote_bundle', 'You can\'t promote bundles on this channel', { app_id: body.app_id, channel: body.channel, channelId: existingChannelId })
    }
  }
  if (body.rolloutVersion && (
    (body.version === undefined && existingChannelVersion === null) || body.version === null || body.version === 'unknown'
  )) {
    throw simpleError('missing_stable_version', 'Cannot set rollout target without a stable bundle', { app_id: body.app_id, channel: body.channel })
  }
  const rolloutPausedAt = body.rolloutPausedAt !== undefined
    ? body.rolloutPausedAt
    : body.rolloutPaused == null ? undefined : body.rolloutPaused ? new Date().toISOString() : null

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
    ...(rolloutPausedAt === undefined ? {} : { rollout_paused_at: rolloutPausedAt, ...(rolloutPausedAt ? {} : { rollout_pause_reason: null }) }),
    ...(body.autoPauseEnabled == null ? {} : { auto_pause_enabled: body.autoPauseEnabled }),
    ...(body.autoPauseWindowMinutes == null ? {} : { auto_pause_window_minutes: body.autoPauseWindowMinutes }),
    ...(body.autoPauseFailureRateBps === undefined ? {} : { auto_pause_failure_rate_bps: body.autoPauseFailureRateBps }),
    ...(body.autoPauseConfidence == null ? {} : { auto_pause_confidence: body.autoPauseConfidence as any }),
    ...(body.autoPauseMinAttempts === undefined ? {} : { auto_pause_min_attempts: body.autoPauseMinAttempts }),
    ...(body.autoPauseMinFailures === undefined ? {} : { auto_pause_min_failures: body.autoPauseMinFailures }),
    ...(body.autoPauseAction == null ? {} : { auto_pause_action: body.autoPauseAction }),
    ...(body.autoPauseCooldownMinutes == null ? {} : { auto_pause_cooldown_minutes: body.autoPauseCooldownMinutes }),
    version: null,
    owner_org: org.owner_org,
  }

  if (body.version === undefined) {
    channel.version = existingChannelVersion
  }
  else {
    channel.version = requestedVersionId ?? null
  }

  if (body.rolloutVersion !== undefined) {
    channel.rollout_version = body.rolloutVersion ? await resolveVersion(c, body.app_id, body.rolloutVersion, org.owner_org) : null
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

  await updateOrCreateChannel(c, channel, existingChannelId, body.version === undefined && !body.promoteToStable)
  return c.json(BRES)
}
