// src/build/onboarding/mcp/step-input.ts
// The interactive android steps and the input field(s) each one accepts. Used to
// enforce step-by-step input: a next_step must carry EXACTLY ONE of the current
// step's allowed fields (and no other android key), or the engine rejects with a
// correction. Most steps accept a single field; a few navigation states collect
// a small set across consecutive calls while the resume step does not change
// (e.g. the existing-keystore unlock stays on keystore-existing-store-password
// while it gathers the store password and then, if needed, the key password).
import type { AndroidOnboardingStep } from '../android/types.js'

/** state → the set of input fields that legitimately answer it (in order). */
export const STEP_ALLOWED_FIELDS: Partial<Record<AndroidOnboardingStep, string[]>> = {
  'keystore-method-select': ['keystoreMethod'],
  'keystore-existing-path': ['keystorePath'],
  // The existing-keystore unlock collects the store password, then (if needed) the
  // key password, while the resume step can stay on store-password — accept both.
  'keystore-existing-store-password': ['keystoreStorePassword', 'keystoreKeyPassword'],
  'keystore-existing-alias-select': ['keystoreAlias'],
  'keystore-existing-alias': ['keystoreAlias'],
  'keystore-existing-key-password': ['keystoreKeyPassword'],
  'keystore-new-alias': ['keystoreNewAlias'],
  // The password-method screen accepts only the random|manual choice. After
  // "manual" the flow advances to keystore-new-store-password (its own step),
  // where the store password is collected — it is never batched here.
  'keystore-new-password-method': ['keystorePasswordMethod'],
  'keystore-new-store-password': ['keystoreStorePassword'],
  'keystore-new-key-password': ['keystoreKeyPassword'],
  'keystore-new-cn': ['keystoreCommonName'],
  'service-account-method-select': ['serviceAccountMethod'],
  'sa-json-existing-path': ['serviceAccountJsonPath'],
  'sa-json-validation-failed': ['saMethodChoice'],
  'play-developer-id-input': ['playDeveloperId'],
  'gcp-projects-select': ['gcpProjectId'],
  'gcp-project-create-name': ['gcpProjectName'],
  'android-package-select': ['androidPackage'],
}

/** The set of all android input keys we govern (for the extras check). */
export const ANDROID_INPUT_KEYS: string[] = [
  'keystoreMethod', 'keystorePath', 'keystoreStorePassword', 'keystoreAlias',
  'keystoreKeyPassword', 'keystoreNewAlias', 'keystorePasswordMethod', 'keystoreCommonName',
  'serviceAccountMethod', 'serviceAccountJsonPath', 'saMethodChoice', 'playDeveloperId',
  'gcpProjectId', 'gcpProjectName', 'androidPackage',
]

/**
 * Validate an incoming next_step input against the step it answers.
 *
 * Returns { ok:true } when the input carries EXACTLY ONE of the step's allowed
 * fields and no other governed android key. Otherwise { ok:false } with the
 * allowed fields + the offending extra keys for a corrective message.
 *
 * Steps with no allowed-field entry (auto/sign-in/no-field) are not governed and
 * always pass — the strict gate only constrains interactive input steps.
 *
 * @param currentStep the resume step the user is currently on
 * @param input the next_step input object
 */
export function validateStepInput(
  currentStep: AndroidOnboardingStep,
  input: Record<string, unknown>,
): { ok: boolean, allowedFields?: string[], extras: string[] } {
  const allowed = STEP_ALLOWED_FIELDS[currentStep]
  const presentAndroidKeys = ANDROID_INPUT_KEYS.filter(k => input[k] !== undefined && input[k] !== null)
  if (!allowed)
    return { ok: true, extras: [] } // auto / no-field step — not governed
  const presentAllowed = presentAndroidKeys.filter(k => allowed.includes(k))
  const extras = presentAndroidKeys.filter(k => !allowed.includes(k))
  // Exactly one allowed field, and no other governed key. (One field per call.)
  const ok = presentAllowed.length === 1 && extras.length === 0
  return { ok, allowedFields: allowed, extras }
}
