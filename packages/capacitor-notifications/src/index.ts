import { Capacitor, registerPlugin } from '@capacitor/core'
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

export * from './definitions'

const NativeCapgoNotifications = registerPlugin<CapgoNotificationsNativePlugin>('CapgoNotifications')
const DEFAULT_SERVER_URL = 'https://api.capgo.app'
const PLUGIN_VERSION = '0.0.1-private.0'

interface UpdaterTriggerResult {
  status?: string
  version?: string
  bundleId?: string
  id?: string
  queued?: boolean
  error?: string
  message?: string
}

interface UpdaterPlugin {
  triggerUpdateCheck?: (options?: { channel?: string, installMode?: CapgoNotificationInstallMode }) => Promise<UpdaterTriggerResult>
  getLatest: (options?: { channel?: string }) => Promise<{ version: string, url?: string, checksum?: string, sessionKey?: string, manifest?: unknown[], error?: string, message?: string }>
  download: (options: { url: string, version: string, checksum?: string, sessionKey?: string, manifest?: unknown[] }) => Promise<{ id: string, version: string }>
  next: (options: { id: string }) => Promise<unknown>
  set: (options: { id: string }) => Promise<unknown>
}

interface ListenerState {
  notificationReceived: Set<(notification: CapgoPushNotificationSchema) => void>
  notificationOpened: Set<(event: CapgoNotificationOpenedEvent) => void>
  backgroundNotification: Set<(event: CapgoBackgroundNotificationEvent) => void>
  registrationChanged: Set<(token: CapgoNotificationToken) => void>
}

interface RuntimeState {
  config?: CapgoNotificationsConfig
  externalId?: string
  identityProof?: string
  tags: string[]
  attributes: Record<string, unknown>
  consent: boolean
  badge: number
  token?: CapgoNotificationToken
  installId?: string
  bridgeListenersReady: boolean
  bridgeListenersPromise?: Promise<void>
  lastRegistration?: CapgoNotificationRegistration
  handledUpdateNotifications: Set<string>
  listeners: ListenerState
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
  listeners: {
    notificationReceived: new Set(),
    notificationOpened: new Set(),
    backgroundNotification: new Set(),
    registrationChanged: new Set(),
  },
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

    const cleanup = async () => {
      await Promise.allSettled([registrationHandle?.remove(), errorHandle?.remove()].filter((promise): promise is Promise<void> => Boolean(promise)))
    }
    const settleAfterCleanup = (callback: () => void) => {
      cleanup()
        .catch(() => undefined)
        .then(callback)
        .catch(() => undefined)
    }
    const fail = (error: unknown) => {
      if (resolved)
        return
      resolved = true
      settleAfterCleanup(() => reject(error instanceof Error ? error : new Error(String(error))))
    }

    void (async () => {
      try {
        registrationHandle = await NativeCapgoNotifications.addListener('registration', (token) => {
          if (resolved)
            return
          resolved = true
          state.token = token
          settleAfterCleanup(() => resolve(token))
        })
        errorHandle = await NativeCapgoNotifications.addListener('registrationError', (error) => {
          fail(new Error(error.error))
        })
        await NativeCapgoNotifications.registerPush()
      }
      catch (error) {
        fail(error)
      }
    })()
  })
}

