// Read path for the Cloudflare-embedded read replica (per-app Durable
// Objects, see supabase/functions/_backend/replicator/).
//
// The update hot path reads from a region-local AppReplica DO (two RPCs,
// ~1ms in-colo) instead of crossing to an external Postgres replica. Every
// method mirrors the exact shape of its Postgres counterpart in pg.ts and
// falls back to it when the replica is unavailable, stale (lease expired) or
// erroring, so turning the mode on is never worse than the current behavior.

import type { DurableObjectNamespace } from '@cloudflare/workers-types'
import type { Context } from 'hono'
import type { AppReplicaRpc, EdgeReplicaRow } from './edge_replica_schema.ts'
import type { AppOwnerPostgresResult, PlanAction } from './pg.ts'
import { cloudlog, cloudlogErr } from './logging.ts'
import { getClientDbRegionSB } from './geolocation.ts'
import {
  getAppBlockProviderInfraRequestsPostgres,
  getAppOwnerPostgres,
  getDrizzleClient,
  requestInfosPostgres,
} from './pg.ts'
import { getRolloutDecision } from './rollout.ts'
import { existInEnv, getEnv } from './utils.ts'

// DO location hints per DB region so a replica is created close to the
// regional worker that first reads it.
const REGION_LOCATION_HINTS: Record<string, string> = {
  EU: 'weur',
  NA: 'enam',
  SA: 'sam',
  OC: 'oc',
  AS_JAPAN: 'apac',
  AS_INDIA: 'apac',
  HK: 'apac',
  AF: 'afr',
  ME: 'me',
}

export function isEdgeReplicaEnabled(c: Context): boolean {
  if (!existInEnv(c, 'EDGE_REPLICA_MODE') || getEnv(c, 'EDGE_REPLICA_MODE') !== 'on')
    return false
  return !!(c.env as { APP_REPLICA?: DurableObjectNamespace }).APP_REPLICA
}

function safeHeader(c: Context, name: string, value: string) {
  try {
    c.header(name, value)
  }
  catch {
    // Response already streaming; header is best-effort.
  }
}

function toBool(value: unknown): boolean {
  return value === 1 || value === true
}

function toStringArray(value: unknown): string[] {
  if (typeof value !== 'string' || value === '')
    return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  }
  catch {
    return []
  }
}

const CHANNEL_BOOL_COLUMNS = new Set([
  'allow_dev',
  'allow_prod',
  'allow_emulator',
  'allow_device',
  'disable_auto_update_under_native',
  'ios',
  'android',
  'electron',
  'allow_device_self_set',
  'public',
  'rollout_enabled',
])

const CHANNEL_COLUMNS = [
  'id',
  'name',
  'app_id',
  'allow_dev',
  'allow_prod',
  'allow_emulator',
  'allow_device',
  'disable_auto_update_under_native',
  'disable_auto_update',
  'ios',
  'android',
  'electron',
  'allow_device_self_set',
  'public',
  'rollout_version',
  'rollout_percentage_bps',
  'rollout_enabled',
  'rollout_id',
  'rollout_paused_at',
  'rollout_pause_reason',
  'rollout_cache_ttl_seconds',
] as const

function mapVersion(row: EdgeReplicaRow, prefix: string, includeMetadata: boolean) {
  const version: Record<string, unknown> = {
    id: row[`${prefix}_id`] as number | null,
    name: row[`${prefix}_name`] as string,
    checksum: row[`${prefix}_checksum`] as string | null,
    session_key: row[`${prefix}_session_key`] as string | null,
    key_id: row[`${prefix}_key_id`] as string | null,
    storage_provider: (row[`${prefix}_storage_provider`] ?? 'r2') as string,
    external_url: row[`${prefix}_external_url`] as string | null,
    min_update_version: row[`${prefix}_min_update_version`] as string | null,
    manifest_count: (row[`${prefix}_manifest_count`] ?? 0) as number,
    r2_path: row[`${prefix}_r2_path`] as string | null,
  }
  if (includeMetadata) {
    version.link = row[`${prefix}_link`] as string | null
    version.comment = row[`${prefix}_comment`] as string | null
  }
  return version
}

function mapChannel(row: EdgeReplicaRow) {
  const channels: Record<string, unknown> = {}
  for (const col of CHANNEL_COLUMNS) {
    const value = row[`c_${col}`]
    channels[col] = CHANNEL_BOOL_COLUMNS.has(col) ? toBool(value) : value
  }
  return channels
}

interface MapChannelRowOptions {
  includeMetadata: boolean
  hasRollout: boolean
  hasDevice: boolean
  hasManifest: boolean
}

function mapChannelRow(row: EdgeReplicaRow | null | undefined, options: MapChannelRowOptions): any {
  if (!row)
    return undefined
  const mapped: Record<string, unknown> = {
    version: mapVersion(row, 'v', options.includeMetadata),
    channels: mapChannel(row),
  }
  if (options.hasRollout)
    mapped.rolloutVersion = mapVersion(row, 'rv', options.includeMetadata)
  if (options.hasDevice) {
    mapped.channel_devices = {
      device_id: row.cd_device_id as string,
      app_id: row.cd_app_id as string,
    }
  }
  if (options.hasManifest) {
    mapped.manifestEntries = typeof row.manifest_entries === 'string'
      ? JSON.parse(row.manifest_entries) as { file_name: string, file_hash: string, s3_path: string }[]
      : []
  }
  return mapped
}

