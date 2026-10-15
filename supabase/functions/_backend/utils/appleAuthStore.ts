import type { Context } from 'hono'
import { authQuery as appleQuery, openAuthCredential, sanitizeAuthName as sanitizeAppleName, sealAuthCredential } from './socialAuthStore.ts'
import { getEnv } from './utils.ts'

export { authHash as appleHash, authQuery as appleQuery, authRandom as appleRandom, sanitizeAuthName as sanitizeAppleName } from './socialAuthStore.ts'

export function sealAppleCredential(c: Context, value: unknown) {
  return sealAuthCredential(value, getEnv(c, 'APPLE_SIGN_IN_PRIVATE_KEY'), 'capgo-apple-oauth-v1')
}

export function openAppleCredential<T>(c: Context, value: string) {
  return openAuthCredential<T>(value, getEnv(c, 'APPLE_SIGN_IN_PRIVATE_KEY'), 'capgo-apple-oauth-v1')
}

export async function rememberAppleName(c: Context, subject: string, first: unknown, last: unknown) {
  const firstName = sanitizeAppleName(first)
  const lastName = sanitizeAppleName(last)
  const rows = await appleQuery<{ first_name: string, last_name: string }>(c, `
    INSERT INTO public.apple_auth_names (subject, first_name, last_name)
    VALUES ($1, $2, $3)
    ON CONFLICT (subject) DO UPDATE SET
      first_name = COALESCE(NULLIF(public.apple_auth_names.first_name, ''), EXCLUDED.first_name),
      last_name = COALESCE(NULLIF(public.apple_auth_names.last_name, ''), EXCLUDED.last_name)
    RETURNING first_name, last_name`, [subject, firstName, lastName])
  return rows[0]
}

export type { SocialAuthAttempt as AppleAttempt } from './socialAuthStore.ts'
