import type { Context } from 'hono'
import { s3 } from './s3.ts'
import { supabaseAdmin } from './supabase.ts'
import type { Database } from './supabase.types.ts'

const EXPIRATION_SECONDS = 604800
// const EXPIRATION_SECONDS = 120

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
  console.log(version)

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

  console.log(path)
  if (!path)
    return null

  try {
    const signedUrl = await s3.getSignedUrl(c, path, EXPIRATION_SECONDS)
    // TODO: fix when cloudflare fix the api rate issue.
    // const [signedUrl, { size: fileSize }] = await Promise.all([
    //   s3.getSignedUrl(c, path, EXPIRATION_SECONDS),
    //   s3.getSizeChecksum(c, path),
    // ])
    // console.log('getBundleUrl', signedUrl, fileSize)
    console.log('getBundleUrl', signedUrl, bundleMeta?.size)

    url = signedUrl
    // size = fileSize ?? 0
    size = bundleMeta?.size ?? 0

    return { url, size }
  }
  catch (error) {
    console.error('getBundleUrl', error)
  }
  return null
}
