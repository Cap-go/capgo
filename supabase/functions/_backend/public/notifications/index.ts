import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { NativeNotificationEvent, NativeNotificationPlatform, NativeNotificationProvider, NativeNotificationProviderConfig, NativeNotificationRegisterInput, NativeNotificationRegistryRow } from '../../utils/nativeNotifications.ts'
import type { Permission } from '../../utils/rbac.ts'
import { sql } from 'drizzle-orm'
import { Hono } from 'hono/tiny'
import { BRES, parseBody, quickError, simpleError, simpleRateLimit, useCors } from '../../utils/hono.ts'
import { middlewareV2 } from '../../utils/hono_middleware.ts'
import {
  deriveRecipientKey,
  enqueueNativeNotification,
  getAllNotificationBuckets,

  readNotificationRegistrationsCF,
  readNotificationStatsCF,
  trackNotificationEventCF,
  trackNotificationRegistrationCF,
} from '../../utils/nativeNotifications.ts'
import { closeClient, getDrizzleClient, getPgClient } from '../../utils/pg.ts'
import { checkPermission } from '../../utils/rbac.ts'
import { isLimited, isValidAppId } from '../../utils/utils.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.use('*', useCors)

const NOTIFICATION_EVENTS = new Set<NativeNotificationEvent>([
  'queued',
  'sent',
  'provider_accepted',
  'received',
  'opened',
  'failed',
  'permission_changed',
  'background_started',
  'background_finished',
])
const NOTIFICATION_PLATFORMS = new Set<NativeNotificationPlatform>(['ios', 'android'])
const NOTIFICATION_PROVIDERS = new Set<NativeNotificationProvider>(['fcm', 'apns'])
const CAMPAIGN_KINDS = new Set(['alert', 'background', 'badge', 'update_check'])
const CAMPAIGN_STATUSES = new Set(['draft', 'scheduled', 'queued', 'sending', 'sent', 'paused', 'failed', 'cancelled'])

interface RegisterBody {
  appId: string
  externalId: string
  nativeInstallId: string
  pushToken: string
  provider: NativeNotificationProvider
  platform: NativeNotificationPlatform
  locale?: string
  timezone?: string
  appVersion?: string
  pluginVersion?: string
  tags?: string[]
  attributes?: Record<string, unknown>
  permission?: NativeNotificationRegisterInput['permission']
  badge?: number
  active?: boolean
  consent?: boolean
}

interface EventBody {
  appId: string
  event: NativeNotificationEvent
  campaignId?: string
  notificationId?: string
  externalId?: string
  nativeInstallId?: string
  recipientKey?: string
  deviceKey?: string
  provider?: string
  platform?: string
  error?: string
  badge?: number
}

interface CampaignBody {
  appId: string
  name: string
  kind?: string
  status?: string
  audience?: Record<string, unknown>
  payload?: Record<string, unknown>
  scheduledAt?: string | null
}

interface ProviderBody {
  appId: string
  provider: NativeNotificationProvider
  status?: string
  config?: Record<string, unknown>
  secretRef?: string | null
}

interface SendBody {
  appId: string
  campaignId?: string
  payload?: Record<string, unknown>
  target?: {
    externalId?: string
    recipientKey?: string
    deviceKey?: string
    tag?: string
    broadcast?: boolean
  }
  limit?: number
}

interface BadgeBody {
  appId: string
  badge: number
  target: SendBody['target']
  campaignId?: string
}

interface SettingsBody {
  appId: string
  pushUpdateEnabled?: boolean
  pushUpdateInstallMode?: 'next' | 'set'
  pushUpdateChannel?: string | null
}

interface UpdateCheckBody {
  appId: string
  target?: SendBody['target']
  campaignId?: string
  installMode?: 'next' | 'set'
  channel?: string | null
  limit?: number
}

function assertString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string')
    throw simpleError('invalid_body', 'Invalid body', { field })
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLength)
    throw simpleError('invalid_body', 'Invalid body', { field })
  return trimmed
}

