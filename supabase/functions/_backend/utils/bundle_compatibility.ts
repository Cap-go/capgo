import { parseRange, rangeIntersects } from '@std/semver'

export interface NativePackage {
  name: string
  version: string
  ios_checksum?: string
  android_checksum?: string
}

export type IncompatibilityReason
  = | 'new_plugin'
    | 'removed_plugin'
    | 'version_mismatch'
    | 'ios_code_changed'
    | 'android_code_changed'
    | 'both_platforms_changed'

export type PackageStatus = 'added' | 'removed' | 'changed' | 'unchanged'

export interface PackageComparison {
  name: string
  candidateVersion?: string
  baselineVersion?: string
  candidateIosChecksum?: string
  baselineIosChecksum?: string
  candidateAndroidChecksum?: string
  baselineAndroidChecksum?: string
  status: PackageStatus
  compatible: boolean
  reasons: IncompatibilityReason[]
}

export interface CompatibilitySummary {
  compatible: boolean
  incompatibleCount: number
  offenders: string[]
}

export interface DeploymentHistoryEntry {
  id: number
  version_id: number
  deployed_at: string | null
  created_at?: string | null
}

export interface DeploymentPair {
  current: DeploymentHistoryEntry
  previous: DeploymentHistoryEntry
}

const STATUS_ORDER: Record<PackageStatus, number> = {
  changed: 0,
  added: 1,
  removed: 2,
  unchanged: 3,
}

function versionsIntersect(candidate: string, baseline: string): boolean {
  try {
    return rangeIntersects(parseRange(candidate), parseRange(baseline))
  }
  catch {
    return false
  }
}

function getIncompatibilityReasons(
  candidate: NativePackage | undefined,
  baseline: NativePackage | undefined,
): IncompatibilityReason[] {
  if (!candidate)
    return []

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
  if (candidate && baseline && (candidate.version !== baseline.version || reasons.length > 0))
    return 'changed'
  return 'unchanged'
}

export function compareNativePackages(
  candidatePackages: readonly NativePackage[],
  baselinePackages: readonly NativePackage[],
): PackageComparison[] {
  const candidateMap = new Map(candidatePackages.map(pkg => [pkg.name, pkg]))
  const baselineMap = new Map(baselinePackages.map(pkg => [pkg.name, pkg]))
  const names = new Set<string>([...candidateMap.keys(), ...baselineMap.keys()])

  return [...names].map((name): PackageComparison => {
    const candidate = candidateMap.get(name)
    const baseline = baselineMap.get(name)
    const reasons = getIncompatibilityReasons(candidate, baseline)
    return {
      name,
      candidateVersion: candidate?.version,
      baselineVersion: baseline?.version,
      candidateIosChecksum: candidate?.ios_checksum,
      baselineIosChecksum: baseline?.ios_checksum,
      candidateAndroidChecksum: candidate?.android_checksum,
      baselineAndroidChecksum: baseline?.android_checksum,
      status: statusFor(candidate, baseline, reasons),
      compatible: reasons.length === 0,
      reasons,
    }
  }).sort((a, b) => {
    const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    return byStatus === 0 ? a.name.localeCompare(b.name) : byStatus
  })
}

export function summarizeBundleCompatibility(comparisons: readonly PackageComparison[]): CompatibilitySummary {
  const offenders = comparisons.filter(entry => !entry.compatible).map(entry => entry.name)
  return {
    compatible: offenders.length === 0,
    incompatibleCount: offenders.length,
    offenders,
  }
}

export function selectCurrentDeploymentPair(
  deployments: readonly DeploymentHistoryEntry[],
  currentVersionId: number,
): DeploymentPair | undefined {
  const currentIndex = deployments.findIndex(row => row.version_id === currentVersionId)
  if (currentIndex < 0)
    return undefined

  const current = deployments[currentIndex]
  const previous = deployments[currentIndex + 1]
  if (!previous)
    return undefined

  return { current, previous }
}
