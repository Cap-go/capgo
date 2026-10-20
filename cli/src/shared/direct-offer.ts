// Direct-offer (paid ads) orgs are created without a free trial: stripe_info.trial_at
// equals the org creation time (Cap-go/capgo.app#3782). Normal trials last 15 days,
// so a trial ending within a day of org creation means the org never had one.
// Same rule as the console's isZeroLengthTrial.
const ZERO_LENGTH_TRIAL_MAX_MS = 24 * 60 * 60 * 1000

export const DIRECT_OFFER_PLAN_MESSAGE = 'Choose a plan to start using Capgo. 14-day money-back guarantee. Cancel anytime.'

/** True when the org was created without a free trial (trial_at ~= org created_at). */
export function isZeroLengthTrial(orgCreatedAt: string | null | undefined, trialAt: string | null | undefined): boolean {
  if (!orgCreatedAt || !trialAt)
    return false
  const created = Date.parse(orgCreatedAt)
  const trialEnd = Date.parse(trialAt)
  if (Number.isNaN(created) || Number.isNaN(trialEnd))
    return false
  return trialEnd - created <= ZERO_LENGTH_TRIAL_MAX_MS
}

/** Copy shown when a metered action is blocked because the org has no usable plan. */
export function formatPlanRequiredMessage(plansUrl: string, directOffer: boolean): string {
  return directOffer
    ? `${DIRECT_OFFER_PLAN_MESSAGE}\n Choose a plan here: ${plansUrl}\n`
    : `You need to upgrade your plan to continue to use capgo.\n Upgrade here: ${plansUrl}\n`
}
