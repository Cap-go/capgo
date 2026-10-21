import type { Context } from 'hono'
import { cloudlogErr, serializeError } from './logging.ts'

/**
 * Paid-ads signups ("pay first") carry `offer = 'direct'` in their auth user
 * metadata. Their orgs get no free trial: trial_at is set to the creation time.
 * Only this exact value has any effect. Keep in sync with
 * public.generate_org_user_stripe_info_on_org_create().
 */
export const DIRECT_OFFER = 'direct'
export const DEFAULT_TRIAL_DAYS = 15
/** Bento tag for direct-offer users. They never get trial tags. */
export const DIRECT_OFFER_BENTO_TAG = 'offer=direct'

/**
 * Minimal admin client shape used for lookups. Callers pass supabaseAdmin(c);
 * taking it as a parameter keeps this module free of an import cycle with
 * supabase.ts.
 */
interface DirectOfferAdminClient {
  auth: { admin: { getUserById: (id: string) => PromiseLike<{ data: { user: { user_metadata?: Record<string, unknown> } | null }, error: unknown }> } }
}

export function isDirectOfferMetadata(metadata: Record<string, unknown> | null | undefined): boolean {
  return metadata?.offer === DIRECT_OFFER
}

export function computeNewOrgTrialEnd(isDirectOffer: boolean, now = new Date()): Date {
  const trialAt = new Date(now)
  if (!isDirectOffer)
    trialAt.setDate(trialAt.getDate() + DEFAULT_TRIAL_DAYS)
  return trialAt
}

/**
 * Whether `userId` signed up through the direct offer. By default a failed
 * lookup is logged and treated as "not direct" (fine for Bento tagging, which
 * is recomputed later). Entitlement callers pass `throwOnError: true` so a
 * transient failure never persists a trial the user should not get.
 */
export async function isDirectOfferUser(
  c: Context,
  admin: DirectOfferAdminClient,
  userId: string | null | undefined,
  options: { throwOnError?: boolean } = {},
): Promise<boolean> {
  if (!userId)
    return false
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId)
    if (error)
      throw error
    return isDirectOfferMetadata(data.user?.user_metadata)
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: options.throwOnError ? 'direct offer lookup failed' : 'direct offer lookup failed, treating user as standard', userId, error: serializeError(error) })
    if (options.throwOnError)
      throw error
    return false
  }
}

/**
 * Trial end for a new org created by `creatorId`. Without a creator the
 * standard trial applies; a failed lookup is rethrown so callers fail (and
 * retry) instead of persisting a 15-day trial for a direct-offer user.
 */
export async function resolveNewOrgTrialEnd(c: Context, admin: DirectOfferAdminClient, creatorId: string | null | undefined): Promise<Date> {
  return computeNewOrgTrialEnd(await isDirectOfferUser(c, admin, creatorId, { throwOnError: true }))
}
