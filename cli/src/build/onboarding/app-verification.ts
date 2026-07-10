/**
 * Pure decision logic for the iOS "verify App Store app" onboarding step.
 *
 * No filesystem, network, or React access — every input (the local Release
 * build ID, the remote App Store Connect apps, and the registered bundle IDs)
 * is passed in so the module stays synchronous and unit-testable, mirroring
 * `decideBuilderCtaSurface` / `shouldBlockIncompatibleUpload` in
 * `cli/src/bundle/builder-cta.ts`.
 *
 * The single invariant the step enforces (always `app_store` mode): an App
 * Store Connect app must exist whose `bundleId` equals the Release build ID.
 */

/**
 * Classification of why (and whether) the verification invariant is met.
 *
 * - `exact-match`            — an ASC app's bundle ID == the Release build ID. Pass.
 * - `wrong-build-id`         — apps exist but none match → likely a wrong build ID (Path A).
 * - `no-app-identifier-exists` — no apps at all, but the identifier is already
 *                              registered in the Developer portal (Path B; the
 *                              ASC new-app form can select the existing id).
 * - `no-app-unregistered`    — no apps at all and the identifier is not yet
 *                              registered (Path B; register first, then create).
 *
 * `no-apps-in-account` is the umbrella for the `apps.length === 0` cases. We
 * keep it in the union because the analytics/step layer surfaces it as a
 * coarse result, but `classifyAppVerification` deliberately returns the finer
 * registered/unregistered split because that distinction is what changes the
 * actionable Path B wording ("identifier already exists" vs "will be
 * registered"). The umbrella value is therefore never returned by the
 * classifier itself.
 */
export type AppVerifyResult
  = | 'exact-match'
    | 'wrong-build-id'
    | 'no-app-identifier-exists'
    | 'no-app-unregistered'
    | 'no-apps-in-account'

/** Minimal shape of an App Store Connect app needed for verification. */
export interface AscAppLike {
  bundleId: string
  name: string
}

export interface ClassifyAppVerificationInput {
  /** The authoritative Release `PRODUCT_BUNDLE_IDENTIFIER` from the project. */
  releaseBundleId: string
  /** Apps that actually exist in the user's App Store Connect account. */
  apps: AscAppLike[]
  /** Bundle IDs registered in the Apple Developer portal (diagnostic only). */
  registeredBundleIds: string[]
}

export interface ClassifyAppVerificationResult {
  result: AppVerifyResult
  /** The matched ASC app when `result === 'exact-match'`, else `null`. */
  matchedApp: AscAppLike | null
}

/**
 * Pure classification of the verification invariant.
 *
 * 1. An app whose `bundleId === releaseBundleId` → `exact-match` (+ that app).
 * 2. Otherwise, if any apps exist → `wrong-build-id` (the build signs an id that
 *    matches none of the account's apps).
 * 3. Otherwise (no apps), if `releaseBundleId` is already registered →
 *    `no-app-identifier-exists`.
 * 4. Otherwise (no apps, not registered) → `no-app-unregistered`.
 */
export function classifyAppVerification(input: ClassifyAppVerificationInput): ClassifyAppVerificationResult {
  const matchedApp = input.apps.find(app => app.bundleId === input.releaseBundleId) ?? null
  if (matchedApp)
    return { result: 'exact-match', matchedApp }

  if (input.apps.length > 0)
    return { result: 'wrong-build-id', matchedApp: null }

  if (input.registeredBundleIds.includes(input.releaseBundleId))
    return { result: 'no-app-identifier-exists', matchedApp: null }

  return { result: 'no-app-unregistered', matchedApp: null }
}

/** Which resolution path the verification gate is enforcing. */
export type GatePath = 'fix-build-id' | 'create-app'

export interface EvaluateGateInput {
  /** Whether the invariant now holds (re-checked live on each Continue). */
  satisfied: boolean
  /** 1-based count of blocked Continue attempts so far. */
  attempt: number
}

export interface EvaluateGateResult {
  /** Whether the user may proceed past the step. */
  proceed: boolean
  /**
   * How loud the (still-blocked) warning box should be. `0` when satisfied;
   * otherwise the attempt count clamped to `3` so the escalation tops out
   * instead of growing unbounded.
   */
  escalationLevel: number
}

/** Maximum escalation level for a repeatedly-blocked gate. */
const MAX_ESCALATION_LEVEL = 3

/**
 * Pure gate decision. When the invariant is satisfied the user proceeds with no
 * escalation; otherwise they are blocked and the escalation level is the attempt
 * count capped at {@link MAX_ESCALATION_LEVEL} so the warning box can ramp its
 * treatment without overflowing.
 */
export function evaluateGate(input: EvaluateGateInput): EvaluateGateResult {
  if (input.satisfied)
    return { proceed: true, escalationLevel: 0 }

  return { proceed: false, escalationLevel: Math.min(input.attempt, MAX_ESCALATION_LEVEL) }
}