function normalizeUpdaterResult(result: UpdaterTriggerResult): CapgoUpdateCheckResult {
  if (result.status === 'disabled' || result.status === 'unavailable' || result.status === 'no_update' || result.status === 'installed' || result.status === 'failed') {
    return {
      status: result.status,
      version: result.version,
      bundleId: result.bundleId || result.id,
      error: result.error || result.message,
    }
  }
  return {
    status: result.queued ? 'installed' : 'failed',
    version: result.version,
    bundleId: result.bundleId || result.id,
    error: result.error || result.message || 'Update check failed',
  }
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

function notifyListeners<T>(listeners: Set<(event: T) => void>, event: T) {
  for (const listener of [...listeners]) {
    try {
      listener(event)
    }
    catch (error) {
      setTimeout(() => {
        throw error
      }, 0)
    }
  }
}

function createListenerHandle(remove: () => void): PluginListenerHandle {
  return {
    remove: async () => remove(),
  }
}

function updateOptionsFromNotification(notification?: CapgoPushNotificationSchema): CapgoUpdaterIntegrationOptions {
  const data = notificationData(notification)
  const requestedInstallMode = getStringData(data, 'capgoUpdateInstallMode', 'capgo_update_install_mode')
  const channel = getStringData(data, 'capgoUpdateChannel', 'capgo_update_channel')
  let installMode: CapgoUpdaterIntegrationOptions['installMode']
  if (requestedInstallMode === 'set' || requestedInstallMode === 'next')
    installMode = requestedInstallMode

  return {
    enabled: true,
    installMode,
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
  const identityProof = options.identityProof || state.identityProof
  if (!identityProof)
    throw new Error('Capgo notification identityProof is required')

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
    identityProof,
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
    eventProof: String(response.eventProof),
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
    eventProof: input?.eventProof || state.lastRegistration?.eventProof,
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
  if (state.bridgeListenersPromise)
    return state.bridgeListenersPromise

  state.bridgeListenersPromise = (async () => {
    const handles: PluginListenerHandle[] = []
    try {
      handles.push(await NativeCapgoNotifications.addListener('registration', (token) => {
        state.token = token
        if (state.externalId) {
          void registerToken({
            appId: state.config?.appId,
            serverUrl: state.config?.serverUrl,
            externalId: state.externalId,
            identityProof: state.identityProof || '',
            tags: state.tags,
            attributes: state.attributes,
            consent: state.consent,
          }, token)
        }
        notifyListeners(state.listeners.registrationChanged, token)
      }))
      handles.push(await NativeCapgoNotifications.addListener('notificationReceived', (notification) => {
        void trackEvent('received', eventFromNotification(notification))
        void maybeRunUpdateCheck(notification)
        notifyListeners(state.listeners.notificationReceived, notification)
      }))
      handles.push(await NativeCapgoNotifications.addListener('notificationOpened', (event) => {
        void trackEvent('opened', eventFromNotification(event.notification))
        notifyListeners(state.listeners.notificationOpened, event)
      }))
      handles.push(await NativeCapgoNotifications.addListener('backgroundNotification', (notification) => {
        if (!isUpdateCheckNotification(notification))
          void trackEvent('background_started', eventFromNotification(notification))
        void maybeRunUpdateCheck(notification)
        let finished = false
        const finish = async () => {
          if (finished)
            return
          finished = true
          await trackEvent('background_finished', eventFromNotification(notification))
        }
        notifyListeners(state.listeners.backgroundNotification, { notification, finish })
      }))
      state.bridgeListenersReady = true
    }
    catch (error) {
      await Promise.allSettled(handles.map(handle => handle.remove()))
      throw error
    }
    finally {
      state.bridgeListenersPromise = undefined
    }
  })()

  return state.bridgeListenersPromise
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
    state.identityProof = options.identityProof
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

  async setExternalId(externalId, identityProof) {
    state.externalId = externalId
    state.identityProof = identityProof ?? state.identityProof
    if (state.token)
      await registerToken({ externalId, identityProof: state.identityProof || '', tags: state.tags, attributes: state.attributes, consent: state.consent }, state.token)
  },

  async setTags(tags) {
    state.tags = tags
    if (state.token && state.externalId)
      await registerToken({ externalId: state.externalId, identityProof: state.identityProof || '', tags, attributes: state.attributes, consent: state.consent }, state.token)
  },

  async setBadge(count) {
    state.badge = Math.max(0, Math.trunc(count))
    await NativeCapgoNotifications.setBadge({ count: state.badge })
    if (state.token && state.externalId)
      await registerToken({ externalId: state.externalId, identityProof: state.identityProof || '', tags: state.tags, attributes: state.attributes, consent: state.consent }, state.token)
  },

  async clearBadge() {
    state.badge = 0
    await NativeCapgoNotifications.clearBadge()
    if (state.token && state.externalId)
      await registerToken({ externalId: state.externalId, identityProof: state.identityProof || '', tags: state.tags, attributes: state.attributes, consent: state.consent }, state.token)
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
      const installMode = options?.installMode || state.updater.installMode
      const channel = options?.channel || state.updater.channel
      if (updater.triggerUpdateCheck) {
        return normalizeUpdaterResult(await updater.triggerUpdateCheck({
          channel,
          installMode,
        }))
      }
      const latest = await updater.getLatest({ channel })
      if (!latest.url)
        return { status: 'no_update', version: latest.version, error: latest.message || latest.error }
      const bundle = await updater.download({
        url: latest.url,
        version: latest.version,
        checksum: latest.checksum,
        sessionKey: latest.sessionKey,
        manifest: latest.manifest,
      })
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
    await ensureBridgeListeners()
    if (eventName === 'notificationReceived') {
      const listener = listenerFunc as (notification: CapgoPushNotificationSchema) => void
      state.listeners.notificationReceived.add(listener)
      return createListenerHandle(() => state.listeners.notificationReceived.delete(listener))
    }

    if (eventName === 'notificationOpened') {
      const listener = listenerFunc as (event: CapgoNotificationOpenedEvent) => void
      state.listeners.notificationOpened.add(listener)
      return createListenerHandle(() => state.listeners.notificationOpened.delete(listener))
    }

    if (eventName === 'backgroundNotification') {
      const listener = listenerFunc as (event: CapgoBackgroundNotificationEvent) => void
      state.listeners.backgroundNotification.add(listener)
      return createListenerHandle(() => state.listeners.backgroundNotification.delete(listener))
    }

    const listener = listenerFunc as (token: CapgoNotificationToken) => void
    state.listeners.registrationChanged.add(listener)
    return createListenerHandle(() => state.listeners.registrationChanged.delete(listener))
  },
}
