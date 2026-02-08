-- Align tmp_users cleanup with invite validity windows (7 days).
-- Previously, tmp_users rows were deleted after 1 hour, which caused invitation
-- acceptance to fail.

CREATE OR REPLACE FUNCTION public.cleanup_tmp_users()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM "public"."tmp_users"
  WHERE GREATEST(updated_at, created_at) < NOW() - INTERVAL '7 days';
END;
$$;

-- SECURITY: tmp_users has RLS disabled for all; keep this definer function
-- executable only by internal roles to avoid bypassing RLS via PUBLIC execute.
REVOKE EXECUTE ON FUNCTION "public"."cleanup_tmp_users"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."cleanup_tmp_users"() TO "service_role";

-- The cron runner is table-driven via public.cron_tasks (see migrations around
-- 2025-12-28 and 2026-01-03). Register tmp_users cleanup as a per-minute task.
INSERT INTO "public"."cron_tasks" (
  "name",
  "description",
  "task_type",
  "target",
  "minute_interval",
  "run_at_second",
  "enabled"
)
VALUES (
  'cleanup_tmp_users',
  'Cleanup expired tmp_users invitations (7 days)',
  'function'::"public"."cron_task_type",
  'public.cleanup_tmp_users()',
  1,
  0,
  true
)
ON CONFLICT ("name") DO UPDATE SET
  "description" = EXCLUDED."description",
  "task_type" = EXCLUDED."task_type",
  "target" = EXCLUDED."target",
  "minute_interval" = EXCLUDED."minute_interval",
  "run_at_second" = EXCLUDED."run_at_second",
  "enabled" = EXCLUDED."enabled",
  "updated_at" = NOW();
