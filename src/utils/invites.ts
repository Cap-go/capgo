import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/types/supabase.types'
import { FunctionsHttpError } from '@supabase/supabase-js'

type TranslateFn = (key: string, params?: Record<string, unknown> | string, defaultMsg?: string) => string

export async function resolveInviteNewUserErrorMessage(
  error: unknown,
  t: TranslateFn,
  options: { cancelledFallback?: string } = {},
): Promise<string | null> {
  if (!(error instanceof FunctionsHttpError) || !(error.context instanceof Response))
    return null

  let json: { error?: string, moreInfo?: { reason?: string, cooldown_minutes?: number } } | null = null
  try {
    json = await error.context.clone().json()
  }
  catch {
    return null
  }

  if (json?.error !== 'user_already_invited')
    return null

  const moreInfo = json.moreInfo
  if (moreInfo?.reason === 'invite_cancelled_recently') {
    if (options.cancelledFallback)
      return t('too-recent-invitation-cancelation', options.cancelledFallback)
    return t('too-recent-invitation-cancelation')
  }

  const rawCooldown = moreInfo?.cooldown_minutes
  const cooldownMinutes = Number.isFinite(rawCooldown) ? Number(rawCooldown) : 5
  return t('invitation-resend-wait', { minutes: cooldownMinutes })
}

export async function notifyExistingUserInvite(
  supabase: SupabaseClient<Database>,
  email: string,
  orgId: string,
): Promise<boolean> {
  const { error } = await supabase.functions.invoke('private/send_existing_user_org_invite', {
    body: {
      email,
      org_id: orgId,
    },
  })

  if (error) {
    console.error('Failed to send organization invite email to existing user:', error)
    return false
  }

  return true
}
