ALTER TABLE "public"."global_stats"
  ADD COLUMN "builds_success_total" bigint DEFAULT 0,
  ADD COLUMN "builds_success_ios" bigint DEFAULT 0,
  ADD COLUMN "builds_success_android" bigint DEFAULT 0;

COMMENT ON COLUMN "public"."global_stats"."builds_success_total" IS 'Total number of successful native builds recorded (all time)';
COMMENT ON COLUMN "public"."global_stats"."builds_success_ios" IS 'Total number of successful iOS native builds recorded (all time)';
COMMENT ON COLUMN "public"."global_stats"."builds_success_android" IS 'Total number of successful Android native builds recorded (all time)';
