// Read path for the Cloudflare-embedded read replica (D1).
//
// The update hot path can read the 7 tables it needs from a D1 database that
// lives inside Cloudflare (replicated to every D1 region via the Sessions
// API) instead of crossing to an external Postgres replica. Data is fed by
// the capgo_replicator worker (see cloudflare_workers/replicator).
//
// Every method mirrors the exact shape of its Postgres counterpart in pg.ts
// and falls back to it on any error or staleness, so turning the mode on is
// never worse than the current behavior.

import type { D1Database, D1DatabaseSession, D1PreparedStatement } from '@cloudflare/workers-types'
import type { Context } from 'hono'
import type { AppOwnerPostgresResult, PlanAction } from './pg.ts'
import { cloudlog, cloudlogErr } from './logging.ts'
import {
  getAppBlockProviderInfraRequestsPostgres,
  getAppOwnerPostgres,
  getDrizzleClient,
  requestInfosPostgres,
} from './pg.ts'
import { getRolloutDecision } from './rollout.ts'
import { existInEnv, getEnv } from './utils.ts'

const DEFAULT_MAX_LAG_SECONDS = 300

const PLAN_EXCEEDED_COLUMNS: Record<PlanAction, string> = {
  mau: 'mau_exceeded',
  storage: 'storage_exceeded',
  bandwidth: 'bandwidth_exceeded',
}

export class EdgeReplicaStaleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EdgeReplicaStaleError'
  }
}

export function isEdgeReplicaEnabled(c: Context): boolean {
  if (!existInEnv(c, 'EDGE_REPLICA_MODE') || getEnv(c, 'EDGE_REPLICA_MODE') !== 'on')
    return false
  return !!(c.env as { DB_REPLICA?: D1Database }).DB_REPLICA
}

