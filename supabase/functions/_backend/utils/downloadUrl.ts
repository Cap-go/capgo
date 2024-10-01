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
  console.log({ requestId: c.get('requestId'), context: 'getBundleUrl version', version })

  let path: string | null = null
  let size: number | null = null
  let url: string | null = null

  // get app_versions_meta to get the size
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

  try {
    const signedUrl = await s3.getSignedUrl(c, path, EXPIRATION_SECONDS)
    console.log({ requestId: c.get('requestId'), context: 'getBundleUrl', signedUrl, size: bundleMeta?.size })

    url = signedUrl
    size = bundleMeta?.size ?? 0

    return { url, size }
  }
  catch (error) {
    console.error({ requestId: c.get('requestId'), context: 'getBundleUrl', error })
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
  const basePath = 'https://api.capgo.app/private/files/read/attachments/'
  const finalManifest = version.manifest.map((entry) => {
    if (!entry.s3_path)
      return null
    return {
      file_name: entry.file_name,
      file_hash: entry.file_hash,
      download_url: `${basePath}${entry.s3_path}`,
    }
  })
  return finalManifest.filter(entry => entry !== null)
}