function assertOptionalRecord(value: unknown, field: string): Record<string, unknown> {
  if (value === undefined || value === null)
    return {}
  if (typeof value !== 'object' || Array.isArray(value))
    throw simpleError('invalid_body', 'Invalid body', { field })
  return value as Record<string, unknown>
}

function assertOptionalDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '')
    return null
  const raw = assertString(value, field, 128)
  const date = new Date(raw)
  if (Number.isNaN(date.getTime()))
    throw simpleError('invalid_body', 'Invalid body', { field })
  return date.toISOString()
}

function assertPublicPluginApp(c: Context<MiddlewareKeyVariables>, appId: string) {
  if (!isValidAppId(appId))
    throw simpleError('invalid_app_id', 'App ID must be a reverse domain string', { app_id: appId })
  if (isLimited(c, appId))
    return simpleRateLimit({ app_id: appId })
  return null
}

async function assertAppPermission(c: Context<MiddlewareKeyVariables>, permission: Permission, appId: string) {
  if (!(await checkPermission(c, permission, { appId })))
    throw quickError(403, 'app_access_denied', 'You can\'t access this app', { app_id: appId, permission })
}

async function getNotificationProviderConfigs(c: Context<MiddlewareKeyVariables>, appId: string): Promise<NativeNotificationProviderConfig[]> {
  let pgClient: ReturnType<typeof getPgClient> | undefined
  try {
    pgClient = getPgClient(c)
    const drizzleClient = getDrizzleClient(pgClient)
    const result = await drizzleClient.execute(sql`
      SELECT provider, status, config, secret_ref
      FROM public.notification_provider_configs
      WHERE app_id = ${appId}
        AND status = 'configured'
      ORDER BY provider ASC
    `)
    return result.rows.map(row => ({
      provider: String((row as any).provider),
      status: String((row as any).status),
      config: ((row as any).config ?? {}) as Record<string, unknown>,
      secretRef: ((row as any).secret_ref ?? null) as string | null,
    }))
  }
  finally {
    if (pgClient)
      closeClient(c, pgClient)
  }
}

async function getAppOwnerOrg(c: Context<MiddlewareKeyVariables>, appId: string): Promise<string> {
  let pgClient: ReturnType<typeof getPgClient> | undefined
  try {
    pgClient = getPgClient(c)
    const drizzleClient = getDrizzleClient(pgClient)
    const result = await drizzleClient.execute(sql`SELECT owner_org::text AS owner_org FROM public.apps WHERE app_id = ${appId} LIMIT 1`)
    const ownerOrg = (result.rows[0] as any)?.owner_org
    if (!ownerOrg)
      throw quickError(404, 'app_not_found', 'App not found', { app_id: appId })
    return String(ownerOrg)
  }
  finally {
    if (pgClient)
      closeClient(c, pgClient)
  }
}

function publicDevice(row: NativeNotificationRegistryRow) {
  return {
    deviceKey: row.device_key,
    recipientKey: row.recipient_key,
    provider: row.provider,
    platform: row.platform,
    locale: row.locale,
    timezone: row.timezone,
    appVersion: row.app_version,
    pluginVersion: row.plugin_version,
    tags: row.tags,
    attributes: row.attributes,
    badge: row.badge,
    permission: row.permission,
    updatedAt: row.updated_at,
  }
}

function publicNotificationSettings(row: Record<string, unknown> | undefined, appId: string) {
  return {
    appId,
    pushUpdateEnabled: Boolean(row?.push_update_enabled ?? false),
    pushUpdateInstallMode: row?.push_update_install_mode === 'set' ? 'set' : 'next',
    pushUpdateChannel: typeof row?.push_update_channel === 'string' ? row.push_update_channel : null,
  }
}

