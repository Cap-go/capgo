import { r2 } from './r2.ts'
import { supabaseAdmin } from './supabase.ts'

const EXPIRATION_SECONDS = 604800
// const EXPIRATION_SECONDS = 120

export async function getBundleUrl(platform: string, path: string, bucket_id: string) {
  if (platform === 'supabase') {
    const { data } = await supabaseAdmin()
      .storage
      .from(path)
      .createSignedUrl(bucket_id, EXPIRATION_SECONDS)
    return data?.signedUrl
  }
  else if (platform === 'r2' && bucket_id.endsWith('.zip')) {
    return (await r2.getSignedUrl(`${path}/${bucket_id}`, EXPIRATION_SECONDS)).replace('http://', 'https://')
  }
  else if (platform === 'r2' && !bucket_id.endsWith('.zip')) {
    return (await r2.getSignedUrl(bucket_id, EXPIRATION_SECONDS)).replace('http://', 'https://')
  }
  return null
}
