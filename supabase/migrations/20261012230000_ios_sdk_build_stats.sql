-- Replace the iOS 26 / 27 device counts with iOS build counts per iOS SDK.
-- The builder reports the Xcode version that ran each build (its major is the iOS SDK);
-- it is stored on build_requests and rolled up daily into global_stats.

ALTER TABLE public.build_requests
  ADD COLUMN IF NOT EXISTS xcode_version text;

COMMENT ON COLUMN public.build_requests.xcode_version IS 'Xcode version of the builder runner that ran the build (its major is the iOS SDK). NULL until a runner claims the build or when the builder does not report it.';

ALTER TABLE public.global_stats
  ADD COLUMN IF NOT EXISTS build_requests_day_ios_sdk jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.global_stats.build_requests_day_ios_sdk IS 'iOS native build requests on the snapshot UTC day by iOS SDK (Xcode major), e.g. {"26": 120, "27": 4, "unknown": 3}. unknown = never claimed by a runner or not reported.';

-- Device iOS version counts were never used by the dashboard.
ALTER TABLE public.global_stats
  DROP COLUMN IF EXISTS devices_ios_26,
  DROP COLUMN IF EXISTS devices_ios_27;
