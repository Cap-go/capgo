import type { Context } from 'hono'
import type { Database } from './supabase.types.ts'
import { getRuntimeKey } from 'hono/adapter'
import { cloudlog, cloudlogErr } from './logging.ts'
import { s3 } from './s3.ts'

const EXPIRATION_SECONDS = 604800
const BASE_PATH = 'files/read/attachments'

export interface ManifestEntry {
  file_name: string | null
  file_hash: string | null
  download_url: string | null
}

export async function getBundleUrl(
  c: Context,
  r2_path: string | null,
  deviceId: string,
  checksum: string,
) {
  cloudlog({ requestId: c.get('requestId'), message: 'getBundleUrl path', r2_path })
  if (!r2_path)
    return null

  if (getRuntimeKey() !== 'workerd') {
    try {
      const signedUrl = await s3.getSignedUrl(c, r2_path, EXPIRATION_SECONDS)
      cloudlog({ requestId: c.get('requestId'), message: 'getBundleUrl', signedUrl })
      const url = signedUrl
      // Since it's signed url we cannot add extra query params like checksum and device id
      // TODO: switch to our own file endpoint instead of direct s3 signed url
      return url
    }
    catch (error) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'getBundleUrl', error })
    }
  }
  const url = new URL(c.req.url)
  let finalPath = BASE_PATH
  // When running on Supabase Edge Runtime, the request host can be the internal container.
  // Build URLs using the externally visible host/port from forwarded headers when possible.
  if (url.host.endsWith(':8081') && url.hostname.startsWith('supabase_edge_runtime_')) {
    const forwardedHost = c.req.header('X-Forwarded-Host') || c.req.header('Host')
    const forwardedProto = c.req.header('X-Forwarded-Proto')
    if (forwardedHost) {
      url.host = forwardedHost
      if (forwardedProto)
        url.protocol = `${forwardedProto}:`
    }
    else {
      url.host = 'localhost:54321'
    }
    finalPath = `functions/v1/${BASE_PATH}`
  }
  const downloadUrl = `${url.protocol}//${url.host}/${finalPath}/${r2_path}?key=${checksum}&device_id=${deviceId}`
  return downloadUrl
}

export function getManifestUrl(c: Context, versionId: number, manifest: Partial<Database['public']['Tables']['manifest']['Row']>[] | null, deviceId: string): ManifestEntry[] {
  if (!manifest) {
    return []
  }

  try {
    const url = new URL(c.req.url)
    let finalPath = BASE_PATH
    if (url.host.endsWith(':8081') && url.hostname.startsWith('supabase_edge_runtime_')) {
      const forwardedHost = c.req.header('X-Forwarded-Host') || c.req.header('Host')
      const forwardedProto = c.req.header('X-Forwarded-Proto')
      if (forwardedHost) {
        url.host = forwardedHost
        if (forwardedProto)
          url.protocol = `${forwardedProto}:`
      }
      else {
        url.host = 'localhost:54321'
      }
      finalPath = `functions/v1/${BASE_PATH}`
    }
    const signKey = versionId

    return manifest.map((entry) => {
      if (!entry.s3_path)
        return null

      return {
        file_name: entry.file_name,
        file_hash: entry.file_hash,
        download_url: `${url.protocol}//${url.host}/${finalPath}/${entry.s3_path}?key=${signKey}&device_id=${deviceId}`,
      }
    }).filter(entry => entry !== null) as ManifestEntry[]
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'getManifestUrl', error, manifest })
    return []
  }
}
