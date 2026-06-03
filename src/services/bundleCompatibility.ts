import { parseRange, rangeIntersects } from '@std/semver'

/**
 * Native package metadata stored per bundle in `app_versions.native_packages`.
 * Mirrors the CLI's `nativePackageSchema` (cli/src/schemas/common.ts).
 */
export interface NativePackage {
  name: string
  version: string
  ios_checksum?: string
  android_checksum?: string
}

/**
 * Reasons a candidate bundle may be incompatible with the installed baseline.
 * Mirrors the CLI's `IncompatibilityReason`. Note `removed_plugin` is part of the
 * shared vocabulary but never emitted here: removing native code is OTA-safe, so
 * a removed package is reported as compatible (matching the CLI).
 */
export type IncompatibilityReason
  = | 'new_plugin'
    | 'removed_plugin'
    | 'version_mismatch'
    | 'ios_code_changed'
    | 'android_code_changed'
    | 'both_platforms_changed'

export type PackageStatus = 'added' | 'removed' | 'changed' | 'unchanged'

/**
 * One package compared between the candidate bundle (the one being viewed /
 * potentially shipped OTA) and the baseline bundle (what is already installed).
 */
export interface PackageComparison {
  name: string
  /** Version in the candidate bundle, or undefined when removed. */
  candidateVersion?: string
  /** Version in the baseline bundle, or undefined when newly added. */
  baselineVersion?: string
  status: PackageStatus
  compatible: boolean
  reasons: IncompatibilityReason[]
}

export interface CompatibilitySummary {
  compatible: boolean
  incompatibleCount: number
  /** Names of packages that block OTA delivery. */
  offenders: string[]
}

function versionsIntersect(candidate: string, baseline: string): boolean {
  try {
    return rangeIntersects(parseRange(candidate), parseRange(baseline))
  }
  catch {
    return false
  }
}

/**
 * Evaluate one package's compatibility, directionally: `candidate` is what would
 * be shipped over-the-air, `baseline` is what the device already runs.
 *
 * Ported from the CLI's `getCompatibilityDetails` (cli/src/utils.ts) so the
 * dashboard verdict matches `capgo bundle compatibility` exactly.
 */
function evaluateReasons(
  candidate: NativePackage | undefined,
  baseline: NativePackage | undefined,
): IncompatibilityReason[] {
  // Removed package (only on baseline): OTA-safe — removing native code is fine.
  if (!candidate)
    return []

  // New native plugin (only on candidate): requires an app-store update.
  if (!baseline)
    return ['new_plugin']

  const reasons: IncompatibilityReason[] = []

  if (!versionsIntersect(candidate.version, baseline.version))
    reasons.push('version_mismatch')

  const iosChanged = candidate.ios_checksum != null && baseline.ios_checksum != null && candidate.ios_checksum !== baseline.ios_checksum
  const androidChanged = candidate.android_checksum != null && baseline.android_checksum != null && candidate.android_checksum !== baseline.android_checksum

  if (iosChanged && androidChanged)
    reasons.push('both_platforms_changed')
  else if (iosChanged)
    reasons.push('ios_code_changed')
  else if (androidChanged)
    reasons.push('android_code_changed')

  return reasons
}

function statusFor(
  candidate: NativePackage | undefined,
  baseline: NativePackage | undefined,
  reasons: readonly IncompatibilityReason[],
): PackageStatus {
  if (candidate && !baseline)
    return 'added'
  if (!candidate && baseline)
    return 'removed'
  // Present in both: "changed" covers a version difference OR a native-code
  // (checksum) change. Deriving from `reasons` keeps status consistent with the
  // compatibility verdict — a same-version bundle whose native code changed must
  // not render as "unchanged" while the verdict flags it as incompatible.
  if (candidate && baseline && (candidate.version !== baseline.version || reasons.length > 0))
    return 'changed'
  return 'unchanged'
}

const STATUS_ORDER: Record<PackageStatus, number> = {
  changed: 0,
  added: 1,
  removed: 2,
  unchanged: 3,
}

/**
 * Compare the candidate bundle's packages against the baseline's. Returns one
 * entry per package present in either bundle, ordered changes-first then by name.
 */
export function comparePackages(
  candidatePackages: readonly NativePackage[],
  baselinePackages: readonly NativePackage[],
): PackageComparison[] {
  const candidateMap = new Map(candidatePackages.map(pkg => [pkg.name, pkg]))
  const baselineMap = new Map(baselinePackages.map(pkg => [pkg.name, pkg]))
  const names = new Set<string>([...candidateMap.keys(), ...baselineMap.keys()])

  const comparisons = [...names].map((name): PackageComparison => {
    const candidate = candidateMap.get(name)
    const baseline = baselineMap.get(name)
    const reasons = evaluateReasons(candidate, baseline)
    return {
      name,
      candidateVersion: candidate?.version,
      baselineVersion: baseline?.version,
      status: statusFor(candidate, baseline, reasons),
      compatible: reasons.length === 0,
      reasons,
    }
  })

  return comparisons.sort((a, b) => {
    const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    return byStatus === 0 ? a.name.localeCompare(b.name) : byStatus
  })
}

/**
 * Aggregate per-package comparisons into an overall OTA-compatibility verdict.
 */
export function summarizeCompatibility(comparisons: readonly PackageComparison[]): CompatibilitySummary {
  const offenders = comparisons.filter(entry => !entry.compatible).map(entry => entry.name)
  return {
    compatible: offenders.length === 0,
    incompatibleCount: offenders.length,
    offenders,
  }
}
