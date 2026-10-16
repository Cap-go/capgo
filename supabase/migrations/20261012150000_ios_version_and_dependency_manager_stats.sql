-- Track iOS dependency manager (CocoaPods vs SPM) per native build request and
-- daily snapshots of iOS 26 / 27 device adoption and iOS builds per dependency manager.

ALTER TABLE public.build_requests
  ADD COLUMN IF NOT EXISTS ios_dependency_manager text;

ALTER TABLE public.build_requests
  DROP CONSTRAINT IF EXISTS build_requests_ios_dependency_manager_check;

ALTER TABLE public.build_requests
  ADD CONSTRAINT build_requests_ios_dependency_manager_check
  CHECK (ios_dependency_manager IS NULL OR ios_dependency_manager IN ('cocoapods', 'spm'));

COMMENT ON COLUMN public.build_requests.ios_dependency_manager IS 'iOS dependency manager detected by the CLI (cocoapods or spm). NULL for Android builds or CLIs that do not report it.';

CREATE INDEX IF NOT EXISTS idx_build_requests_created_at_platform
  ON public.build_requests USING btree (created_at, platform);

ALTER TABLE public.global_stats
  ADD COLUMN IF NOT EXISTS devices_ios_26 bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS devices_ios_27 bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS build_requests_day_ios_cocoapods integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS build_requests_day_ios_spm integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS build_requests_day_ios_unknown integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.global_stats.devices_ios_26 IS 'Distinct iOS devices whose latest OS version is 26.x, seen in the last 30 days before the snapshot end.';
COMMENT ON COLUMN public.global_stats.devices_ios_27 IS 'Distinct iOS devices whose latest OS version is 27.x, seen in the last 30 days before the snapshot end.';
COMMENT ON COLUMN public.global_stats.build_requests_day_ios_cocoapods IS 'iOS native build requests on the snapshot UTC day whose project uses CocoaPods.';
COMMENT ON COLUMN public.global_stats.build_requests_day_ios_spm IS 'iOS native build requests on the snapshot UTC day whose project uses Swift Package Manager.';
COMMENT ON COLUMN public.global_stats.build_requests_day_ios_unknown IS 'iOS native build requests on the snapshot UTC day without a reported dependency manager (older CLI).';
