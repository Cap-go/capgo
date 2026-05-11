import type { PluginListenerHandle } from '@capacitor/core'
import type {
  CapgoBackgroundNotificationEvent,
  CapgoNotificationEvent,
  CapgoNotificationInstallMode,
  CapgoNotificationOpenedEvent,
  CapgoNotificationPermission,
  CapgoNotificationPlatform,
  CapgoNotificationProvider,
  CapgoNotificationRegisterOptions,
  CapgoNotificationRegistration,
  CapgoNotificationToken,
  CapgoNotificationsConfig,
  CapgoNotificationsNativePlugin,
  CapgoNotificationsPlugin,
  CapgoPushNotificationSchema,
  CapgoUpdateCheckResult,
  CapgoUpdaterIntegrationOptions,
} from './definitions'
import { Capacitor, registerPlugin } from '@capacitor/core'

export * from './definitions'

const NativeCapgoNotifications = registerPlugin<CapgoNotificationsNativePlugin>('CapgoNotifications')
const DEFAULT_SERVER_URL = 'https://api.capgo.app'
const PLUGIN_VERSION = '0.0.1-private.0'

type UpdaterPlugin = {
  getLatest(options?: { channel?: string }): Promise<{ version: string, url?: string, checksum?: string, sessionKey?: string, manifest?: unknown[], error?: string, message?: string }>
  download(options: { url: string, version: string, checksum?: string, sessionKey?: string, manifest?: unknown[] }): Promise<{ id: string, version: string }>
  next(options: { id: string }): Promise<unknown>
  set(options: { id: string }): Promise<unknown>
}

interface RuntimeState {
  config?: CapgoNotificationsConfig
  externalId?: string
  tags: string[]
  attributes: Record<string, unknown>
  consent: boolean
  badge: number
  token?: CapgoNotificationToken
  installId?: string
  bridgeListenersReady: boolean
  lastRegistration?: CapgoNotificationRegistration
  handledUpdateNotifications: Set<string>
  updater: Required<Pick<CapgoUpdaterIntegrationOptions, 'enabled'>> & {
    installMode: CapgoNotificationInstallMode
    channel?: string
  }
}

const state: RuntimeState = {
  tags: [],
  attributes: {},
  consent: true,
  badge: 0,
  bridgeListenersReady: false,
  handledUpdateNotifications: new Set(),
  updater: {
    enabled: true,
    installMode: 'next',
  },
}

function assertNativePlatform(): CapgoNotificationPlatform {
  const platform = Capacitor.getPlatform()
  if (platform === 'ios' || platform === 'android')
    return platform
  throw new Error('Capgo notifications are only available on iOS and Android')
}

function getProvider(platform: CapgoNotificationPlatform): CapgoNotificationProvider {
  return platform === 'ios' ? 'apns' : 'fcm'
}

function getServerUrl(options?: { serverUrl?: string }) {
  return options?.serverUrl || state.config?.serverUrl || DEFAULT_SERVER_URL
}

function getAppId(options?: { appId?: string }) {
  const appId = options?.appId || state.config?.appId
  if (!appId)
    throw new Error('Capgo notification appId is required')
  return appId
}

async function getInstallId() {
  if (state.installId)
    return state.installId
  const result = await NativeCapgoNotifications.getNativeInstallId()
  state.installId = result.nativeInstallId
  return result.nativeInstallId
}

async function getPermissionState(): Promise<CapgoNotificationPermission> {
  const permissions = await NativeCapgoNotifications.checkPermissions()
  if (permissions.receive === 'granted')
    return 'granted'
  if (permissions.receive === 'denied')
    return 'denied'
  if (permissions.receive === 'prompt')
    return 'prompt'
  return 'unknown'
}

