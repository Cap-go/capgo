// src/build/onboarding/mcp/tail-progress.ts
//
// SLIM post-save tail progress for the MCP driver (S8).
//
// The shared tail (tail/flow.ts) NEVER persists after `saving-credentials`
// deleted progress.json — the TUI deliberately keeps all tail state in memory
// for the lifetime of the Ink process. The MCP server cannot: every step is a
// separate tool call and the server may restart between calls. Per the marker
// contract in android/types.ts ("markers are written by whichever driver
// chooses to persist the tail"), the MCP driver re-uses the EXISTING progress
// stores (saveProgress / saveAndroidProgress) to persist a SLIM file holding
// ONLY:
//
//   - platform / appId / startedAt — file identity;
//   - completedSteps.credentialsSaved / buildRequested / ciSecretsUploaded —
//     the three irreversible-side-effect markers tailResumeStep routes on;
//   - the non-secret TailProgress prefs (setupMode / ciSecretTarget /
//     selectedPackageManager / buildScriptChoice / envExportTargetPath);
//   - activePlatform (android only — the platform resume-routing marker).
//
// EXPLICITLY NO SECRETS — the builders below WHITELIST fields and never spread
// the in-memory progress object (which still carries every pre-save field at
// save time): no keystore passwords, no _keystoreBase64, no
// _serviceAccountKeyBase64, no _oauthRefreshToken, no p8/p12 material, no
// keyId/issuerId/p8Path. Credential material lives ONLY in
// ~/.capgo-credentials/credentials.json (written by the save itself) and in
// the process-local session registry (session-state.ts). After a server
// restart the carried tail secrets are re-derived from loadSavedCredentials(),
// never from this file.

import type { TailProgress } from '../tail-types.js'
import type { AndroidOnboardingProgress } from '../android/types.js'
import type { OnboardingProgress } from '../types.js'

/** The non-secret TailProgress prefs, copied field-by-field (whitelist). */
function tailPrefs(progress: TailProgress): TailProgress {
  return {
    ...(progress.setupMode !== undefined ? { setupMode: progress.setupMode } : {}),
    ...(progress.ciSecretTarget !== undefined ? { ciSecretTarget: progress.ciSecretTarget } : {}),
    ...(progress.selectedPackageManager !== undefined ? { selectedPackageManager: progress.selectedPackageManager } : {}),
    ...(progress.buildScriptChoice !== undefined ? { buildScriptChoice: progress.buildScriptChoice } : {}),
    ...(progress.envExportTargetPath !== undefined ? { envExportTargetPath: progress.envExportTargetPath } : {}),
  }
}

/** Build the slim iOS tail progress — WHITELIST ONLY (see module doc). */
export function slimIosTailProgress(progress: OnboardingProgress): OnboardingProgress {
  const { credentialsSaved, buildRequested, ciSecretsUploaded } = progress.completedSteps
  return {
    platform: 'ios',
    appId: progress.appId,
    startedAt: progress.startedAt,
    completedSteps: {
      ...(credentialsSaved ? { credentialsSaved } : {}),
      ...(buildRequested ? { buildRequested } : {}),
      ...(ciSecretsUploaded ? { ciSecretsUploaded } : {}),
    },
    ...tailPrefs(progress),
  }
}

/** Build the slim Android tail progress — WHITELIST ONLY (see module doc). */
export function slimAndroidTailProgress(progress: AndroidOnboardingProgress): AndroidOnboardingProgress {
  const { credentialsSaved, buildRequested, ciSecretsUploaded } = progress.completedSteps
  return {
    platform: 'android',
    appId: progress.appId,
    startedAt: progress.startedAt,
    activePlatform: 'android',
    completedSteps: {
      ...(credentialsSaved ? { credentialsSaved } : {}),
      ...(buildRequested ? { buildRequested } : {}),
      ...(ciSecretsUploaded ? { ciSecretsUploaded } : {}),
    },
    ...tailPrefs(progress),
  }
}
