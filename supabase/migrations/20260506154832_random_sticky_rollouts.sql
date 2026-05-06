ALTER TABLE "public"."apps"
ADD COLUMN "rollout_channel_count" bigint NOT NULL DEFAULT 0;

ALTER TABLE "public"."channels"
ADD COLUMN "rollout_version" bigint,
ADD COLUMN "rollout_percentage_bps" integer NOT NULL DEFAULT 0,
ADD COLUMN "rollout_enabled" boolean NOT NULL DEFAULT false,
ADD COLUMN "rollout_id" uuid NOT NULL DEFAULT gen_random_uuid(),
ADD COLUMN "rollout_paused_at" timestamp with time zone,
ADD COLUMN "rollout_pause_reason" text,
ADD COLUMN "rollout_cache_ttl_seconds" integer NOT NULL DEFAULT 2592000,
ADD COLUMN "auto_pause_enabled" boolean NOT NULL DEFAULT false,
ADD COLUMN "auto_pause_window_minutes" integer NOT NULL DEFAULT 60,
ADD COLUMN "auto_pause_failure_rate_bps" integer,
ADD COLUMN "auto_pause_confidence" numeric(5, 4) NOT NULL DEFAULT 0.9500,
ADD COLUMN "auto_pause_min_attempts" integer,
ADD COLUMN "auto_pause_min_failures" integer,
ADD COLUMN "auto_pause_action" text NOT NULL DEFAULT 'pause',
ADD COLUMN "auto_pause_cooldown_minutes" integer NOT NULL DEFAULT 60,
ADD COLUMN "auto_pause_last_triggered_at" timestamp with time zone,
ADD COLUMN "auto_pause_last_checked_at" timestamp with time zone;

ALTER TABLE "public"."channels"
ADD CONSTRAINT "channels_rollout_version_fkey"
FOREIGN KEY ("rollout_version")
REFERENCES "public"."app_versions"("id")
ON DELETE SET NULL;

ALTER TABLE "public"."channels"
ADD CONSTRAINT "channels_rollout_percentage_bps_check"
CHECK ("rollout_percentage_bps" >= 0 AND "rollout_percentage_bps" <= 10000);

ALTER TABLE "public"."channels"
ADD CONSTRAINT "channels_rollout_cache_ttl_seconds_check"
CHECK ("rollout_cache_ttl_seconds" >= 60 AND "rollout_cache_ttl_seconds" <= 31536000);

ALTER TABLE "public"."channels"
ADD CONSTRAINT "channels_auto_pause_window_minutes_check"
CHECK ("auto_pause_window_minutes" > 0 AND "auto_pause_window_minutes" <= 10080);

ALTER TABLE "public"."channels"
ADD CONSTRAINT "channels_auto_pause_failure_rate_bps_check"
CHECK ("auto_pause_failure_rate_bps" IS NULL OR ("auto_pause_failure_rate_bps" >= 0 AND "auto_pause_failure_rate_bps" <= 10000));

ALTER TABLE "public"."channels"
ADD CONSTRAINT "channels_auto_pause_confidence_check"
CHECK ("auto_pause_confidence" > 0 AND "auto_pause_confidence" < 1);

ALTER TABLE "public"."channels"
ADD CONSTRAINT "channels_auto_pause_min_attempts_check"
CHECK ("auto_pause_min_attempts" IS NULL OR "auto_pause_min_attempts" >= 0);

ALTER TABLE "public"."channels"
ADD CONSTRAINT "channels_auto_pause_min_failures_check"
CHECK ("auto_pause_min_failures" IS NULL OR "auto_pause_min_failures" >= 0);

ALTER TABLE "public"."channels"
ADD CONSTRAINT "channels_auto_pause_action_check"
CHECK ("auto_pause_action" IN ('pause', 'rollback', 'notify'));

ALTER TABLE "public"."channels"
ADD CONSTRAINT "channels_auto_pause_cooldown_minutes_check"
CHECK ("auto_pause_cooldown_minutes" >= 0 AND "auto_pause_cooldown_minutes" <= 10080);

CREATE INDEX "idx_channels_rollout_version"
ON "public"."channels" ("rollout_version")
WHERE "rollout_version" IS NOT NULL;

CREATE INDEX "idx_channels_active_rollouts"
ON "public"."channels" ("app_id", "rollout_enabled", "rollout_version")
WHERE "rollout_enabled" = true AND "rollout_version" IS NOT NULL;

CREATE OR REPLACE FUNCTION "public"."refresh_app_rollout_channel_count_for_app"("p_app_id" character varying)
RETURNS void
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO ''
AS $$
BEGIN
  IF p_app_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.apps AS a
  SET
    rollout_channel_count = (
      SELECT count(*)::bigint
      FROM public.channels AS c
      WHERE c.app_id = p_app_id
        AND c.rollout_enabled IS TRUE
        AND c.rollout_version IS NOT NULL
    ),
    updated_at = now()
  WHERE a.app_id = p_app_id;
END;
$$;

