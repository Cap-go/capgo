ALTER TABLE "public"."apps"
ADD COLUMN "rollout_channel_count" bigint NOT NULL DEFAULT 0,
ADD COLUMN "rollout_paused_version_names" character varying[] NOT NULL DEFAULT '{}'::character varying[];

ALTER TABLE "public"."version_usage"
ADD COLUMN "channel_name" character varying(255);

ALTER TABLE "public"."version_usage"
ADD COLUMN "channel_id" bigint;

CREATE INDEX IF NOT EXISTS "idx_version_usage_app_channel_time"
ON "public"."version_usage" ("app_id", "channel_id", "timestamp")
WHERE "channel_id" IS NOT NULL;

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

CREATE INDEX "idx_channels_rollout_targets"
ON "public"."channels" ("app_id", "rollout_version")
WHERE "rollout_version" IS NOT NULL;

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
        AND c.rollout_version IS NOT NULL
        AND c.rollout_enabled = true
        AND c.rollout_percentage_bps > 0
        AND c.rollout_paused_at IS NULL
    ),
    rollout_paused_version_names = ARRAY(
      SELECT DISTINCT rv.name
      FROM public.channels AS c
      INNER JOIN public.app_versions AS rv ON rv.id = c.rollout_version AND rv.app_id = c.app_id
      WHERE c.app_id = p_app_id
        AND c.rollout_version IS NOT NULL
        AND c.rollout_enabled = true
        AND c.rollout_percentage_bps > 0
        AND c.rollout_paused_at IS NOT NULL
      ORDER BY rv.name
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
DECLARE
  rollout_changed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    rollout_changed := NEW."rollout_version" IS NOT NULL;
  ELSE
    rollout_changed := NEW."rollout_version" IS DISTINCT FROM OLD."rollout_version";
  END IF;

  IF rollout_changed THEN
    IF ("auth"."uid"() IS NOT NULL OR "public"."get_apikey_header"() IS NOT NULL)
      AND NOT "public"."rbac_check_permission_request"(
        "public"."rbac_perm_channel_promote_bundle"(),
        NEW."owner_org",
        NEW."app_id",
        NEW."id"
      )
    THEN
      RAISE EXCEPTION 'NO_RIGHTS';
    END IF;

    IF NEW."rollout_version" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "public"."app_versions" AS av
        WHERE av."id" = NEW."rollout_version"
          AND av."app_id" = NEW."app_id"
          AND av."owner_org" = NEW."owner_org"
          AND av."deleted" = false
      )
    THEN
      RAISE EXCEPTION 'INVALID_ROLLOUT_VERSION';
    END IF;

    NEW."rollout_id" = gen_random_uuid();
    IF NEW."rollout_version" IS NULL THEN
      NEW."rollout_paused_at" = NULL;
      IF TG_OP = 'INSERT' THEN
        NEW."rollout_pause_reason" = NULL;
        NEW."auto_pause_last_triggered_at" = NULL;
      ELSE
        IF NEW."rollout_pause_reason" IS NOT DISTINCT FROM OLD."rollout_pause_reason" THEN
          NEW."rollout_pause_reason" = NULL;
        END IF;
        IF NEW."auto_pause_last_triggered_at" IS NOT DISTINCT FROM OLD."auto_pause_last_triggered_at" THEN
          NEW."auto_pause_last_triggered_at" = NULL;
        END IF;
      END IF;
    ELSE
      NEW."rollout_paused_at" = NULL;
      NEW."rollout_pause_reason" = NULL;
      NEW."auto_pause_last_triggered_at" = NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."refresh_channel_rollout_id"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."refresh_channel_rollout_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_channel_rollout_id"() TO "service_role";

DROP TRIGGER IF EXISTS "refresh_channel_rollout_id" ON "public"."channels";
CREATE TRIGGER "refresh_channel_rollout_id"
BEFORE INSERT OR UPDATE OF "rollout_version" ON "public"."channels"
FOR EACH ROW
EXECUTE FUNCTION "public"."refresh_channel_rollout_id"();

DROP TRIGGER IF EXISTS "refresh_app_rollout_channel_count" ON "public"."channels";
CREATE TRIGGER "refresh_app_rollout_channel_count"
AFTER INSERT OR UPDATE OF "app_id", "rollout_enabled", "rollout_version", "rollout_percentage_bps", "rollout_paused_at" OR DELETE ON "public"."channels"
FOR EACH ROW
EXECUTE FUNCTION "public"."refresh_app_rollout_channel_count"();

