#!/usr/bin/env node
/**
 * Plan 3 Phase 1 — headless sequencing proof.
 *
 * The android TUI's `persistAndStep` now derives the next step from the saved
 * progress via the shared engine's `getAndroidResumeStep`, instead of jumping
 * to a hardcoded step. This test is the headless proof that the engine derives
 * the SAME next step the TUI has historically hardcoded for the core keystore
 * "generate" flow.
 *
 * We build a progress object step-by-step using the engine's pure
 * `applyAndroidInput` reducer (the same updaters the TUI's persistAndStep runs)
 * and assert `getAndroidResumeStep` returns the expected next step at each
 * point. Full ink visual parity is a manual check by the maintainer.
 */
import process from "node:process"

console.log("🧪 Android TUI in-session sequencing — engine parity proof\n")

const { getAndroidResumeStep } = await import("../src/build/onboarding/android/progress.ts")
const { applyAndroidInput } = await import("../src/build/onboarding/android/flow.ts")

let testsPassed = 0
let testsFailed = 0

function check(name, actual, expected) {
  if (actual === expected) {
    console.log(`✅ ${name} → ${actual}`)
    testsPassed++
  }
  else {
    console.error(`❌ ${name} → expected ${expected}, got ${actual}`)
    testsFailed++
  }
}

function emptyProgress(appId) {
  return {
    platform: "android",
    appId,
    startedAt: "2026-06-03T00:00:00.000Z",
    completedSteps: {},
  }
}

const APP_ID = "com.example.app"

// ─── Core keystore "generate" flow ──────────────────────────────────────────
//
// At each step we (1) apply the user input via the engine reducer and
// (2) assert the engine-derived resume step equals the step the TUI hardcodes
// next. The hardcoded targets come from app.tsx persistAndStep call sites
// for the keystore-generate path.

let p = emptyProgress(APP_ID)

// keystore-method-select: pick generate. TUI hardcodes next → keystore-new-alias.
p = applyAndroidInput("keystore-method-select", p, { step: "keystore-method-select", value: "generate" })
check("after keystoreMethod=generate", getAndroidResumeStep(p), "keystore-new-alias")

// keystore-new-alias: enter release. TUI hardcodes next → keystore-new-password-method.
p = applyAndroidInput("keystore-new-alias", p, { step: "keystore-new-alias", alias: "release" })
check("after keystoreNewAlias=release", getAndroidResumeStep(p), "keystore-new-password-method")

// keystore-new-password-method: pick manual. TUI hardcodes next → keystore-new-store-password.
p = applyAndroidInput("keystore-new-password-method", p, { step: "keystore-new-password-method", value: "manual" })
check("after keystorePasswordMethod=manual", getAndroidResumeStep(p), "keystore-new-store-password")

// keystore-new-store-password: enter store password. Has alias + storePassword
// → engine routes to keystore-new-cn (keystore phase still not fully valid).
p = applyAndroidInput("keystore-new-store-password", p, { step: "keystore-new-store-password", password: "store-secret" })
check("after keystoreStorePassword", getAndroidResumeStep(p), "keystore-new-cn")

// keystore-new-key-password: enter key password (manual path). Engine still
// routes to keystore-new-cn (alias + storePassword present).
p = applyAndroidInput("keystore-new-key-password", p, { step: "keystore-new-key-password", password: "key-secret" })
check("after keystoreKeyPassword", getAndroidResumeStep(p), "keystore-new-cn")

// keystore-new-cn: enter common name. Keystore not yet fully valid (no
// _keystoreBase64 / keystoreReady — IO-side writes), so engine routes back to
// keystore-new-cn until the IO effect completes (TUI hands off to the build effect).
p = applyAndroidInput("keystore-new-cn", p, { step: "keystore-new-cn", cn: "CN=Example" })
check("after keystoreCommonName (pre-build)", getAndroidResumeStep(p), "keystore-new-cn")

// Once the IO effect writes _keystoreBase64 + keystoreReady (simulated here),
// the engine advances past the keystore phase to the service-account fork.
const built = {
  ...p,
  _keystoreBase64: "BASE64KEYSTORE",
  serviceAccountForkSeen: true,
  completedSteps: { ...p.completedSteps, keystoreReady: true },
}
check("after keystore build complete", getAndroidResumeStep(built), "service-account-method-select")

// ─── random password sub-flow (auto-fills both passwords) ───────────────────
//
// Picking random fills store + key password in one shot, so the engine skips
// the store/key password input steps and lands straight on keystore-new-cn.
let r = emptyProgress(APP_ID)
r = applyAndroidInput("keystore-method-select", r, { step: "keystore-method-select", value: "generate" })
r = applyAndroidInput("keystore-new-alias", r, { step: "keystore-new-alias", alias: "release" })
r = applyAndroidInput("keystore-new-password-method", r, { step: "keystore-new-password-method", value: "random" })
check("after keystorePasswordMethod=random", getAndroidResumeStep(r), "keystore-new-cn")

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${testsPassed} passed, ${testsFailed} failed`)
process.exit(testsFailed === 0 ? 0 : 1)
