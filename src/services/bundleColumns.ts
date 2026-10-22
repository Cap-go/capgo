// Re-export the shared light app_versions projections used by GET /bundle?fields=summary
// and console list/picker paths so list pages never pull manifest / native_packages.
export {
  BUNDLE_PICKER_COLUMNS,
  BUNDLE_SUMMARY_COLUMNS,
} from '../../supabase/functions/shared/bundle-columns.ts'
