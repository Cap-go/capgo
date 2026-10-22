// Public REST API version prefix. /v1/<route> serves the same handlers as the unprefixed /<route>,
// so integrations can pin a version today. A breaking change would ship under /v2 instead.
const PUBLIC_API_VERSION = 'v1'

const VERSIONED_PUBLIC_ROUTES = new Set([
  'apikey',
  'app',
  'build',
  'bundle',
  'channel',
  'device',
  'notifications',
  'organization',
  'statistics',
  'user',
  'webhooks',
])

const VERSIONED_PATH = new RegExp(`^/${PUBLIC_API_VERSION}(/([^/]+)(?:/.*)?)$`)

export function stripPublicApiVersion(request: Request): Request {
  const url = new URL(request.url)
  const match = VERSIONED_PATH.exec(url.pathname)
  if (!match || !VERSIONED_PUBLIC_ROUTES.has(match[2]))
    return request
  url.pathname = match[1]
  return new Request(url, request)
}
