// src/build/onboarding/tail-types.ts
//
// Shared mixin for the post-save "tail" of onboarding — the GitHub Actions
// workflow + CI-secret + .env-export sub-flow that runs identically on BOTH the
// iOS (`OnboardingProgress`) and Android (`AndroidOnboardingProgress`) tracks.
//
// Today these values live only as React `useState` hooks inside the two ink
// `ui/app.tsx` components (and are duplicated verbatim between them). This
// interface gives both progress types a single, additive home for those tail
// fields so a future change that persists tail state (for resume) — or the
// stateless MCP engine, which already mirrors the ink state on disk — has ONE
// shape to extend instead of two drifting copies.
//
// Every field is OPTIONAL: existing progress files and existing call sites that
// construct a progress object without the tail keep type-checking unchanged,
// and the JSON save/load round-trip is unaffected (extra optional keys are just
// absent). The field names + types here are copied verbatim from the matching
// `useState` declarations in `ui/app.tsx` and `android/ui/app.tsx` so the two
// stay in lock-step — do not rename them independently of those hooks.

import type { CiSecretTarget } from './ci-secrets.js'
import type { BuildScriptChoice, PackageManager } from './workflow-generator.js'

export interface TailProgress {
  /**
   * The 3-way GitHub Actions setup choice made at `ask-github-actions-setup`.
   * Mirrors `const [setupMode] = useState<…>('undecided')` in both app.tsx.
   */
  setupMode?: 'undecided' | 'with-workflow' | 'secrets-only' | 'declined'
  /**
   * The CI-secrets destination picked at `ci-secrets-target-select`.
   * Mirrors `const [ciSecretTarget] = useState<CiSecretTarget | null>(null)`.
   */
  ciSecretTarget?: CiSecretTarget | null
  /**
   * The package manager chosen at `pick-package-manager`.
   * Mirrors `const [selectedPackageManager] = useState<PackageManager | null>(null)`.
   */
  selectedPackageManager?: PackageManager | null
  /**
   * The build-script choice made at `pick-build-script`.
   * Mirrors `const [buildScriptChoice] = useState<BuildScriptChoice | null>(null)`.
   */
  buildScriptChoice?: BuildScriptChoice | null
  /**
   * The user-supplied `.env` export path entered at `ask-export-env`.
   * Mirrors `const [envExportTargetPath] = useState<string>('')`.
   */
  envExportTargetPath?: string
}
