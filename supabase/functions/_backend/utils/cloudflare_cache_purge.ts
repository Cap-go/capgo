import type { Context } from 'hono'
import { cloudlog, cloudlogErr, serializeError } from './logging.ts'
import { getEnv } from './utils.ts'

const CACHE_TAG_PREFIX = 'app:'
const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4'

function parseZoneIds(raw: string): string[] {
  return raw
    .split(',')
    .map(zoneId => zoneId.trim())
    .filter(Boolean)
}

export function buildAppCacheTag(appId: string) {
  return `${CACHE_TAG_PREFIX}${appId}`
}

export async function purgeAppCacheTags(c: Context, appId: string) {
  const token = getEnv(c, 'CF_CACHE_PURGE_TOKEN')
  const zoneIdsRaw = getEnv(c, 'CF_CACHE_PURGE_ZONE_IDS')

  if (!token || !zoneIdsRaw) {
    cloudlog({ requestId: c.get('requestId'), message: 'Cloudflare cache purge skipped (missing env)', hasToken: Boolean(token), hasZoneIds: Boolean(zoneIdsRaw) })
    return
  }

  const zoneIds = parseZoneIds(zoneIdsRaw)
  if (!zoneIds.length) {
    cloudlog({ requestId: c.get('requestId'), message: 'Cloudflare cache purge skipped (no zone IDs)', zoneIdsRaw })
    return
  }

  const tags = [buildAppCacheTag(appId)]
  const body = JSON.stringify({ tags })
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'Capgo/1.0',
  }

  await Promise.all(zoneIds.map(async (zoneId) => {
    try {
      const response = await fetch(`${CLOUDFLARE_API_BASE}/zones/${zoneId}/purge_cache`, {
        method: 'POST',
        headers,
        body,
      })

      if (!response.ok) {
        const error = await response.json().catch(() => null)
        cloudlogErr({ requestId: c.get('requestId'), message: 'Cloudflare cache purge failed', zoneId, status: response.status, error })
        return
      }

      const result = await response.json().catch(() => null)
      if (result && result.success === false) {
        cloudlogErr({ requestId: c.get('requestId'), message: 'Cloudflare cache purge returned error', zoneId, result })
        return
      }

      cloudlog({ requestId: c.get('requestId'), message: 'Cloudflare cache purged by tag', zoneId, tags })
    }
    catch (error) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'Cloudflare cache purge error', zoneId, error: serializeError(error) })
    }
  }))
}