ALTER FUNCTION "public"."refresh_app_rollout_channel_count_for_app"("p_app_id" character varying) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."refresh_app_rollout_channel_count_for_app"("p_app_id" character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_app_rollout_channel_count_for_app"("p_app_id" character varying) TO "service_role";

CREATE OR REPLACE FUNCTION "public"."refresh_app_rollout_channel_count"()
RETURNS trigger
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM "public"."refresh_app_rollout_channel_count_for_app"(NEW."app_id");
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM "public"."refresh_app_rollout_channel_count_for_app"(OLD."app_id");
    RETURN OLD;
  END IF;

  PERFORM "public"."refresh_app_rollout_channel_count_for_app"(NEW."app_id");
  IF OLD."app_id" IS DISTINCT FROM NEW."app_id" THEN
    PERFORM "public"."refresh_app_rollout_channel_count_for_app"(OLD."app_id");
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."refresh_app_rollout_channel_count"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."refresh_app_rollout_channel_count"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_app_rollout_channel_count"() TO "service_role";

CREATE OR REPLACE FUNCTION "public"."refresh_channel_rollout_id"()
RETURNS trigger
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO ''
AS $$
BEGIN
  IF NEW."rollout_version" IS DISTINCT FROM OLD."rollout_version" THEN
    NEW."rollout_id" = gen_random_uuid();
    NEW."rollout_paused_at" = NULL;
    NEW."rollout_pause_reason" = NULL;
    NEW."auto_pause_last_triggered_at" = NULL;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."refresh_channel_rollout_id"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."refresh_channel_rollout_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_channel_rollout_id"() TO "service_role";

DROP TRIGGER IF EXISTS "refresh_channel_rollout_id" ON "public"."channels";
CREATE TRIGGER "refresh_channel_rollout_id"
BEFORE UPDATE OF "rollout_version" ON "public"."channels"
FOR EACH ROW
EXECUTE FUNCTION "public"."refresh_channel_rollout_id"();

DROP TRIGGER IF EXISTS "refresh_app_rollout_channel_count" ON "public"."channels";
CREATE TRIGGER "refresh_app_rollout_channel_count"
AFTER INSERT OR UPDATE OF "app_id", "rollout_enabled", "rollout_version" OR DELETE ON "public"."channels"
FOR EACH ROW
EXECUTE FUNCTION "public"."refresh_app_rollout_channel_count"();

UPDATE "public"."apps" AS a
SET "rollout_channel_count" = rollout_counts.rollout_count
FROM (
  SELECT
    c."app_id",
    count(*)::bigint AS rollout_count
  FROM "public"."channels" AS c
  WHERE c."rollout_enabled" = true
    AND c."rollout_version" IS NOT NULL
  GROUP BY c."app_id"
) AS rollout_counts
WHERE rollout_counts."app_id" = a."app_id";

CREATE OR REPLACE FUNCTION public.update_app_versions_retention()
RETURNS void
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
    UPDATE public.app_versions AS av
    SET deleted = true
    WHERE av.deleted = false
      AND (SELECT retention FROM public.apps WHERE apps.app_id = av.app_id) >= 0
      AND (SELECT retention FROM public.apps WHERE apps.app_id = av.app_id) < 63113904
      AND av.created_at < (
          SELECT NOW() - make_interval(secs => apps.retention)
          FROM public.apps
          WHERE apps.app_id = av.app_id
      )
      AND NOT EXISTS (
          SELECT 1
          FROM public.channels AS c
          WHERE c.app_id = av.app_id
            AND (c.version = av.id OR c.rollout_version = av.id)
      );
END;
$$;

ALTER FUNCTION public.update_app_versions_retention() OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.delete_old_deleted_versions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  deleted_count bigint;
BEGIN
    DELETE FROM public.app_versions AS av
    WHERE av.deleted_at IS NOT NULL
      AND av.deleted_at < NOW() - INTERVAL '3 months'
      AND av.name NOT IN ('builtin', 'unknown')
      AND NOT EXISTS (
        SELECT 1
        FROM public.channels AS c
        WHERE c.app_id = av.app_id
          AND (c.version = av.id OR c.rollout_version = av.id)
      );

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    IF deleted_count > 0 THEN
      RAISE NOTICE 'delete_old_deleted_versions: permanently deleted % app versions', deleted_count;
    END IF;
END;
$$;

ALTER FUNCTION public.delete_old_deleted_versions() OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.delete_old_deleted_versions() FROM public;
GRANT EXECUTE ON FUNCTION public.delete_old_deleted_versions() TO service_role;

SELECT pgmq.create('cron_rollout_auto_pause');

INSERT INTO "public"."cron_tasks" (
  "name",
  "description",
  "task_type",
  "target",
  "batch_size",
  "second_interval",
  "minute_interval",
  "hour_interval",
  "run_at_hour",
  "run_at_minute",
  "run_at_second",
  "run_on_dow",
  "run_on_day"
) VALUES (
  'rollout_auto_pause',
  'Queue progressive rollout auto-pause evaluation',
  'queue',
  'cron_rollout_auto_pause',
  null,
  null,
  5,
  null,
  null,
  null,
  0,
  null,
  null
)
ON CONFLICT ("name") DO UPDATE SET
  "description" = excluded."description",
  "task_type" = excluded."task_type",
  "target" = excluded."target",
  "minute_interval" = excluded."minute_interval",
  "run_at_second" = excluded."run_at_second",
  "updated_at" = NOW();

INSERT INTO "public"."cron_tasks" (
  "name",
  "description",
  "task_type",
  "target",
  "batch_size",
  "second_interval",
  "minute_interval",
  "hour_interval",
  "run_at_hour",
  "run_at_minute",
  "run_at_second",
  "run_on_dow",
  "run_on_day"
) VALUES (
  'rollout_auto_pause_queue',
  'Process progressive rollout auto-pause evaluation queue',
  'function_queue',
  '["cron_rollout_auto_pause"]',
  null,
  null,
  1,
  null,
  null,
  null,
  0,
  null,
  null
)
ON CONFLICT ("name") DO UPDATE SET
  "description" = excluded."description",
  "task_type" = excluded."task_type",
  "target" = excluded."target",
  "minute_interval" = excluded."minute_interval",
  "run_at_second" = excluded."run_at_second",
  "updated_at" = NOW();