async function resolveTargetDevices(c: Context<MiddlewareKeyVariables>, body: SendBody | BadgeBody) {
  const target = body.target ?? {}
  const limit = 'limit' in body ? body.limit : undefined
  if (target.externalId) {
    const recipientKey = await deriveRecipientKey(c, body.appId, target.externalId)
    return readNotificationRegistrationsCF(c, { appId: body.appId, recipientKey, limit })
  }
  if (target.recipientKey)
    return readNotificationRegistrationsCF(c, { appId: body.appId, recipientKey: target.recipientKey, limit })
  if (target.deviceKey)
    return readNotificationRegistrationsCF(c, { appId: body.appId, deviceKey: target.deviceKey, buckets: getAllNotificationBuckets(), limit })
  if (target.tag)
    return readNotificationRegistrationsCF(c, { appId: body.appId, tag: target.tag, buckets: getAllNotificationBuckets(), limit })
  if (target.broadcast)
    return readNotificationRegistrationsCF(c, { appId: body.appId, buckets: getAllNotificationBuckets(), limit })
  throw simpleError('missing_notification_target', 'Missing notification target')
}

async function getNotificationSettings(c: Context<MiddlewareKeyVariables>, appId: string) {
  let pgClient: ReturnType<typeof getPgClient> | undefined
  try {
    pgClient = getPgClient(c)
    const drizzleClient = getDrizzleClient(pgClient)
    const result = await drizzleClient.execute(sql`
      SELECT app_id, push_update_enabled, push_update_install_mode, push_update_channel
      FROM public.notification_app_settings
      WHERE app_id = ${appId}
      LIMIT 1
    `)
    return publicNotificationSettings(result.rows[0] as Record<string, unknown> | undefined, appId)
  }
  finally {
    if (pgClient)
      closeClient(c, pgClient)
  }
}

async function upsertNotificationSettings(c: Context<MiddlewareKeyVariables>, body: SettingsBody) {
  const appId = assertString(body.appId, 'appId', 128)
  await assertAppPermission(c, 'app.update_settings', appId)
  const ownerOrg = await getAppOwnerOrg(c, appId)
  const pushUpdateEnabled = body.pushUpdateEnabled === true
  const pushUpdateInstallMode = body.pushUpdateInstallMode === 'set' ? 'set' : 'next'
  const pushUpdateChannel = body.pushUpdateChannel ? assertString(body.pushUpdateChannel, 'pushUpdateChannel', 128) : null
  const auth = c.get('auth')
  let pgClient: ReturnType<typeof getPgClient> | undefined
  try {
    pgClient = getPgClient(c)
    const drizzleClient = getDrizzleClient(pgClient)
    const result = await drizzleClient.execute(sql`
      INSERT INTO public.notification_app_settings (owner_org, app_id, push_update_enabled, push_update_install_mode, push_update_channel, created_by)
      VALUES (${ownerOrg}::uuid, ${appId}, ${pushUpdateEnabled}, ${pushUpdateInstallMode}, ${pushUpdateChannel}, ${auth?.userId ?? null}::uuid)
      ON CONFLICT (app_id)
      DO UPDATE SET updated_at = now(), push_update_enabled = EXCLUDED.push_update_enabled, push_update_install_mode = EXCLUDED.push_update_install_mode, push_update_channel = EXCLUDED.push_update_channel
      RETURNING app_id, push_update_enabled, push_update_install_mode, push_update_channel
    `)
    return publicNotificationSettings(result.rows[0] as Record<string, unknown>, appId)
  }
  finally {
    if (pgClient)
      closeClient(c, pgClient)
  }
}

async function createCampaignRecord(c: Context<MiddlewareKeyVariables>, body: CampaignBody) {
  const appId = assertString(body.appId, 'appId', 128)
  await assertAppPermission(c, 'app.manage_devices', appId)
  const ownerOrg = await getAppOwnerOrg(c, appId)
  const name = assertString(body.name, 'name', 180)
  const kind = body.kind && CAMPAIGN_KINDS.has(body.kind) ? body.kind : 'alert'
  const status = body.status && CAMPAIGN_STATUSES.has(body.status) ? body.status : 'draft'
  const audience = assertOptionalRecord(body.audience, 'audience')
  const payload = assertOptionalRecord(body.payload, 'payload')
  const scheduledAt = assertOptionalDate(body.scheduledAt, 'scheduledAt')
  const auth = c.get('auth')

  let pgClient: ReturnType<typeof getPgClient> | undefined
  try {
    pgClient = getPgClient(c)
    const drizzleClient = getDrizzleClient(pgClient)
    const result = await drizzleClient.execute(sql`
      INSERT INTO public.notification_campaigns (owner_org, app_id, name, kind, status, audience, payload, scheduled_at, created_by)
      VALUES (${ownerOrg}::uuid, ${appId}, ${name}, ${kind}, ${status}, ${JSON.stringify(audience)}::jsonb, ${JSON.stringify(payload)}::jsonb, ${scheduledAt}::timestamptz, ${auth?.userId ?? null}::uuid)
      RETURNING id, created_at, updated_at, owner_org::text, app_id, name, kind, status, audience, payload, scheduled_at, queued_at, completed_at, counters
    `)
    return result.rows[0]
  }
  finally {
    if (pgClient)
      closeClient(c, pgClient)
  }
}

