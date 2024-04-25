import type { Context } from 'hono'
import { s3 } from './s3.ts'

const EXPIRATION_SECONDS = 604800
// const EXPIRATION_SECONDS = 120

export async function getBundleUrl(c: Context, ownerOrg: string, version: { bucket_id: string | null, app_id: string, storage_provider: string | undefined, r2_path: string | null }) {
  console.log(version)

  let path: string | null = null
  let size: number | null = null
  let url: string | null = null

  if (version.storage_provider === 'r2' && version.r2_path)
    path = version.r2_path
  else if (version.storage_provider === 'r2' && version.bucket_id && version.bucket_id?.endsWith('.zip'))
    path = `apps/${ownerOrg}/${version.app_id}/versions/${version.bucket_id}`

  console.log(path)
  if (!path)
    return null

  try {
    const [signedUrl, { size: fileSize }] = await Promise.all([
      s3.getSignedUrl(c, path, EXPIRATION_SECONDS),
      s3.getSizeChecksum(c, path),
    ])
    console.log('getBundleUrl', signedUrl, fileSize)

    url = signedUrl
    size = fileSize ?? 0

    return { url, size }
  }
  catch (error) {
    console.error('getBundleUrl', error)
  }
  return null
}