export interface EdgeRequestInfosOptions {
  platform: string
  app_id: string
  device_id: string
  defaultChannel: string
  channelDeviceCount?: number | null
  manifestBundleCount?: number | null
  rolloutChannelCount?: number | null
  rolloutPausedVersionNames?: string[] | null
  currentVersionName: string
  includeMetadata?: boolean
  channelSelfOverrideChannelId?: number | null
}

// Region-local replica reader for the update hot path. One instance per
// request. Any failure or 'unavailable' answer permanently downgrades the
// instance to the Postgres fallback for the rest of the request.
export class EdgeReplicaReader {
  private stub: AppReplicaRpc
  private disabled = false

  constructor(
    private c: Context,
    namespace: DurableObjectNamespace,
    appId: string,
    private fallbackDrizzle: ReturnType<typeof getDrizzleClient>,
  ) {
    const region = getClientDbRegionSB(c) ?? 'EU'
    const locationHint = REGION_LOCATION_HINTS[region] ?? 'weur'
    const id = namespace.idFromName(`${region}:${appId}`)
    this.stub = namespace.get(id, { locationHint: locationHint as any }) as unknown as AppReplicaRpc
  }

  get active(): boolean {
    return !this.disabled
  }

  private downgrade(scope: string, error: unknown) {
    this.disabled = true
    if (error instanceof Error && error.message === 'edge replica unavailable') {
      cloudlog({ requestId: this.c.get('requestId'), message: `edge replica warming up, fallback to postgres in ${scope}` })
    }
    else {
      cloudlogErr({ requestId: this.c.get('requestId'), message: `edge replica fallback to postgres in ${scope}`, error: error instanceof Error ? error.message : error })
    }
    safeHeader(this.c, 'X-Database-Source', 'edge_replica_fallback')
  }

  private markServed() {
    safeHeader(this.c, 'X-Database-Source', 'edge_replica')
  }

  private ensureOk(result: { status: 'ok' | 'unavailable' }) {
    if (result.status !== 'ok')
      throw new Error('edge replica unavailable')
  }

  // Mirrors getAppOwnerPostgres (pg.ts).
  async getAppOwner(appId: string, actions: PlanAction[]): Promise<AppOwnerPostgresResult | null> {
    if (this.disabled)
      return getAppOwnerPostgres(this.c, appId, this.fallbackDrizzle, actions)
    if (actions.length === 0)
      return null
    try {
      const result = await this.stub.queryAppOwner(appId, actions)
      this.ensureOk(result)
      this.markServed()
      const row = result.rows?.at(0)
      if (!row)
        return null
      const ownerOrg = String(row.owner_org)
      if (!row.org_id) {
        cloudlog({
          requestId: this.c.get('requestId'),
          message: 'App owner org missing on edge replica; preserving cloud app classification from apps row',
          appId,
          ownerOrg,
        })
      }
      return {
        owner_org: ownerOrg,
        plan_valid: toBool(row.plan_valid),
        channel_device_count: Number(row.channel_device_count ?? 0),
        manifest_bundle_count: Number(row.manifest_bundle_count ?? 0),
        rollout_channel_count: Number(row.rollout_channel_count ?? 0),
        rollout_paused_version_names: toStringArray(row.rollout_paused_version_names),
        expose_metadata: toBool(row.expose_metadata),
        allow_device_custom_id: toBool(row.allow_device_custom_id),
        block_provider_infra_requests: toBool(row.block_provider_infra_requests),
        orgs: {
          created_by: (row.org_created_by as string | null) ?? '',
          id: (row.org_id as string | null) ?? ownerOrg,
          management_email: (row.org_management_email as string | null) ?? '',
        },
      }
    }
    catch (e) {
      this.downgrade('getAppOwner', e)
      return getAppOwnerPostgres(this.c, appId, this.fallbackDrizzle, actions)
    }
  }

  // Mirrors getAppBlockProviderInfraRequestsPostgres (pg.ts).
  async getAppBlockProviderInfraRequests(appId: string): Promise<ReturnType<typeof getAppBlockProviderInfraRequestsPostgres>> {
    if (this.disabled)
      return getAppBlockProviderInfraRequestsPostgres(this.c, appId, this.fallbackDrizzle)
    try {
      const result = await this.stub.queryBlockProvider(appId)
      this.ensureOk(result)
      const row = result.rows?.at(0)
      if (!row)
        return { status: 'missing' }
      return { status: 'found', blockProviderInfraRequests: toBool(row.block_provider_infra_requests) }
    }
    catch (e) {
      this.downgrade('getAppBlockProviderInfraRequests', e)
      return getAppBlockProviderInfraRequestsPostgres(this.c, appId, this.fallbackDrizzle)
    }
  }

