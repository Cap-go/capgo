import type { Context } from '@hono/hono'
import type { Database } from './supabase.types.ts'
import { getRuntimeKey } from 'hono/adapter'
import { s3 } from './s3.ts'
import { supabaseAdmin } from './supabase.ts'

const EXPIRATION_SECONDS = 604800
const BASE_PATH = 'files/read/attachments'

export interface ManifestEntry {
  file_name: string | null
  file_hash: string | null
  download_url: string | null
  file_size: number | null
}

export async function getBundleUrl(
  c: Context,
  versionId: number,
  r2_path: string | null,
  deviceId: string,
) {
  console.log({ requestId: c.get('requestId'), context: 'getBundleUrlV2 version', versionId })

  const { data: bundleMeta } = await supabaseAdmin(c)
    .from('app_versions_meta')
    .select('size, checksum')
    .eq('id', versionId)
    .single()

  console.log({ requestId: c.get('requestId'), context: 'path', r2_path })
  if (!r2_path)
    return null

  if (getRuntimeKey() !== 'workerd') {
    try {
      const signedUrl = await s3.getSignedUrl(c, r2_path, EXPIRATION_SECONDS)
      console.log({ requestId: c.get('requestId'), context: 'getBundleUrl', signedUrl, size: bundleMeta?.size })

      const url = signedUrl

      return { url, size: bundleMeta?.size }
    }
    catch (error) {
      console.error({ requestId: c.get('requestId'), context: 'getBundleUrl', error })
    }
  }
  const url = new URL(c.req.url)
  let finalPath = BASE_PATH
  // .replace('http://supabase_edge_runtime_capgo:8081', 'http://localhost:54321')
  if (url.host === 'supabase_edge_runtime_capgo-app:8081') {
    url.host = 'localhost:54321'
    finalPath = `functions/v1/${BASE_PATH}`
  }
  const downloadUrl = `${url.protocol}//${url.host}/${finalPath}/${r2_path}?key=${bundleMeta?.checksum}&device_id=${deviceId}`
  return { url: downloadUrl, size: bundleMeta?.size }
}

export function getManifestUrl(c: Context, versionId: number, manifest: Database['public']['CompositeTypes']['manifest_entry'][] | null, deviceId: string): ManifestEntry[] {
  if (!manifest) {
    return []
  }

  try {
    const url = new URL(c.req.url)
    let finalPath = BASE_PATH
    // .replace('http://supabase_edge_runtime_capgo:8081', 'http://localhost:54321')
    if (url.host === 'supabase_edge_runtime_capgo:8081') {
      url.host = 'localhost:54321'
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
        file_size: entry.file_size
      }
    }).filter(entry => entry !== null) as ManifestEntry[]
  }
  catch (error) {
    console.error({ requestId: c.get('requestId'), context: 'getManifestUrl', error })
    return []
  }
}
