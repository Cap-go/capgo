import { r2 } from './r2.ts'
import { supabaseAdmin } from './supabase.ts'

export async function getBundleUrl(platform: string, path: string, bucket_id: string) {
  if (platform === 'supabase') {
    const { data } = await supabaseAdmin()
      .storage
      .from(path)
      .createSignedUrl(bucket_id, 120)
    return data?.signedUrl
  }
  else if (platform === 'r2' && bucket_id.endsWith('.zip')) {
    return (await r2.getSignedUrl(`${path}/${bucket_id}`, 120)).replace('http://', 'https://')
  }
  else if (platform === 'r2' && !bucket_id.endsWith('.zip')) {
    return (await r2.getSignedUrl(bucket_id, 120)).replace('http://', 'https://')
  }
  return null
}