  private async requestManifestEntries(appId: string, versionId: number) {
    const result = await this.stub.queryManifest(appId, versionId)
    this.ensureOk(result)
    return (result.rows ?? []) as { file_name: string, file_hash: string, s3_path: string }[]
  }

  // Mirrors resolveRolloutChannelDataPostgres (pg.ts). Runs in the worker so
  // the rollout decision cache (Cache API) stays request-local.
  private async resolveRolloutChannelData(channelData: any, appId: string, deviceId: string, currentVersionName: string, includeManifest: boolean) {
    if (!channelData)
      return channelData
    const stableVersion = channelData.version
    const rolloutVersion = channelData.rolloutVersion
    let selectedVersion = stableVersion
    if (rolloutVersion?.id && channelData.channels?.rollout_version) {
      const decision = await getRolloutDecision(this.c, {
        appId,
        channelId: channelData.channels.id,
        currentVersionName,
        deviceId,
        rolloutCacheTtlSeconds: channelData.channels.rollout_cache_ttl_seconds,
        rolloutEnabled: channelData.channels.rollout_enabled,
        rolloutId: channelData.channels.rollout_id,
        rolloutPausedAt: channelData.channels.rollout_paused_at,
        rolloutPercentageBps: channelData.channels.rollout_percentage_bps,
        rolloutVersionId: rolloutVersion.id,
        rolloutVersionName: rolloutVersion.name,
      })
      if (decision.selected)
        selectedVersion = rolloutVersion
      cloudlog({ requestId: this.c.get('requestId'), message: 'rollout decision', appId, channelId: channelData.channels.id, selected: decision.selected, reason: decision.reason })
    }
    const manifestEntries = includeManifest && selectedVersion?.manifest_count > 0
      ? await this.requestManifestEntries(appId, selectedVersion.id)
      : []
    return { ...channelData, version: selectedVersion, manifestEntries }
  }

  // Mirrors requestInfosPostgres (pg.ts). Both lookups run inside the DO,
  // i.e. one region-local round trip.
  async requestInfos(options: EdgeRequestInfosOptions): Promise<{ channelData: any, channelOverride: any }> {
    if (this.disabled)
      return this.requestInfosFallback(options)
    const {
      platform,
      app_id,
      device_id,
      defaultChannel,
      channelDeviceCount,
      manifestBundleCount,
      rolloutChannelCount,
      rolloutPausedVersionNames,
      currentVersionName,
      includeMetadata = false,
      channelSelfOverrideChannelId,
    } = options
    const shouldQueryChannelOverride = channelDeviceCount === undefined || channelDeviceCount === null ? true : channelDeviceCount > 0
    const shouldFetchManifest = manifestBundleCount === undefined || manifestBundleCount === null ? true : manifestBundleCount > 0
    const isPausedRolloutVersion = Array.isArray(rolloutPausedVersionNames) && rolloutPausedVersionNames.includes(currentVersionName)
    const rollout = (rolloutChannelCount ?? 0) > 0 || isPausedRolloutVersion

    try {
      const result = await this.stub.queryInfos(app_id, {
        platform,
        deviceId: device_id,
        defaultChannel,
        includeManifest: shouldFetchManifest,
        includeMetadata,
        rollout,
        queryOverride: shouldQueryChannelOverride,
        channelSelfOverrideChannelId,
      })
      this.ensureOk(result)

      const mapOptions = { includeMetadata, hasRollout: rollout, hasManifest: !rollout && shouldFetchManifest }
      const channelOverrideRaw = mapChannelRow(result.override?.at(0), {
        ...mapOptions,
        hasDevice: typeof channelSelfOverrideChannelId !== 'number',
      })
      const channelDataRaw = mapChannelRow(result.rows?.at(0), { ...mapOptions, hasDevice: false })

      if (!rollout)
        return { channelData: channelDataRaw, channelOverride: channelOverrideRaw }

      const channelOverride = await this.resolveRolloutChannelData(channelOverrideRaw, app_id, device_id, currentVersionName, shouldFetchManifest)
      const channelData = channelOverride
        ? channelDataRaw
        : await this.resolveRolloutChannelData(channelDataRaw, app_id, device_id, currentVersionName, shouldFetchManifest)
      return { channelOverride, channelData }
    }
    catch (e) {
      this.downgrade('requestInfos', e)
      return this.requestInfosFallback(options)
    }
  }

  private requestInfosFallback(options: EdgeRequestInfosOptions) {
    return requestInfosPostgres({
      c: this.c,
      drizzleClient: this.fallbackDrizzle,
      ...options,
    })
  }
}

export function getEdgeReplicaReader(c: Context, appId: string, fallbackDrizzle: ReturnType<typeof getDrizzleClient>): EdgeReplicaReader | null {
  if (!isEdgeReplicaEnabled(c) || !appId)
    return null
  try {
    return new EdgeReplicaReader(c, (c.env as { APP_REPLICA: DurableObjectNamespace }).APP_REPLICA, appId, fallbackDrizzle)
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'edge replica reader init failed', error: e instanceof Error ? e.message : e })
    return null
  }
}
