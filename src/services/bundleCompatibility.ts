export type {
  CompatibilitySummary,
  IncompatibilityReason,
  NativePackage,
  PackageComparison,
  PackageStatus,
} from '../../supabase/functions/_backend/utils/bundle_compatibility.ts'

export {
  compareNativePackages as comparePackages,
  summarizeBundleCompatibility as summarizeCompatibility,
} from '../../supabase/functions/_backend/utils/bundle_compatibility.ts'
