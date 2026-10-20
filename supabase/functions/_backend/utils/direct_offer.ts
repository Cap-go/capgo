import type { Context } from 'hono'
import { cloudlogErr, serializeError } from './logging.ts'
import { supabaseAdmin } from './supabase.ts'

/**
 * Paid-ads signups ("pay first") carry `offer = 'direct'` in their auth user
 * metadata. Their orgs get no free trial: trial_at is set to the creation time.
 * Only this exact value has any effect. Keep in sync with
 * public.generate_org_user_stripe_info_on_org_create().
 */
export const DIRECT_OFFER = 'direct'
export const DEFAULT_TRIAL_DAYS = 15

export function isDirectOfferMetadata(metadata: Record<string, unknown> | null | undefined): boolean {
  return metadata?.offer === DIRECT_OFFER
}

export function computeNewOrgTrialEnd(isDirectOffer: boolean, now = new Date()): Date {
  const trialAt = new Date(now)
  if (!isDirectOffer)
    trialAt.setDate(trialAt.getDate() + DEFAULT_TRIAL_DAYS)
  return trialAt
}

/** Trial end for a new org created by `creatorId`; falls back to the standard trial if the lookup fails. */
export async function resolveNewOrgTrialEnd(c: Context, creatorId: string | null | undefined): Promise<Date> {
  if (!creatorId)
    return computeNewOrgTrialEnd(false)
  try {
    const { data, error } = await supabaseAdmin(c).auth.admin.getUserById(creatorId)
    if (error)
      throw error
    return computeNewOrgTrialEnd(isDirectOfferMetadata(data.user?.user_metadata as Record<string, unknown> | undefined))
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'direct offer lookup failed, using default trial', userId: creatorId, error: serializeError(error) })
    return computeNewOrgTrialEnd(false)
  }
}
