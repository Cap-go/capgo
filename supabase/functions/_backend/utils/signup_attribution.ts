import type { Context } from 'hono'
import {
  mergeSignupAttribution,
  parseSignupAttributionRecord,
  signupAttributionEventTags,
  type ResolvedSignupAttribution,
  type SignupAttributionEventTags,
} from '../../shared/signup-attribution.ts'
import { supabaseAdmin } from './supabase.ts'

export function signupPluginTagsFromAttribution(attribution: ResolvedSignupAttribution): SignupAttributionEventTags {
  return signupAttributionEventTags(attribution)
}

export async function resolveSignupAttributionForUser(
  c: Context,
  userId: string,
): Promise<ResolvedSignupAttribution> {
  const { data, error } = await supabaseAdmin(c).auth.admin.getUserById(userId)
  if (error || !data.user)
    return {}
  return parseSignupAttributionRecord(data.user.user_metadata as Record<string, unknown>)
}

export async function resolveSignupAttributionForOrg(
  c: Context,
  org: { created_by: string, signup_plugin?: string | null },
): Promise<ResolvedSignupAttribution> {
  const attribution = await resolveSignupAttributionForUser(c, org.created_by)
  const signup_plugin = typeof org.signup_plugin === 'string' && org.signup_plugin.trim().length > 0
    ? org.signup_plugin.trim()
    : attribution.signup_plugin

  return mergeSignupAttribution(
    attribution,
    signup_plugin ? { signup_plugin } : null,
  )
}

export async function signupAttributionTagsForOrg(
  c: Context,
  org: { created_by: string, signup_plugin?: string | null },
): Promise<SignupAttributionEventTags> {
  return signupAttributionEventTags(await resolveSignupAttributionForOrg(c, org))
}
