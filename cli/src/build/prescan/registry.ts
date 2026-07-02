// src/build/prescan/registry.ts
import type { PrescanCheck } from './types'
import {
  manifestDeeplinkValid,
  manifestDuplicateComponent,
  manifestExportedMissing,
  manifestExportedUnprotected,
  manifestHardcodedDebuggable,
  manifestMissingPrefix,
  manifestMockLocation,
  manifestMultipleUsesSdk,
  manifestNamespaceUri,
  manifestQueryAllPackages,
  manifestTagTypo,
  manifestUniquePermission,
  manifestWellFormed,
} from './checks/android-manifest'
import { keystoreExpiry, keystoreOpens } from './checks/android-keystore'
import {
  agp8PackageAttr,
  applicationIdPresent,
  capacitorBuildGradleApplied,
  cordovaVarsPresent,
  flavorDimensions,
  flavorExists,
  googleServicesFile,
  gradlePropsHeuristics,
  gradleWrapperPresent,
  localPropertiesCommitted,
  minSdkCapacitor,
  playSaJson,
  sdkFloors,
  targetSdkPlay,
  versionFields,
} from './checks/android-project'
import { credentialsSaved } from './checks/credentials'
import { ascKeyValid, p12Expiry, p12Opens } from './checks/ios-certs'
import { infoplistSanity } from './checks/ios-plist'
import { certProfilePairing, profileBundleMatch, profileExpiry, profileTypeVsMode, targetsCovered } from './checks/ios-profiles'
import { bundleIdConsistency, capSyncStale, nodeLinkerLayout } from './checks/shared'
import { apikeyPermission, appExists } from './checks/shared-remote'
import { ascKeyAccess, playSaAccess } from './checks/store-access'

export const ALL_CHECKS: PrescanCheck[] = [
  // shared
  apikeyPermission, appExists, credentialsSaved,
  capSyncStale, nodeLinkerLayout, bundleIdConsistency,
  // ios certs / profiles / plist
  p12Opens, p12Expiry, profileExpiry, profileBundleMatch, profileTypeVsMode,
  certProfilePairing, targetsCovered, infoplistSanity, ascKeyValid,
  // android keystore / project
  keystoreOpens, keystoreExpiry, cordovaVarsPresent, gradlePropsHeuristics,
  playSaJson, flavorExists, agp8PackageAttr,
  // android manifest
  manifestWellFormed, manifestTagTypo, manifestNamespaceUri,
  manifestMissingPrefix, manifestExportedMissing, manifestMultipleUsesSdk,
  manifestDuplicateComponent, manifestUniquePermission, manifestHardcodedDebuggable,
  manifestMockLocation, manifestExportedUnprotected, manifestQueryAllPackages,
  manifestDeeplinkValid,
  // android gradle / project
  applicationIdPresent, capacitorBuildGradleApplied, gradleWrapperPresent,
  flavorDimensions, googleServicesFile, localPropertiesCommitted,
  sdkFloors, targetSdkPlay, minSdkCapacitor, versionFields,
  // store-access (remote)
  playSaAccess, ascKeyAccess,
]
