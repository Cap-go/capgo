import { getRuntimeKey } from 'hono/adapter'
import type { Context } from '@hono/hono'
import { s3 } from './s3.ts'
import { supabaseAdmin } from './supabase.ts'
import type { Database } from './supabase.types.ts'

const EXPIRATION_SECONDS = 604800

export interface ManifestEntry {
  file_name: string | null
  file_hash: string | null
  download_url: string | null
}

export function getPathFromVersion(ownerOrg: string, appId: string, bucketId: string | null, storageProvider: string, r2Path: string | null) {
  if (storageProvider === 'r2' && r2Path)
    return r2Path
  else if (storageProvider === 'r2' && bucketId && bucketId?.endsWith('.zip'))
    return `apps/${ownerOrg}/${appId}/versions/${bucketId}`
}

export async function getBundleUrl(
  c: Context,
  ownerOrg: string,
  version: {
    id: Database['public']['Tables']['app_versions']['Row']['id']
    storage_provider: Database['public']['Tables']['app_versions']['Row']['storage_provider']
    r2_path: Database['public']['Tables']['app_versions']['Row']['r2_path']
    bucket_id: Database['public']['Tables']['app_versions']['Row']['bucket_id']
    app_id: Database['public']['Tables']['app_versions']['Row']['app_id']
  },
) {
  console.log({ requestId: c.get('requestId'), context: 'getBundleUrlV2 version', version })

  const path = getPathFromVersion(ownerOrg, version.app_id, version.bucket_id, version.storage_provider, version.r2_path)

  const { data: bundleMeta } = await supabaseAdmin(c)
    .from('app_versions_meta')
    .select('size')
    .eq('id', version.id)
    .single()

  console.log({ requestId: c.get('requestId'), context: 'path', path })
  if (!path)
    return null

  if (getRuntimeKey() !== 'workerd') {
    try {
      const signedUrl = await s3.getSignedUrl(c, path, EXPIRATION_SECONDS)
      console.log({ requestId: c.get('requestId'), context: 'getBundleUrl', signedUrl, size: bundleMeta?.size })

      const url = signedUrl

      return { url, size: bundleMeta?.size }
    }
    catch (error) {
      console.error({ requestId: c.get('requestId'), context: 'getBundleUrl', error })
    }
  }

  const url = new URL(c.req.url)
  const downloadUrl = `${url.protocol}//${url.host}/private/files/read/attachments/${path}?key=${version.id}`
  return { url: downloadUrl, size: bundleMeta?.size }
}

export async function getManifestUrl(c: Context, version: {
  id: Database['public']['Tables']['app_versions']['Row']['id']
  storage_provider: Database['public']['Tables']['app_versions']['Row']['storage_provider']
  r2_path: Database['public']['Tables']['app_versions']['Row']['r2_path']
  bucket_id: Database['public']['Tables']['app_versions']['Row']['bucket_id']
  app_id: Database['public']['Tables']['app_versions']['Row']['app_id']
  manifest: Database['public']['CompositeTypes']['manifest_entry'][] | null
}): Promise<ManifestEntry[]> {
  if (!version.manifest) {
    return []
  }
  const basePath = 'private/files/read/attachments'

  try {
    const url = new URL(c.req.url)
    const signKey = version.id

    return version.manifest.map((entry) => {
      if (!entry.s3_path)
        return null

      return {
        file_name: entry.file_name,
        file_hash: entry.file_hash,
        download_url: `${url.protocol}//${url.host}/${basePath}/${entry.s3_path}?key=${signKey}`,
      }
    }).filter(entry => entry !== null) as ManifestEntry[]
  }
  catch (error) {
    console.error({ requestId: c.get('requestId'), context: 'getManifestUrl', error })
    return []
  }
}
