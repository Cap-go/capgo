// Worst-case fixtures for every STATIC onboarding step, in its COMFORTABLE form
// (dense:false — the only form once the dense flag is dropped). Props are the
// worst cases lifted from the existing frame-fit tests (longest ids/messages,
// most options) so the measured floor is a true upper bound.
//
// DYNAMIC steps are intentionally EXCLUDED — they scroll or cut, so they don't
// constrain the static floor:
//   • ai-analysis-prompt / -running / -result  (AI content scrolls)
//   • requesting-build (build log scrolls/tails)
//   • the completed-steps log (cuts to a summary line)
//
// Each entry: { label, el, withProgress }. withProgress=false for the takeover /
// pre-flow frames that hide the progress bar (welcome, no-platform,
// build-complete).
import React from 'react'
import * as ks from '../../src/build/onboarding/ui/steps/android-keystore.tsx'
import * as sa from '../../src/build/onboarding/ui/steps/android-sa-gcp.tsx'
import * as ash from '../../src/build/onboarding/ui/steps/android-shared.tsx'
import * as aci from '../../src/build/onboarding/ui/steps/android-ci.tsx'
import * as cred from '../../src/build/onboarding/ui/steps/ios-credentials.tsx'
import * as imp from '../../src/build/onboarding/ui/steps/ios-import.tsx'
import * as ish from '../../src/build/onboarding/ui/steps/ios-shared.tsx'

const h = React.createElement
const noop = () => {}
// The form we ship: dense is becoming the only form (the comfortable variant is
// being dropped). Measure the floor for dense everywhere.
const C = { dense: true }

const LONG_APP_ID = 'com.acme.enterprise.internal.mobile.companion.app'
const LONG_ERR = 'The service account is valid but has no access to this app in the Play Console. Invite capgo-native-build@your-project.iam.gserviceaccount.com under Users and permissions, grant release access, then retry. (HTTP 403 from androidpublisher.edits.insert)'
const ALIASES = ['release', 'upload', 'androiddebugkey', 'mykeyalias', 'prod', 'staging']
const opt = n => Array.from({ length: n }, (_, i) => ({ label: `Option ${i + 1}`, value: `${i}` }))

