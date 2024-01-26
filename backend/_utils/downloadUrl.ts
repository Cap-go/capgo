import type { Context } from 'https://deno.land/x/hono@v3.12.7/mod.ts'
import { r2 } from './r2.ts'
import { supabaseAdmin } from './supabase.ts'

const EXPIRATION_SECONDS = 604800
// const EXPIRATION_SECONDS = 120

export async function getBundleUrl(c: Context, platform: string, path: string, bucket_id: string) {
  if (platform === 'supabase') {
    const { data } = await supabaseAdmin(c)
      .storage
      .from(path)
      .createSignedUrl(bucket_id, EXPIRATION_SECONDS)
    return data?.signedUrl
  }
  else if (platform === 'r2' && bucket_id.endsWith('.zip')) {
    return await r2.getSignedUrl(c, `${path}/${bucket_id}`, EXPIRATION_SECONDS)
  }
  else if (platform === 'r2' && !bucket_id.endsWith('.zip')) {
    return await r2.getSignedUrl(c, bucket_id, EXPIRATION_SECONDS)
  }
  return null
}
