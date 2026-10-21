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