UPDATE "public"."apps" AS a
SET
  "rollout_channel_count" = (
    SELECT count(*)::bigint
    FROM "public"."channels" AS c
    WHERE c."app_id" = a."app_id"
      AND c."rollout_version" IS NOT NULL
      AND c."rollout_enabled" = true
      AND c."rollout_percentage_bps" > 0
      AND c."rollout_paused_at" IS NULL
  ),
  "rollout_paused_version_names" = ARRAY(
    SELECT DISTINCT rv."name"
    FROM "public"."channels" AS c
    INNER JOIN "public"."app_versions" AS rv ON rv."id" = c."rollout_version" AND rv."app_id" = c."app_id"
    WHERE c."app_id" = a."app_id"
      AND c."rollout_version" IS NOT NULL
      AND c."rollout_enabled" = true
      AND c."rollout_percentage_bps" > 0
      AND c."rollout_paused_at" IS NOT NULL
    ORDER BY rv."name"
  );

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
      AND av.name NOT IN ('builtin', 'unknown')
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
REVOKE ALL ON FUNCTION public.update_app_versions_retention() FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_app_versions_retention() TO service_role;

DROP FUNCTION IF EXISTS public.read_version_usage(character varying, timestamp without time zone, timestamp without time zone);
DROP FUNCTION IF EXISTS public.read_version_usage(character varying, timestamp without time zone, timestamp without time zone, text);

CREATE OR REPLACE FUNCTION public.read_version_usage(p_app_id character varying, p_period_start timestamp without time zone, p_period_end timestamp without time zone, p_channel_name text DEFAULT NULL, p_channel_id bigint DEFAULT NULL)
RETURNS TABLE(app_id character varying, version_name character varying, date timestamp without time zone, "get" bigint, fail bigint, install bigint, uninstall bigint)
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vu.app_id,
    COALESCE(vu.version_name, av.name)::character varying AS version_name,
    DATE_TRUNC('day', vu.timestamp) AS date,
    SUM(CASE WHEN vu.action = 'get' THEN 1 ELSE 0 END) AS "get",
    SUM(CASE WHEN vu.action = 'fail' THEN 1 ELSE 0 END) AS fail,
    SUM(CASE WHEN vu.action = 'install' THEN 1 ELSE 0 END) AS install,
    SUM(CASE WHEN vu.action = 'uninstall' THEN 1 ELSE 0 END) AS uninstall
  FROM public.version_usage AS vu
  LEFT JOIN public.app_versions AS av ON vu.version_id = av.id AND vu.version_name IS NULL
  WHERE vu.app_id = p_app_id
    AND vu.timestamp >= p_period_start
    AND vu.timestamp < p_period_end
    AND (p_channel_name IS NULL OR vu.channel_name = p_channel_name)
    AND (p_channel_id IS NULL OR vu.channel_id = p_channel_id)
  GROUP BY date, vu.app_id, COALESCE(vu.version_name, av.name)
  ORDER BY date;
END;
$$;

