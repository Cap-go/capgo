import type { User } from '@supabase/supabase-js'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { emptySupabaseWithClientIP } from './supabase.ts'
import { z } from 'zod'
import { parseSignupAttributionRecord } from '../../shared/signup-attribution.ts'
import { supabaseAdmin } from './supabase.ts'
import { getEnv } from './utils.ts'

export function getCaptchaSecret(c: Context) {
  return getEnv(c, 'CAPTCHA_SECRET_KEY') || getEnv(c, 'CLOUDFLARE_TURNSTILE_SECRET_KEY')
}

export async function hashEmailSha256(email: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.trim().toLowerCase()))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function checkRegistrationEmail(c: Context, email: string) {
  return supabaseAdmin(c).rpc('is_not_deleted', { email_check: await hashEmailSha256(email) })
}

export function isCaptchaFailedError(error: unknown) {
  const err = error as { code?: string, message?: string }
  return err?.code === 'captcha_failed' || String(err?.message ?? '').toLowerCase().includes('captcha')
}

export function isAuthRateLimitError(error: unknown) {
  const err = error as { code?: string, message?: string, status?: number }
  return err?.status === 429 || ['over_request_rate_limit', 'over_email_send_rate_limit'].includes(err?.code ?? '')
    || String(err?.message ?? '').toLowerCase().includes('rate limit')
}

export interface ProfileInput { id: string, email: string, first_name: string, last_name: string }

// All sign-up paths insert the real profile so on_user_create runs exactly once.
// Optional newsletter consent must never be inferred from social authentication.
export function provisionUserProfile(c: Context, profile: ProfileInput, preserveExisting = false) {
  return supabaseAdmin(c).from('users').upsert({
    ...profile,
    enable_notifications: true,
    opt_for_newsletters: false,
  }, { onConflict: 'id', ...(preserveExisting ? { ignoreDuplicates: true } : {}) })
}

export class SocialAuthError extends Error {
  constructor(readonly status: ContentfulStatusCode, readonly code: string) {
    super(code)
  }
}

export const socialRegistrationMetadataSchema = z.object({
  registration_device_type: z.string().trim().max(100).optional(),
  registration_os: z.string().trim().max(100).optional(),
  registration_browser: z.string().trim().max(100).optional(),
  registration_variant: z.string().trim().max(100).optional(),
  registration_experiment: z.string().trim().max(100).optional(),
  registration_experiment_variant: z.string().trim().max(100).optional(),
  signup_ref: z.string().max(512).optional(),
  signup_plugin: z.string().max(512).optional(),
  signup_source: z.string().max(512).optional(),
  first_touch_type: z.string().max(100).optional(),
  first_touch_path: z.string().max(1024).optional(),
  first_utm_source: z.string().max(512).optional(),
  first_utm_medium: z.string().max(512).optional(),
  first_utm_campaign: z.string().max(512).optional(),
  first_utm_content: z.string().max(512).optional(),
  first_utm_term: z.string().max(512).optional(),
})
type SocialRegistrationMetadata = z.infer<typeof socialRegistrationMetadataSchema>
type AuthClient = ReturnType<typeof emptySupabaseWithClientIP>

export async function checkSocialEmail(c: Context, email: string, provider: 'apple' | 'google') {
  const admin = supabaseAdmin(c)
  const [deleted, sso] = await Promise.all([
    checkRegistrationEmail(c, email),
    admin.rpc('get_sso_enforcement_by_domain', { p_domain: email.split('@')[1] }),
  ])
  if (deleted.error || sso.error)
    throw new SocialAuthError(500, `${provider}_login_failed`)
  if (!deleted.data)
    throw new SocialAuthError(403, 'account_deleted')
  const enforcement = Array.isArray(sso.data) ? sso.data[0] : sso.data
  if (enforcement?.enforce_sso)
    throw new SocialAuthError(403, 'sso_required')
}

async function updateRegistrationMetadata(c: Context, client: AuthClient, user: User, provider: 'apple' | 'google', rawMetadata: SocialRegistrationMetadata = {}) {
  const existing = await supabaseAdmin(c).from('users').select('id').eq('id', user.id).maybeSingle()
  if (existing.error)
    throw new SocialAuthError(500, `${provider}_login_failed`)
  if (existing.data)
    return
  const metadata: Record<string, string> = { ...parseSignupAttributionRecord(rawMetadata) }
  for (const [key, value] of Object.entries(rawMetadata)) {
    if (key.startsWith('registration_') && value)
      metadata[key] = value
  }
  // Hooks read auth metadata when the public profile insert queues on_user_create.
  const updated = await client.auth.updateUser({ data: Object.fromEntries(Object.entries(metadata).filter(([key]) => !user.user_metadata[key])) })
  if (updated.error)
    throw new SocialAuthError(500, `${provider}_login_failed`)
}

export async function saveSocialProfile(c: Context, client: AuthClient, user: User & { email: string }, name: { first_name: string, last_name: string }, metadata: SocialRegistrationMetadata | undefined, provider: 'apple' | 'google') {
  await updateRegistrationMetadata(c, client, user, provider, metadata)
  const profile = await provisionUserProfile(c, {
    id: user.id,
    email: user.email,
    first_name: name.first_name || '',
    last_name: name.last_name || '',
  }, true).select('id')
  if (profile.error)
    throw new SocialAuthError(500, `${provider}_login_failed`)
  const admin = supabaseAdmin(c)
  // Conditional updates are atomic: parallel sign-ins cannot erase a chosen name.
  await Promise.all((['first_name', 'last_name'] as const).map(async (field) => {
    if (!name[field])
      return
    const patch = field === 'first_name' ? { first_name: name.first_name } : { last_name: name.last_name }
    const update = await admin.from('users').update(patch).eq('id', user.id).or(`${field}.is.null,${field}.eq.`)
    if (update.error)
      throw new SocialAuthError(500, `${provider}_login_failed`)
  }))
  const saved = await admin.from('users').select('first_name,last_name').eq('id', user.id).single()
  if (saved.error)
    throw new SocialAuthError(500, `${provider}_login_failed`)
  return {
    is_new_user: (profile.data?.length ?? 0) > 0,
    name_status: saved.data.first_name || saved.data.last_name ? 'saved' : 'unavailable',
  }
}

export async function finishSocialSignIn(c: Context, client: AuthClient, user: User & { email: string }, session: { access_token: string, refresh_token: string }, name: { first_name: string, last_name: string }, metadata: SocialRegistrationMetadata | undefined, provider: 'apple' | 'google') {
  // Linked accounts can have a different primary email; enforce both identities.
  await checkSocialEmail(c, user.email, provider)
  const disabled = await client.rpc('is_account_disabled', { user_id: user.id })
  if (disabled.error)
    throw new SocialAuthError(500, `${provider}_login_failed`)
  // Scheduled deletion stays restorable without provisioning a new profile.
  const profile = disabled.data
    ? { is_new_user: false, name_status: 'unavailable' }
    : await saveSocialProfile(c, client, user, name, metadata, provider)
  return {
    user,
    account_status: disabled.data ? 'disabled' : 'active',
    ...profile,
    session: { access_token: session.access_token, refresh_token: session.refresh_token },
  }
}