app.post('/register', async (c) => {
  const body = await parseBody<RegisterBody>(c)
  const appId = assertString(body.appId, 'appId', 128)
  const limitedResponse = assertPublicPluginApp(c, appId)
  if (limitedResponse)
    return limitedResponse
  const externalId = assertString(body.externalId, 'externalId', 512)
  const nativeInstallId = assertString(body.nativeInstallId, 'nativeInstallId', 512)
  const pushToken = assertString(body.pushToken, 'pushToken', 4096)
  if (!NOTIFICATION_PROVIDERS.has(body.provider))
    throw simpleError('invalid_provider', 'Invalid notification provider')
  if (!NOTIFICATION_PLATFORMS.has(body.platform))
    throw simpleError('invalid_platform', 'Invalid notification platform')

  const identity = await trackNotificationRegistrationCF(c, {
    ...body,
    appId,
    externalId,
    nativeInstallId,
    pushToken,
  })

  await trackNotificationEventCF(c, {
    appId,
    event: 'permission_changed',
    recipientKey: identity.recipientKey,
    deviceKey: identity.deviceKey,
    provider: body.provider,
    platform: body.platform,
    badge: body.badge,
  })

  return c.json({ ...BRES, recipientKey: identity.recipientKey, deviceKey: identity.deviceKey, bucket: identity.bucket })
})

app.post('/events', async (c) => {
  const body = await parseBody<EventBody>(c)
  const appId = assertString(body.appId, 'appId', 128)
  const limitedResponse = assertPublicPluginApp(c, appId)
  if (limitedResponse)
    return limitedResponse
  if (!NOTIFICATION_EVENTS.has(body.event))
    throw simpleError('invalid_notification_event', 'Invalid notification event')
  await trackNotificationEventCF(c, { ...body, appId })
  return c.json(BRES)
})

app.post('/recipients/lookup', middlewareV2(['read', 'write', 'all']), async (c) => {
  const body = await parseBody<{ appId: string, externalId?: string, recipientKey?: string, limit?: number }>(c)
  const appId = assertString(body.appId, 'appId', 128)
  await assertAppPermission(c, 'app.read_devices', appId)
  const recipientKey = body.recipientKey ?? (body.externalId ? await deriveRecipientKey(c, appId, body.externalId) : undefined)
  if (!recipientKey)
    throw simpleError('missing_recipient', 'Missing recipient')
  const devices = await readNotificationRegistrationsCF(c, { appId, recipientKey, limit: body.limit })
  return c.json({ recipientKey, devices: devices.map(publicDevice), count: devices.length })
})

app.get('/settings', middlewareV2(['read', 'write', 'all']), async (c) => {
  const appId = assertString(c.req.query('app_id'), 'app_id', 128)
  await assertAppPermission(c, 'app.read_logs', appId)
  return c.json(await getNotificationSettings(c, appId))
})

app.put('/settings', middlewareV2(['write', 'all']), async (c) => {
  const body = await parseBody<SettingsBody>(c)
  return c.json(await upsertNotificationSettings(c, body))
})