async function requestToken(): Promise<CapgoNotificationToken> {
  const permission = await NativeCapgoNotifications.requestPermissions()
  if (permission.receive !== 'granted')
    throw new Error('Push notification permission was not granted')

  return new Promise<CapgoNotificationToken>((resolve, reject) => {
    let resolved = false
    let registrationHandle: PluginListenerHandle | undefined
    let errorHandle: PluginListenerHandle | undefined

    Promise.all([
      NativeCapgoNotifications.addListener('registration', (token) => {
        if (resolved)
          return
        resolved = true
        state.token = token
        void registrationHandle?.remove()
        void errorHandle?.remove()
        resolve(token)
      }),
      NativeCapgoNotifications.addListener('registrationError', (error) => {
        if (resolved)
          return
        resolved = true
        void registrationHandle?.remove()
        void errorHandle?.remove()
        reject(new Error(error.error))
      }),
    ]).then(([registration, registrationError]) => {
      registrationHandle = registration
      errorHandle = registrationError
      return NativeCapgoNotifications.registerPush()
    }).catch(reject)
  })
}

function notificationData(notification?: CapgoPushNotificationSchema): Record<string, unknown> {
  const data = notification?.data
  return data && typeof data === 'object' ? data : {}
}

function getStringData(data: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = data[key]
    if (typeof value === 'string' && value)
      return value
  }
  return ''
}

function eventFromNotification(notification?: CapgoPushNotificationSchema): CapgoNotificationEvent {
  const data = notificationData(notification)
  return {
    campaignId: getStringData(data, 'capgoCampaignId', 'capgo_campaign_id') || undefined,
    notificationId: getStringData(data, 'capgoNotificationId', 'capgo_notification_id') || notification?.id,
  }
}

function updateNotificationKey(notification?: CapgoPushNotificationSchema) {
  const data = notificationData(notification)
  const campaignId = getStringData(data, 'capgoCampaignId', 'capgo_campaign_id')
  const notificationId = getStringData(data, 'capgoNotificationId', 'capgo_notification_id') || notification?.id || ''
  if (!campaignId && !notificationId)
    return ''
  return `${campaignId}:${notificationId}`
}

function isUpdateCheckNotification(notification?: CapgoPushNotificationSchema) {
  const data = notificationData(notification)
  const action = getStringData(data, 'capgoAction', 'capgo_action', 'action')
  return action === 'update_check' || action === 'capgo_update_check'
}

function updateOptionsFromNotification(notification?: CapgoPushNotificationSchema): CapgoUpdaterIntegrationOptions {
  const data = notificationData(notification)
  const installMode = getStringData(data, 'capgoUpdateInstallMode', 'capgo_update_install_mode')
  const channel = getStringData(data, 'capgoUpdateChannel', 'capgo_update_channel')
  return {
    enabled: true,
    installMode: installMode === 'set' ? 'set' : installMode === 'next' ? 'next' : undefined,
    channel: channel || undefined,
  }
}

async function postJson(serverUrl: string, route: string, body: Record<string, unknown>) {
  const url = new URL(route, serverUrl)
  const response = await fetch(url.href, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const error = await response.text().catch(() => '')
    throw new Error(error || 'Capgo notification request failed')
  }
  return response.json() as Promise<Record<string, unknown>>
}

async function registerToken(options: CapgoNotificationRegisterOptions, token: CapgoNotificationToken): Promise<CapgoNotificationRegistration> {
  const platform = assertNativePlatform()
  const appInfo = await NativeCapgoNotifications.getAppInfo().catch(() => ({ version: options.appVersion || '' }))
  const nativeInstallId = await getInstallId()
  const permission = await getPermissionState()
  const appId = getAppId(options)
  const serverUrl = getServerUrl(options)

  const response = await postJson(serverUrl, '/notifications/register', {
    appId,
    externalId: options.externalId,
    nativeInstallId,
    pushToken: token.value,
    provider: getProvider(platform),
    platform,
    locale: navigator.language || '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    appVersion: options.appVersion || appInfo.version || '',
    pluginVersion: PLUGIN_VERSION,
    tags: options.tags ?? state.tags,
    attributes: options.attributes ?? state.attributes,
    permission,
    badge: state.badge,
    active: true,
    consent: options.consent ?? state.consent,
  })

  const registration: CapgoNotificationRegistration = {
    recipientKey: String(response.recipientKey),
    deviceKey: String(response.deviceKey),
    bucket: String(response.bucket),
    token: token.value,
    provider: getProvider(platform),
    platform,
    permission,
  }
  state.lastRegistration = registration
  return registration
}

