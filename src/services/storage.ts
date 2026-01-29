import { useSupabase } from './supabase'

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7
const MAX_CACHE_ENTRIES = 500
const signedUrlCache = new Map<string, { url: string, expiresAt: number }>()

export async function createSignedImageUrl(path?: string | null) {
  if (!path)
    return ''

  if (path.includes('://'))
    return path

  const normalized = path.replace(/^images\//, '').replace(/^\/+/, '')
  if (!normalized)
    return ''

  const cacheKey = `images:${normalized}`
  const cached = signedUrlCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now())
    return cached.url
  if (cached)
    signedUrlCache.delete(cacheKey)

  const { data, error } = await useSupabase()
    .storage
    .from('images')
    .createSignedUrl(normalized, SIGNED_URL_TTL_SECONDS)

  if (error || !data?.signedUrl)
    return ''

  signedUrlCache.set(cacheKey, {
    url: data.signedUrl,
    expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
  })
  if (signedUrlCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = signedUrlCache.keys().next().value
    if (oldestKey)
      signedUrlCache.delete(oldestKey)
  }
  return data.signedUrl
}