app.post('/badge', middlewareV2(['write', 'all']), async (c) => {
  const body = await parseBody<BadgeBody>(c)
  const appId = assertString(body.appId, 'appId', 128)
  await assertAppPermission(c, 'app.manage_devices', appId)
  const badge = Math.max(0, Math.trunc(Number(body.badge)))
  if (!Number.isFinite(badge))
    throw simpleError('invalid_badge', 'Invalid badge')
  const devices = await resolveTargetDevices(c, { ...body, appId, badge })
  const providerConfigs = await getNotificationProviderConfigs(c, appId)
  if (!providerConfigs.length)
    throw simpleError('missing_notification_provider', 'Missing configured notification provider')
  const campaignId = body.campaignId || crypto.randomUUID()
  const queued = await enqueueNativeNotification(c, { kind: 'badge', appId, campaignId, payload: {}, devices, badge, providerConfigs })
  await Promise.all(devices.map(device => trackNotificationEventCF(c, {
    appId,
    campaignId,
    event: 'queued',
    recipientKey: device.recipient_key,
    deviceKey: device.device_key,
    provider: device.provider,
    platform: device.platform,
    badge,
  })))
  return c.json({ ...BRES, campaignId, queued, targeted: devices.length })
})

app.post('/update-check', middlewareV2(['write', 'all']), async (c) => {
  const body = await parseBody<UpdateCheckBody>(c)
  const appId = assertString(body.appId, 'appId', 128)
  await assertAppPermission(c, 'app.manage_devices', appId)
  const settings = await getNotificationSettings(c, appId)
  if (!settings.pushUpdateEnabled)
    throw simpleError('push_update_disabled', 'Push update is disabled for this app')
  const installMode = body.installMode || settings.pushUpdateInstallMode
  const channel = body.channel ?? settings.pushUpdateChannel
  const target = body.target ?? { broadcast: true }
  const devices = await resolveTargetDevices(c, { appId, target, limit: body.limit })
  const providerConfigs = await getNotificationProviderConfigs(c, appId)
  if (!providerConfigs.length)
    throw simpleError('missing_notification_provider', 'Missing configured notification provider')
  const campaignRecord = await createCampaignRecord(c, {
    appId,
    name: 'Push update check',
    kind: 'update_check',
    status: 'queued',
    audience: target,
    payload: { installMode, channel, silent: true, background: true },
    scheduledAt: null,
  })
  const campaignId = body.campaignId || String((campaignRecord as any).id)
  const payload = {
    silent: true,
    background: true,
    collapseId: 'capgo-update-check',
    installMode,
    channel,
    data: {
      capgoAction: 'update_check',
      capgoUpdateInstallMode: installMode,
      ...(channel ? { capgoUpdateChannel: channel } : {}),
    },
  }
  const queued = await enqueueNativeNotification(c, { kind: 'update_check', appId, campaignId, payload, devices, providerConfigs })
  await Promise.all(devices.map(device => trackNotificationEventCF(c, {
    appId,
    campaignId,
    event: 'queued',
    recipientKey: device.recipient_key,
    deviceKey: device.device_key,
    provider: device.provider,
    platform: device.platform,
  })))
  return c.json({ ...BRES, campaignId, queued, targeted: devices.length })
})

app.post('/send', middlewareV2(['write', 'all']), async (c) => {
  const body = await parseBody<SendBody>(c)
  const appId = assertString(body.appId, 'appId', 128)
  await assertAppPermission(c, 'app.manage_devices', appId)
  const campaignId = body.campaignId || crypto.randomUUID()
  const payload = assertOptionalRecord(body.payload, 'payload')
  const devices = await resolveTargetDevices(c, { ...body, appId })
  const providerConfigs = await getNotificationProviderConfigs(c, appId)
  if (!providerConfigs.length)
    throw simpleError('missing_notification_provider', 'Missing configured notification provider')
  const queued = await enqueueNativeNotification(c, { kind: 'send', appId, campaignId, payload, devices, providerConfigs })
  await Promise.all(devices.map(device => trackNotificationEventCF(c, {
    appId,
    campaignId,
    event: 'queued',
    recipientKey: device.recipient_key,
    deviceKey: device.device_key,
    provider: device.provider,
    platform: device.platform,
  })))
  return c.json({ ...BRES, campaignId, queued, targeted: devices.length })
})

