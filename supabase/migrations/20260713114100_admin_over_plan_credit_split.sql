ALTER TABLE "public"."global_stats"
  ADD COLUMN IF NOT EXISTS "above_plan_with_credits" bigint,
  ADD COLUMN IF NOT EXISTS "above_plan_without_credits" bigint;

ALTER TABLE "public"."stripe_info"
  ADD COLUMN IF NOT EXISTS "is_above_plan" boolean;

COMMENT ON COLUMN "public"."global_stats"."above_plan_with_credits"
  IS 'Active above-plan organizations with positive, unexpired usage credits at snapshot time; null for snapshots created before this metric existed.';

COMMENT ON COLUMN "public"."global_stats"."above_plan_without_credits"
  IS 'Active above-plan organizations with no positive, unexpired usage credits at snapshot time; null for snapshots created before this metric existed.';

COMMENT ON COLUMN "public"."stripe_info"."is_above_plan"
  IS 'Raw plan-fit result before usage credits are applied; null until the next plan-status refresh.';
