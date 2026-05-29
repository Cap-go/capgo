import { createSupabaseClient } from '../utils'

const ownerOrgCache = new Map<string, Promise<string | undefined>>()

export interface OrgResolverDeps {
  /** Injectable for tests; defaults to the real Supabase client factory. */
  createClient?: typeof createSupabaseClient
}

/**
 * Resolves an app's owner organization id (`apps.owner_org`), promise-cached
 * per `(apikey, appId)`. Returns undefined on any error — never throws.
 * Extracted so the analytics layer and onboarding analytics share one path.
 */
export function resolveOwnerOrgId(apikey: string, appId: string, deps: OrgResolverDeps = {}, signal?: AbortSignal): Promise<string | undefined> {
  const cacheKey = `${apikey}:${appId}`
  const cached = ownerOrgCache.get(cacheKey)
  if (cached)
    return cached

  const create = deps.createClient ?? createSupabaseClient
  const promise = (async () => {
    try {
      const supabase = await create(apikey, undefined, undefined, true, false)
      let query = supabase
        .from('apps')
        .select('owner_org')
        .eq('app_id', appId)
      if (signal)
        query = query.abortSignal(signal)
      const { data } = await query.maybeSingle()
      return data?.owner_org ?? undefined
    }
    catch {
      return undefined
    }
  })()

  ownerOrgCache.set(cacheKey, promise)
  return promise
}
