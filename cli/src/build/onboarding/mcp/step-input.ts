// src/build/onboarding/mcp/step-input.ts
// The interactive android steps and the input field(s) each one accepts. Used to
// enforce step-by-step input: a next_step must carry EXACTLY ONE of the current
// step's allowed fields (and no other android key), or the engine rejects with a
// correction. Each step accepts a single field per call. Store-password steps
// additionally enforce a content rule (matching the ink TUI in app.tsx): the
// new keystore store password must be at least 6 characters and the existing
// keystore store password must be non-empty — see validateStorePassword.
import type { AndroidOnboardingStep } from '../android/types.js'

/** state → the set of input fields that legitimately answer it (in order). */
export const STEP_ALLOWED_FIELDS: Partial<Record<AndroidOnboardingStep, string[]>> = {
  // Data-safety gate shown when saved android credentials already exist. Accepts
  // only the backup-or-cancel choice (mirrors main's CredentialsExistStep).
  'credentials-exist': ['credentialsExistChoice'],
  'keystore-method-select': ['keystoreMethod'],
  'keystore-existing-path': ['keystorePath'],
  // The existing-keystore unlock collects ONLY the store password here. Once it
  // is applied the resume step auto-advances to keystore-existing-detecting-alias
  // — the store-password step never stays to collect a key password, so
  // keystoreKeyPassword is not a legitimate answer at this step (vestigial).
  'keystore-existing-store-password': ['keystoreStorePassword'],
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
  // The GCP project picker accepts EITHER an existing project id OR a new
  // project name — mirroring main's app.tsx onChange, where selecting the
  // "Create a new project" (`__new__`) row routes to the create-name prompt.
  // The strict gate still requires EXACTLY ONE of these per call, so the agent
  // either picks an existing project (gcpProjectId) or creates one
  // (gcpProjectName), never both. persistAndroidInput routes a supplied
  // gcpProjectName through applyAndroidInput('gcp-project-create-name') so
  // gcpProjectChosen{createdByOnboarding:true} is written and gcp-setup-running
  // creates the project.
  'gcp-projects-select': ['gcpProjectId', 'gcpProjectName'],
  'gcp-project-create-name': ['gcpProjectName'],
  'android-package-select': ['androidPackage'],
}

/** The set of all android input keys we govern (for the extras check). */
export const ANDROID_INPUT_KEYS: string[] = [
  'keystoreMethod', 'keystorePath', 'keystoreStorePassword', 'keystoreAlias',
  'keystoreKeyPassword', 'keystoreNewAlias', 'keystorePasswordMethod', 'keystoreCommonName',
  'serviceAccountMethod', 'serviceAccountJsonPath', 'saMethodChoice', 'playDeveloperId',
  'gcpProjectId', 'gcpProjectName', 'androidPackage', 'credentialsExistChoice',
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

/**
 * Content validation for the keystore store-password steps, mirroring the ink
 * TUI onSubmit guards in app.tsx so the stateless MCP path enforces the SAME
 * rule before a value is persisted (and before it can reach keystore-generating):
 *
 *   - keystore-new-store-password  → reject < 6 chars (app.tsx:2575,
 *     'Password must be at least 6 characters')
 *   - keystore-existing-store-password → reject empty (app.tsx:2455,
 *     'Store password cannot be empty')
 *
 * Returns { ok:true } when the value passes (or the step is not a store-password
 * step). On failure returns { ok:false, message } with the exact main wording so
 * the gate can re-render the current step with a corrective summary and persist
 * nothing.
 *
 * @param currentStep the resume step the user is currently on
 * @param storePassword the supplied keystoreStorePassword (or undefined/null)
 */
export function validateStorePassword(
  currentStep: AndroidOnboardingStep,
  storePassword: string | undefined | null,
): { ok: boolean, message?: string } {
  if (storePassword === undefined || storePassword === null)
    return { ok: true }
  if (currentStep === 'keystore-new-store-password') {
    if (storePassword.length < 6)
      return { ok: false, message: 'Password must be at least 6 characters' }
    return { ok: true }
  }
  if (currentStep === 'keystore-existing-store-password') {
    if (storePassword.length === 0)
      return { ok: false, message: 'Store password cannot be empty' }
    return { ok: true }
  }
  return { ok: true }
}