ALTER FUNCTION public.read_version_usage(character varying, timestamp without time zone, timestamp without time zone, text, bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.read_version_usage(character varying, timestamp without time zone, timestamp without time zone, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_version_usage(character varying, timestamp without time zone, timestamp without time zone, text, bigint) TO anon;
GRANT EXECUTE ON FUNCTION public.read_version_usage(character varying, timestamp without time zone, timestamp without time zone, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.read_version_usage(character varying, timestamp without time zone, timestamp without time zone, text, bigint) TO service_role;

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
  WHERE av.deleted = true
    AND av.deleted_at IS NOT NULL
    AND av.deleted_at <= pg_catalog.now() - INTERVAL '90 days'
    AND av.name NOT IN ('builtin', 'unknown')
    AND av.manifest_count = 0
    AND (
      av.r2_path IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.app_versions_meta AS avm
        WHERE avm.id = av.id
          AND avm.size = 0
      )
    )
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
COMMENT ON FUNCTION public.delete_old_deleted_versions() IS
  'Permanently deletes app_versions that have been soft-deleted for at least 90 days after storage cleanup is reflected in app_versions_meta and app_versions.manifest_count.';
REVOKE ALL ON FUNCTION public.delete_old_deleted_versions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_old_deleted_versions() FROM anon;
REVOKE ALL ON FUNCTION public.delete_old_deleted_versions() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_old_deleted_versions() TO service_role;

SELECT pgmq.create('cron_rollout_auto_pause');

CREATE OR REPLACE FUNCTION public.process_all_cron_tasks()
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  current_hour int;
  current_minute int;
  current_second int;
  current_dow int;
  current_day int;
  task RECORD;
  queue_names text[];
  should_run boolean;
  lock_acquired boolean;
BEGIN
  lock_acquired := pg_try_advisory_lock(1);

  IF NOT lock_acquired THEN
    RAISE NOTICE 'process_all_cron_tasks: skipped, another instance is already running';
    RETURN;
  END IF;

  BEGIN
    current_hour := EXTRACT(HOUR FROM NOW());
    current_minute := EXTRACT(MINUTE FROM NOW());
    current_second := EXTRACT(SECOND FROM NOW());
    current_dow := EXTRACT(DOW FROM NOW());
    current_day := EXTRACT(DAY FROM NOW());

    FOR task IN SELECT * FROM public.cron_tasks WHERE enabled = true LOOP
      should_run := false;

      IF task.second_interval IS NOT NULL THEN
        should_run := true;
      ELSIF task.minute_interval IS NOT NULL THEN
        should_run := (current_minute % task.minute_interval = 0)
                      AND (current_second < 10);
      ELSIF task.hour_interval IS NOT NULL THEN
        should_run := (current_hour % task.hour_interval = 0)
                      AND (current_minute = COALESCE(task.run_at_minute, 0))
                      AND (current_second < 10);
      ELSIF task.run_at_hour IS NOT NULL THEN
        should_run := (current_hour = task.run_at_hour)
                      AND (current_minute = COALESCE(task.run_at_minute, 0))
                      AND (current_second < 10);

        IF should_run AND task.run_on_dow IS NOT NULL THEN
          should_run := (current_dow = task.run_on_dow);
        END IF;

        IF should_run AND task.run_on_day IS NOT NULL THEN
          should_run := (current_day = task.run_on_day);
        END IF;
      END IF;

      IF should_run THEN
        BEGIN
          CASE task.task_type
            WHEN 'function' THEN
              EXECUTE 'SELECT ' || task.target;

            WHEN 'queue' THEN
              PERFORM pgmq.send(
                task.target,
                COALESCE(task.payload, jsonb_build_object('function_name', task.target))
              );

            WHEN 'function_queue' THEN
              SELECT array_agg(value::text) INTO queue_names
              FROM jsonb_array_elements_text(task.target::jsonb);

              IF task.healthcheck_url IS NOT NULL THEN
                PERFORM public.process_queue_with_healthcheck(
                  COALESCE(queue_names, ARRAY[]::text[]),
                  COALESCE(task.batch_size, 950),
                  task.healthcheck_url
                );
              ELSIF task.batch_size IS NOT NULL THEN
                PERFORM public.process_function_queue(queue_names, task.batch_size);
              ELSE
                PERFORM public.process_function_queue(queue_names);
              END IF;
          END CASE;
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'cron task "%" failed: %', task.name, SQLERRM;
        END;
      END IF;
    END LOOP;

    IF current_minute % 5 = 0 AND current_second < 10 THEN
      PERFORM pgmq.send(
        'cron_rollout_auto_pause',
        jsonb_build_object(
          'function_name', 'cron_rollout_auto_pause',
          'function_type', 'cloudflare'
        )
      );
    END IF;

    PERFORM public.process_function_queue(ARRAY['cron_rollout_auto_pause']);
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_advisory_unlock(1);
    RAISE;
  END;

  PERFORM pg_advisory_unlock(1);
END;
$$;

ALTER FUNCTION public.process_all_cron_tasks() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.process_all_cron_tasks() FROM public;
REVOKE ALL ON FUNCTION public.process_all_cron_tasks() FROM anon;
REVOKE ALL ON FUNCTION public.process_all_cron_tasks() FROM authenticated;
REVOKE ALL ON FUNCTION public.process_all_cron_tasks() FROM service_role;
GRANT EXECUTE ON FUNCTION public.process_all_cron_tasks() TO service_role;

COMMENT ON FUNCTION public.process_all_cron_tasks() IS
$$Consolidated cron task processor that runs every 10 seconds. Uses advisory
lock (ID=1) to prevent concurrent execution - if a previous run is still
executing, the new invocation will skip. Also queues and processes progressive
rollout auto-pause evaluation through the existing cron processor.$$;

DROP FUNCTION IF EXISTS "public"."get_org_apps_with_last_upload"("uuid", "text", "text", boolean, integer, integer);

CREATE FUNCTION "public"."get_org_apps_with_last_upload"(
    "p_org_id" "uuid",
    "p_search" "text" DEFAULT NULL,
    "p_sort_by" "text" DEFAULT 'last_upload_at',
    "p_sort_desc" boolean DEFAULT true,
    "p_limit" integer DEFAULT 10,
    "p_offset" integer DEFAULT 0
)
RETURNS TABLE(
    "created_at" timestamp with time zone,
    "app_id" character varying,
    "icon_url" character varying,
    "user_id" "uuid",
    "name" character varying,
    "last_version" character varying,
    "updated_at" timestamp with time zone,
    "id" "uuid",
    "retention" bigint,
    "owner_org" "uuid",
    "default_upload_channel" character varying,
    "transfer_history" "jsonb"[],
    "channel_device_count" bigint,
    "manifest_bundle_count" bigint,
    "expose_metadata" boolean,
    "allow_preview" boolean,
    "allow_device_custom_id" boolean,
    "need_onboarding" boolean,
    "existing_app" boolean,
    "ios_store_url" "text",
    "android_store_url" "text",
    "stats_updated_at" timestamp without time zone,
    "stats_refresh_requested_at" timestamp without time zone,
    "build_timeout_seconds" bigint,
    "build_timeout_updated_at" timestamp with time zone,
    "block_provider_infra_requests" boolean,
    "rollout_channel_count" bigint,
    "rollout_paused_version_names" character varying[],
    "last_upload_at" timestamp with time zone,
    "total_count" bigint
)
LANGUAGE "plpgsql"
SECURITY INVOKER
SET "search_path" TO ''
AS $$
DECLARE
    v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 100);
    v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
    v_search text := NULLIF(btrim(COALESCE(p_search, '')), '');
    v_sort text := CASE
        WHEN p_sort_by IN ('name', 'last_version', 'updated_at', 'created_at', 'last_upload_at')
            THEN p_sort_by
        ELSE 'last_upload_at'
    END;
    v_desc boolean := COALESCE(p_sort_desc, true);
BEGIN
    RETURN QUERY
    WITH scoped AS (
        SELECT
            a.*,
            lv.created_at AS last_upload_at
        FROM public.apps a
        LEFT JOIN LATERAL (
            SELECT av.created_at
            FROM public.app_versions av
            WHERE av.app_id = a.app_id
              AND av.name = a.last_version
              AND av.deleted = false
            ORDER BY av.created_at DESC
            LIMIT 1
        ) lv ON a.last_version IS NOT NULL
        WHERE a.owner_org = p_org_id
          AND (
            v_search IS NULL
            OR a.name ILIKE '%' || v_search || '%'
            OR a.app_id ILIKE '%' || v_search || '%'
          )
    )
    SELECT
        s.*,
        COUNT(*) OVER () AS total_count
    FROM scoped s
    ORDER BY
        CASE WHEN v_sort = 'last_upload_at' AND v_desc THEN s.last_upload_at END DESC NULLS LAST,
        CASE WHEN v_sort = 'last_upload_at' AND NOT v_desc THEN s.last_upload_at END ASC NULLS LAST,
        CASE WHEN v_sort = 'updated_at' AND v_desc THEN s.updated_at END DESC NULLS LAST,
        CASE WHEN v_sort = 'updated_at' AND NOT v_desc THEN s.updated_at END ASC NULLS LAST,
        CASE WHEN v_sort = 'created_at' AND v_desc THEN s.created_at END DESC NULLS LAST,
        CASE WHEN v_sort = 'created_at' AND NOT v_desc THEN s.created_at END ASC NULLS LAST,
        CASE WHEN v_sort = 'name' AND v_desc THEN s.name END DESC NULLS LAST,
        CASE WHEN v_sort = 'name' AND NOT v_desc THEN s.name END ASC NULLS LAST,
        CASE WHEN v_sort = 'last_version' AND v_desc THEN s.last_version END DESC NULLS LAST,
        CASE WHEN v_sort = 'last_version' AND NOT v_desc THEN s.last_version END ASC NULLS LAST,
        s.app_id ASC
    LIMIT v_limit
    OFFSET v_offset;
END;
$$;

ALTER FUNCTION "public"."get_org_apps_with_last_upload"(
    "uuid", "text", "text", boolean, integer, integer
) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."get_org_apps_with_last_upload"(
    "uuid", "text", "text", boolean, integer, integer
) IS 'Paginated apps for one org with a derived last_upload_at (created_at of the bundle matching apps.last_version). Returns the full apps row plus last_upload_at and total_count. SECURITY INVOKER so RLS on apps/app_versions enforces visibility; p_org_id is an indexed narrowing filter on top of RLS. Search/sort/pagination/total_count are computed in SQL so page order matches the displayed last-upload sort.';

REVOKE ALL ON FUNCTION "public"."get_org_apps_with_last_upload"(
    "uuid", "text", "text", boolean, integer, integer
) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_org_apps_with_last_upload"(
    "uuid", "text", "text", boolean, integer, integer
) TO "anon";
GRANT ALL ON FUNCTION "public"."get_org_apps_with_last_upload"(
    "uuid", "text", "text", boolean, integer, integer
) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_org_apps_with_last_upload"(
    "uuid", "text", "text", boolean, integer, integer
) TO "service_role";
