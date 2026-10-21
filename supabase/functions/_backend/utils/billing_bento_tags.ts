import { DIRECT_OFFER_BENTO_TAG } from './direct_offer.ts'

// Trial org that saved a card: its onboarding plan starts when the trial ends.
export const TRIAL_CARD_BENTO_TAG = 'trial-card-on-file'

export type BillingPlanBentoState = 'none' | 'paying' | 'trial'

export function buildBillingPlanBentoTags(
  planName: string | null | undefined,
  state: BillingPlanBentoState,
  trialPlanNamesToRemove?: readonly string[] | null,
): { segments: string[], deleteSegments: string[] } {
  if (state === 'none')
    return { segments: [], deleteSegments: [] }

  if (state === 'trial') {
    return {
      segments: planName ? [`trial-plan:${planName}`] : [],
      deleteSegments: [],
    }
  }
  let trialPlanNames: readonly string[] = []
  if (trialPlanNamesToRemove?.length)
    trialPlanNames = trialPlanNamesToRemove
  else if (planName)
    trialPlanNames = [planName]
  return {
    segments: planName ? [`plan:${planName}`] : [],
    deleteSegments: [...new Set(trialPlanNames.map(name => `trial-plan:${name}`)), TRIAL_CARD_BENTO_TAG],
  }
}

const TRIAL_SEGMENTS = new Set(['trial', 'trial7', 'trial1', 'trial0'])

function isTrialSegment(tag: string) {
  return TRIAL_SEGMENTS.has(tag) || tag.startsWith('trial-plan:')
}

/**
 * Direct-offer (paid ads) users never had a trial: tag them `offer=direct` and
 * never add trial tags, so trial email sequences do not fire for them.
 * Standard users are returned unchanged.
 */
export function applyDirectOfferBentoTags(
  tags: { segments: string[], deleteSegments: string[] },
  isDirectOffer: boolean,
): { segments: string[], deleteSegments: string[] } {
  if (!isDirectOffer)
    return tags
  const removedTrialSegments = tags.segments.filter(isTrialSegment)
  return {
    segments: [...tags.segments.filter(tag => !isTrialSegment(tag)), DIRECT_OFFER_BENTO_TAG],
    deleteSegments: Array.from(new Set([...tags.deleteSegments, ...removedTrialSegments])).filter(tag => tag !== DIRECT_OFFER_BENTO_TAG),
  }
}
