# Bundle Dependency Compatibility View — Design

Date: 2026-05-30
Status: Approved for implementation
Related PR (precursor): #2373 (fixed empty compare picker by gating on `native_packages`)

## Problem

The bundle **Dependencies** tab (`src/pages/app/[app].bundle.[bundle].dependencies.vue`)
can compare two bundles, but it only shows a **version diff** ("changed" vs
"unchanged" counts, and lists only changed packages). It does not tell the user
the thing that actually matters: **is shipping this bundle over-the-air (OTA) safe,
or does it require an app-store update?** — which is exactly what the CLI
`capgo bundle compatibility` command answers.

This design upgrades the tab to:
1. Show every package with an explicit, color-coded status (changed / added /
   removed / unchanged), each with the relevant version(s).
2. Show a CLI-grade **compatibility verdict** banner (compatible ✅ / not
   compatible ❌ + reasons).

## Direction (decided)

The verdict is directional. The **viewed bundle is the candidate update**; the
bundle chosen in "Compare with bundle" is the **installed baseline**. The verdict
answers: *"Can devices running the compare (baseline) bundle safely receive the
viewed (candidate) bundle over-the-air?"* This matches the CLI semantics
(`local` = candidate being uploaded, `remote` = what's already deployed).

Implication: a **newly added** native plugin in the candidate is the cause of
incompatibility (the installed app lacks that native code → needs app-store
update). A **removed** plugin is OTA-safe.

## Data model

`app_versions.native_packages` is `jsonb[]`; each entry:

```ts
interface NativePackage {
  name: string
  version: string
  ios_checksum?: string
  android_checksum?: string
}
```

Confirmed against prod data: entries can carry `ios_checksum` / `android_checksum`
(not just version). The verdict uses these — a version match with a changed native
checksum is still incompatible (native code changed).

## Compatibility algorithm (ported from CLI `getCompatibilityDetails`)

For each package, compare candidate (`local`) vs baseline (`remote`):

- **No candidate version (removed):** compatible. "Package only exists on baseline
  (will be removed)" — OTA-safe.
- **Candidate present, no baseline version (added/new plugin):** **incompatible**,
  reason `new_plugin` — requires app-store update.
- **Both present:**
  - version ranges don't intersect (`@std/semver` `parseRange` + `rangeIntersects`)
    → reason `version_mismatch`.
  - `ios_checksum` differs (both present) → reason `ios_code_changed`.
  - `android_checksum` differs (both present) → reason `android_code_changed`.
  - both checksums differ → reason `both_platforms_changed`.
  - no reasons → compatible.

Overall verdict = incompatible if **any** package is incompatible.

This logic lives in a new shared util so the page stays thin and the logic is
unit-testable: `src/services/bundleCompatibility.ts`.

## Per-package status + color scheme (decided)

| Status | Color | Display | Meaning |
|---|---|---|---|
| changed | blue | `old → new` | present in both, version differs |
| added | green | `New · <version>` | only in candidate (cause of incompat) |
| removed | red | `Removed · <version>` | only in baseline (OTA-safe) |
| unchanged | gray | `Unchanged · <version>` | present in both, identical version |

- When no compare bundle is selected, fall back to current behavior: a plain list
  of the viewed bundle's packages (status concept doesn't apply with one bundle).
- With a compare bundle selected: list **all** packages (changed first, then
  added/removed, then unchanged), each with a colored pill + left-border accent.
- Counts row: Changed / Added / Removed / Unchanged / Total.

Color tokens follow existing Tailwind/DaisyUI usage already in the file
(blue-100/800, emerald, red, slate for gray), dark-mode variants included.

## Compatibility verdict banner (decided)

Shown only when a compare bundle is selected (a verdict needs a baseline):

- ✅ **Compatible** (green banner): "This bundle can be delivered over-the-air to
  devices running {baseline}."
- ❌ **Not compatible** (red banner): "{n} package(s) require an app-store update."
  followed by the offending packages and their reason text (new native plugin /
  version change / iOS or Android native code changed), reusing the CLI's reason
  → message mapping.

Note on the green-added / red-verdict tension: an added package shows green in the
diff (it *was* added) but is named in the red verdict banner as a cause of
incompatibility. The banner lists offending packages by name so the two readings
never contradict.

## Components / files

- **New:** `src/services/bundleCompatibility.ts` — pure functions:
  - `NativePackage`, `CompatibilityReason`, `PackageComparison` types
  - `comparePackages(candidate, baseline)` → `PackageComparison[]` (status + reasons + versions)
  - `summarizeCompatibility(comparisons)` → `{ compatible, incompatibleCount, offenders }`
  - Uses `@std/semver` `parseRange` + `rangeIntersects` (same as CLI).
- **Edit:** `src/pages/app/[app].bundle.[bundle].dependencies.vue` — replace the
  diff-only computeds + table with status-aware rendering and the verdict banner.
  Keep existing data fetching, `BundleCompareSelect`, caching, request-id guards.
- **i18n:** add keys to `messages/en.json` (source of truth; `fallbackLocale: 'en'`
  so other locales fall back gracefully — no need to translate 15 files in this PR).

## Out of scope

- No backend/schema/API changes.
- No changes to the Manifest tab.
- Not wiring the verdict into the channel-set flow (that already has its own toast).

## Test plan

- Unit tests for `bundleCompatibility.ts`: added/removed/changed/unchanged,
  version-range intersect, checksum-only change, new-plugin incompatibility,
  overall verdict aggregation.
- Manual: on `me.wcaleniewolny.test.ionic.vue2`, view `1.0.7-c`, compare with
  `0.0.0`:
  - 3 changed rows (blue, `8.3.4 → 8.1.0` ×2, `8.46.1 → 8.45.9`).
  - Verdict ❌ Not compatible (version mismatches + updater checksum change).
- Manual: compare two identical bundles → all gray unchanged, verdict ✅.
- Dev server points at **prod DB** for manual testing (plain `vite`, default branch
  → prod config; do NOT use `serve:dev`).
