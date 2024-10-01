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

  let path: string | null = null
  let size: number | null = null

  const { data: bundleMeta } = await supabaseAdmin(c)
    .from('app_versions_meta')
    .select('size')
    .eq('id', version.id)
    .single()

  if (version.storage_provider === 'r2' && version.r2_path)
    path = version.r2_path
  else if (version.storage_provider === 'r2' && version.bucket_id && version.bucket_id?.endsWith('.zip'))
    path = `apps/${ownerOrg}/${version.app_id}/versions/${version.bucket_id}`

  console.log({ requestId: c.get('requestId'), context: 'path', path })
  if (!path)
    return null

  const durableObjNs: DurableObjectNamespace = c.env.TEMPORARY_KEY_HANDLER
  if (!durableObjNs) {
    try {
      const signedUrl = await s3.getSignedUrl(c, path, EXPIRATION_SECONDS)
      console.log({ requestId: c.get('requestId'), context: 'getBundleUrl', signedUrl, size: bundleMeta?.size })

      const url = signedUrl

      return { url }
    }
    catch (error) {
      console.error({ requestId: c.get('requestId'), context: 'getBundleUrl', error })
    }
  }
  const handler = durableObjNs.get(durableObjNs.idFromName('temporary-keys'))

  try {
    const url = new URL(c.req.url)
    const response = await handler.fetch(`${url.protocol}//${url.host}/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ versionID: version.id, paths: [path] }),
    })
    const { key: signKey } = await response.json<{ key: string }>()

    if (!signKey) {
      console.error({ requestId: c.get('requestId'), context: 'getBundleUrlV2', error: 'Failed to create temporary key' })
      return null
    }

    const downloadUrl = `${url.protocol}//${url.host}/private/files/read/attachments/${path}?key=${signKey}&versionID=${version.id}`
    size = bundleMeta?.size ?? 0

    return { url: downloadUrl, size }
  }
  catch (error) {
    console.error({ requestId: c.get('requestId'), context: 'getBundleUrlV2', error })
  }
  return null
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
  const durableObjNs: DurableObjectNamespace = c.env.TEMPORARY_KEY_HANDLER
  const handler = durableObjNs.get(durableObjNs.idFromName('temporary-keys'))

  const paths = version.manifest.map(entry => entry.s3_path).filter(Boolean) as string[]

  try {
    const url = new URL(c.req.url)
    const response = await handler.fetch(`${url.protocol}//${url.host}/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ versionID: version.id, paths }),
    })
    const { key: signKey } = await response.json<{ key: string }>()

    if (!signKey) {
      console.error({ requestId: c.get('requestId'), context: 'getManifestUrl', error: 'Failed to create temporary key' })
      return []
    }

    return version.manifest.map((entry) => {
      if (!entry.s3_path)
        return null

      return {
        file_name: entry.file_name,
        file_hash: entry.file_hash,
        download_url: `${url.protocol}//${url.host}/${basePath}/${entry.s3_path}?key=${signKey}&version_id=${version.id}`,
      }
    }).filter(entry => entry !== null) as ManifestEntry[]
  }
  catch (error) {
    console.error({ requestId: c.get('requestId'), context: 'getManifestUrl', error })
    return []
  }
}