/** @returns {{ label: string, el: import('react').ReactElement, withProgress: boolean }[]} */
export function staticStepFixtures() {
  const f = (label, el, withProgress = true) => ({ label, el, withProgress })
  return [
    // ── android-sa-gcp ──────────────────────────────────────────────────────
    f('google-sign-in', h(sa.GoogleSignInStep, { onChoose: noop, ...C })),
    f('google-sign-in-learn-more', h(sa.GoogleSignInLearnMoreStep, { onBack: noop, ...C })),
    f('service-account-method-select', h(sa.ServiceAccountMethodSelectStep, { onChoose: noop, ...C })),
    f('sa-json-existing-path-chooser', h(sa.SaJsonExistingPathStep, { showChooser: true, onChoosePicker: noop, onChooseManual: noop, onSubmitPath: noop, ...C })),
    f('sa-json-existing-path-manual', h(sa.SaJsonExistingPathStep, { showChooser: false, onChoosePicker: noop, onChooseManual: noop, onSubmitPath: noop, ...C })),
    f('sa-json-validation-failed', h(sa.SaJsonValidationFailedStep, { message: LONG_ERR, onChoose: noop, ...C })),
    f('play-developer-id-actions', h(sa.PlayDeveloperIdActionsStep, { onChoose: noop, ...C })),
    f('play-developer-id-input', h(sa.PlayDeveloperIdInputStep, { onSubmit: noop, ...C })),
    f('gcp-projects-select', h(sa.GcpProjectsSelectStep, { projects: Array.from({ length: 8 }, (_, i) => ({ projectId: `proj-${i}`, name: `Project ${i}` })), onSelect: noop, ...C })),
    f('gcp-project-create-name', h(sa.GcpProjectCreateNameStep, { onSubmit: noop, ...C })),
    f('android-package-select', h(sa.AndroidPackageSelectStep, { packages: ['com.x.y', 'com.a.b'], onSelect: noop, ...C })),
    // ── android-keystore ────────────────────────────────────────────────────
    f('keystore-method-select', h(ks.KeystoreMethodSelectStep, { onChoose: noop, ...C })),
    f('keystore-explainer', h(ks.KeystoreExplainerStep, { onBack: noop, ...C })),
    f('keystore-existing-store-password', h(ks.KeystoreExistingStorePasswordStep, { onSubmit: noop, ...C })),
    f('keystore-existing-alias-select', h(ks.KeystoreExistingAliasSelectStep, { aliases: ALIASES, onSelect: noop, ...C })),
    f('keystore-existing-alias', h(ks.KeystoreExistingAliasStep, { onSubmit: noop, ...C })),
    f('keystore-existing-key-password', h(ks.KeystoreExistingKeyPasswordStep, { mode: 'prompt', onSubmit: noop, ...C })),
    f('keystore-new-alias', h(ks.KeystoreNewAliasStep, { onSubmit: noop, ...C })),
    f('keystore-new-password-method', h(ks.KeystoreNewPasswordMethodStep, { onChoose: noop, ...C })),
    f('keystore-new-store-password', h(ks.KeystoreNewStorePasswordStep, { onSubmit: noop, ...C })),
    f('keystore-new-key-password', h(ks.KeystoreNewKeyPasswordStep, { onSubmit: noop, ...C })),
    f('keystore-new-common-name', h(ks.KeystoreNewCommonNameStep, { appId: LONG_APP_ID, onSubmit: noop, ...C })),
    // ── ios-credentials ─────────────────────────────────────────────────────
    f('credentials-exist', h(cred.CredentialsExistStep, { appId: LONG_APP_ID, onChange: noop, ...C })),
    f('setup-method-select', h(cred.SetupMethodSelectStep, { onChange: noop, ...C })),
    f('api-key-instructions', h(cred.ApiKeyInstructionsStep, { canUseFilePicker: true, onMethodChange: noop, onPathSubmit: noop, ...C })),
    f('input-key-id', h(cred.InputKeyIdStep, { keyId: '', onSubmit: noop, ...C })),
    f('input-issuer-id', h(cred.InputIssuerIdStep, { onSubmit: noop, ...C })),
    f('cert-limit-prompt', h(cred.CertLimitPromptStep, { existingCount: 3, options: opt(2), onChange: noop, ...C })),
    f('duplicate-profile-prompt', h(cred.DuplicateProfilePromptStep, { duplicateCount: 4, onChange: noop, ...C })),
    // ── ios-import ──────────────────────────────────────────────────────────
    f('import-distribution-mode', h(imp.ImportDistributionModeStep, { onChange: noop, ...C })),
    f('import-pick-identity', h(imp.ImportPickIdentityStep, { identityCount: 12, options: opt(12), onChange: noop, ...C })),
    f('import-export-warning', h(imp.ImportExportWarningStep, { identityName: 'Apple Distribution: Acme Enterprise Inc (ABCDE12345)', onChange: noop, ...C })),
    // ── shared (with + without progress) ────────────────────────────────────
    f('welcome', h(ish.WelcomeStep), false),
    f('no-platform', h(ash.NoPlatformStep, { androidDir: 'apps/mobile/platforms/android-native', ...C }), false),
    f('credentials-exist-choose', h(ash.CredentialsExistStep, { appId: 'com.x.y', onChoose: noop, ...C })),
    f('build-complete', h(ash.BuildCompleteStep, { uploadSummary: null, buildUrl: 'https://capgo.app/app/com.example.app/builds', ...C }), false),
    f('error', h(ash.ErrorStep, { message: LONG_ERR, onChoose: noop, ...C })),
    // ── ci ──────────────────────────────────────────────────────────────────
    f('ci-secrets-setup', h(aci.CiSecretsSetupStep, { advice: [{ target: 'github', label: 'GitHub', authed: false, installed: true }, { target: 'gitlab', label: 'GitLab', authed: false, installed: false }], onChoose: noop, ...C })),
    f('ci-secrets-target-select', h(aci.CiSecretsTargetSelectStep, { options: opt(8), onChange: noop, ...C })),
    f('ask-ci-secrets', h(aci.AskCiSecretsStep, { entryCount: 12, targetLabel: 'GitLab CI/CD', cli: 'glab', onChoose: noop, ...C })),
  ]
}
