// src/build/onboarding/ios/progress.ts
//
// TOTAL iOS resume routing.
//
// `getIosResumeStep` extends the PARTIAL `getResumeStep` (in ../progress.ts)
// into a TOTAL resume over persisted state, exactly as `getAndroidResumeStep`
// did for android. It adds the FRONT gates that, on main, live only as
// `setStep` calls inside the ink TUI (and so are invisible to a stateless
// resume):
//
//   Phase 0 — data-safety gate (`_credentialsExistGate`)
//             'pending' → credentials-exist   (backup-or-cancel choice)
//             'backup'  → backing-up          (the backup effect must still run)
//   Phase 1 — confirm-app-id gate
//             a persisted bundle-id mismatch awaiting confirmation
//             (`pendingAppIdNext` set AND !appIdConfirmed) → confirm-app-id
//
// Everything AFTER the gates — the create-new / import `.p8`-chain / cert /
// profile → `saving-credentials` routing — is delegated VERBATIM to the
// existing `getResumeStep`, so:
//   - the intentional `verifying-key` round-trip on import app_store resume is
//     preserved (risk #4 in the audit): when all three .p8 inputs are present
//     `getResumeStep` returns `verifying-key`, never short-circuiting on
//     `completedSteps.apiKeyVerified`;
//   - the existing exported `getResumeStep` stays byte-for-byte unchanged (the
//     ink TUI still imports it), so its regression tests stay green.
//
// BATCH 0 deliberately does NOT route into the post-save tail — the terminal
// here stays `saving-credentials` exactly as `getResumeStep` returns it. The
// shared-tail routing (Phase 2 in the audit) is added in BATCH 1.
//
// CRITICAL — resume can ONLY land on persisted-state-derivable steps. The
// ephemeral import picker steps (`import-pick-identity` / `import-pick-profile`,
// `import-checking-apple-cert`, `import-validating-all-certs`,
// `import-no-match-recovery`, the recovery sub-steps) are NEVER resume targets:
// on resume the engine lands on `import-scanning` (or the .p8 chain), the scan
// effect re-populates the ephemeral inventory into transient, and the picker is
// re-rendered. This contract is inherited from `getResumeStep` (it returns
// `import-scanning`, not a picker) — the gates added here never introduce a
// picker target either.
//
// PURE / IO-FREE — this function only reads `progress`; it never performs an FS
// read (the bundle-id mismatch detection that decides whether a `confirm-app-id`
// gate is needed is a SYNC FS read done by the DRIVER, which records the result
// as the persisted `pendingAppIdNext` / `appIdConfirmed` fields this function
// reads).

import type { OnboardingProgress, OnboardingStep } from '../types.js'
import { getResumeStep } from '../progress.js'

export function getIosResumeStep(progress: OnboardingProgress | null): OnboardingStep {
  if (!progress)
    return 'welcome'

  // Phase 0 — Data-safety gate. When saved iOS credentials already exist for
  // this appId, the engine routes through `credentials-exist` (backup-or-cancel
  // choice) and, on backup, `backing-up` (the credentials.json → dated copy)
  // BEFORE entering the setup-method fork — mirroring main's ink TUI. The gate
  // lifecycle lives in `_credentialsExistGate`; only 'pending'/'backup' park the
  // user on a gate step. 'done'/'cancel'/undefined fall through to the normal
  // routing below (the driver handles 'cancel' as a hard stop).
  if (progress._credentialsExistGate === 'pending')
    return 'credentials-exist'
  if (progress._credentialsExistGate === 'backup')
    return 'backing-up'

  // Phase 1 — confirm-app-id gate. Only shown when `capacitor.config.appId` and
  // `project.pbxproj` disagree — a mismatch the DRIVER detects via a sync FS
  // read and records by persisting `pendingAppIdNext` (the router target). This
  // pure function never re-runs that detection; it lands on the gate only while
  // a mismatch is pending (`pendingAppIdNext` set) and the user has not yet
  // confirmed (`!appIdConfirmed`). Once confirmed, the gate is skipped so resume
  // never re-asks. Legacy/in-flight files (no `pendingAppIdNext`) skip it.
  if (progress.pendingAppIdNext && !progress.appIdConfirmed)
    return 'confirm-app-id'

  // Phases 2+ — create-new / import `.p8`-chain / cert / profile →
  // saving-credentials. Delegated VERBATIM to the existing partial resume so the
  // import app_store `verifying-key` round-trip (and every other already-tested
  // branch) is preserved unchanged. BATCH 1 will interpose the shared-tail
  // router before this fall-through; for now the terminal stays
  // `saving-credentials`.
  return getResumeStep(progress)
}
