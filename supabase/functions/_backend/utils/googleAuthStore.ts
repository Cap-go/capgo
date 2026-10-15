import type { Context } from 'hono'
import type { SocialAuthAttempt } from './socialAuthStore.ts'
import { openAuthCredential, sealAuthCredential } from './socialAuthStore.ts'
import { getEnv } from './utils.ts'

export { authHash as googleHash, authQuery as googleQuery, authRandom as googleRandom } from './socialAuthStore.ts'
export interface GoogleAttempt extends SocialAuthAttempt { provider_verifier: string }
export function sealGoogleCredential(c: Context, value: unknown) {
  return sealAuthCredential(value, getEnv(c, 'GOOGLE_SIGN_IN_WEB_CLIENT_SECRET'), 'capgo-google-oauth-v1')
}
export function openGoogleCredential<T>(c: Context, value: string) {
  return openAuthCredential<T>(value, getEnv(c, 'GOOGLE_SIGN_IN_WEB_CLIENT_SECRET'), 'capgo-google-oauth-v1')
}
