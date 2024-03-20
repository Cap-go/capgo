import type { Context } from 'hono'
import { s3 } from './s3.ts'

const EXPIRATION_SECONDS = 604800
// const EXPIRATION_SECONDS = 120

export async function getBundleUrl(c: Context, ownerOrg: string, version: { bucket_id: string | null, app_id: string, storage_provider: string | undefined, r2_path: string | null }) {
  console.log(version)
  if (version.storage_provider === 'r2' && version.r2_path)
    return await s3.getSignedUrl(c, version.r2_path, EXPIRATION_SECONDS)
  else if (version.storage_provider === 'r2' && version.bucket_id && version.bucket_id?.endsWith('.zip'))
    return await s3.getSignedUrl(c, `apps/${ownerOrg}/${version.app_id}/versions/${version.bucket_id}`, EXPIRATION_SECONDS)

  return null
}
