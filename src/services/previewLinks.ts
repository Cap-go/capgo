export interface ChannelPreviewLink {
  type: 'channel'
  appId: string
  channelId?: number
  channelName: string
  payloadUrl?: string
}

export interface BundlePreviewLink {
  type: 'bundle'
  appId?: string
  versionId?: number
  payloadUrl: string
}

export type PreviewDeepLink = ChannelPreviewLink | BundlePreviewLink

const CHANNEL_PREVIEW_PATH = '/preview/channel'
const BUNDLE_PREVIEW_PATH = '/preview/bundle'
const CHANNEL_PREVIEW_SCHEME_URL = 'capgo://preview/channel'
const BUNDLE_PREVIEW_SCHEME_URL = 'capgo://preview/bundle'

function parseUrl(value: string): URL | null {
  try {
    return new URL(value.trim())
  }
  catch {
    return null
  }
}

function getPreviewPath(url: URL) {
  if (url.protocol !== 'capgo:')
    return url.pathname

  const hostPath = url.hostname ? `/${url.hostname}${url.pathname}` : url.pathname
  return hostPath.replace(/\/+/g, '/')
}

function getHttpUrlParam(url: URL, ...names: string[]) {
  for (const name of names) {
    const value = url.searchParams.get(name)
    const parsed = value ? parseUrl(value) : null
    if (parsed && (parsed.protocol === 'https:' || parsed.protocol === 'http:'))
      return parsed.toString()
  }
  return undefined
}

export function buildChannelPreviewDeepLink(options: {
  appId: string
  channelId?: number
  channelName: string
  payloadUrl?: string
  origin?: string
}) {
  const url = options.origin
    ? new URL(CHANNEL_PREVIEW_PATH, options.origin)
    : new URL(CHANNEL_PREVIEW_SCHEME_URL)
  url.searchParams.set('appId', options.appId)
  url.searchParams.set('channel', options.channelName)
  if (typeof options.channelId === 'number')
    url.searchParams.set('channelId', String(options.channelId))
  if (options.payloadUrl)
    url.searchParams.set('url', options.payloadUrl)
  return url.toString()
}

export function buildBundlePreviewDeepLink(options: {
  appId?: string
  versionId?: number
  payloadUrl: string
  origin?: string
}) {
  const url = options.origin
    ? new URL(BUNDLE_PREVIEW_PATH, options.origin)
    : new URL(BUNDLE_PREVIEW_SCHEME_URL)
  url.searchParams.set('url', options.payloadUrl)
  if (options.appId)
    url.searchParams.set('appId', options.appId)
  if (typeof options.versionId === 'number')
    url.searchParams.set('versionId', String(options.versionId))
  return url.toString()
}

export function parsePreviewDeepLink(value: string): PreviewDeepLink | null {
  const url = parseUrl(value)
  if (!url)
    return null

  const previewPath = getPreviewPath(url)
  if (previewPath !== CHANNEL_PREVIEW_PATH && previewPath !== BUNDLE_PREVIEW_PATH)
    return null

  const payloadUrl = getHttpUrlParam(url, 'url', 'payloadUrl')
  if (previewPath === BUNDLE_PREVIEW_PATH) {
    if (!payloadUrl)
      return null

    const versionIdValue = url.searchParams.get('versionId') ?? url.searchParams.get('bundleId')
    const versionId = versionIdValue ? Number(versionIdValue) : Number.NaN
    return {
      type: 'bundle',
      appId: url.searchParams.get('appId') ?? url.searchParams.get('app') ?? undefined,
      versionId: Number.isFinite(versionId) ? versionId : undefined,
      payloadUrl,
    }
  }

  const appId = url.searchParams.get('appId') ?? url.searchParams.get('app')
  const channelName = url.searchParams.get('channel') ?? url.searchParams.get('channelName')
  const channelIdValue = url.searchParams.get('channelId')
  const channelId = channelIdValue ? Number(channelIdValue) : Number.NaN

  if (!appId || !channelName)
    return null

  return {
    type: 'channel',
    appId,
    channelId: Number.isFinite(channelId) ? channelId : undefined,
    channelName,
    payloadUrl,
  }
}

export function parseChannelPreviewDeepLink(value: string): ChannelPreviewLink | null {
  const previewLink = parsePreviewDeepLink(value)
  return previewLink?.type === 'channel' ? previewLink : null
}

export function buildChannelPreviewLatestOptions(previewLink: ChannelPreviewLink) {
  return {
    appId: previewLink.appId,
    channel: previewLink.channelName,
    preview: true,
  }
}
