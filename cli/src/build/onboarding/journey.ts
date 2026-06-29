// src/build/onboarding/journey.ts
import { randomUUID } from 'node:crypto'

/**
 * A correlation id for a single Builder onboarding journey.
 *
 * Generated once per `build init` / onboarding process (in command.ts) and
 * threaded through every analytics event the wizard emits — per-step funnel
 * events, named action events, workflow-file events, and the terminal
 * quit/cancel event. Without it, the events from one user's run are
 * indistinguishable from another's in PostHog, so a "journey" can't be
 * reconstructed when several runs overlap in the same window.
 *
 * The `bj_` prefix (Builder Journey) makes the id self-identifying in raw
 * analytics payloads and easy to grep for. Scope is one process: a
 * quit-and-resume starts a fresh journey id (cross-run stitching is a possible
 * future enhancement, but each run is still fully correlated on its own).
 */
export function newBuilderJourneyId(): string {
  return `bj_${randomUUID()}`
}