async function trackEvent(event: 'received' | 'opened' | 'background_started' | 'background_finished' | 'failed', input?: CapgoNotificationEvent) {
  const appId = input?.appId || state.config?.appId
  if (!appId)
    return
  const platform = assertNativePlatform()
  await postJson(getServerUrl(), '/notifications/events', {
    appId,
    event,
    nativeInstallId: input?.nativeInstallId || await getInstallId(),
    externalId: input?.externalId || state.externalId,
    recipientKey: input?.recipientKey || state.lastRegistration?.recipientKey,
    deviceKey: input?.deviceKey || state.lastRegistration?.deviceKey,
    provider: input?.provider || getProvider(platform),
    platform: input?.platform || platform,
    campaignId: input?.campaignId,
    notificationId: input?.notificationId,
    error: input?.error,
    badge: input?.badge ?? state.badge,
  })
}

async function maybeRunUpdateCheck(notification?: CapgoPushNotificationSchema) {
  if (!isUpdateCheckNotification(notification) || !state.updater.enabled)
    return
  const key = updateNotificationKey(notification)
  if (key) {
    if (state.handledUpdateNotifications.has(key))
      return
    state.handledUpdateNotifications.add(key)
    if (state.handledUpdateNotifications.size > 128) {
      const oldest = state.handledUpdateNotifications.values().next().value
      if (oldest)
        state.handledUpdateNotifications.delete(oldest)
    }
  }
  const baseEvent = eventFromNotification(notification)
  await trackEvent('background_started', baseEvent)
  const result = await CapgoNotifications.runUpdateCheck(updateOptionsFromNotification(notification))
  await trackEvent(result.status === 'failed' ? 'failed' : 'background_finished', {
    ...baseEvent,
    error: result.error,
  })
}

async function ensureBridgeListeners() {
  if (state.bridgeListenersReady)
    return
  state.bridgeListenersReady = true
  await NativeCapgoNotifications.addListener('registration', (token) => {
    state.token = token
    if (state.externalId) {
      void registerToken({
        appId: state.config?.appId,
        serverUrl: state.config?.serverUrl,
        externalId: state.externalId,
        tags: state.tags,
        attributes: state.attributes,
        consent: state.consent,
      }, token)
    }
  })
  await NativeCapgoNotifications.addListener('notificationReceived', notification => void maybeRunUpdateCheck(notification))
  await NativeCapgoNotifications.addListener('backgroundNotification', notification => void maybeRunUpdateCheck(notification))
}

async function getUpdater(): Promise<UpdaterPlugin | null> {
  if (!Capacitor.isPluginAvailable('CapacitorUpdater'))
    return null
  return registerPlugin<UpdaterPlugin>('CapacitorUpdater')
}

