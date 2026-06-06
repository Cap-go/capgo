// src/build/prescan/registry.ts
import type { PrescanCheck } from './types'
import { keystoreExpiry, keystoreOpens } from './checks/android-keystore'
import { agp8PackageAttr, cordovaVarsPresent, flavorExists, gradlePropsHeuristics, playSaJson } from './checks/android-project'
import { credentialsSaved } from './checks/credentials'
import { ascKeyValid, p12Expiry, p12Opens } from './checks/ios-certs'
import { infoplistSanity } from './checks/ios-plist'
import { certProfilePairing, profileBundleMatch, profileExpiry, profileTypeVsMode, targetsCovered } from './checks/ios-profiles'
import { bundleIdConsistency, capSyncStale, nodeLinkerLayout } from './checks/shared'
import { apikeyPermission, appExists } from './checks/shared-remote'

export const ALL_CHECKS: PrescanCheck[] = [
  apikeyPermission, appExists, credentialsSaved,
  capSyncStale, nodeLinkerLayout, bundleIdConsistency,
  p12Opens, p12Expiry, profileExpiry, profileBundleMatch, profileTypeVsMode,
  certProfilePairing, targetsCovered, infoplistSanity, ascKeyValid,
  keystoreOpens, keystoreExpiry, cordovaVarsPresent, gradlePropsHeuristics,
  playSaJson, flavorExists, agp8PackageAttr,
]
