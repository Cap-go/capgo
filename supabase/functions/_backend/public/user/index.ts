import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { z } from 'zod'
import { getBodyOrQuery, honoFactory, quickError, simpleError, useCors } from '../../utils/hono.ts'
import { middlewareAuth } from '../../utils/hono_middleware.ts'
import { safeParseSchema } from '../../utils/schema_validation.ts'
import { emailPreferencesPatchSchema, USER_SETTINGS_EMAIL_PREFERENCE_KEYS } from '../../utils/settings_email_preferences.ts'
import { createSignedImageUrl } from '../../utils/storage.ts'
import { supabaseAdmin } from '../../utils/supabase.ts'

/**
 * Account settings of the caller (Settings > Account).
 *
 * Email, password, two-factor authentication and account deletion are intentionally not exposed:
 * they require an interactive, re-authenticated session, and an API key must never be able to take
 * over or delete the account that owns it.
 */
const PROFILE_COLUMNS = 'id, email, first_name, last_name, country, discord_username, format_locale, enable_notifications, opt_for_newsletters, email_preferences, image_url, created_at'

const updateBodySchema = z.object({
  first_name: z.string().trim().min(1).max(100).optional(),
  last_name: z.string().trim().min(1).max(100).optional(),
  country: z.string().trim().max(100).nullable().optional(),
  discord_username: z.string().trim().max(100).nullable().optional(),
  format_locale: z.string().trim().max(35).nullable().optional(),
  enable_notifications: z.boolean().optional(),
  opt_for_newsletters: z.boolean().optional(),
  email_preferences: emailPreferencesPatchSchema(USER_SETTINGS_EMAIL_PREFERENCE_KEYS).optional(),
}).strict()

type ProfileRow = Record<string, unknown> & { id: string, image_url: string | null }

function getCallerId(c: Context<MiddlewareKeyVariables>) {
  const userId = c.get('auth')?.userId
  if (!userId)
    throw quickError(401, 'not_authorized', 'Not authorized')
  return userId
}

async function loadProfile(c: Context<MiddlewareKeyVariables>, userId: string) {
  const { data, error } = await supabaseAdmin(c)
    .from('users')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .single()
  if (error || !data)
    throw quickError(404, 'user_not_found', 'User not found', { error })
  return data as unknown as ProfileRow
}

async function withSignedImage(c: Context<MiddlewareKeyVariables>, profile: ProfileRow) {
  return { ...profile, image_url: await createSignedImageUrl(c, profile.image_url, { userId: profile.id }) ?? '' }
}

export const app = honoFactory.createApp()

app.use('*', useCors)

app.get('/', middlewareAuth(), async (c) => {
  const userId = getCallerId(c)
  return c.json(await withSignedImage(c, await loadProfile(c, userId)))
})

app.put('/', middlewareAuth(), async (c) => {
  const userId = getCallerId(c)
  const parsed = safeParseSchema(updateBodySchema, await getBodyOrQuery<unknown>(c))
  if (!parsed.success)
    throw simpleError('invalid_body', 'Invalid body', { error: parsed.error })
  const { email_preferences: emailPreferencesPatch, ...fields } = parsed.data

  const update: Database['public']['Tables']['users']['Update'] = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined))
  if (emailPreferencesPatch) {
    const current = await loadProfile(c, userId)
    const currentPrefs = (current.email_preferences && typeof current.email_preferences === 'object') ? current.email_preferences as Record<string, boolean> : {}
    update.email_preferences = { ...currentPrefs, ...emailPreferencesPatch }
  }
  if (Object.keys(update).length === 0)
    throw simpleError('invalid_body', 'Nothing to update')

  // Service role write strictly pinned to the authenticated caller's own row.
  const { data, error } = await supabaseAdmin(c)
    .from('users')
    .update(update)
    .eq('id', userId)
    .select(PROFILE_COLUMNS)
    .single()
  if (error || !data)
    throw simpleError('cannot_update_user', 'Cannot update user', { error })
  return c.json(await withSignedImage(c, data as unknown as ProfileRow))
})
