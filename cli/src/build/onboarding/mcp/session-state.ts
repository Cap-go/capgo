// src/build/onboarding/mcp/session-state.ts
//
// Cross-call carried-state registry for the MCP-conducted onboarding.
//
// The TUI keeps each flow's transient "carried" state in React refs/state for
// the lifetime of the Ink process. The MCP server is the headless equivalent:
// the stdio server process is long-lived, but each onboarding step arrives as a
// separate tool call. This module is where the granular iOS path and the MCP
// tail park their carried transients BETWEEN tool calls, keyed by appId —
// mirroring the oauth-session.ts pending-session registry.
//
// The carried shapes are imported from the flow engines (the single source of
// truth): `IosEffectDeps['carried']` (certData/profileData/teamId/p8Content/
// importedP12Password/picker guards/verify* gate fields/...) and
// `TailEffectDeps['carried']` (savedCredentials/ciSecretEntries/
// ciSecretExistingKeys/workflowIsNew).
//
// Lifecycle per appId:
//   getSession(appId)            → { iosCarried, tailCarried } (created empty on demand)
//   mergeIosCarried(appId, p)    → shallow-merge p into iosCarried (undefined values skipped)
//   mergeTailCarried(appId, p)   → shallow-merge p into tailCarried (undefined values skipped)
//   clearSession(appId)          → drop the entry (idempotent)
//   clearAllSessions()           → drop everything (test isolation)
//
// INVARIANTS — consumers (engine S6/S8 wiring, MCP tail) MUST respect these:
//
//  - State is PROCESS-LOCAL. A server restart loses every session. Consumers
//    MUST degrade gracefully when carried state is absent (the flow engines
//    self-heal: re-derive from progress.json, re-read the .p8 from p8Path,
//    re-scan identities, ...). NEVER crash on a missing carried field.
//
//  - Carried state holds SECRETS (p8Content key bytes, importedP12Password,
//    savedCredentials, ciSecretEntries values). They live ONLY in this
//    process-local registry: they must NEVER serialize into MCP tool results,
//    progress.json, or logs. Tool-result builders must whitelist fields, never
//    spread carried state.
//
//  - Merges are IMMUTABLE: each merge produces a NEW carried object; a
//    previously captured snapshot (a getSession() return) is never mutated.
//    Read fresh via getSession() after any merge.

import type { IosEffectDeps } from '../ios/flow.js'
import type { TailEffectDeps } from '../tail/flow.js'

/** The iOS driver-held transient state — the exact `IosEffectDeps['carried']` shape. */
export type IosCarried = NonNullable<IosEffectDeps['carried']>
/** The tail driver-held transient state — the exact `TailEffectDeps['carried']` shape. */
export type TailCarried = NonNullable<TailEffectDeps['carried']>

export interface OnboardingSessionState {
  iosCarried: IosCarried
  tailCarried: TailCarried
}

const registry = new Map<string, OnboardingSessionState>()

/**
 * Shallow-merge `partial` into `base`, returning a NEW object. Keys whose
 * value is `undefined` are skipped so they leave the prior value intact —
 * callers can pass effect transients straight through without first stripping
 * the fields the effect did not produce.
 */
function mergeDefined<T extends object>(base: T, partial: Partial<T>): T {
  const next: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [key, value] of Object.entries(partial)) {
    if (value !== undefined)
      next[key] = value
  }
  return next as T
}

/**
 * Get the session state for `appId`, creating an empty one on demand.
 * The returned object is the current SNAPSHOT: merges replace the carried
 * objects rather than mutating them, so re-read after merging.
 */
export function getSession(appId: string): OnboardingSessionState {
  const existing = registry.get(appId)
  if (existing)
    return existing
  const created: OnboardingSessionState = { iosCarried: {}, tailCarried: {} }
  registry.set(appId, created)
  return created
}

/**
 * Merge `partial` into the iOS carried state for `appId` and return the new
 * merged carried object. `undefined` values leave the prior value intact.
 */
export function mergeIosCarried(appId: string, partial: Partial<IosCarried>): IosCarried {
  const session = getSession(appId)
  const iosCarried = mergeDefined(session.iosCarried, partial)
  registry.set(appId, { ...session, iosCarried })
  return iosCarried
}

/**
 * Merge `partial` into the tail carried state for `appId` and return the new
 * merged carried object. `undefined` values leave the prior value intact.
 */
export function mergeTailCarried(appId: string, partial: Partial<TailCarried>): TailCarried {
  const session = getSession(appId)
  const tailCarried = mergeDefined(session.tailCarried, partial)
  registry.set(appId, { ...session, tailCarried })
  return tailCarried
}

/**
 * Drop the session entry for `appId`. Idempotent: safe on an absent appId and
 * safe to call twice. The next getSession() recreates a fresh empty session.
 */
export function clearSession(appId: string): void {
  registry.delete(appId)
}

/** Drop every session (test isolation only — production code clears per appId). */
export function clearAllSessions(): void {
  registry.clear()
}
