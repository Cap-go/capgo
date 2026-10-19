// Optional "add your card" prompt for trial orgs. Orgs whose app reaches real
// devices usually buy, but only at the end of the trial, so the prompt asks
// early and promises no charge before the trial ends (checkout keeps the
// remaining trial days, see createCheckout).

export type TrialCardPromptMoment = 'activated' | 'mid-trial' | 'trial-ending'

export interface TrialCardPromptState {
  shown: TrialCardPromptMoment[]
  lastShownAt?: number
}

// Below 4 days left, checkout may charge at once (Stripe needs 48h of trial),
// so the "no charge until" promise would be wrong.
export const TRIAL_CARD_PROMPT_MIN_DAYS_LEFT = 4
const MID_TRIAL_MAX_DAYS_LEFT = 8
const TRIAL_ENDING_MAX_DAYS_LEFT = 5
const MIN_HOURS_BETWEEN_PROMPTS = 20
const MOMENT_ORDER: TrialCardPromptMoment[] = ['activated', 'mid-trial', 'trial-ending']
const STORAGE_PREFIX = 'capgo-trial-card-prompt:'

export function getTrialCardPromptMoment(input: {
  trialDaysLeft: number
  paying: boolean
  hasRealDevices: boolean
  state: TrialCardPromptState
  now?: number
}): TrialCardPromptMoment | null {
  const { trialDaysLeft, paying, hasRealDevices, state } = input
  const now = input.now ?? Date.now()
  if (paying || !hasRealDevices || trialDaysLeft < TRIAL_CARD_PROMPT_MIN_DAYS_LEFT)
    return null
  if (state.lastShownAt && now - state.lastShownAt < MIN_HOURS_BETWEEN_PROMPTS * 60 * 60 * 1000)
    return null

  // The latest moment that applies wins: an org that reaches devices late in
  // the trial gets one prompt, not three in a row.
  let moment: TrialCardPromptMoment = 'activated'
  if (trialDaysLeft <= TRIAL_ENDING_MAX_DAYS_LEFT)
    moment = 'trial-ending'
  else if (trialDaysLeft <= MID_TRIAL_MAX_DAYS_LEFT)
    moment = 'mid-trial'
  return state.shown.includes(moment) ? null : moment
}

export function markTrialCardPromptShown(state: TrialCardPromptState, moment: TrialCardPromptMoment, now = Date.now()): TrialCardPromptState {
  // Showing a moment also closes the earlier ones.
  const shown = new Set(state.shown)
  for (const candidate of MOMENT_ORDER.slice(0, MOMENT_ORDER.indexOf(moment) + 1))
    shown.add(candidate)
  return { shown: [...shown], lastShownAt: now }
}

export function readTrialCardPromptState(orgId: string, storage: Pick<Storage, 'getItem'> = localStorage): TrialCardPromptState {
  try {
    const parsed = JSON.parse(storage.getItem(`${STORAGE_PREFIX}${orgId}`) ?? 'null') as Partial<TrialCardPromptState> | null
    const shown = Array.isArray(parsed?.shown)
      ? parsed.shown.filter((moment): moment is TrialCardPromptMoment => MOMENT_ORDER.includes(moment as TrialCardPromptMoment))
      : []
    return { shown, lastShownAt: typeof parsed?.lastShownAt === 'number' ? parsed.lastShownAt : undefined }
  }
  catch {
    return { shown: [] }
  }
}

export function writeTrialCardPromptState(orgId: string, state: TrialCardPromptState, storage: Pick<Storage, 'setItem'> = localStorage) {
  try {
    storage.setItem(`${STORAGE_PREFIX}${orgId}`, JSON.stringify(state))
  }
  catch {
    // Storage can be full or blocked; the prompt then simply shows again later.
  }
}

export function getTrialEndDate(trialDaysLeft: number, now = Date.now()) {
  return new Date(now + trialDaysLeft * 24 * 60 * 60 * 1000)
}
