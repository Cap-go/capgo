export type BillingPlanBentoState = 'none' | 'paying' | 'trial'

export function buildBillingPlanBentoTags(
  planName: string | null | undefined,
  state: BillingPlanBentoState,
  trialPlanNamesToRemove?: readonly string[] | null,
): { segments: string[], deleteSegments: string[] } {
  if (!planName || state === 'none')
    return { segments: [], deleteSegments: [] }

  const paidPlanTag = `plan:${planName}`
  const trialPlanTag = `trial-plan:${planName}`

  if (state === 'trial') {
    return {
      segments: [trialPlanTag],
      deleteSegments: [],
    }
  }

  const trialPlanNames = trialPlanNamesToRemove?.length ? trialPlanNamesToRemove : [planName]
  return {
    segments: [paidPlanTag],
    deleteSegments: Array.from(new Set(trialPlanNames.map(name => `trial-plan:${name}`))),
  }
}
