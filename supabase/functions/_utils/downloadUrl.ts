import { r2 } from './r2.ts'
import { supabaseAdmin } from './supabase.ts'

export const getBundleUrl = async (platform: string, path: string, bucket_id: string) => {
  if (platform === 'supabase') {
    const { data } = await supabaseAdmin()
      .storage
      .from(path)
      .createSignedUrl(bucket_id, 120)
    return data?.signedUrl
  }
  else if (platform === 'r2') {
    return r2.getSignedUrl(bucket_id, 120)
  }
  return null
}
