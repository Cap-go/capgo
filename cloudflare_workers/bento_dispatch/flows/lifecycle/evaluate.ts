import type { Candidate, LifecycleInput } from './types.ts'
import { withLifecycleCommercialMetadata } from './commercial.ts'
import { progressCandidate, recoveryCandidate } from './recovery.ts'
import { trialCandidate, trialReserved } from './trial.ts'
import { accepted, DAY, iso, ms } from './types.ts'

export interface LifecycleDecision {
  candidate: Candidate | null
  decision: 'send' | 'suppress' | 'wait' | 'unknown'
  reason: string
}

export function evaluateLifecycleDecision(input: LifecycleInput): LifecycleDecision {
  const none = (decision: LifecycleDecision['decision'], reason: string): LifecycleDecision => ({ candidate: null, decision, reason })
  if (!input.creatorTreatment)
    return none('suppress', 'creator_ineligible')
  if (!input.consent)
    return none('suppress', 'recipient_consent_or_membership')
  if (!input.selected)
    return none('suppress', 'product_unselected')
  if (input.paused)
    return none('suppress', 'paused')
  if (input.supportHold)
    return none('suppress', 'support_hold')
  if (!input.billingHealthy)
    return none('unknown', 'billing_unknown')
  // Retained ready notices rely on durable organization readiness and current
  // billing, not on the health or selection of a replaceable app's telemetry.
  const trial = input.sourceHealthy || input.state.checklistCompleteAt ? trialCandidate(input) : null
  if (trial)
    return { candidate: withLifecycleCommercialMetadata(input, trial), decision: 'send', reason: trial.branch }
  if (!input.sourceHealthy || (input.evidence && (!input.evidence.selected || !input.evidence.healthy)))
    return none('unknown', 'source_unknown')
  if (ms(input.evidence?.activeUntil) > ms(input.now))
    return none('wait', 'build_in_progress')
  if (trialReserved(input))
    return none('wait', 'trial_reserved')
  const progress = progressCandidate(input)
  if (progress)
    return { candidate: withLifecycleCommercialMetadata(input, progress), decision: 'send', reason: progress.branch }
  const recovery = recoveryCandidate(input)
  if (recovery)
    return { candidate: withLifecycleCommercialMetadata(input, recovery), decision: 'send', reason: recovery.branch }
  if (input.state.checklistCompleteAt && input.plan && !input.paid && !input.compatibleCredits
    && !accepted(input, `offer:${input.product}`)
    && !input.accepted.some(item => item.product === input.product && item.purpose.startsWith('summary:') && ms(item.acceptedAt) + DAY > ms(input.now))) {
    return { candidate: withLifecycleCommercialMetadata(input, { branch: 'subscription_proposition', purpose: `offer:${input.product}`, context: input.state.checklistCompleteAt, priority: 20, expiresAt: iso(ms(input.now) + DAY) }), decision: 'send', reason: 'subscription_proposition' }
  }
  if (input.paid)
    return none('suppress', 'paid_commercial_suppressed')
  if (input.compatibleCredits)
    return none('suppress', 'usage_credits_commercial_suppressed')
  if (input.state.checklistCompleteAt && !input.plan)
    return none('unknown', 'plan_recommendation_unknown')
  return none('wait', 'no_candidate_due')
}

// Keep the dispatch predicate identical; monitoring only gives its null paths
// explicit reasons and never adds an authorization or activation decision.
export function evaluateLifecycle(input: LifecycleInput): Candidate | null {
  return evaluateLifecycleDecision(input).candidate
}