export const CapgoNotifications: CapgoNotificationsPlugin = {
  async configure(config) {
    state.config = config
    state.updater.enabled = config.autoUpdater !== false
    state.updater.installMode = config.updateInstallMode || 'next'
    state.updater.channel = config.updateChannel
    await ensureBridgeListeners()
    if (Capacitor.getPlatform() === 'android')
      await NativeCapgoNotifications.createDefaultChannel().catch(() => undefined)
  },

  async register(options) {
    state.externalId = options.externalId
    state.tags = options.tags ?? state.tags
    state.attributes = options.attributes ?? state.attributes
    state.consent = options.consent ?? state.consent
    state.config = {
      appId: options.appId || state.config?.appId || '',
      serverUrl: options.serverUrl || state.config?.serverUrl,
      autoUpdater: state.updater.enabled,
      updateInstallMode: state.updater.installMode,
      updateChannel: state.updater.channel,
    }
    await ensureBridgeListeners()
    const token = state.token || await requestToken()
    return registerToken(options, token)
  },

  async setExternalId(externalId) {
    state.externalId = externalId
    if (state.token)
      await registerToken({ externalId, tags: state.tags, attributes: state.attributes, consent: state.consent }, state.token)
  },

  async setTags(tags) {
    state.tags = tags
    if (state.token && state.externalId)
      await registerToken({ externalId: state.externalId, tags, attributes: state.attributes, consent: state.consent }, state.token)
  },

  async setBadge(count) {
    state.badge = Math.max(0, Math.trunc(count))
    await NativeCapgoNotifications.setBadge({ count: state.badge })
    if (state.token && state.externalId)
      await registerToken({ externalId: state.externalId, tags: state.tags, attributes: state.attributes, consent: state.consent }, state.token)
  },

  async clearBadge() {
    state.badge = 0
    await NativeCapgoNotifications.clearBadge()
    if (state.token && state.externalId)
      await registerToken({ externalId: state.externalId, tags: state.tags, attributes: state.attributes, consent: state.consent }, state.token)
  },

  async incrementBadge(by = 1) {
    const current = await NativeCapgoNotifications.getBadge().catch(() => ({ count: state.badge }))
    await this.setBadge(Math.max(0, Math.trunc(current.count + by)))
  },

  async enableUpdaterIntegration(options) {
    state.updater.enabled = options?.enabled ?? true
    state.updater.installMode = options?.installMode || state.updater.installMode
    state.updater.channel = options?.channel ?? state.updater.channel
  },

  async runUpdateCheck(options): Promise<CapgoUpdateCheckResult> {
    const enabled = options?.enabled ?? state.updater.enabled
    if (!enabled)
      return { status: 'disabled' }
    const updater = await getUpdater()
    if (!updater)
      return { status: 'unavailable', error: 'CapacitorUpdater plugin is not installed' }
    try {
      const latest = await updater.getLatest({ channel: options?.channel || state.updater.channel })
      if (!latest.url)
        return { status: 'no_update', version: latest.version, error: latest.message || latest.error }
      const bundle = await updater.download({
        url: latest.url,
        version: latest.version,
        checksum: latest.checksum,
        sessionKey: latest.sessionKey,
        manifest: latest.manifest,
      })
      const installMode = options?.installMode || state.updater.installMode
      if (installMode === 'set')
        await updater.set({ id: bundle.id })
      else
        await updater.next({ id: bundle.id })
      return { status: 'installed', version: latest.version, bundleId: bundle.id }
    }
    catch (error) {
      const message = error instanceof Error ? error.message : 'Update check failed'
      if (message === 'No new version available' || message.includes('no_new_version_available'))
        return { status: 'no_update', error: message }
      return { status: 'failed', error: message }
    }
  },

  async trackReceived(event) {
    await trackEvent('received', event)
  },

  async trackOpened(event) {
    await trackEvent('opened', event)
  },

  async addListener(eventName, listenerFunc) {
    if (eventName === 'notificationReceived') {
      return NativeCapgoNotifications.addListener('notificationReceived', (notification) => {
        void trackEvent('received', eventFromNotification(notification))
        void maybeRunUpdateCheck(notification)
        ;(listenerFunc as (notification: CapgoPushNotificationSchema) => void)(notification)
      })
    }

    if (eventName === 'notificationOpened') {
      return NativeCapgoNotifications.addListener('notificationOpened', (event) => {
        void trackEvent('opened', eventFromNotification(event.notification))
        ;(listenerFunc as (event: CapgoNotificationOpenedEvent) => void)(event)
      })
    }

    if (eventName === 'backgroundNotification') {
      return NativeCapgoNotifications.addListener('backgroundNotification', (notification) => {
        void maybeRunUpdateCheck(notification)
        const finish = async () => trackEvent('background_finished', eventFromNotification(notification))
        ;(listenerFunc as (event: CapgoBackgroundNotificationEvent) => void)({ notification, finish })
      })
    }

    return NativeCapgoNotifications.addListener('registration', listenerFunc as (token: CapgoNotificationToken) => void)
  },
}
