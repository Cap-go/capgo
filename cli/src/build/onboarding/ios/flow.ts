// src/build/onboarding/ios/flow.ts
//
// iOS onboarding engine skeleton. Mirrors the android engine shapes
// (android/flow.ts) so the platform-agnostic PlatformFlow adapter can wrap it
// the same way android-flow.ts wraps the android engine.
//
// These are deliberately minimal stubs to be filled in by tasks 3B / 3C:
//   - iosViewForStep   → real per-step view-models
//   - applyIosInput    → real progress mutations from user input
//   - runIosEffect     → real async side-effects (Apple API, keychain, build)
//
// iOS reuses the EXISTING master types — OnboardingStep / OnboardingProgress —
// rather than inventing a parallel iOS step union.

import type { OnboardingProgress, OnboardingStep } from '../types.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export type IosStepKind = 'auto' | 'input' | 'choice' | 'done' | 'error'

export interface IosStepOption {
  value: string
  label?: string
  note?: string
}

export interface IosStepView {
  step: OnboardingStep
  kind: IosStepKind
  title?: string
  prompt?: string // 'input' steps
  collect?: string[] // field(s) an 'input' step gathers
  options?: IosStepOption[] // 'choice' steps
  message?: string // 'done' | 'error'
}

/**
 * Per-step runtime context the driver supplies to the view builder. Every
 * field is OPTIONAL so a caller that only passes `{ appId }` still gets a
 * usable view. Fields are added as the iOS view-models are filled in (3B/3C).
 */
export interface IosStepCtx {
  appId?: string
}

/**
 * Async dependencies the iOS effects need (Apple API client, keychain access,
 * build request, etc.). Filled in alongside runIosEffect in 3B/3C.
 */
export interface IosEffectDeps {
  appId?: string
}

export interface IosEffectResult {
  /** Updated progress after the effect ran (matches what was persisted). */
  progress: OnboardingProgress
  /** Explicit next step when not derivable from progress alone (★ transitions). */
  next?: OnboardingStep
  /** Transient runtime data that lives in the driver but is NOT persisted. */
  transient?: Partial<IosStepCtx>
}

// ─── Stubs (to be filled in 3B/3C) ──────────────────────────────────────────────

/**
 * Build the view-model for a given step. Stub: returns a minimal placeholder
 * 'auto' view echoing the step. Real per-step views land in 3B/3C.
 */
export function iosViewForStep(
  step: OnboardingStep,
  _progress: OnboardingProgress,
  _ctx?: IosStepCtx,
): IosStepView {
  return { step, kind: 'auto', title: step }
}

/**
 * Apply a user input to progress. Stub: returns progress unchanged. Real
 * per-step mutations land in 3B/3C.
 */
export function applyIosInput(
  _step: OnboardingStep,
  progress: OnboardingProgress,
  _input: unknown,
): OnboardingProgress {
  return progress
}

/**
 * Run the async side-effect for a step. Stub: not implemented yet — the real
 * Apple-API / keychain / build effects land in 3B/3C.
 */
export function runIosEffect(
  _step: OnboardingStep,
  _progress: OnboardingProgress,
  _deps: IosEffectDeps,
): Promise<IosEffectResult> {
  throw new Error('runIosEffect: not implemented')
}
