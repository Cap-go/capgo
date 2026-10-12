-- Track, per native iOS build, the dependency manager (CocoaPods vs SPM) reported by the
-- CLI and the Xcode version (iOS SDK) the builder ran it with, plus daily global_stats
-- counts of iOS builds by dependency manager and by iOS SDK major.

ALTER TABLE public.build_requests
  ADD COLUMN IF NOT EXISTS ios_dependency_manager text,
  ADD COLUMN IF NOT EXISTS xcode_version text;

ALTER TABLE public.build_requests
  DROP CONSTRAINT IF EXISTS build_requests_ios_dependency_manager_check;

ALTER TABLE public.build_requests
  ADD CONSTRAINT build_requests_ios_dependency_manager_check
  CHECK (ios_dependency_manager IS NULL OR ios_dependency_manager IN ('cocoapods', 'spm'));

COMMENT ON COLUMN public.build_requests.ios_dependency_manager IS 'iOS dependency manager detected by the CLI (cocoapods or spm). NULL for Android builds or CLIs that do not report it.';
COMMENT ON COLUMN public.build_requests.xcode_version IS 'Xcode version of the builder runner that ran the build (its major is the iOS SDK). NULL until a runner claims the build or when the builder does not report it.';

CREATE INDEX IF NOT EXISTS idx_build_requests_created_at_platform
  ON public.build_requests USING btree (created_at, platform);

ALTER TABLE public.global_stats
  ADD COLUMN IF NOT EXISTS build_requests_day_ios_cocoapods integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS build_requests_day_ios_spm integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS build_requests_day_ios_unknown integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS build_requests_day_ios_sdk jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.global_stats.build_requests_day_ios_cocoapods IS 'iOS native build requests on the snapshot UTC day whose project uses CocoaPods.';
COMMENT ON COLUMN public.global_stats.build_requests_day_ios_spm IS 'iOS native build requests on the snapshot UTC day whose project uses Swift Package Manager.';
COMMENT ON COLUMN public.global_stats.build_requests_day_ios_unknown IS 'iOS native build requests on the snapshot UTC day without a reported dependency manager (older CLI).';
COMMENT ON COLUMN public.global_stats.build_requests_day_ios_sdk IS 'iOS native build requests on the snapshot UTC day by iOS SDK (Xcode major), e.g. {"26": 120, "27": 4, "unknown": 3}. unknown = never claimed by a runner or not reported.';
