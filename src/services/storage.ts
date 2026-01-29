import { useSupabase } from './supabase'

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7
const signedUrlCache = new Map<string, string>()

export async function createSignedImageUrl(path?: string | null) {
  if (!path)
    return ''

  if (path.includes('://'))
    return ''

  const normalized = path.replace(/^images\//, '').replace(/^\/+/, '')
  if (!normalized)
    return ''

  const cacheKey = `images:${normalized}`
  const cached = signedUrlCache.get(cacheKey)
  if (cached)
    return cached

  const { data, error } = await useSupabase()
    .storage
    .from('images')
    .createSignedUrl(normalized, SIGNED_URL_TTL_SECONDS)

  if (error || !data?.signedUrl)
    return ''

  signedUrlCache.set(cacheKey, data.signedUrl)
  return data.signedUrl
}