function maxLagSeconds(c: Context): number {
  const raw = existInEnv(c, 'EDGE_REPLICA_MAX_LAG_SECONDS') ? Number(getEnv(c, 'EDGE_REPLICA_MAX_LAG_SECONDS')) : Number.NaN
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_LAG_SECONDS
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

// Mirrors buildPlanValidationExpression in pg.ts, in SQLite dialect.
function planValidSql(actions: PlanAction[]): string {
  const extraConditions = actions.map(action => ` AND si.${PLAN_EXCEEDED_COLUMNS[action]} = 0`).join('')
  return `CASE WHEN (
    EXISTS (SELECT 1 FROM orgs oc WHERE oc.id = a.owner_org AND oc.has_usage_credits = 1)
    OR EXISTS (
      SELECT 1 FROM stripe_info si
      WHERE si.customer_id = (SELECT oi.customer_id FROM orgs oi WHERE oi.id = a.owner_org)
        AND (
          date(si.trial_at) > date('now')
          OR (si.status = 'succeeded'${extraConditions})
        )
    )
    OR (SELECT oi.customer_id FROM orgs oi WHERE oi.id = a.owner_org) IS NULL
  ) THEN 1 ELSE 0 END`
}

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

function channelSelect(): string {
  return CHANNEL_COLUMNS.map(col => `ch."${col}" AS "c_${col}"`).join(', ')
}

// Mirrors getVersionSelect in pg.ts. `useBuiltinCase` matches the Postgres
// behavior where a channel without a linked version resolves to 'builtin'.
function versionSelect(aliasName: string, prefix: string, includeMetadata: boolean, useBuiltinCase: boolean): string {
  const name = useBuiltinCase
    ? `CASE WHEN ch.version IS NULL THEN 'builtin' ELSE ${aliasName}.name END`
    : `${aliasName}.name`
  const cols = [
    `${aliasName}.id AS "${prefix}_id"`,
    `${name} AS "${prefix}_name"`,
    `${aliasName}.checksum AS "${prefix}_checksum"`,
    `${aliasName}.session_key AS "${prefix}_session_key"`,
    `${aliasName}.key_id AS "${prefix}_key_id"`,
    `COALESCE(${aliasName}.storage_provider, 'r2') AS "${prefix}_storage_provider"`,
    `${aliasName}.external_url AS "${prefix}_external_url"`,
    `${aliasName}.min_update_version AS "${prefix}_min_update_version"`,
    `${aliasName}.manifest_count AS "${prefix}_manifest_count"`,
    `${aliasName}.r2_path AS "${prefix}_r2_path"`,
  ]
  if (includeMetadata) {
    cols.push(`${aliasName}.link AS "${prefix}_link"`)
    cols.push(`${aliasName}.comment AS "${prefix}_comment"`)
  }
  return cols.join(', ')
}

// Mirrors activeChannelVersionJoin in pg.ts.
function versionJoin(aliasName: string, channelVersionColumn: string, joinType: 'LEFT' | 'INNER', matchAppId: boolean): string {
  const appIdCondition = matchAppId ? ` AND ${aliasName}.app_id = ch.app_id` : ''
  return `${joinType} JOIN app_versions ${aliasName}
    ON ${channelVersionColumn} = ${aliasName}.id
    AND (${aliasName}.deleted = 0 OR ${aliasName}.name = 'builtin')${appIdCondition}`
}

// Mirrors the json_agg(...) FILTER manifest aggregation in pg.ts.
function manifestEntriesSelect(): string {
  return `(
    SELECT json_group_array(json_object('file_name', m.file_name, 'file_hash', m.file_hash, 's3_path', m.s3_path))
    FROM manifest m WHERE m.app_version_id = v.id
  ) AS "manifest_entries"`
}

function mapVersion(row: Record<string, unknown>, prefix: string, includeMetadata: boolean) {
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

function mapChannel(row: Record<string, unknown>) {
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

function mapChannelRow(row: Record<string, unknown> | null | undefined, options: MapChannelRowOptions): any {
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

// D1-backed reader for the update hot path. One instance per request; the
// first read validates replica freshness in the same round trip. Any failure
// permanently downgrades the instance to the Postgres fallback for the rest
// of the request.
export class EdgeReplicaReader {
  private session: D1DatabaseSession
  private checked = false
  private disabled = false

  constructor(
    private c: Context,
    db: D1Database,
    private fallbackDrizzle: ReturnType<typeof getDrizzleClient>,
  ) {
    // Reads are served by the closest D1 read replica; consistency between
    // requests is not needed because the outbox replay is strictly ordered.
    this.session = db.withSession('first-unconstrained')
  }

  get active(): boolean {
    return !this.disabled
  }

  private stateStatement(): D1PreparedStatement {
    return this.session.prepare(`SELECT key, value FROM replication_state WHERE key IN ('seeded_at', 'last_applied_at')`)
  }

  private assertFresh(stateRows: Record<string, unknown>[] | undefined) {
    const state = new Map((stateRows ?? []).map(row => [String(row.key), String(row.value)]))
    if (!state.get('seeded_at'))
      throw new EdgeReplicaStaleError('edge replica is not seeded')
    const lastAppliedAt = Date.parse(state.get('last_applied_at') ?? '')
    if (!Number.isFinite(lastAppliedAt))
      throw new EdgeReplicaStaleError('edge replica has no heartbeat')
    const lagSeconds = Math.max(0, (Date.now() - lastAppliedAt) / 1000)
    if (lagSeconds > maxLagSeconds(this.c))
      throw new EdgeReplicaStaleError(`edge replica lag ${Math.round(lagSeconds)}s exceeds limit`)
    this.checked = true
    safeHeader(this.c, 'X-Database-Source', 'edge_replica')
    safeHeader(this.c, 'X-Replication-Lag-Seconds', String(Math.round(lagSeconds)))
  }

  private downgrade(scope: string, error: unknown) {
    this.disabled = true
    cloudlogErr({ requestId: this.c.get('requestId'), message: `edge replica fallback to postgres in ${scope}`, error: error instanceof Error ? error.message : error })
    safeHeader(this.c, 'X-Database-Source', 'edge_replica_fallback')
  }

  // Mirrors getAppOwnerPostgres (pg.ts).
  async getAppOwner(appId: string, actions: PlanAction[]): Promise<AppOwnerPostgresResult | null> {
    if (this.disabled)
      return getAppOwnerPostgres(this.c, appId, this.fallbackDrizzle, actions)
    if (actions.length === 0)
      return null
    try {
      const appStatement = this.session.prepare(`
        SELECT
          a.owner_org, a.channel_device_count, a.manifest_bundle_count, a.rollout_channel_count,
          a.rollout_paused_version_names, a.expose_metadata, a.allow_device_custom_id,
          a.block_provider_infra_requests,
          o.created_by AS org_created_by, o.id AS org_id, o.management_email AS org_management_email,
          ${planValidSql(actions)} AS plan_valid
        FROM apps a
        LEFT JOIN orgs o ON o.id = a.owner_org
        WHERE a.app_id = ?1
        LIMIT 1`).bind(appId)
      const [stateResult, appResult] = this.checked
        ? [null, await appStatement.all()]
        : await this.session.batch([this.stateStatement(), appStatement])
      if (stateResult)
        this.assertFresh(stateResult.results as Record<string, unknown>[])
      const row = (appResult!.results as Record<string, unknown>[]).at(0)
      if (!row)
        return null
      const ownerOrg = String(row.owner_org)
      const appOwner: AppOwnerPostgresResult = {
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
      if (!row.org_id) {
        cloudlog({
          requestId: this.c.get('requestId'),
          message: 'App owner org missing on edge replica; preserving cloud app classification from apps row',
          appId,
          ownerOrg,
        })
      }
      return appOwner
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
      const statement = this.session.prepare('SELECT block_provider_infra_requests FROM apps WHERE app_id = ?1 LIMIT 1').bind(appId)
      const [stateResult, appResult] = this.checked
        ? [null, await statement.all()]
        : await this.session.batch([this.stateStatement(), statement])
      if (stateResult)
        this.assertFresh(stateResult.results as Record<string, unknown>[])
      const row = (appResult!.results as Record<string, unknown>[]).at(0)
      if (!row)
        return { status: 'missing' }
      return { status: 'found', blockProviderInfraRequests: toBool(row.block_provider_infra_requests) }
    }
    catch (e) {
      this.downgrade('getAppBlockProviderInfraRequests', e)
      return getAppBlockProviderInfraRequestsPostgres(this.c, appId, this.fallbackDrizzle)
    }
  }

  private channelByIdStatement(appId: string, channelId: number, includeManifest: boolean, includeMetadata: boolean, rollout: boolean): D1PreparedStatement {
    if (rollout) {
      return this.session.prepare(`
        SELECT ${channelSelect()}, ${versionSelect('v', 'v', includeMetadata, true)}, ${versionSelect('rv', 'rv', includeMetadata, false)}
        FROM channels ch
        ${versionJoin('v', 'ch.version', 'LEFT', false)}
        ${versionJoin('rv', 'ch.rollout_version', 'LEFT', true)}
        WHERE ch.app_id = ?1 AND ch.id = ?2 AND (ch.version IS NULL OR v.id IS NOT NULL)
        LIMIT 1`).bind(appId, channelId)
    }
    const manifest = includeManifest ? `, ${manifestEntriesSelect()}` : ''
    // INNER JOIN mirrors requestInfosChannelByIdPostgres.
    return this.session.prepare(`
      SELECT ${channelSelect()}, ${versionSelect('v', 'v', includeMetadata, true)}${manifest}
      FROM channels ch
      ${versionJoin('v', 'ch.version', 'INNER', false)}
      WHERE ch.app_id = ?1 AND ch.id = ?2
      LIMIT 1`).bind(appId, channelId)
  }

  private channelDeviceStatement(appId: string, deviceId: string, includeManifest: boolean, includeMetadata: boolean, rollout: boolean): D1PreparedStatement {
    const rolloutSelect = rollout ? `, ${versionSelect('rv', 'rv', includeMetadata, false)}` : ''
    const rolloutJoin = rollout ? versionJoin('rv', 'ch.rollout_version', 'LEFT', true) : ''
    const manifest = !rollout && includeManifest ? `, ${manifestEntriesSelect()}` : ''
    return this.session.prepare(`
      SELECT cd.device_id AS cd_device_id, cd.app_id AS cd_app_id,
        ${channelSelect()}, ${versionSelect('v', 'v', includeMetadata, true)}${rolloutSelect}${manifest}
      FROM channel_devices cd
      INNER JOIN channels ch ON cd.channel_id = ch.id
      ${versionJoin('v', 'ch.version', 'LEFT', false)}
      ${rolloutJoin}
      WHERE cd.device_id = ?1 AND cd.app_id = ?2 AND (ch.version IS NULL OR v.id IS NOT NULL)
      LIMIT 1`).bind(deviceId, appId)
  }

  private channelStatement(platform: string, appId: string, defaultChannel: string, includeManifest: boolean, includeMetadata: boolean, rollout: boolean): D1PreparedStatement {
    const platformColumn = platform === 'android' ? 'ch.android' : platform === 'electron' ? 'ch.electron' : 'ch.ios'
    const rolloutSelect = rollout ? `, ${versionSelect('rv', 'rv', includeMetadata, false)}` : ''
    const rolloutJoin = rollout ? versionJoin('rv', 'ch.rollout_version', 'LEFT', true) : ''
    const manifest = !rollout && includeManifest ? `, ${manifestEntriesSelect()}` : ''
    const filter = defaultChannel
      ? `ch.app_id = ?1 AND ch.name = ?2 AND ${platformColumn} = 1 AND (ch.public = 1 OR ch.allow_device_self_set = 1)`
      : `ch.public = 1 AND ch.app_id = ?1 AND ${platformColumn} = 1`
    const statement = this.session.prepare(`
      SELECT ${channelSelect()}, ${versionSelect('v', 'v', includeMetadata, true)}${rolloutSelect}${manifest}
      FROM channels ch
      ${versionJoin('v', 'ch.version', 'LEFT', false)}
      ${rolloutJoin}
      WHERE ${filter} AND (ch.version IS NULL OR v.id IS NOT NULL)
      ORDER BY ch.name, ch.id
      LIMIT 1`)
    return defaultChannel ? statement.bind(appId, defaultChannel) : statement.bind(appId)
  }

  private async requestManifestEntries(versionId: number) {
    const result = await this.session.prepare(
      'SELECT file_name, file_hash, s3_path FROM manifest WHERE app_version_id = ?1',
    ).bind(versionId).all()
    return result.results as { file_name: string, file_hash: string, s3_path: string }[]
  }

  // Mirrors resolveRolloutChannelDataPostgres (pg.ts).
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
      ? await this.requestManifestEntries(selectedVersion.id)
      : []
    return { ...channelData, version: selectedVersion, manifestEntries }
  }

  // Mirrors requestInfosPostgres (pg.ts). Both lookups run in a single D1
  // batch, i.e. one round trip to the closest replica.
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
      const statements: D1PreparedStatement[] = []
      if (!this.checked)
        statements.push(this.stateStatement())
      const stateIndex = statements.length - 1

      let overrideIndex = -1
      if (typeof channelSelfOverrideChannelId === 'number') {
        statements.push(this.channelByIdStatement(app_id, channelSelfOverrideChannelId, shouldFetchManifest, includeMetadata, rollout))
        overrideIndex = statements.length - 1
      }
      else if (shouldQueryChannelOverride) {
        statements.push(this.channelDeviceStatement(app_id, device_id, shouldFetchManifest, includeMetadata, rollout))
        overrideIndex = statements.length - 1
      }
      statements.push(this.channelStatement(platform, app_id, defaultChannel, shouldFetchManifest, includeMetadata, rollout))
      const channelIndex = statements.length - 1

      const results = await this.session.batch(statements)
      if (stateIndex >= 0)
        this.assertFresh(results[stateIndex].results as Record<string, unknown>[])

      const mapOptions = { includeMetadata, hasRollout: rollout, hasManifest: !rollout && shouldFetchManifest }
      const channelOverrideRaw = overrideIndex >= 0
        ? mapChannelRow((results[overrideIndex].results as Record<string, unknown>[]).at(0), {
            ...mapOptions,
            hasDevice: typeof channelSelfOverrideChannelId !== 'number',
          })
        : null
      const channelDataRaw = mapChannelRow((results[channelIndex].results as Record<string, unknown>[]).at(0), { ...mapOptions, hasDevice: false })

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

export function getEdgeReplicaReader(c: Context, fallbackDrizzle: ReturnType<typeof getDrizzleClient>): EdgeReplicaReader | null {
  if (!isEdgeReplicaEnabled(c))
    return null
  try {
    return new EdgeReplicaReader(c, (c.env as { DB_REPLICA: D1Database }).DB_REPLICA, fallbackDrizzle)
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'edge replica reader init failed', error: e instanceof Error ? e.message : e })
    return null
  }
}
