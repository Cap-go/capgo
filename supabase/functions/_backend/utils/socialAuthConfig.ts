import type { Context } from 'hono'
import { CacheHelper } from './cache.ts'
import { closeClient, getPgClient } from './pg.ts'
import { getEnv } from './utils.ts'

export async function isSocialRolloutEnabled(c: Context, setting: string) {
  // Environment values are deployment-time overrides; Vault owns runtime rollout.
  const override = getEnv(c, setting)
  if (override)
    return override === 'true'
  try {
    const cache = new CacheHelper(c)
    const request = cache.buildRequest(`/.${setting.toLowerCase().replaceAll('_', '-')}`)
    const cached = await cache.matchJson<{ enabled: boolean }>(request)
    if (cached)
      return cached.enabled === true
    const client = await getPgClient(c)
    let enabled = false
    try {
      const result = await client.query<{ decrypted_secret: string }>('SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1 LIMIT 1', [setting])
      enabled = result.rows[0]?.decrypted_secret?.trim() === 'true'
    }
    finally {
      await closeClient(c, client)
    }
    await cache.putJson(request, { enabled }, 60)
    return enabled
  }
  catch {
    return false
  }
}

export async function getSocialAuthSetting(c: Context, setting: string) {
  const override = getEnv(c, setting)
  if (override)
    return override
  try {
    const cache = new CacheHelper(c)
    const request = cache.buildRequest('/.social-auth-value', { setting })
    const cached = await cache.matchJson<{ value: string }>(request)
    if (cached)
      return cached.value
    const client = await getPgClient(c)
    let value = ''
    try {
      const result = await client.query<{ decrypted_secret: string }>('SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1 LIMIT 1', [setting])
      value = result.rows[0]?.decrypted_secret?.trim() || ''
    }
    finally { await closeClient(c, client) }
    await cache.putJson(request, { value }, 60)
    return value
  }
  catch { return '' }
}
