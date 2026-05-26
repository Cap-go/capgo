export interface ChannelPreviewLink {
  type: 'channel'
  appId: string
  channelId?: number
  channelName: string
}

const CHANNEL_PREVIEW_PATH = '/preview/channel'
const CHANNEL_PREVIEW_SCHEME_URL = 'capgo://preview/channel'

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

export function buildChannelPreviewDeepLink(options: {
  appId: string
  channelId?: number
  channelName: string
  origin?: string
}) {
  const url = options.origin
    ? new URL(CHANNEL_PREVIEW_PATH, options.origin)
    : new URL(CHANNEL_PREVIEW_SCHEME_URL)
  url.searchParams.set('appId', options.appId)
  url.searchParams.set('channel', options.channelName)
  if (typeof options.channelId === 'number')
    url.searchParams.set('channelId', String(options.channelId))
  return url.toString()
}

export function parseChannelPreviewDeepLink(value: string): ChannelPreviewLink | null {
  const url = parseUrl(value)
  if (!url)
    return null

  if (getPreviewPath(url) !== CHANNEL_PREVIEW_PATH)
    return null

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
  }
}

export function buildChannelPreviewLatestOptions(previewLink: ChannelPreviewLink) {
  return {
    appId: previewLink.appId,
    channel: previewLink.channelName,
    preview: true,
  }
}