app.get('/campaigns', middlewareV2(['read', 'write', 'all']), async (c) => {
  const appId = assertString(c.req.query('app_id'), 'app_id', 128)
  await assertAppPermission(c, 'app.read_logs', appId)
  let pgClient: ReturnType<typeof getPgClient> | undefined
  try {
    pgClient = getPgClient(c)
    const drizzleClient = getDrizzleClient(pgClient)
    const result = await drizzleClient.execute(sql`
      SELECT id, created_at, updated_at, owner_org::text, app_id, name, kind, status, audience, payload, scheduled_at, queued_at, completed_at, counters
      FROM public.notification_campaigns
      WHERE app_id = ${appId}
      ORDER BY created_at DESC
      LIMIT 100
    `)
    return c.json({ data: result.rows })
  }
  finally {
    if (pgClient)
      closeClient(c, pgClient)
  }
})

app.post('/campaigns', middlewareV2(['write', 'all']), async (c) => {
  const body = await parseBody<CampaignBody>(c)
  return c.json(await createCampaignRecord(c, body))
})

app.get('/stats', middlewareV2(['read', 'write', 'all']), async (c) => {
  const appId = assertString(c.req.query('app_id'), 'app_id', 128)
  await assertAppPermission(c, 'app.read_logs', appId)
  const days = Number(c.req.query('days') ?? 30)
  const campaignId = c.req.query('campaign_id') || undefined
  const data = await readNotificationStatsCF(c, { appId, campaignId, days })
  return c.json({ data })
})

app.get('/providers', middlewareV2(['read', 'write', 'all']), async (c) => {
  const appId = assertString(c.req.query('app_id'), 'app_id', 128)
  await assertAppPermission(c, 'app.update_settings', appId)
  let pgClient: ReturnType<typeof getPgClient> | undefined
  try {
    pgClient = getPgClient(c)
    const drizzleClient = getDrizzleClient(pgClient)
    const result = await drizzleClient.execute(sql`
      SELECT id, created_at, updated_at, owner_org::text, app_id, provider, status, config, secret_ref
      FROM public.notification_provider_configs
      WHERE app_id = ${appId}
      ORDER BY provider ASC
    `)
    return c.json({ data: result.rows })
  }
  finally {
    if (pgClient)
      closeClient(c, pgClient)
  }
})

app.put('/providers', middlewareV2(['write', 'all']), async (c) => {
  const body = await parseBody<ProviderBody>(c)
  const appId = assertString(body.appId, 'appId', 128)
  await assertAppPermission(c, 'app.update_settings', appId)
  if (!NOTIFICATION_PROVIDERS.has(body.provider))
    throw simpleError('invalid_provider', 'Invalid notification provider')
  const status = body.status && ['draft', 'configured', 'disabled', 'error'].includes(body.status) ? body.status : 'draft'
  const ownerOrg = await getAppOwnerOrg(c, appId)
  const config = assertOptionalRecord(body.config, 'config')
  const secretRef = body.secretRef ?? null
  const auth = c.get('auth')
  let pgClient: ReturnType<typeof getPgClient> | undefined
  try {
    pgClient = getPgClient(c)
    const drizzleClient = getDrizzleClient(pgClient)
    const result = await drizzleClient.execute(sql`
      INSERT INTO public.notification_provider_configs (owner_org, app_id, provider, status, config, secret_ref, created_by)
      VALUES (${ownerOrg}::uuid, ${appId}, ${body.provider}, ${status}, ${JSON.stringify(config)}::jsonb, ${secretRef}, ${auth?.userId ?? null}::uuid)
      ON CONFLICT (app_id, provider)
      DO UPDATE SET updated_at = now(), status = EXCLUDED.status, config = EXCLUDED.config, secret_ref = EXCLUDED.secret_ref
      RETURNING id, created_at, updated_at, owner_org::text, app_id, provider, status, config, secret_ref
    `)
    return c.json(result.rows[0])
  }
  finally {
    if (pgClient)
      closeClient(c, pgClient)
  }
})
