SET
  statement_timeout = 0;

SET
  lock_timeout = 0;

SET
  idle_in_transaction_session_timeout = 0;

SET
  client_encoding = 'UTF8';

SET
  standard_conforming_strings = on;

SELECT
  pg_catalog.set_config ('search_path', '', false);

SET
  check_function_bodies = false;

SET
  xmloption = content;

SET
  client_min_messages = warning;

SET
  row_security = off;

CREATE EXTENSION IF NOT EXISTS "pg_cron"
WITH
  SCHEMA "pg_catalog";

CREATE EXTENSION IF NOT EXISTS "pg_net"
WITH
  SCHEMA "extensions";

ALTER SCHEMA "public" OWNER TO "postgres";

COMMENT ON SCHEMA "public" IS 'standard public schema';

CREATE EXTENSION IF NOT EXISTS "http"
WITH
  SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "moddatetime"
WITH
  SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pg_graphql"
WITH
  SCHEMA "graphql";

CREATE EXTENSION IF NOT EXISTS "pg_stat_monitor"
WITH
  SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pg_stat_statements"
WITH
  SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pgcrypto"
WITH
  SCHEMA "extensions";

CREATE SCHEMA IF NOT EXISTS "pgmq";

CREATE EXTENSION IF NOT EXISTS "pgmq"
WITH
  SCHEMA "pgmq";

CREATE EXTENSION IF NOT EXISTS "postgres_fdw"
WITH
  SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "supabase_vault"
WITH
  SCHEMA "vault";

CREATE EXTENSION IF NOT EXISTS "uuid-ossp"
WITH
  SCHEMA "extensions";

CREATE TYPE "public"."action_type" AS ENUM('mau', 'storage', 'bandwidth');

ALTER TYPE "public"."action_type" OWNER TO "postgres";

CREATE TYPE "public"."disable_update" AS ENUM(
  'major',
  'minor',
  'patch',
  'version_number',
  'none'
);

ALTER TYPE "public"."disable_update" OWNER TO "postgres";

CREATE TYPE "public"."key_mode" AS ENUM('read', 'write', 'all', 'upload');

ALTER TYPE "public"."key_mode" OWNER TO "postgres";

CREATE TYPE "public"."manifest_entry" AS (
  "file_name" character varying,
  "s3_path" character varying,
  "file_hash" character varying
);

ALTER TYPE "public"."manifest_entry" OWNER TO "postgres";

CREATE TYPE "public"."orgs_table" AS (
  "id" "uuid",
  "created_by" "uuid",
  "created_at" timestamp with time zone,
  "updated_at" timestamp with time zone,
  "logo" "text",
  "name" "text"
);

ALTER TYPE "public"."orgs_table" OWNER TO "postgres";

CREATE TYPE "public"."owned_orgs" AS (
  "id" "uuid",
  "created_by" "uuid",
  "logo" "text",
  "name" "text",
  "role" character varying
);

ALTER TYPE "public"."owned_orgs" OWNER TO "postgres";

CREATE TYPE "public"."platform_os" AS ENUM('ios', 'android');

ALTER TYPE "public"."platform_os" OWNER TO "postgres";

CREATE TYPE "public"."stats_action" AS ENUM(
  'delete',
  'reset',
  'set',
  'get',
  'set_fail',
  'update_fail',
  'download_fail',
  'windows_path_fail',
  'canonical_path_fail',
  'directory_path_fail',
  'unzip_fail',
  'low_mem_fail',
  'download_10',
  'download_20',
  'download_30',
  'download_40',
  'download_50',
  'download_60',
  'download_70',
  'download_80',
  'download_90',
  'download_complete',
  'decrypt_fail',
  'app_moved_to_foreground',
  'app_moved_to_background',
  'uninstall',
  'needPlanUpgrade',
  'missingBundle',
  'noNew',
  'disablePlatformIos',
  'disablePlatformAndroid',
  'disableAutoUpdateToMajor',
  'cannotUpdateViaPrivateChannel',
  'disableAutoUpdateToMinor',
  'disableAutoUpdateToPatch',
  'channelMisconfigured',
  'disableAutoUpdateMetadata',
  'disableAutoUpdateUnderNative',
  'disableDevBuild',
  'disableEmulator',
  'cannotGetBundle',
  'checksum_fail',
  'NoChannelOrOverride',
  'setChannel',
  'getChannel',
  'rateLimited'
);

ALTER TYPE "public"."stats_action" OWNER TO "postgres";

CREATE TYPE "public"."stats_table" AS (
  "mau" bigint,
  "bandwidth" bigint,
  "storage" bigint
);

ALTER TYPE "public"."stats_table" OWNER TO "postgres";

CREATE TYPE "public"."stripe_status" AS ENUM(
  'created',
  'succeeded',
  'updated',
  'failed',
  'deleted',
  'canceled'
);

ALTER TYPE "public"."stripe_status" OWNER TO "postgres";

CREATE TYPE "public"."usage_mode" AS ENUM('last_saved', '5min', 'day', 'cycle');

ALTER TYPE "public"."usage_mode" OWNER TO "postgres";

CREATE TYPE "public"."user_min_right" AS ENUM(
  'invite_read',
  'invite_upload',
  'invite_write',
  'invite_admin',
  'invite_super_admin',
  'read',
  'upload',
  'write',
  'admin',
  'super_admin'
);

ALTER TYPE "public"."user_min_right" OWNER TO "postgres";

CREATE TYPE "public"."user_role" AS ENUM('read', 'upload', 'write', 'admin');

ALTER TYPE "public"."user_role" OWNER TO "postgres";

CREATE TYPE "public"."version_action" AS ENUM('get', 'fail', 'install', 'uninstall');

ALTER TYPE "public"."version_action" OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."accept_invitation_to_org" ("org_id" "uuid") RETURNS character varying LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
Declare  
 invite record;
Begin
  SELECT org_users.* FROM public.org_users
  INTO invite
  WHERE org_users.org_id=accept_invitation_to_org.org_id and (select auth.uid())=org_users.user_id;

  IF invite IS NULL THEN
    return 'NO_INVITE';
  else
    IF NOT (invite.user_right::varchar ilike 'invite_'||'%') THEN
      return 'INVALID_ROLE';
    END IF;

    UPDATE public.org_users
    SET user_right = REPLACE(invite.user_right::varchar, 'invite_', '')::"public"."user_min_right"
    WHERE org_users.id=invite.id;

    return 'OK';
  end if;
End;
$$;

ALTER FUNCTION "public"."accept_invitation_to_org" ("org_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."auto_apikey_name_by_id" () RETURNS "trigger" LANGUAGE "plpgsql"
SET
  search_path = '' AS $$BEGIN

  IF (NEW.name IS NOT DISTINCT FROM NULL) OR LENGTH(NEW.name) = 0 THEN
    NEW.name = format('Apikey %s', NEW.id);
  END IF;

  RETURN NEW;
END;$$;

ALTER FUNCTION "public"."auto_apikey_name_by_id" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."auto_owner_org_by_app_id" () RETURNS "trigger" LANGUAGE "plpgsql"
SET
  search_path = '' AS $$BEGIN
  IF NEW."app_id" is distinct from OLD."app_id" AND OLD."app_id" is distinct from NULL THEN
    RAISE EXCEPTION 'changing the app_id is not allowed';
  END IF;

  NEW.owner_org = public.get_user_main_org_id_by_app_id(NEW."app_id");

   RETURN NEW;
END;$$;

ALTER FUNCTION "public"."auto_owner_org_by_app_id" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."check_if_org_can_exist" () RETURNS "trigger" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
BEGIN
  delete FROM public.orgs
  where
  (
      (
      select
          count(*)
      from
          public.org_users
      where
          org_users.user_right = 'super_admin'
          AND org_users.user_id != OLD.user_id
          AND org_users.org_id=orgs.id
      ) = 0
  ) 
  AND orgs.id=OLD.org_id;

  RETURN OLD;
END;$$;

ALTER FUNCTION "public"."check_if_org_can_exist" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."check_min_rights" (
  "min_right" "public"."user_min_right",
  "org_id" "uuid",
  "app_id" character varying,
  "channel_id" bigint
) RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
BEGIN
    RETURN check_min_rights(min_right, (select auth.uid()), org_id, app_id, channel_id);
END;  
$$;

ALTER FUNCTION "public"."check_min_rights" (
  "min_right" "public"."user_min_right",
  "org_id" "uuid",
  "app_id" character varying,
  "channel_id" bigint
) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."check_min_rights" (
  "min_right" "public"."user_min_right",
  "user_id" "uuid",
  "org_id" "uuid",
  "app_id" character varying,
  "channel_id" bigint
) RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
    user_right_record RECORD; 
BEGIN
    IF user_id = NULL THEN
        RETURN false;
    END IF;

    FOR user_right_record IN 
        SELECT org_users.user_right, org_users.app_id, org_users.channel_id 
        FROM public.org_users 
        WHERE org_users.org_id = check_min_rights.org_id AND org_users.user_id = check_min_rights.user_id
    LOOP
        IF (user_right_record.user_right >= min_right AND user_right_record.app_id IS NULL AND user_right_record.channel_id IS NULL) OR
           (user_right_record.user_right >= min_right AND user_right_record.app_id = check_min_rights.app_id AND user_right_record.channel_id IS NULL) OR
           (user_right_record.user_right >= min_right AND user_right_record.app_id = check_min_rights.app_id AND user_right_record.channel_id = check_min_rights.channel_id)
        THEN
            RETURN true;
        END IF;
    END LOOP;

    RETURN false;
END;
$$;

ALTER FUNCTION "public"."check_min_rights" (
  "min_right" "public"."user_min_right",
  "user_id" "uuid",
  "org_id" "uuid",
  "app_id" character varying,
  "channel_id" bigint
) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."check_org_user_privilages" () RETURNS "trigger" LANGUAGE "plpgsql"
SET
  search_path = '' AS $$BEGIN
  IF (select current_user) IS NOT DISTINCT FROM 'postgres' THEN
    RETURN NEW;
  END IF;
  
  IF ("public"."check_min_rights"('super_admin'::"public"."user_min_right", (select auth.uid()), NEW.org_id, NULL::character varying, NULL::bigint))
  THEN
    RETURN NEW;
  END IF;

  IF NEW.user_right IS NOT DISTINCT FROM 'super_admin'::"public"."user_min_right"
  THEN
    RAISE EXCEPTION 'Admins cannot elevate privilages!';
  END IF;

  IF NEW.user_right IS NOT DISTINCT FROM 'invite_super_admin'::"public"."user_min_right"
  THEN
    RAISE EXCEPTION 'Admins cannot elevate privilages!';
  END IF;

  RETURN NEW;
END;$$;

ALTER FUNCTION "public"."check_org_user_privilages" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."check_revert_to_builtin_version" ("appid" character varying) RETURNS integer LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
BEGIN
    DECLARE
        version_id INTEGER;
    BEGIN
        SELECT id
        INTO version_id
        FROM public.app_versions
        WHERE name = 'builtin'
        AND app_id = appid;

        IF NOT FOUND THEN
            INSERT INTO app_versions(name, app_id, storage_provider)
            VALUES ('builtin', appid, 'r2')
            RETURNING id INTO version_id;
        END IF;

        RETURN version_id;
    END;
END;
$$;

ALTER FUNCTION "public"."check_revert_to_builtin_version" ("appid" character varying) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."cleanup_frequent_job_details" () RETURNS "void" LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
BEGIN
    DELETE FROM cron.job_run_details 
    WHERE job_pid IN (
        SELECT jobid 
        FROM cron.job 
        WHERE schedule = '5 seconds' OR schedule = '1 seconds'
    ) 
    AND end_time < now() - interval '1 hour';
END;
$$;

ALTER FUNCTION "public"."cleanup_frequent_job_details" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."cleanup_queue_messages" () RETURNS "void" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $_$
DECLARE
    queue_name text;
BEGIN
    -- Clean up messages older than 7 days from all queues
    FOR queue_name IN (
        SELECT name FROM pgmq.list_queues()
    ) LOOP
        -- Delete archived messages older than 7 days
        EXECUTE format('DELETE FROM pgmq.a_%I WHERE archived_at < $1', queue_name)
        USING (NOW() - INTERVAL '7 days')::timestamptz;
        
        -- Delete failed messages that have been retried more than 5 times
        EXECUTE format('DELETE FROM pgmq.q_%I WHERE read_ct > 5', queue_name);
    END LOOP;
END;
$_$;

ALTER FUNCTION "public"."cleanup_queue_messages" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."convert_bytes_to_gb" ("byt" double precision) RETURNS double precision LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
Begin
  RETURN byt / 1024.0 / 1024.0 / 1024.0;
End;
$$;

ALTER FUNCTION "public"."convert_bytes_to_gb" ("byt" double precision) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."convert_bytes_to_mb" ("byt" double precision) RETURNS double precision LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
Begin
  RETURN byt / 1024.0 / 1024.0;
End;
$$;

ALTER FUNCTION "public"."convert_bytes_to_mb" ("byt" double precision) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."convert_gb_to_bytes" ("gb" double precision) RETURNS double precision LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
Begin
  RETURN gb * 1024 * 1024 * 1024;
End;
$$;

ALTER FUNCTION "public"."convert_gb_to_bytes" ("gb" double precision) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."convert_mb_to_bytes" ("gb" double precision) RETURNS double precision LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
Begin
  RETURN gb * 1024 * 1024;
End;
$$;

ALTER FUNCTION "public"."convert_mb_to_bytes" ("gb" double precision) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."convert_number_to_percent" (
  "val" double precision,
  "max_val" double precision
) RETURNS double precision LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
BEGIN
  IF max_val = 0 THEN
    RETURN 0;
  ELSE
    RETURN round(((val * 100) / max_val)::numeric, 2);
  END IF;
END;
$$;

ALTER FUNCTION "public"."convert_number_to_percent" (
  "val" double precision,
  "max_val" double precision
) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."count_active_users" ("app_ids" character varying[]) RETURNS integer LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
BEGIN
    RETURN (
        SELECT COUNT(DISTINCT user_id)
        FROM public.apps
        WHERE app_id = ANY(app_ids)
    );
END;
$$;

ALTER FUNCTION "public"."count_active_users" ("app_ids" character varying[]) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."count_all_need_upgrade" () RETURNS integer LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
Begin
  RETURN (SELECT COUNT(*) FROM public.stripe_info WHERE is_good_plan = false AND status = 'succeeded');
End;  
$$;

ALTER FUNCTION "public"."count_all_need_upgrade" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."count_all_onboarded" () RETURNS integer LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
Begin
  RETURN (SELECT COUNT(DISTINCT owner_org) FROM public.apps);
End;  
$$;

ALTER FUNCTION "public"."count_all_onboarded" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."count_all_plans_v2" () RETURNS TABLE ("plan_name" character varying, "count" bigint) LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
BEGIN
  RETURN QUERY 
  WITH ActiveSubscriptions AS (
    SELECT DISTINCT ON (si.customer_id)
      p.name AS product_name,
      si.customer_id
    FROM public.stripe_info si
    INNER JOIN public.plans p ON si.product_id = p.stripe_id 
    WHERE si.status = 'succeeded'
    ORDER BY si.customer_id, si.created_at DESC
  ),
  TrialUsers AS (
    SELECT DISTINCT ON (si.customer_id)
      'Trial' AS product_name,
      si.customer_id
    FROM public.stripe_info si
    WHERE si.trial_at > NOW() 
    AND si.status is NULL
    AND NOT EXISTS (
      SELECT 1 FROM ActiveSubscriptions a 
      WHERE a.customer_id = si.customer_id
    )
  )
  SELECT 
    product_name as plan_name,
    COUNT(*) as count
  FROM (
    SELECT product_name, customer_id FROM ActiveSubscriptions
    UNION ALL
    SELECT product_name, customer_id FROM TrialUsers
  ) all_subs
  GROUP BY product_name;
END;
$$;

ALTER FUNCTION "public"."count_all_plans_v2" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."delete_http_response" ("request_id" bigint) RETURNS "void" LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
BEGIN
    DELETE FROM net._http_response 
    WHERE id = request_id;
END;
$$;

ALTER FUNCTION "public"."delete_http_response" ("request_id" bigint) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."delete_old_deleted_apps" () RETURNS "void" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
BEGIN
    DELETE FROM "public"."deleted_apps"
    WHERE deleted_at < NOW() - INTERVAL '35 days';
END;
$$;

ALTER FUNCTION "public"."delete_old_deleted_apps" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."delete_user" () RETURNS "void" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
  user_id uuid;
  user_email text;
  hashed_email text;
BEGIN
  -- Get the current user ID and email
  SELECT auth.uid() INTO user_id;
  SELECT email INTO user_email FROM auth.users WHERE id = user_id;
  
  -- Hash the email and store it in deleted_account table
  hashed_email := encode(digest(user_email::text, 'sha256'::text)::bytea, 'hex'::text);
  
  INSERT INTO public.deleted_account (email)
  VALUES (hashed_email);
  
  -- Trigger the queue-based deletion process
  PERFORM pgmq.send(
    'on_user_delete',
    json_build_object(
      'user_id', user_id,
      'email', user_email
    )
  );
  
  -- Delete the user from auth.users
  -- This will cascade to other tables due to foreign key constraints
  DELETE FROM auth.users WHERE id = user_id;
END;
$$;

ALTER FUNCTION "public"."delete_user" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."exist_app_v2" ("appid" character varying) RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM public.apps
  WHERE app_id=appid));
End;  
$$;

ALTER FUNCTION "public"."exist_app_v2" ("appid" character varying) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."exist_app_versions" (
  "appid" character varying,
  "name_version" character varying,
  "apikey" "text"
) RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM public.app_versions
  WHERE app_id=appid
  AND name=name_version));
End;  
$$;

ALTER FUNCTION "public"."exist_app_versions" (
  "appid" character varying,
  "name_version" character varying,
  "apikey" "text"
) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."find_best_plan_v3" (
  "mau" bigint,
  "bandwidth" double precision,
  "storage" double precision
) RETURNS character varying LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
Begin
  RETURN (SELECT name
  FROM public.plans
  WHERE plans.mau>=find_best_plan_v3.mau
    AND plans.storage>=find_best_plan_v3.storage
    AND plans.bandwidth>=find_best_plan_v3.bandwidth
    OR plans.name = 'Pay as you go'
    ORDER BY plans.mau
    LIMIT 1);
End;  
$$;

ALTER FUNCTION "public"."find_best_plan_v3" (
  "mau" bigint,
  "bandwidth" double precision,
  "storage" double precision
) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."find_fit_plan_v3" (
  "mau" bigint,
  "bandwidth" bigint,
  "storage" bigint
) RETURNS TABLE ("name" character varying) LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
BEGIN

RETURN QUERY (
  SELECT plans.name
  FROM public.plans
  WHERE plans.mau >= find_fit_plan_v3.mau
    AND plans.storage >= find_fit_plan_v3.storage
    AND plans.bandwidth >= find_fit_plan_v3.bandwidth
    OR plans.name = 'Pay as you go'
  ORDER BY plans.mau
);
END;
$$;

ALTER FUNCTION "public"."find_fit_plan_v3" (
  "mau" bigint,
  "bandwidth" bigint,
  "storage" bigint
) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."force_valid_user_id_on_app" () RETURNS "trigger" LANGUAGE "plpgsql"
SET
  search_path = '' AS $$BEGIN
  NEW.user_id = (select created_by FROM public.orgs where id = (NEW."owner_org"));

   RETURN NEW;
END;$$;

ALTER FUNCTION "public"."force_valid_user_id_on_app" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."generate_org_on_user_create" () RETURNS "trigger" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
  org_record record;
BEGIN
    -- Add management_email compared to old fn
    INSERT INTO public.orgs (created_by, name, management_email) values (NEW.id, format('%s organization', NEW.first_name), NEW.email) RETURNING * into org_record;
    -- we no longer insert into org_users here. There is a new trigger on "orgs"
    -- INSERT INTO public.org_users (user_id, org_id, user_right) values (NEW.id, org_record.id, 'super_admin'::"user_min_right");

    RETURN NEW;
END $$;

ALTER FUNCTION "public"."generate_org_on_user_create" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."generate_org_user_on_org_create" () RETURNS "trigger" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
  org_record record;
BEGIN
    INSERT INTO public.org_users (user_id, org_id, user_right) values (NEW.created_by, NEW.id, 'super_admin'::"public"."user_min_right");
    RETURN NEW;
END $$;

ALTER FUNCTION "public"."generate_org_user_on_org_create" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_apikey" () RETURNS "text" LANGUAGE "plpgsql"
SET
  search_path = '' STABLE SECURITY DEFINER PARALLEL SAFE AS $$
BEGIN
    RETURN (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='apikey');
END;
$$;

ALTER FUNCTION "public"."get_apikey" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_app_metrics" ("org_id" "uuid") RETURNS TABLE (
  "app_id" character varying,
  "date" "date",
  "mau" bigint,
  "storage" bigint,
  "bandwidth" bigint,
  "get" bigint,
  "fail" bigint,
  "install" bigint,
  "uninstall" bigint
) LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
DECLARE
    cycle_start timestamp with time zone;
    cycle_end timestamp with time zone;
BEGIN
    SELECT subscription_anchor_start, subscription_anchor_end 
    INTO cycle_start, cycle_end
    FROM public.get_cycle_info_org(org_id);
    
    RETURN QUERY
    SELECT * FROM public.get_app_metrics(org_id, cycle_start::date, cycle_end::date);
END;
$$;

ALTER FUNCTION "public"."get_app_metrics" ("org_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_app_metrics" (
  "org_id" "uuid",
  "start_date" "date",
  "end_date" "date"
) RETURNS TABLE (
  "app_id" character varying,
  "date" "date",
  "mau" bigint,
  "storage" bigint,
  "bandwidth" bigint,
  "get" bigint,
  "fail" bigint,
  "install" bigint,
  "uninstall" bigint
) LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    WITH DateSeries AS (
        SELECT generate_series(start_date, end_date, '1 day'::interval)::date AS "date"
    ),
    all_apps AS (
        -- Get active apps
        SELECT apps.app_id, apps.owner_org
        FROM public.apps
        WHERE apps.owner_org = org_id
        UNION
        -- Get deleted apps
        SELECT deleted_apps.app_id, deleted_apps.owner_org
        FROM public.deleted_apps
        WHERE deleted_apps.owner_org = org_id
    ),
    deleted_metrics AS (
        SELECT 
            deleted_apps.app_id,
            deleted_apps.deleted_at::date as date,
            COUNT(*) as deleted_count
        FROM public.deleted_apps
        WHERE deleted_apps.owner_org = org_id
        AND deleted_apps.deleted_at::date BETWEEN start_date AND end_date
        GROUP BY deleted_apps.app_id, deleted_apps.deleted_at::date
    )
    SELECT
        aa.app_id,
        ds.date::date,
        COALESCE(dm.mau, 0) AS mau,
        COALESCE(dst.storage, 0) AS storage,
        COALESCE(db.bandwidth, 0) AS bandwidth,
        COALESCE(SUM(dv.get)::bigint, 0) AS get,
        COALESCE(SUM(dv.fail)::bigint, 0) AS fail,
        COALESCE(SUM(dv.install)::bigint, 0) AS install,
        COALESCE(SUM(dv.uninstall)::bigint, 0) AS uninstall
    FROM
        all_apps aa
    CROSS JOIN 
        DateSeries ds
    LEFT JOIN 
        public.daily_mau dm ON aa.app_id = dm.app_id AND ds.date = dm.date
    LEFT JOIN 
        public.daily_storage dst ON aa.app_id = dst.app_id AND ds.date = dst.date
    LEFT JOIN 
        public.daily_bandwidth db ON aa.app_id = db.app_id AND ds.date = db.date
    LEFT JOIN 
        public.daily_version dv ON aa.app_id = dv.app_id AND ds.date = dv.date
    LEFT JOIN
        deleted_metrics del ON aa.app_id = del.app_id AND ds.date = del.date
    GROUP BY 
        aa.app_id, ds.date, dm.mau, dst.storage, db.bandwidth, del.deleted_count
    ORDER BY
        aa.app_id, ds.date;
END;
$$;

ALTER FUNCTION "public"."get_app_metrics" (
  "org_id" "uuid",
  "start_date" "date",
  "end_date" "date"
) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_app_versions" (
  "appid" character varying,
  "name_version" character varying,
  "apikey" "text"
) RETURNS integer LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
Begin
  RETURN (SELECT id
  FROM public.app_versions
  WHERE app_id=appid
  AND name=name_version
  AND owner_org=(select public.get_user_main_org_id_by_app_id(appid))
  AND public.is_member_of_org(public.get_user_id(apikey), (SELECT public.get_user_main_org_id_by_app_id(appid)))
  );
End;  
$$;

ALTER FUNCTION "public"."get_app_versions" (
  "appid" character varying,
  "name_version" character varying,
  "apikey" "text"
) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_current_plan_max_org" ("orgid" "uuid") RETURNS TABLE (
  "mau" bigint,
  "bandwidth" bigint,
  "storage" bigint
) LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
Begin
  RETURN QUERY
  (SELECT plans.mau, plans.bandwidth, plans.storage
  FROM public.plans
    WHERE stripe_id=(
      SELECT product_id
      FROM public.stripe_info
      where customer_id=(
        SELECT customer_id
        FROM public.orgs
        where id=orgid)
  ));
End;  
$$;

ALTER FUNCTION "public"."get_current_plan_max_org" ("orgid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_current_plan_name_org" ("orgid" "uuid") RETURNS character varying LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
Begin
  RETURN 
  (SELECT name
  FROM public.plans
    WHERE stripe_id=(SELECT product_id
    FROM public.stripe_info
    where customer_id=(SELECT customer_id FROM public.orgs where id=orgid)
    ));
End;  
$$;

ALTER FUNCTION "public"."get_current_plan_name_org" ("orgid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_customer_counts" () RETURNS TABLE ("yearly" bigint, "monthly" bigint, "total" bigint) LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
BEGIN
  RETURN QUERY
  WITH ActiveSubscriptions AS (
    -- Get the most recent subscription for each customer
    SELECT DISTINCT ON (customer_id)
      customer_id,
      price_id,
      status,
      trial_at
    FROM public.stripe_info
    WHERE status = 'succeeded'
    ORDER BY customer_id, created_at DESC
  )
  SELECT
    COUNT(CASE 
      WHEN s.price_id IN (SELECT price_y_id FROM public.plans WHERE price_y_id IS NOT NULL) 
      THEN 1 
    END) AS yearly,
    COUNT(CASE 
      WHEN s.price_id IN (SELECT price_m_id FROM public.plans WHERE price_m_id IS NOT NULL) 
      THEN 1 
    END) AS monthly,
    COUNT(*) AS total
  FROM ActiveSubscriptions s;
END;
$$;

ALTER FUNCTION "public"."get_customer_counts" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_cycle_info_org" ("orgid" "uuid") RETURNS TABLE (
  "subscription_anchor_start" timestamp with time zone,
  "subscription_anchor_end" timestamp with time zone
) LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
DECLARE
    customer_id_var text;
    stripe_info_row public.stripe_info%ROWTYPE;
    anchor_day INTERVAL;
    start_date timestamp with time zone;
    end_date timestamp with time zone;
BEGIN
    SELECT customer_id INTO customer_id_var FROM public.orgs WHERE id = orgid;

    -- Get the stripe_info using the customer_id
    SELECT * INTO stripe_info_row FROM public.stripe_info WHERE customer_id = customer_id_var;

    -- Extract the day of the month FROM public.subscription_anchor_start as an INTERVAL, default to '0 DAYS' if null
    anchor_day := COALESCE(stripe_info_row.subscription_anchor_start - date_trunc('MONTH', stripe_info_row.subscription_anchor_start), '0 DAYS'::INTERVAL);

    -- Determine the start date based on the anchor day and current date
    IF anchor_day > now() - date_trunc('MONTH', now()) THEN
        start_date := date_trunc('MONTH', now() - INTERVAL '1 MONTH') + anchor_day;
    ELSE
        start_date := date_trunc('MONTH', now()) + anchor_day;
    END IF;

    -- Calculate the end date
    end_date := start_date + INTERVAL '1 MONTH';

    RETURN QUERY
    SELECT start_date, end_date;
END;
$$;

ALTER FUNCTION "public"."get_cycle_info_org" ("orgid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_d1_webhook_signature" () RETURNS "text" LANGUAGE "plpgsql"
SET
  search_path = '' STABLE SECURITY DEFINER PARALLEL SAFE AS $$
BEGIN
    RETURN (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='d1_webhook_signature');
END;
$$;

ALTER FUNCTION "public"."get_d1_webhook_signature" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_db_url" () RETURNS "text" LANGUAGE "plpgsql"
SET
  search_path = '' STABLE SECURITY DEFINER PARALLEL SAFE AS $$
BEGIN
    RETURN (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='db_url');
END;
$$;

ALTER FUNCTION "public"."get_db_url" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_global_metrics" ("org_id" "uuid") RETURNS TABLE (
  "date" "date",
  "mau" bigint,
  "storage" bigint,
  "bandwidth" bigint,
  "get" bigint,
  "fail" bigint,
  "install" bigint,
  "uninstall" bigint
) LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
DECLARE
    cycle_start timestamp with time zone;
    cycle_end timestamp with time zone;
BEGIN
    SELECT subscription_anchor_start, subscription_anchor_end 
    INTO cycle_start, cycle_end
    FROM public.get_cycle_info_org(org_id);
    
    RETURN QUERY
    SELECT * FROM public.get_global_metrics(org_id, cycle_start::date, cycle_end::date);
END;
$$;

ALTER FUNCTION "public"."get_global_metrics" ("org_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_global_metrics" (
  "org_id" "uuid",
  "start_date" "date",
  "end_date" "date"
) RETURNS TABLE (
  "date" "date",
  "mau" bigint,
  "storage" bigint,
  "bandwidth" bigint,
  "get" bigint,
  "fail" bigint,
  "install" bigint,
  "uninstall" bigint
) LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
BEGIN
    RETURN QUERY
    SELECT
        metrics.date,
        SUM(metrics.mau)::bigint AS mau,
        SUM(metrics.storage)::bigint AS storage,
        SUM(metrics.bandwidth)::bigint AS bandwidth,
        SUM(metrics.get)::bigint AS get,
        SUM(metrics.fail)::bigint AS fail,
        SUM(metrics.install)::bigint AS install,
        SUM(metrics.uninstall)::bigint AS uninstall
    FROM
        public.get_app_metrics(org_id, start_date, end_date) AS metrics
    GROUP BY
        metrics.date
    ORDER BY
        metrics.date;
END;
$$;

ALTER FUNCTION "public"."get_global_metrics" (
  "org_id" "uuid",
  "start_date" "date",
  "end_date" "date"
) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_identity" () RETURNS "uuid" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
    auth_uid uuid;
Begin
  SELECT auth.uid() into auth_uid;

  -- JWT auth.uid is not null, reutrn
  IF auth_uid IS NOT NULL THEN
    return auth_uid;
  END IF;

  -- JWT is null
  RETURN NULL;
End;
$$;

ALTER FUNCTION "public"."get_identity" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_identity" ("keymode" "public"."key_mode" []) RETURNS "uuid" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
    auth_uid uuid;
    api_key_text text;
    api_key record;
Begin
  RAISE EXCEPTION 'get_identity called!';  
End;
$$;

ALTER FUNCTION "public"."get_identity" ("keymode" "public"."key_mode" []) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_identity_apikey_only" ("keymode" "public"."key_mode" []) RETURNS "uuid" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
    api_key_text text;
    api_key record;
Begin
  SELECT "public"."get_apikey_header"() into api_key_text;
  
  -- No api key found in headers, return
  IF api_key_text IS NULL THEN
    RETURN NULL;
  END IF;

  -- Fetch the api key
  select * FROM public.apikeys 
  where key=api_key_text AND
  mode=ANY(keymode)
  limit 1 into api_key;

  if api_key IS DISTINCT FROM NULL THEN
    RETURN api_key.user_id;
  END IF;

  RETURN NULL;
End;
$$;

ALTER FUNCTION "public"."get_identity_apikey_only" ("keymode" "public"."key_mode" []) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_identity_org_allowed" ("keymode" "public"."key_mode" [], "org_id" "uuid") RETURNS "uuid" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
    auth_uid uuid;
    api_key_text text;
    api_key record;
Begin
  SELECT auth.uid() into auth_uid;

  IF auth_uid IS NOT NULL THEN
    RETURN auth_uid;
  END IF;

  SELECT "public"."get_apikey_header"() into api_key_text;

  -- No api key found in headers, return
  IF api_key_text IS NULL THEN
    RETURN NULL;
  END IF;

  -- Fetch the api key
  select * FROM public.apikeys 
  where key=api_key_text AND
  mode=ANY(keymode)
  limit 1 into api_key;

  if api_key IS DISTINCT FROM  NULL THEN
    IF api_key.limited_to_orgs IS NOT NULL AND api_key.limited_to_orgs != '{}' THEN 
      IF NOT (org_id = ANY(api_key.limited_to_orgs)) THEN
          RETURN NULL;
      END IF;
    END IF;
    RETURN api_key.user_id;
  END IF;

  RETURN NULL;
End;
$$;

ALTER FUNCTION "public"."get_identity_org_allowed" ("keymode" "public"."key_mode" [], "org_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_identity_org_appid" (
  "keymode" "public"."key_mode" [],
  "org_id" "uuid",
  "app_id" character varying
) RETURNS "uuid" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
    auth_uid uuid;
    api_key_text text;
    api_key record;
Begin
  SELECT auth.uid() into auth_uid;

  IF auth_uid IS NOT NULL THEN
    RETURN auth_uid;
  END IF;

  SELECT "public"."get_apikey_header"() into api_key_text;

  -- No api key found in headers, return
  IF api_key_text IS NULL THEN
    RETURN NULL;
  END IF;

  -- Fetch the api key
  select * FROM public.apikeys 
  where key=api_key_text AND
  mode=ANY(keymode)
  limit 1 into api_key;

  if api_key IS DISTINCT FROM  NULL THEN
    IF api_key.limited_to_orgs IS NOT NULL AND api_key.limited_to_orgs != '{}' THEN 
      IF NOT (org_id = ANY(api_key.limited_to_orgs)) THEN
          RETURN NULL;
      END IF;
    END IF;
    IF api_key.limited_to_apps IS DISTINCT FROM '{}' THEN
      IF NOT (app_id = ANY(api_key.limited_to_apps)) THEN
          RETURN NULL;
      END IF;
    END IF;

    RETURN api_key.user_id;
  END IF;

  RETURN NULL;
End;
$$;

ALTER FUNCTION "public"."get_identity_org_appid" (
  "keymode" "public"."key_mode" [],
  "org_id" "uuid",
  "app_id" character varying
) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_metered_usage" () RETURNS "public"."stats_table" LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
BEGIN
    RETURN public.get_metered_usage((select auth.uid()));
END;  
$$;

ALTER FUNCTION "public"."get_metered_usage" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_metered_usage" ("orgid" "uuid") RETURNS "public"."stats_table" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
    current_usage public.stats_table;
    max_plan public.stats_table;
    result public.stats_table;
BEGIN
  -- Get the total values for the user's current usage
  SELECT * INTO current_usage FROM public.get_total_metrics(orgid);
  SELECT * INTO max_plan FROM public.get_current_plan_max_org(orgid);
  result.mau = current_usage.mau - max_plan.mau;
  result.mau = (CASE WHEN result.mau > 0 THEN result.mau ELSE 0 END);
  result.bandwidth = current_usage.bandwidth - max_plan.bandwidth;
  result.bandwidth = (CASE WHEN result.bandwidth > 0 THEN result.bandwidth ELSE 0 END);
  result.storage = current_usage.storage - max_plan.storage;
  result.storage = (CASE WHEN result.storage > 0 THEN result.storage ELSE 0 END);
  RETURN result;
END;
$$;

ALTER FUNCTION "public"."get_metered_usage" ("orgid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_next_cron_time" (
  "p_schedule" "text",
  "p_timestamp" timestamp with time zone
) RETURNS timestamp with time zone LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
DECLARE
    parts text[];
    minute_pattern text;
    hour_pattern text;
    day_pattern text;
    month_pattern text;
    dow_pattern text;
    next_minute int;
    next_hour int;
    next_time timestamp with time zone;
BEGIN
    -- Split cron expression
    parts := regexp_split_to_array(p_schedule, '\s+');
    minute_pattern := parts[1];
    hour_pattern := parts[2];
    day_pattern := parts[3];
    month_pattern := parts[4];
    dow_pattern := parts[5];

    -- Get next minute and hour
    next_minute := public.get_next_cron_value(
        minute_pattern,
        EXTRACT(MINUTE FROM p_timestamp)::int,
        60
    );
    next_hour := public.get_next_cron_value(
        hour_pattern,
        EXTRACT(HOUR FROM p_timestamp)::int,
        24
    );

    -- Calculate base next time
    next_time := date_trunc('hour', p_timestamp) + 
                 make_interval(hours => next_hour - EXTRACT(HOUR FROM p_timestamp)::int,
                             mins => next_minute);

    -- Ensure next_time is in the future
    IF next_time <= p_timestamp THEN
        IF hour_pattern LIKE '*/%' THEN
            next_time := next_time + make_interval(hours => public.parse_step_pattern(hour_pattern));
        ELSIF minute_pattern LIKE '*/%' THEN
            next_time := next_time + make_interval(mins => public.parse_step_pattern(minute_pattern));
        ELSE
            next_time := next_time + interval '1 day';
        END IF;
    END IF;

    RETURN next_time;
END;
$$;

ALTER FUNCTION "public"."get_next_cron_time" (
  "p_schedule" "text",
  "p_timestamp" timestamp with time zone
) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_next_cron_value" (
  "pattern" "text",
  "current_val" integer,
  "max_val" integer
) RETURNS integer LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
DECLARE
    next_val int;
BEGIN
    IF pattern = '*' THEN
        RETURN current_val;
    ELSIF pattern LIKE '*/%' THEN
        DECLARE
            step int := public.parse_step_pattern(pattern);
            temp_next int := current_val + (step - (current_val % step));
        BEGIN
            IF temp_next >= max_val THEN
                RETURN step;
            ELSE
                RETURN temp_next;
            END IF;
        END;
    ELSE
        RETURN pattern::int;
    END IF;
END;
$$;

ALTER FUNCTION "public"."get_next_cron_value" (
  "pattern" "text",
  "current_val" integer,
  "max_val" integer
) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_org_members" ("guild_id" "uuid") RETURNS TABLE (
  "aid" bigint,
  "uid" "uuid",
  "email" character varying,
  "image_url" character varying,
  "role" "public"."user_min_right"
) LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
begin
  IF NOT public.check_min_rights('read'::"public"."user_min_right", (select auth.uid()), get_org_members.guild_id, NULL::character varying, NULL::bigint) THEN
    raise exception 'NO_RIGHTS';
  END IF;

  return query select * FROM public.get_org_members((select auth.uid()), get_org_members.guild_id);
End;
$$;

ALTER FUNCTION "public"."get_org_members" ("guild_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_org_members" ("user_id" "uuid", "guild_id" "uuid") RETURNS TABLE (
  "aid" bigint,
  "uid" "uuid",
  "email" character varying,
  "image_url" character varying,
  "role" "public"."user_min_right"
) LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
begin
  return query select o.id as aid, users.id as uid, users.email, users.image_url, o.user_right as role FROM public.org_users as o
  JOIN public.users on users.id = o.user_id
  where o.org_id=get_org_members.guild_id
  AND public.is_member_of_org(users.id, o.org_id);
End;
$$;

ALTER FUNCTION "public"."get_org_members" ("user_id" "uuid", "guild_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_org_owner_id" ("apikey" "text", "app_id" "text") RETURNS "uuid" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
Declare  
 org_owner_id uuid;
 real_user_id uuid;
 org_id uuid;
Begin
  SELECT apps.user_id FROM public.apps WHERE apps.app_id=get_org_owner_id.app_id into org_owner_id;
  SELECT public.get_user_main_org_id_by_app_id(app_id) INTO org_id;

  SELECT user_id
  INTO real_user_id
  FROM public.apikeys
  WHERE key=apikey;

  IF (public.is_member_of_org(real_user_id, org_id) IS FALSE)
  THEN
    raise exception 'NO_RIGHTS';
  END IF;

  RETURN org_owner_id;
End;  
$$;

ALTER FUNCTION "public"."get_org_owner_id" ("apikey" "text", "app_id" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_org_perm_for_apikey" ("apikey" "text", "app_id" "text") RETURNS "text" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
<<get_org_perm_for_apikey>>
Declare  
  apikey_user_id uuid;
  org_id uuid;
  user_perm "public"."user_min_right";
BEGIN
  SELECT public.get_user_id(apikey) into apikey_user_id;

  IF apikey_user_id IS NULL THEN
    return 'INVALID_APIKEY';
  END IF;

  SELECT owner_org FROM public.apps
  INTO org_id
  WHERE apps.app_id=get_org_perm_for_apikey.app_id
  limit 1;

  IF org_id IS NULL THEN
    return 'NO_APP';
  END IF;

  SELECT user_right FROM public.org_users
  INTO user_perm
  WHERE user_id=apikey_user_id
  AND org_users.org_id=get_org_perm_for_apikey.org_id;

  IF user_perm IS NULL THEN
    return 'perm_none';
  END IF;

  -- For compatibility reasons if you are a super_admin we will return "owner"
  -- The old cli relies on this behaviour, on get_org_perm_for_apikey_v2 we will change that
  IF user_perm='super_admin'::"public"."user_min_right" THEN
    return 'perm_owner';
  END IF;

  RETURN format('perm_%s', user_perm);
END;$$;

ALTER FUNCTION "public"."get_org_perm_for_apikey" ("apikey" "text", "app_id" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_organization_cli_warnings" ("orgid" "uuid", "cli_version" "text") RETURNS "jsonb" [] LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
    messages jsonb[] := '{}';
    has_read_access boolean;
BEGIN
    -- Check if API key has read access
    SELECT public.check_min_rights('read'::"public"."user_min_right", public.get_identity_apikey_only('{write,all,upload,read}'::"public"."key_mode"[]), orgid, NULL::character varying, NULL::bigint) INTO has_read_access;

    IF NOT has_read_access THEN
        messages := array_append(messages, jsonb_build_object(
            'message', 'API key does not have read access to this organization',
            'fatal', true
        ));
        RETURN messages;
    END IF;

    -- test the user plan
    IF (public.is_paying_and_good_plan_org_action(orgid, ARRAY['mau']::"public"."action_type"[]) = true AND public.is_paying_and_good_plan_org_action(orgid, ARRAY['bandwidth']::"public"."action_type"[]) = true AND public.is_paying_and_good_plan_org_action(orgid, ARRAY['storage']::"public"."action_type"[]) = false) THEN
        messages := array_append(messages, jsonb_build_object(
            'message', 'You have exceeded your storage limit.\nUpload will fail, but you can still download your data.\nMAU and bandwidth limits are not exceeded.\nIn order to upload your data, please upgrade your plan here: https://web.capgo.app/settings/plans.',
            'fatal', true
        ));
    END IF;

    RETURN messages;
END;
$$;

ALTER FUNCTION "public"."get_organization_cli_warnings" ("orgid" "uuid", "cli_version" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_orgs_v6" () RETURNS TABLE (
  "gid" "uuid",
  "created_by" "uuid",
  "logo" "text",
  "name" "text",
  "role" character varying,
  "paying" boolean,
  "trial_left" integer,
  "can_use_more" boolean,
  "is_canceled" boolean,
  "app_count" bigint,
  "subscription_start" timestamp with time zone,
  "subscription_end" timestamp with time zone,
  "management_email" "text",
  "is_yearly" boolean
) LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
  api_key_text text;
  api_key record;
  user_id uuid;
BEGIN
  SELECT "public"."get_apikey_header"() into api_key_text;
  user_id := NULL;
  
  -- Check for API key first
  IF api_key_text IS NOT NULL THEN
    SELECT * FROM public.apikeys WHERE key=api_key_text into api_key;
    
    IF api_key IS NULL THEN
      RAISE EXCEPTION 'Invalid API key provided';
    END IF;
    
    user_id := api_key.user_id;
    
    -- Check limited_to_orgs only if api_key exists and has restrictions
    IF api_key.limited_to_orgs IS NOT NULL AND api_key.limited_to_orgs != '{}' THEN    
      return query select orgs.* FROM public.get_orgs_v6(user_id) orgs 
      where orgs.gid = ANY(api_key.limited_to_orgs::uuid[]);
      RETURN;
    END IF;
  END IF;

  -- If no valid API key user_id yet, try to get FROM public.identity
  IF user_id IS NULL THEN
    SELECT public.get_identity() into user_id;
    
    IF user_id IS NULL THEN
      RAISE EXCEPTION 'No authentication provided - API key or valid session required';
    END IF;
  END IF;

  return query select * FROM public.get_orgs_v6(user_id);
END;  
$$;

ALTER FUNCTION "public"."get_orgs_v6" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_orgs_v6" ("userid" "uuid") RETURNS TABLE (
  "gid" "uuid",
  "created_by" "uuid",
  "logo" "text",
  "name" "text",
  "role" character varying,
  "paying" boolean,
  "trial_left" integer,
  "can_use_more" boolean,
  "is_canceled" boolean,
  "app_count" bigint,
  "subscription_start" timestamp with time zone,
  "subscription_end" timestamp with time zone,
  "management_email" "text",
  "is_yearly" boolean
) LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY 
  SELECT 
    sub.id AS gid, 
    sub.created_by, 
    sub.logo, 
    sub.name, 
    org_users.user_right::varchar AS role, 
    public.is_paying_org(sub.id) AS paying,
    public.is_trial_org(sub.id) AS trial_left, 
    public.is_allowed_action_org(sub.id) AS can_use_more,
    public.is_canceled_org(sub.id) AS is_canceled,
    (SELECT count(*) FROM public.apps WHERE owner_org = sub.id) AS app_count,
    (sub.f).subscription_anchor_start AS subscription_start,
    (sub.f).subscription_anchor_end AS subscription_end,
    sub.management_email AS management_email,
    public.is_org_yearly(sub.id) AS is_yearly
  FROM (
    SELECT public.get_cycle_info_org(o.id) AS f, o.* AS o FROM public.orgs AS o
  ) sub
  JOIN public.org_users ON (org_users."user_id" = get_orgs_v6.userid AND sub.id = org_users."org_id");
END;  
$$;

ALTER FUNCTION "public"."get_orgs_v6" ("userid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_plan_usage_percent_detailed" ("orgid" "uuid") RETURNS TABLE (
  "total_percent" double precision,
  "mau_percent" double precision,
  "bandwidth_percent" double precision,
  "storage_percent" double precision
) LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
    cycle_start date;
    cycle_end date;
BEGIN
  -- Get the start and end dates of the current billing cycle
  SELECT subscription_anchor_start::date, subscription_anchor_end::date
  INTO cycle_start, cycle_end
  FROM public.get_cycle_info_org(orgid);
  
  -- Call the function with billing cycle dates as parameters
  RETURN QUERY
  SELECT * FROM public.get_plan_usage_percent_detailed(orgid, cycle_start, cycle_end);
END;
$$;

ALTER FUNCTION "public"."get_plan_usage_percent_detailed" ("orgid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_plan_usage_percent_detailed" (
  "orgid" "uuid",
  "cycle_start" "date",
  "cycle_end" "date"
) RETURNS TABLE (
  "total_percent" double precision,
  "mau_percent" double precision,
  "bandwidth_percent" double precision,
  "storage_percent" double precision
) LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
    current_plan_max public.stats_table;
    total_stats public.stats_table;
    percent_mau double precision;
    percent_bandwidth double precision;
    percent_storage double precision;
BEGIN
  -- Get the maximum values for the user's current plan
  current_plan_max := public.get_current_plan_max_org(orgid);
  
  -- Get the user's maximum usage stats for the specified billing cycle
  SELECT mau, bandwidth, storage
  INTO total_stats
  FROM public.get_total_metrics(orgid, cycle_start, cycle_end);
  
  -- Calculate the percentage of usage for each stat
  percent_mau := public.convert_number_to_percent(total_stats.mau, current_plan_max.mau);
  percent_bandwidth := public.convert_number_to_percent(total_stats.bandwidth, current_plan_max.bandwidth);
  percent_storage := public.convert_number_to_percent(total_stats.storage, current_plan_max.storage);

  -- Return the total usage percentage and the individual usage percentages
  RETURN QUERY SELECT
    GREATEST(percent_mau, percent_bandwidth, percent_storage) AS total_percent,
    percent_mau AS mau_percent,
    percent_bandwidth AS bandwidth_percent,
    percent_storage AS storage_percent;
END;
$$;

ALTER FUNCTION "public"."get_plan_usage_percent_detailed" (
  "orgid" "uuid",
  "cycle_start" "date",
  "cycle_end" "date"
) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_process_cron_stats_job_info" () RETURNS TABLE (
  "last_run" timestamp with time zone,
  "next_run" timestamp with time zone
) LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    WITH last_run AS (
        SELECT start_time
        FROM cron.job_run_details
        WHERE command = 'SELECT process_cron_stats_jobs();'
        AND status = 'succeeded'
        ORDER BY start_time DESC
        LIMIT 1
    ),
    job_info AS (
        SELECT schedule
        FROM cron.job
        WHERE jobname = 'process_cron_stats_jobs'
    )
    SELECT 
        COALESCE(last_run.start_time, CURRENT_TIMESTAMP - INTERVAL '1 day') AS last_run,
        public.get_next_cron_time(job_info.schedule, CURRENT_TIMESTAMP) AS next_run
    FROM job_info
    LEFT JOIN last_run ON true;
END;
$$;

ALTER FUNCTION "public"."get_process_cron_stats_job_info" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_total_app_storage_size_orgs" ("org_id" "uuid", "app_id" character varying) RETURNS double precision LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
    total_size double precision := 0;
BEGIN
    SELECT COALESCE(SUM(app_versions_meta.size), 0) INTO total_size
    FROM public.app_versions
    INNER JOIN public.app_versions_meta ON app_versions.id = app_versions_meta.id
    WHERE app_versions.owner_org = org_id
    AND app_versions.app_id = get_total_app_storage_size_orgs.app_id
    AND app_versions.deleted = false;

    RETURN total_size;
END;  
$$;

ALTER FUNCTION "public"."get_total_app_storage_size_orgs" ("org_id" "uuid", "app_id" character varying) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_total_metrics" ("org_id" "uuid") RETURNS TABLE (
  "mau" bigint,
  "storage" bigint,
  "bandwidth" bigint,
  "get" bigint,
  "fail" bigint,
  "install" bigint,
  "uninstall" bigint
) LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
DECLARE
    cycle_start timestamp with time zone;
    cycle_end timestamp with time zone;
BEGIN
    SELECT subscription_anchor_start, subscription_anchor_end 
    INTO cycle_start, cycle_end
    FROM public.get_cycle_info_org(org_id);
    
    RETURN QUERY
    SELECT * FROM public.get_total_metrics(org_id, cycle_start::date, cycle_end::date);
END;
$$;

ALTER FUNCTION "public"."get_total_metrics" ("org_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_total_metrics" (
  "org_id" "uuid",
  "start_date" "date",
  "end_date" "date"
) RETURNS TABLE (
  "mau" bigint,
  "storage" bigint,
  "bandwidth" bigint,
  "get" bigint,
  "fail" bigint,
  "install" bigint,
  "uninstall" bigint
) LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(metrics.mau), 0)::bigint AS mau,
        COALESCE(public.get_total_storage_size_org(org_id), 0)::bigint AS storage,
        COALESCE(SUM(metrics.bandwidth), 0)::bigint AS bandwidth,
        COALESCE(SUM(metrics.get), 0)::bigint AS get,
        COALESCE(SUM(metrics.fail), 0)::bigint AS fail,
        COALESCE(SUM(metrics.install), 0)::bigint AS install,
        COALESCE(SUM(metrics.uninstall), 0)::bigint AS uninstall
    FROM
        public.get_app_metrics(org_id, start_date, end_date) AS metrics;
END;
$$;

ALTER FUNCTION "public"."get_total_metrics" (
  "org_id" "uuid",
  "start_date" "date",
  "end_date" "date"
) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_total_storage_size_org" ("org_id" "uuid") RETURNS double precision LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
    total_size double precision := 0;
BEGIN
    SELECT COALESCE(SUM(app_versions_meta.size), 0) INTO total_size
    FROM public.app_versions
    INNER JOIN public.app_versions_meta ON app_versions.id = app_versions_meta.id
    WHERE app_versions.owner_org = org_id
    AND app_versions.deleted = false;

    RETURN total_size;
END;  
$$;

ALTER FUNCTION "public"."get_total_storage_size_org" ("org_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_update_stats" () RETURNS TABLE (
  "app_id" character varying,
  "failed" bigint,
  "install" bigint,
  "get" bigint,
  "success_rate" numeric,
  "healthy" boolean
) LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    WITH stats AS (
        SELECT
            version_usage.app_id,
            COALESCE(SUM(CASE WHEN action = 'fail' THEN 1 ELSE 0 END), 0) AS failed,
            COALESCE(SUM(CASE WHEN action = 'install' THEN 1 ELSE 0 END), 0) AS install,
            COALESCE(SUM(CASE WHEN action = 'get' THEN 1 ELSE 0 END), 0) AS get
        FROM
            public.version_usage
        WHERE
            timestamp >= (date_trunc('minute', now()) - INTERVAL '10 minutes')
            AND timestamp < (date_trunc('minute', now()) - INTERVAL '9 minutes')
        GROUP BY
            version_usage.app_id
    )
    SELECT
        stats.app_id,
        stats.failed,
        stats.install,
        stats.get,
        CASE
            WHEN (stats.install + stats.get) > 0 THEN
                ROUND((stats.get::numeric / (stats.install + stats.get)) * 100, 2)
            ELSE 100
        END AS success_rate,
        CASE
            WHEN (stats.install + stats.get) > 0 THEN
                ((stats.get::numeric / (stats.install + stats.get)) * 100 >= 70)
            ELSE true
        END AS healthy
    FROM
        stats
    WHERE
        stats.get > 0;
END;
$$;

ALTER FUNCTION "public"."get_update_stats" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_user_id" ("apikey" "text") RETURNS "uuid" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
Declare  
 is_found uuid;
Begin
  SELECT user_id
  INTO is_found
  FROM public.apikeys
  WHERE key=apikey;
  RETURN is_found;
End;  
$$;

ALTER FUNCTION "public"."get_user_id" ("apikey" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_user_id" ("apikey" "text", "app_id" "text") RETURNS "uuid" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
Declare  
 real_user_id uuid;
Begin
  SELECT public.get_user_id(apikey) into real_user_id;

  RETURN real_user_id;
End;  
$$;

ALTER FUNCTION "public"."get_user_id" ("apikey" "text", "app_id" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_user_main_org_id" ("user_id" "uuid") RETURNS "uuid" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
  org_id uuid;
begin
  select orgs.id FROM public.orgs
  into org_id
  where orgs.created_by=get_user_main_org_id.user_id
  limit 1;

  return org_id;
End;
$$;

ALTER FUNCTION "public"."get_user_main_org_id" ("user_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_user_main_org_id_by_app_id" ("app_id" "text") RETURNS "uuid" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
  org_id uuid;
begin
  select apps.owner_org FROM public.apps
  into org_id
  where ((apps.app_id)::text = (get_user_main_org_id_by_app_id.app_id)::text)
  limit 1;

  return org_id;
End;
$$;

ALTER FUNCTION "public"."get_user_main_org_id_by_app_id" ("app_id" "text") OWNER TO "postgres";

SET
  default_tablespace = '';

SET
  default_table_access_method = "heap";

CREATE TABLE IF NOT EXISTS "public"."app_versions" (
  "id" bigint NOT NULL,
  "created_at" timestamp with time zone DEFAULT "now" (),
  "app_id" character varying NOT NULL,
  "name" character varying NOT NULL,
  "updated_at" timestamp with time zone DEFAULT "now" (),
  "deleted" boolean DEFAULT false NOT NULL,
  "external_url" character varying,
  "checksum" character varying,
  "session_key" character varying,
  "storage_provider" "text" DEFAULT 'r2'::"text" NOT NULL,
  "min_update_version" character varying,
  "native_packages" "jsonb" [],
  "owner_org" "uuid" NOT NULL,
  "user_id" "uuid",
  "r2_path" character varying,
  "manifest" "public"."manifest_entry" [],
  "link" "text",
  "comment" "text"
);

ALTER TABLE "public"."app_versions" OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_apikey_header" () RETURNS "text" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
  headers_text text;
BEGIN
  headers_text := "current_setting"('request.headers'::"text", true);
  
  IF headers_text IS NULL OR headers_text = '' THEN
    RETURN NULL;
  END IF;
  
  BEGIN
    RETURN (headers_text::"json" ->> 'capgkey'::"text");
  EXCEPTION
    WHEN OTHERS THEN
      RETURN NULL;
  END;
END;
$$;

ALTER FUNCTION "public"."get_apikey_header" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_versions_with_no_metadata" () RETURNS SETOF "public"."app_versions" LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
BEGIN
  RETURN QUERY
  SELECT app_versions.* FROM public.app_versions
  LEFT JOIN public.app_versions_meta ON app_versions_meta.id=app_versions.id
  where coalesce(app_versions_meta.size, 0) = 0
  AND app_versions.deleted=false
  AND app_versions.storage_provider != 'external'
  AND now() - app_versions.created_at > interval '120 seconds';
END;
$$;

ALTER FUNCTION "public"."get_versions_with_no_metadata" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_weekly_stats" ("app_id" character varying) RETURNS TABLE (
  "all_updates" bigint,
  "failed_updates" bigint,
  "open_app" bigint
) LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
DECLARE
    seven_days_ago DATE;
    all_updates bigint;
    failed_updates bigint;
BEGIN
    seven_days_ago := CURRENT_DATE - INTERVAL '7 days';

    SELECT COALESCE(SUM(install), 0)
    INTO all_updates
    FROM public.daily_version
    WHERE date BETWEEN seven_days_ago AND CURRENT_DATE
    AND public.daily_version.app_id = get_weekly_stats.app_id;

    SELECT COALESCE(SUM(fail), 0)
    INTO failed_updates
    FROM public.daily_version
    WHERE date BETWEEN seven_days_ago AND CURRENT_DATE
    AND public.daily_version.app_id = get_weekly_stats.app_id;

    SELECT COALESCE(SUM(get), 0)
    INTO open_app
    FROM public.daily_version
    WHERE date BETWEEN seven_days_ago AND CURRENT_DATE
    AND public.daily_version.app_id = get_weekly_stats.app_id;

    RETURN QUERY SELECT all_updates, failed_updates, open_app;
END;
$$;

ALTER FUNCTION "public"."get_weekly_stats" ("app_id" character varying) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."has_app_right" (
  "appid" character varying,
  "right" "public"."user_min_right"
) RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
Begin
  RETURN public.has_app_right_userid("appid", "right", (select auth.uid()));
End;
$$;

ALTER FUNCTION "public"."has_app_right" (
  "appid" character varying,
  "right" "public"."user_min_right"
) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."has_app_right_apikey" (
  "appid" character varying,
  "right" "public"."user_min_right",
  "userid" "uuid",
  "apikey" "text"
) RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE 
  org_id uuid;
  api_key record;
Begin
  org_id := public.get_user_main_org_id_by_app_id(appid);

  SELECT * FROM public.apikeys WHERE key = apikey INTO api_key;
  IF api_key.limited_to_orgs IS NOT NULL AND api_key.limited_to_orgs != '{}' THEN 
      IF NOT (org_id = ANY(api_key.limited_to_orgs)) THEN
          RETURN false;
      END IF;
  END IF;

  IF api_key.limited_to_apps IS DISTINCT FROM '{}' THEN
    IF NOT (appid = ANY(api_key.limited_to_apps)) THEN
        RETURN false;
    END IF;
  END IF;

  RETURN (public.check_min_rights("right", userid, org_id, "appid", NULL::bigint));
End;
$$;

ALTER FUNCTION "public"."has_app_right_apikey" (
  "appid" character varying,
  "right" "public"."user_min_right",
  "userid" "uuid",
  "apikey" "text"
) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."has_app_right_userid" (
  "appid" character varying,
  "right" "public"."user_min_right",
  "userid" "uuid"
) RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE 
  org_id uuid;
Begin
  org_id := public.get_user_main_org_id_by_app_id(appid);

  RETURN public.check_min_rights("right", userid, org_id, "appid", NULL::bigint);
End;
$$;

ALTER FUNCTION "public"."has_app_right_userid" (
  "appid" character varying,
  "right" "public"."user_min_right",
  "userid" "uuid"
) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."invite_user_to_org" (
  "email" character varying,
  "org_id" "uuid",
  "invite_type" "public"."user_min_right"
) RETURNS character varying LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
Declare  
  org record;
  invited_user record;
  current_record record;
Begin
  SELECT * FROM public.orgs
  INTO org
  WHERE orgs.id=invite_user_to_org.org_id;

  IF org IS NULL THEN
    return 'NO_ORG';
  END IF;

  if NOT (public.check_min_rights('admin'::"public"."user_min_right", (select "public"."get_identity_org_allowed"('{read,upload,write,all}'::"public"."key_mode"[], invite_user_to_org.org_id)), invite_user_to_org.org_id, NULL::character varying, NULL::bigint)) THEN
    return 'NO_RIGHTS';
  END IF;


  if NOT (public.check_min_rights('super_admin'::"public"."user_min_right", (select "public"."get_identity_org_allowed"('{read,upload,write,all}'::"public"."key_mode"[], invite_user_to_org.org_id)), invite_user_to_org.org_id, NULL::character varying, NULL::bigint) AND (invite_type is distinct from 'super_admin'::"public"."user_min_right" or invite_type is distinct from 'invite_super_admin'::"public"."user_min_right")) THEN
    return 'NO_RIGHTS';
  END IF;

  SELECT users.id FROM public.users
  INTO invited_user
  WHERE users.email=invite_user_to_org.email;

  IF invited_user IS NOT NULL THEN
    -- INSERT INTO publicorg_users (user_id, org_id, user_right)
    -- VALUES (invited_user.id, invite_user_to_org.org_id, invite_type);

    SELECT org_users.id FROM public.org_users 
    INTO current_record
    WHERE org_users.user_id=invited_user.id
    AND org_users.org_id=invite_user_to_org.org_id;

    IF current_record IS NOT NULL THEN
      RETURN 'ALREADY_INVITED';
    ELSE
      INSERT INTO public.org_users (user_id, org_id, user_right)
      VALUES (invited_user.id, invite_user_to_org.org_id, invite_type);

      RETURN 'OK';
    END IF;
  ELSE
    return 'NO_EMAIL';
  END IF;
End;
$$;

ALTER FUNCTION "public"."invite_user_to_org" (
  "email" character varying,
  "org_id" "uuid",
  "invite_type" "public"."user_min_right"
) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_admin" () RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
BEGIN
    RETURN public.is_admin((select auth.uid()));
END;  
$$;

ALTER FUNCTION "public"."is_admin" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_admin" ("userid" "uuid") RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
  admin_ids_jsonb JSONB;
  is_admin_flag BOOLEAN;
  mfa_verified BOOLEAN;
BEGIN
  -- Fetch the JSONB string of admin user IDs from the vault
  SELECT decrypted_secret INTO admin_ids_jsonb FROM vault.decrypted_secrets WHERE name = 'admin_users';
  
  -- Check if the provided userid is within the JSONB array of admin user IDs
  is_admin_flag := (admin_ids_jsonb ? userid::text);
  
  -- Verify MFA status for the user
  SELECT public.verify_mfa() INTO mfa_verified;
  
  -- An admin with no logged 2FA should not have his admin perms granted
  RETURN is_admin_flag AND mfa_verified;
END;  
$$;

ALTER FUNCTION "public"."is_admin" ("userid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_allowed_action" ("apikey" "text", "appid" "text") RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
Begin
  RETURN public.is_allowed_action_org((select owner_org FROM public.apps where app_id=appid));
End;
$$;

ALTER FUNCTION "public"."is_allowed_action" ("apikey" "text", "appid" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_allowed_action_org" ("orgid" "uuid") RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
Begin
    RETURN public.is_paying_and_good_plan_org(orgid);
End;
$$;

ALTER FUNCTION "public"."is_allowed_action_org" ("orgid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_allowed_action_org_action" (
  "orgid" "uuid",
  "actions" "public"."action_type" []
) RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
Begin
    RETURN public.is_paying_and_good_plan_org_action(orgid, actions);
End;
$$;

ALTER FUNCTION "public"."is_allowed_action_org_action" (
  "orgid" "uuid",
  "actions" "public"."action_type" []
) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_allowed_capgkey" ("apikey" "text", "keymode" "public"."key_mode" []) RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM public.apikeys
  WHERE key=apikey
  AND mode=ANY(keymode)));
End;  
$$;

ALTER FUNCTION "public"."is_allowed_capgkey" ("apikey" "text", "keymode" "public"."key_mode" []) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_allowed_capgkey" (
  "apikey" "text",
  "keymode" "public"."key_mode" [],
  "app_id" character varying
) RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM public.apikeys
  WHERE key=apikey
  AND mode=ANY(keymode))) AND public.is_app_owner(public.get_user_id(apikey), app_id);
End;  
$$;

ALTER FUNCTION "public"."is_allowed_capgkey" (
  "apikey" "text",
  "keymode" "public"."key_mode" [],
  "app_id" character varying
) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_app_owner" ("appid" character varying) RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
BEGIN
    RETURN public.is_app_owner((select auth.uid()), appid);
END;  
$$;

ALTER FUNCTION "public"."is_app_owner" ("appid" character varying) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_app_owner" ("apikey" "text", "appid" character varying) RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
Begin
  RETURN public.is_app_owner(public.get_user_id(apikey), appid);
End;
$$;

ALTER FUNCTION "public"."is_app_owner" ("apikey" "text", "appid" character varying) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_app_owner" ("userid" "uuid", "appid" character varying) RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM public.apps
  WHERE app_id=appid
  AND user_id=userid));
End;  
$$;

ALTER FUNCTION "public"."is_app_owner" ("userid" "uuid", "appid" character varying) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_bandwidth_exceeded_by_org" ("org_id" "uuid") RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' STABLE AS $$
BEGIN
    RETURN (SELECT bandwidth_exceeded
    FROM public.stripe_info
    WHERE stripe_info.customer_id = (SELECT customer_id FROM public.orgs WHERE id = is_bandwidth_exceeded_by_org.org_id));
END;
$$;

ALTER FUNCTION "public"."is_bandwidth_exceeded_by_org" ("org_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_canceled_org" ("orgid" "uuid") RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM public.stripe_info
  where customer_id=(SELECT customer_id FROM public.orgs where id=orgid)
  AND status = 'canceled'));
End;  
$$;

ALTER FUNCTION "public"."is_canceled_org" ("orgid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_good_plan_v5_org" ("orgid" "uuid") RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
    total_metrics RECORD;
    current_plan_name TEXT;
BEGIN
  SELECT * INTO total_metrics FROM public.get_total_metrics(orgid);
  current_plan_name := (SELECT public.get_current_plan_name_org(orgid));
  
  RETURN EXISTS (
    SELECT 1 
    FROM public.find_fit_plan_v3(
      total_metrics.mau,
      total_metrics.bandwidth,
      total_metrics.storage
    ) 
    WHERE find_fit_plan_v3.name = current_plan_name
  );
END;
$$;

ALTER FUNCTION "public"."is_good_plan_v5_org" ("orgid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_mau_exceeded_by_org" ("org_id" "uuid") RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' STABLE AS $$
BEGIN
    RETURN (SELECT mau_exceeded
    FROM public.stripe_info
    WHERE stripe_info.customer_id = (SELECT customer_id FROM public.orgs WHERE id = is_mau_exceeded_by_org.org_id));
END;
$$;

ALTER FUNCTION "public"."is_mau_exceeded_by_org" ("org_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_member_of_org" ("user_id" "uuid", "org_id" "uuid") RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
Declare
 is_found integer;
Begin
  SELECT count(*)
  INTO is_found
  FROM public.orgs
  JOIN public.org_users on org_users.org_id = orgs.id
  WhERE org_users.user_id = is_member_of_org.user_id AND
  orgs.id = is_member_of_org.org_id;
  RETURN is_found != 0;
End;
$$;

ALTER FUNCTION "public"."is_member_of_org" ("user_id" "uuid", "org_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_not_deleted" ("email_check" character varying) RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
Declare  
 is_found integer;
Begin
  SELECT count(*)
  INTO is_found
  FROM public.deleted_account
  WHERE email=email_check;
  RETURN is_found = 0;
End; 
$$;

ALTER FUNCTION "public"."is_not_deleted" ("email_check" character varying) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_numeric" ("text") RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' AS $_$
BEGIN
    RETURN $1 ~ '^[0-9]+$';
END;
$_$;

ALTER FUNCTION "public"."is_numeric" ("text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_onboarded_org" ("orgid" "uuid") RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM public.apps
  WHERE owner_org=orgid)) AND (SELECT EXISTS (SELECT 1
  FROM public.app_versions
  WHERE owner_org=orgid));
End;
$$;

ALTER FUNCTION "public"."is_onboarded_org" ("orgid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_onboarding_needed_org" ("orgid" "uuid") RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
Begin
  RETURN (NOT public.is_onboarded_org(orgid)) AND public.is_trial_org(orgid) = 0;
End;
$$;

ALTER FUNCTION "public"."is_onboarding_needed_org" ("orgid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_org_yearly" ("orgid" "uuid") RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
    is_yearly boolean;
BEGIN
    SELECT 
        CASE
            WHEN si.price_id = p.price_y_id THEN true
            ELSE false
        END INTO is_yearly
    FROM public.orgs o
    JOIN public.stripe_info si ON o.customer_id = si.customer_id
    JOIN public.plans p ON si.product_id = p.stripe_id
    WHERE o.id = orgid
    LIMIT 1;

    RETURN COALESCE(is_yearly, false);
END;
$$;

ALTER FUNCTION "public"."is_org_yearly" ("orgid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_paying_and_good_plan_org" ("orgid" "uuid") RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM public.stripe_info
  where customer_id=(SELECT customer_id FROM public.orgs where id=orgid)
  AND (
    (status = 'succeeded' AND is_good_plan = true)
    OR (trial_at::date - (now())::date > 0)
  )
  )
);
End;  
$$;

ALTER FUNCTION "public"."is_paying_and_good_plan_org" ("orgid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_paying_and_good_plan_org_action" (
  "orgid" "uuid",
  "actions" "public"."action_type" []
) RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
    org_customer_id text;
    exceeded boolean := false;
BEGIN
    -- Get customer_id once
    SELECT o.customer_id INTO org_customer_id
    FROM public.orgs o WHERE o.id = orgid;

    -- Check if any action is exceeded
    SELECT EXISTS (
        SELECT 1 FROM public.stripe_info
        WHERE customer_id = org_customer_id
        AND (
            ('mau' = ANY(actions) AND mau_exceeded)
            OR ('storage' = ANY(actions) AND storage_exceeded)
            OR ('bandwidth' = ANY(actions) AND bandwidth_exceeded)
        )
    ) INTO exceeded;

    -- Return final check
    RETURN EXISTS (
        SELECT 1
        FROM public.stripe_info
        WHERE customer_id = org_customer_id
        AND (
            trial_at::date - (now())::date > 0
            OR (status = 'succeeded' AND NOT exceeded)
        )
    );
END;
$$;

ALTER FUNCTION "public"."is_paying_and_good_plan_org_action" (
  "orgid" "uuid",
  "actions" "public"."action_type" []
) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_paying_org" ("orgid" "uuid") RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM public.stripe_info
  where customer_id=(SELECT customer_id FROM public.orgs where id=orgid)
  AND status = 'succeeded'));
End;  
$$;

ALTER FUNCTION "public"."is_paying_org" ("orgid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_storage_exceeded_by_org" ("org_id" "uuid") RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' STABLE AS $$
BEGIN
    RETURN (SELECT storage_exceeded
    FROM public.stripe_info
    WHERE stripe_info.customer_id = (SELECT customer_id FROM public.orgs WHERE id = is_storage_exceeded_by_org.org_id));
END;
$$;

ALTER FUNCTION "public"."is_storage_exceeded_by_org" ("org_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_trial_org" ("orgid" "uuid") RETURNS integer LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
Begin
  RETURN (SELECT GREATEST((trial_at::date - (now())::date), 0) AS days
  FROM public.stripe_info
  where customer_id=(SELECT customer_id FROM public.orgs where id=orgid));
End;  
$$;

ALTER FUNCTION "public"."is_trial_org" ("orgid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."noupdate" () RETURNS "trigger" LANGUAGE "plpgsql"
SET
  search_path = '' AS $_$
DECLARE
    val RECORD;
    is_diffrent boolean;
BEGIN
    -- API key? We do not care
    IF (select auth.uid()) IS NULL THEN
        RETURN NEW;
    END IF;

    -- If the user has the 'admin' role then we do not care
    IF public.check_min_rights('admin'::"public"."user_min_right", (select auth.uid()), OLD.owner_org, NULL::character varying, NULL::bigint) THEN
        RETURN NEW;
    END IF;

    for val in
      select * from json_each_text(row_to_json(NEW))
    loop
      -- raise warning '?? % % %', val.key, val.value, format('SELECT (NEW."%s" <> OLD."%s")', val.key, val.key);

      EXECUTE format('SELECT ($1."%s" is distinct from $2."%s")', val.key, val.key) using NEW, OLD
      INTO is_diffrent;

      IF is_diffrent AND val.key <> 'version' AND val.key <> 'updated_at' THEN
          RAISE EXCEPTION 'not allowed %', val.key;
      END IF;
    end loop;

   RETURN NEW;
END;$_$;

ALTER FUNCTION "public"."noupdate" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."one_month_ahead" () RETURNS timestamp without time zone LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
BEGIN
   RETURN NOW() + INTERVAL '1 month';
END;
$$;

ALTER FUNCTION "public"."one_month_ahead" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."parse_cron_field" (
  "field" "text",
  "current_val" integer,
  "max_val" integer
) RETURNS integer LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
BEGIN
    IF field = '*' THEN
        RETURN current_val;
    ELSIF public.is_numeric(field) THEN
        RETURN field::int;
    ELSIF field LIKE '*/%' THEN
        DECLARE
            step int := regexp_replace(field, '\*/(\d+)', '\1')::int;
            next_val int := current_val + (step - (current_val % step));
        BEGIN
            IF next_val >= max_val THEN
                RETURN step;
            ELSE
                RETURN next_val;
            END IF;
        END;
    ELSE
        RETURN 0;
    END IF;
END;
$$;

ALTER FUNCTION "public"."parse_cron_field" (
  "field" "text",
  "current_val" integer,
  "max_val" integer
) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."parse_step_pattern" ("pattern" "text") RETURNS integer LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
BEGIN
    RETURN (regexp_replace(pattern, '\*/(\d+)', '\1'))::int;
END;
$$;

ALTER FUNCTION "public"."parse_step_pattern" ("pattern" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."process_admin_stats" () RETURNS "void" LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
DECLARE
  org_record RECORD;
BEGIN
    PERFORM pgmq.send('admin_stats',
      jsonb_build_object(
        'function_name', 'logsnag_insights',
        'function_type', 'cloudflare',
        'payload', jsonb_build_object()
      )
    );
END;
$$;

ALTER FUNCTION "public"."process_admin_stats" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."process_cron_stats_jobs" () RETURNS "void" LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
DECLARE
  app_record RECORD;
BEGIN
  FOR app_record IN (
    SELECT DISTINCT av.app_id, av.owner_org
    FROM public.app_versions av
    WHERE av.created_at >= NOW() - INTERVAL '30 days'
    
    UNION
    
    SELECT DISTINCT dm.app_id, av.owner_org
    FROM public.daily_mau dm
    JOIN public.app_versions av ON dm.app_id = av.app_id
    WHERE dm.date >= NOW() - INTERVAL '30 days' AND dm.mau > 0
  )
  LOOP
    PERFORM pgmq.send('cron_stats', 
      jsonb_build_object(
        'function_name', 'cron_stats',
        'function_type', 'cloudflare',
        'payload', jsonb_build_object(
          'appId', app_record.app_id,
          'orgId', app_record.owner_org,
          'todayOnly', false
        )
      )
    );
  END LOOP;
END;
$$;

ALTER FUNCTION "public"."process_cron_stats_jobs" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."process_d1_replication_batch" () RETURNS "void" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
  queue_size bigint;
  calls_needed int;
  i int;
BEGIN
  -- Check if the webhook signature is set
  IF public.get_d1_webhook_signature() IS NOT NULL THEN
    -- Get the queue size by counting rows in the table
    SELECT count(*) INTO queue_size
    FROM pgmq.q_replicate_data;

    -- Call the endpoint only if the queue is not empty
    IF queue_size > 0 THEN
      -- Calculate how many times to call the sync endpoint (1 call per 1000 items, max 10 calls)
      calls_needed := least(ceil(queue_size / 1000.0)::int, 10);

      -- Call the endpoint multiple times if needed
      FOR i IN 1..calls_needed LOOP
        PERFORM net.http_post(
          url := 'https://sync.capgo.app/sync',
          headers := jsonb_build_object('x-webhook-signature', public.get_d1_webhook_signature())
        );
      END LOOP;
    END IF;
  END IF;
END;
$$;

ALTER FUNCTION "public"."process_d1_replication_batch" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."process_failed_uploads" () RETURNS "void" LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
DECLARE
  failed_version RECORD;
BEGIN
  FOR failed_version IN (
    SELECT * FROM public.get_versions_with_no_metadata()
  )
  LOOP
    PERFORM pgmq.send('cron_clear_versions',
      jsonb_build_object(
        'function_name', 'cron_clear_versions',
        'function_type', 'cloudflare',
        'payload', jsonb_build_object('version', failed_version)
      )
    );
  END LOOP;
END;
$$;

ALTER FUNCTION "public"."process_failed_uploads" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."process_free_trial_expired" () RETURNS "void" LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
BEGIN
  UPDATE public.stripe_info
  SET is_good_plan = false
  WHERE status <> 'succeeded' AND trial_at < NOW();
END;
$$;

ALTER FUNCTION "public"."process_free_trial_expired" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."process_function_queue" ("queue_name" "text") RETURNS bigint LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
DECLARE
  request_id text;
  headers jsonb;
  url text;
  queue_size bigint;
  calls_needed int;
  i int;
BEGIN
  -- Check if the queue has elements
  EXECUTE format('SELECT count(*) FROM pgmq.q_%I', queue_name) INTO queue_size;
  
  -- Only make the HTTP request if the queue is not empty
  IF queue_size > 0 THEN
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apisecret', public.get_apikey()
    );
    url := public.get_db_url() || '/functions/v1/triggers/queue_consumer/sync';

    -- Calculate how many times to call the sync endpoint (1 call per 1000 items, max 10 calls)
    calls_needed := least(ceil(queue_size / 1000.0)::int, 10);

    -- Call the endpoint multiple times if needed
    FOR i IN 1..calls_needed LOOP
      SELECT INTO request_id net.http_post(
        url := url,
        headers := headers,
        body := jsonb_build_object('queue_name', queue_name),
        timeout_milliseconds := 15000
      );
    END LOOP;
    
    RETURN request_id;
  END IF;
  
  RETURN NULL;
END;
$$;

ALTER FUNCTION "public"."process_function_queue" ("queue_name" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."process_stats_email_monthly" () RETURNS "void" LANGUAGE "plpgsql"
SET
  search_path = '' AS $$                                                              
DECLARE                                                            
  app_record RECORD;                                               
BEGIN                                                              
  FOR app_record IN (                                              
    SELECT a.app_id, o.management_email                            
    FROM public.apps a                                                    
    JOIN public.orgs o ON a.owner_org = o.id                              
  )
  LOOP                                                             
    PERFORM pgmq.send('cron_email',                                
      jsonb_build_object(                                          
        'function_name', 'cron_email',                             
        'function_type', 'cloudflare',                             
        'payload', jsonb_build_object(                             
          'email', app_record.management_email,                    
          'appId', app_record.app_id,                              
          'type', 'monthly_create_stats'                           
        )                                                          
      )                                                            
    );                                                             
  END LOOP;
END;                                                               
$$;

ALTER FUNCTION "public"."process_stats_email_monthly" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."process_stats_email_weekly" () RETURNS "void" LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
DECLARE
  app_record RECORD;
BEGIN
  FOR app_record IN (
    SELECT a.app_id, o.management_email
    FROM public.apps a
    JOIN public.orgs o ON a.owner_org = o.id
  )
  LOOP
    PERFORM pgmq.send('cron_email',
      jsonb_build_object(
        'function_name', 'cron_email',
        'function_type', 'cloudflare',
        'payload', jsonb_build_object(
          'email', app_record.management_email,
          'appId', app_record.app_id,
          'type', 'weekly_install_stats'
        )
      )
    );
  END LOOP;
END;
$$;

ALTER FUNCTION "public"."process_stats_email_weekly" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."process_subscribed_orgs" () RETURNS "void" LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
DECLARE
  org_record RECORD;
BEGIN
  FOR org_record IN (
    SELECT o.id, o.customer_id
    FROM public.orgs o
    JOIN public.stripe_info si ON o.customer_id = si.customer_id
    WHERE si.status = 'succeeded'
  )
  LOOP
    PERFORM pgmq.send('cron_plan',
      jsonb_build_object(
        'function_name', 'cron_plan',
        'function_type', 'cloudflare',
        'payload', jsonb_build_object(
          'orgId', org_record.id,
          'customerId', org_record.customer_id
        )
      )
    );
  END LOOP;
END;
$$;

ALTER FUNCTION "public"."process_subscribed_orgs" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."read_bandwidth_usage" (
  "p_app_id" character varying,
  "p_period_start" timestamp without time zone,
  "p_period_end" timestamp without time zone
) RETURNS TABLE (
  "date" timestamp without time zone,
  "bandwidth" numeric,
  "app_id" character varying
) LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE_TRUNC('day', timestamp) AS date,
    SUM(file_size) AS bandwidth,
    bandwidth_usage.app_id
  FROM public.bandwidth_usage
  WHERE
    timestamp >= p_period_start
    AND timestamp < p_period_end
    AND bandwidth_usage. app_id = p_app_id
  GROUP BY bandwidth_usage.app_id, date
  ORDER BY date;
END;
$$;

ALTER FUNCTION "public"."read_bandwidth_usage" (
  "p_app_id" character varying,
  "p_period_start" timestamp without time zone,
  "p_period_end" timestamp without time zone
) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."read_device_usage" (
  "p_app_id" character varying,
  "p_period_start" timestamp without time zone,
  "p_period_end" timestamp without time zone
) RETURNS TABLE (
  "date" "date",
  "mau" bigint,
  "app_id" character varying
) LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE_TRUNC('day', device_usage.timestamp)::date AS date,
    COUNT(DISTINCT device_usage.device_id) AS mau,
    device_usage.app_id
  FROM public.device_usage
  WHERE
    device_usage.app_id = p_app_id
    AND device_usage.timestamp >= p_period_start
    AND device_usage.timestamp < p_period_end
  GROUP BY DATE_TRUNC('day', device_usage.timestamp)::date, device_usage.app_id
  ORDER BY date;
END;
$$;

ALTER FUNCTION "public"."read_device_usage" (
  "p_app_id" character varying,
  "p_period_start" timestamp without time zone,
  "p_period_end" timestamp without time zone
) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."read_storage_usage" (
  "p_app_id" character varying,
  "p_period_start" timestamp without time zone,
  "p_period_end" timestamp without time zone
) RETURNS TABLE (
  "app_id" character varying,
  "date" "date",
  "storage" bigint
) LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
BEGIN
  RETURN QUERY
  SELECT
    p_app_id AS app_id,
    DATE_TRUNC('day', timestamp)::DATE AS date,
    SUM(size)::BIGINT AS storage
  FROM public.version_meta
  WHERE
    timestamp >= p_period_start
    AND timestamp < p_period_end
    AND version_meta.app_id = p_app_id
  GROUP BY version_meta.app_id, date
  ORDER BY date;
END;
$$;

ALTER FUNCTION "public"."read_storage_usage" (
  "p_app_id" character varying,
  "p_period_start" timestamp without time zone,
  "p_period_end" timestamp without time zone
) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."read_version_usage" (
  "p_app_id" character varying,
  "p_period_start" timestamp without time zone,
  "p_period_end" timestamp without time zone
) RETURNS TABLE (
  "app_id" character varying,
  "version_id" bigint,
  "date" timestamp without time zone,
  "get" bigint,
  "fail" bigint,
  "install" bigint,
  "uninstall" bigint
) LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
BEGIN
  RETURN QUERY
  SELECT
    version_usage.app_id,
    version_usage.version_id as version_id,
    DATE_TRUNC('day', timestamp) AS date,
    SUM(CASE WHEN action = 'get' THEN 1 ELSE 0 END) AS get,
    SUM(CASE WHEN action = 'fail' THEN 1 ELSE 0 END) AS fail,
    SUM(CASE WHEN action = 'install' THEN 1 ELSE 0 END) AS install,
    SUM(CASE WHEN action = 'uninstall' THEN 1 ELSE 0 END) AS uninstall
  FROM public.version_usage
  WHERE
    version_usage.app_id = p_app_id
    AND timestamp >= p_period_start
    AND timestamp < p_period_end
  GROUP BY date, version_usage.app_id, version_usage.version_id
  ORDER BY date;
END;
$$;

ALTER FUNCTION "public"."read_version_usage" (
  "p_app_id" character varying,
  "p_period_start" timestamp without time zone,
  "p_period_end" timestamp without time zone
) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."record_deployment_history" () RETURNS "trigger" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
BEGIN
    -- If version is changing, record the deployment
    IF OLD.version <> NEW.version THEN
        -- Insert new record
        INSERT INTO public.deploy_history (
            channel_id, 
            app_id, 
            version_id, 
            owner_org,
            created_by
        )
        VALUES (
            NEW.id,
            NEW.app_id,
            NEW.version,
            NEW.owner_org,
            coalesce(public.get_identity()::uuid, NEW.created_by)
        );
    END IF;
    
    RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."record_deployment_history" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."remove_old_jobs" () RETURNS "void" LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
BEGIN
    DELETE FROM cron.job_run_details 
    WHERE end_time < now() - interval '1 day';
END;
$$;

ALTER FUNCTION "public"."remove_old_jobs" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."set_bandwidth_exceeded_by_org" ("org_id" "uuid", "disabled" boolean) RETURNS "void" LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
BEGIN
    UPDATE public.stripe_info
    SET bandwidth_exceeded = disabled
    WHERE stripe_info.customer_id = (SELECT customer_id FROM public.orgs WHERE id = org_id);
END;
$$;

ALTER FUNCTION "public"."set_bandwidth_exceeded_by_org" ("org_id" "uuid", "disabled" boolean) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."set_mau_exceeded_by_org" ("org_id" "uuid", "disabled" boolean) RETURNS "void" LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
BEGIN
    UPDATE public.stripe_info
    SET mau_exceeded = disabled
    WHERE stripe_info.customer_id = (SELECT customer_id FROM public.orgs WHERE id = org_id);
END;
$$;

ALTER FUNCTION "public"."set_mau_exceeded_by_org" ("org_id" "uuid", "disabled" boolean) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."set_storage_exceeded_by_org" ("org_id" "uuid", "disabled" boolean) RETURNS "void" LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
BEGIN
    UPDATE public.stripe_info
    SET storage_exceeded = disabled
    WHERE stripe_info.customer_id = (SELECT customer_id FROM public.orgs WHERE id = set_storage_exceeded_by_org.org_id);
END;
$$;

ALTER FUNCTION "public"."set_storage_exceeded_by_org" ("org_id" "uuid", "disabled" boolean) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."transfer_app" (
  "p_app_id" character varying,
  "p_new_org_id" "uuid"
) RETURNS "void" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
    v_old_org_id uuid;
    v_user_id uuid;
    v_last_transfer jsonb;
    v_last_transfer_date timestamp;
BEGIN
  -- Get the current owner_org
  SELECT owner_org, transfer_history[array_length(transfer_history, 1)]
  INTO v_old_org_id, v_last_transfer
  FROM public.apps
  WHERE app_id = p_app_id;

  -- Check if app exists
  IF v_old_org_id IS NULL THEN
      RAISE EXCEPTION 'App % not found', p_app_id;
  END IF;

  -- Get the current user ID
  v_user_id := (select auth.uid());

if NOT (public.check_min_rights('super_admin'::"public"."user_min_right", v_user_id, v_old_org_id, NULL::character varying, NULL::bigint)) THEN
  RAISE EXCEPTION 'You are not authorized to transfer this app. (You don''t have super_admin rights on the old organization)';
END IF;

if NOT (public.check_min_rights('super_admin'::"public"."user_min_right", v_user_id, p_new_org_id, NULL::character varying, NULL::bigint)) THEN
  RAISE EXCEPTION 'You are not authorized to transfer this app. (You don''t have super_admin rights on the new organization)';
END IF;

  -- Check if enough time has passed since last transfer
  IF v_last_transfer IS NOT NULL THEN
    v_last_transfer_date := (v_last_transfer->>'transferred_at')::timestamp;
    IF v_last_transfer_date + interval '32 days' > now() THEN
      RAISE EXCEPTION 'Cannot transfer app. Must wait at least 32 days between transfers. Last transfer was on %', v_last_transfer_date;
    END IF;
  END IF;

  -- Update the app's owner_org and user_id
  UPDATE public.apps
  SET 
      owner_org = p_new_org_id,
      updated_at = now(),
      transfer_history = COALESCE(transfer_history, '{}') || jsonb_build_object(
          'transferred_at', now(),
          'transferred_from', v_old_org_id,
          'transferred_to', p_new_org_id,
          'initiated_by', v_user_id
      )::jsonb
  WHERE app_id = p_app_id;

  -- Update app_versions owner_org
  UPDATE public.app_versions
  SET owner_org = p_new_org_id
  WHERE app_id = p_app_id;

  -- Update app_versions_meta owner_org
  UPDATE public.app_versions_meta
  SET owner_org = p_new_org_id
  WHERE app_id = p_app_id;

  -- Update channel_devices owner_org
  UPDATE public.channel_devices
  SET owner_org = p_new_org_id
  WHERE app_id = p_app_id;

  -- Update channels owner_org
  UPDATE public.channels
  SET owner_org = p_new_org_id
  WHERE app_id = p_app_id;

  -- Update notifications owner_org
  UPDATE public.notifications
  SET owner_org = p_new_org_id
  WHERE owner_org = v_old_org_id;
END;
$$;

ALTER FUNCTION "public"."transfer_app" (
  "p_app_id" character varying,
  "p_new_org_id" "uuid"
) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."transfer_app" (
  "p_app_id" character varying,
  "p_new_org_id" "uuid"
) IS 'Transfers an app and all its related data to a new organization. Requires the caller to have appropriate permissions on both organizations.';

CREATE OR REPLACE FUNCTION "public"."trigger_http_queue_post_to_function" () RETURNS "trigger" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE 
  payload jsonb;
BEGIN 
  -- Build the base payload
  payload := jsonb_build_object(
    'function_name', TG_ARGV[0],
    'function_type', TG_ARGV[1],
    'payload', jsonb_build_object(
      'old_record', OLD, 
      'record', NEW, 
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA
    )
  );
  
  -- Also send to function-specific queue
  IF TG_ARGV[0] IS NOT NULL THEN
    PERFORM pgmq.send(TG_ARGV[0], payload);
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trigger_http_queue_post_to_function" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trigger_http_queue_post_to_function_d1" () RETURNS "trigger" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
BEGIN
    -- Queue the operation for batch processing
    IF public.get_d1_webhook_signature() IS NOT NULL THEN
      PERFORM pgmq.send('replicate_data', 
          jsonb_build_object(
              'record', to_jsonb(NEW),
              'old_record', to_jsonb(OLD),
              'type', TG_OP,
              'table', TG_TABLE_NAME
          )
      );
    END IF;
    RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trigger_http_queue_post_to_function_d1" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_app_versions_retention" () RETURNS void LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
BEGIN
    -- Use a more efficient approach with direct timestamp comparison
    UPDATE public.app_versions
    SET deleted = true
    WHERE app_versions.deleted = false  -- Filter non-deleted first
      AND app_versions.created_at < (
          SELECT now() - make_interval(secs => apps.retention)
          FROM public.apps
          WHERE apps.app_id = app_versions.app_id
      )
      AND NOT EXISTS (
          SELECT 1
          FROM public.channels
          WHERE channels.app_id = app_versions.app_id
            AND channels.version = app_versions.id
      );
END;
$$;

ALTER FUNCTION "public"."update_app_versions_retention" () OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."verify_mfa" () RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $_$
Begin
  RETURN (
    array[(select coalesce(auth.jwt()->>'aal', 'aal1'))] <@ (
      select
          case
            when count(id) > 0 then array['aal2']
            else array['aal1', 'aal2']
          end as aal
        from auth.mfa_factors
        where (select auth.uid()) = user_id and status = 'verified'
    )
  ) OR (
    select array(select jsonb_path_query_array((select auth.jwt()), '$.amr[*].method')) @> ARRAY['"otp"'::jsonb]
  );
End;  
$_$;

ALTER FUNCTION "public"."verify_mfa" () OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."apikeys" (
  "id" bigint NOT NULL,
  "created_at" timestamp with time zone DEFAULT "now" (),
  "user_id" "uuid" NOT NULL,
  "key" character varying NOT NULL,
  "mode" "public"."key_mode" NOT NULL,
  "updated_at" timestamp with time zone DEFAULT "now" (),
  "name" character varying NOT NULL,
  "limited_to_orgs" "uuid" [] DEFAULT '{}'::"uuid" [],
  "limited_to_apps" character varying[] DEFAULT '{}'::character varying[]
);

ALTER TABLE "public"."apikeys" OWNER TO "postgres";

ALTER TABLE "public"."apikeys"
ALTER COLUMN "id"
ADD GENERATED BY DEFAULT AS IDENTITY (
  SEQUENCE NAME "public"."apikeys_id_seq" START
  WITH
    1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1
);

ALTER TABLE "public"."app_versions"
ALTER COLUMN "id"
ADD GENERATED BY DEFAULT AS IDENTITY (
  SEQUENCE NAME "public"."app_versions_id_seq" START
  WITH
    1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1
);

CREATE TABLE IF NOT EXISTS "public"."app_versions_meta" (
  "created_at" timestamp with time zone DEFAULT "now" (),
  "app_id" character varying NOT NULL,
  "updated_at" timestamp with time zone DEFAULT "now" (),
  "checksum" character varying NOT NULL,
  "size" bigint NOT NULL,
  "id" bigint NOT NULL,
  "devices" bigint DEFAULT '0'::bigint,
  "fails" bigint DEFAULT '0'::bigint,
  "installs" bigint DEFAULT '0'::bigint,
  "uninstalls" bigint DEFAULT '0'::bigint,
  "owner_org" "uuid" NOT NULL
);

ALTER TABLE "public"."app_versions_meta" OWNER TO "postgres";

ALTER TABLE "public"."app_versions_meta"
ALTER COLUMN "id"
ADD GENERATED BY DEFAULT AS IDENTITY (
  SEQUENCE NAME "public"."app_versions_meta_id_seq" START
  WITH
    1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1
);

CREATE TABLE IF NOT EXISTS "public"."apps" (
  "created_at" timestamp with time zone DEFAULT "now" (),
  "app_id" character varying NOT NULL,
  "icon_url" character varying NOT NULL,
  "user_id" "uuid",
  "name" character varying,
  "last_version" character varying,
  "updated_at" timestamp with time zone,
  "id" "uuid" DEFAULT "extensions"."uuid_generate_v4" (),
  "retention" bigint DEFAULT '2592000'::bigint NOT NULL,
  "owner_org" "uuid" NOT NULL,
  "default_upload_channel" character varying DEFAULT 'dev'::character varying NOT NULL,
  "transfer_history" "jsonb" [] DEFAULT '{}'::"jsonb" []
);

ALTER TABLE "public"."apps" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."bandwidth_usage" (
  "id" integer NOT NULL,
  "device_id" character varying(255) NOT NULL,
  "app_id" character varying(255) NOT NULL,
  "file_size" bigint NOT NULL,
  "timestamp" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE "public"."bandwidth_usage" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."bandwidth_usage_id_seq" AS integer START
WITH
  1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

ALTER TABLE "public"."bandwidth_usage_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."bandwidth_usage_id_seq" OWNED BY "public"."bandwidth_usage"."id";

CREATE TABLE IF NOT EXISTS "public"."channel_devices" (
  "created_at" timestamp with time zone DEFAULT "now" (),
  "channel_id" bigint NOT NULL,
  "app_id" character varying NOT NULL,
  "updated_at" timestamp with time zone DEFAULT "now" () NOT NULL,
  "device_id" "text" NOT NULL,
  "id" bigint NOT NULL,
  "owner_org" "uuid" NOT NULL
);

ALTER TABLE "public"."channel_devices" OWNER TO "postgres";

ALTER TABLE "public"."channel_devices"
ALTER COLUMN "id"
ADD GENERATED BY DEFAULT AS IDENTITY (
  SEQUENCE NAME "public"."channel_devices_id_seq" START
  WITH
    1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1
);

CREATE TABLE IF NOT EXISTS "public"."channels" (
  "id" bigint NOT NULL,
  "created_at" timestamp with time zone DEFAULT "now" () NOT NULL,
  "name" character varying NOT NULL,
  "app_id" character varying NOT NULL,
  "version" bigint NOT NULL,
  "updated_at" timestamp with time zone DEFAULT "now" () NOT NULL,
  "public" boolean DEFAULT false NOT NULL,
  "disable_auto_update_under_native" boolean DEFAULT true NOT NULL,
  "ios" boolean DEFAULT true NOT NULL,
  "android" boolean DEFAULT true NOT NULL,
  "allow_device_self_set" boolean DEFAULT false NOT NULL,
  "allow_emulator" boolean DEFAULT true NOT NULL,
  "allow_dev" boolean DEFAULT true NOT NULL,
  "disable_auto_update" "public"."disable_update" DEFAULT 'major'::"public"."disable_update" NOT NULL,
  "owner_org" "uuid" NOT NULL,
  "created_by" "uuid" NOT NULL
);

ALTER TABLE "public"."channels" OWNER TO "postgres";

ALTER TABLE "public"."channels"
ALTER COLUMN "id"
ADD GENERATED BY DEFAULT AS IDENTITY (
  SEQUENCE NAME "public"."channel_id_seq" START
  WITH
    1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1
);

CREATE TABLE IF NOT EXISTS "public"."daily_bandwidth" (
  "id" integer NOT NULL,
  "app_id" character varying(255) NOT NULL,
  "date" "date" NOT NULL,
  "bandwidth" bigint NOT NULL
);

ALTER TABLE "public"."daily_bandwidth" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."daily_bandwidth_id_seq" AS integer START
WITH
  1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

ALTER TABLE "public"."daily_bandwidth_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."daily_bandwidth_id_seq" OWNED BY "public"."daily_bandwidth"."id";

CREATE TABLE IF NOT EXISTS "public"."daily_mau" (
  "id" integer NOT NULL,
  "app_id" character varying(255) NOT NULL,
  "date" "date" NOT NULL,
  "mau" bigint NOT NULL
);

ALTER TABLE "public"."daily_mau" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."daily_mau_id_seq" AS integer START
WITH
  1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

ALTER TABLE "public"."daily_mau_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."daily_mau_id_seq" OWNED BY "public"."daily_mau"."id";

CREATE TABLE IF NOT EXISTS "public"."daily_storage" (
  "id" integer NOT NULL,
  "app_id" character varying(255) NOT NULL,
  "date" "date" NOT NULL,
  "storage" bigint NOT NULL
);

ALTER TABLE "public"."daily_storage" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."daily_storage_id_seq" AS integer START
WITH
  1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

ALTER TABLE "public"."daily_storage_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."daily_storage_id_seq" OWNED BY "public"."daily_storage"."id";

CREATE TABLE IF NOT EXISTS "public"."daily_version" (
  "date" "date" NOT NULL,
  "app_id" character varying(255) NOT NULL,
  "version_id" bigint NOT NULL,
  "get" bigint,
  "fail" bigint,
  "install" bigint,
  "uninstall" bigint
);

ALTER TABLE "public"."daily_version" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."deleted_account" (
  "created_at" timestamp with time zone DEFAULT "now" (),
  "email" character varying NOT NULL,
  "id" "uuid" DEFAULT "extensions"."uuid_generate_v4" () NOT NULL
);

ALTER TABLE "public"."deleted_account" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."deleted_apps" (
  "id" bigint NOT NULL,
  "created_at" timestamp with time zone DEFAULT "now" (),
  "app_id" character varying NOT NULL,
  "owner_org" "uuid" NOT NULL,
  "deleted_at" timestamp with time zone DEFAULT "now" ()
);

ALTER TABLE "public"."deleted_apps" OWNER TO "postgres";

ALTER TABLE "public"."deleted_apps"
ALTER COLUMN "id"
ADD GENERATED BY DEFAULT AS IDENTITY (
  SEQUENCE NAME "public"."deleted_apps_id_seq" START
  WITH
    1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1
);

CREATE TABLE IF NOT EXISTS "public"."deploy_history" (
  "id" bigint NOT NULL,
  "created_at" timestamp with time zone DEFAULT "now" (),
  "updated_at" timestamp with time zone DEFAULT "now" (),
  "channel_id" bigint NOT NULL,
  "app_id" character varying NOT NULL,
  "version_id" bigint NOT NULL,
  "deployed_at" timestamp with time zone DEFAULT "now" (),
  "created_by" "uuid" NOT NULL,
  "owner_org" "uuid" NOT NULL
);

ALTER TABLE "public"."deploy_history" OWNER TO "postgres";

ALTER TABLE "public"."deploy_history"
ALTER COLUMN "id"
ADD GENERATED BY DEFAULT AS IDENTITY (
  SEQUENCE NAME "public"."deploy_history_id_seq" START
  WITH
    1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1
);

CREATE TABLE IF NOT EXISTS "public"."device_usage" (
  "id" integer NOT NULL,
  "device_id" character varying(255) NOT NULL,
  "app_id" character varying(255) NOT NULL,
  "timestamp" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE "public"."device_usage" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."device_usage_id_seq" AS integer START
WITH
  1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

ALTER TABLE "public"."device_usage_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."device_usage_id_seq" OWNED BY "public"."device_usage"."id";

CREATE TABLE IF NOT EXISTS "public"."devices" (
  "updated_at" timestamp with time zone NOT NULL,
  "device_id" "text" NOT NULL,
  "version" bigint NOT NULL,
  "app_id" character varying(50) NOT NULL,
  "platform" "public"."platform_os" NOT NULL,
  "plugin_version" character varying(20) DEFAULT '2.3.3'::"text" NOT NULL,
  "os_version" character varying(20),
  "version_build" character varying(70) DEFAULT 'builtin'::"text",
  "custom_id" character varying(36) DEFAULT ''::"text" NOT NULL,
  "is_prod" boolean DEFAULT true,
  "is_emulator" boolean DEFAULT false
);

ALTER TABLE "public"."devices" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."global_stats" (
  "created_at" timestamp with time zone DEFAULT "now" (),
  "date_id" character varying NOT NULL,
  "apps" bigint NOT NULL,
  "updates" bigint NOT NULL,
  "updates_external" bigint DEFAULT '0'::bigint,
  "stars" bigint NOT NULL,
  "users" bigint DEFAULT '0'::bigint,
  "paying" bigint DEFAULT '0'::bigint,
  "trial" bigint DEFAULT '0'::bigint,
  "need_upgrade" bigint DEFAULT '0'::bigint,
  "not_paying" bigint DEFAULT '0'::bigint,
  "onboarded" bigint DEFAULT '0'::bigint,
  "apps_active" integer DEFAULT 0,
  "users_active" integer DEFAULT 0,
  "paying_yearly" integer DEFAULT 0,
  "paying_monthly" integer DEFAULT 0,
  "updates_last_month" integer DEFAULT 0
);

ALTER TABLE "public"."global_stats" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."manifest" (
  "id" integer NOT NULL,
  "app_version_id" bigint NOT NULL,
  "file_name" character varying NOT NULL,
  "s3_path" character varying NOT NULL,
  "file_hash" character varying NOT NULL,
  "file_size" bigint DEFAULT 0
);

ALTER TABLE "public"."manifest" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."manifest_id_seq" AS integer START
WITH
  1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

ALTER TABLE "public"."manifest_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."manifest_id_seq" OWNED BY "public"."manifest"."id";

CREATE TABLE IF NOT EXISTS "public"."notifications" (
  "created_at" timestamp with time zone DEFAULT "now" (),
  "updated_at" timestamp with time zone DEFAULT "now" (),
  "last_send_at" timestamp with time zone DEFAULT "now" () NOT NULL,
  "total_send" bigint DEFAULT '1'::bigint NOT NULL,
  "owner_org" "uuid" NOT NULL,
  "event" character varying(255) NOT NULL,
  "uniq_id" character varying(255) NOT NULL
);

ALTER TABLE "public"."notifications" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."org_users" (
  "id" bigint NOT NULL,
  "created_at" timestamp with time zone DEFAULT "now" (),
  "updated_at" timestamp with time zone DEFAULT "now" (),
  "user_id" "uuid" NOT NULL,
  "org_id" "uuid" NOT NULL,
  "app_id" character varying,
  "channel_id" bigint,
  "user_right" "public"."user_min_right"
);

ALTER TABLE "public"."org_users" OWNER TO "postgres";

ALTER TABLE "public"."org_users"
ALTER COLUMN "id"
ADD GENERATED BY DEFAULT AS IDENTITY (
  SEQUENCE NAME "public"."org_users_id_seq" START
  WITH
    1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1
);

CREATE TABLE IF NOT EXISTS "public"."orgs" (
  "id" "uuid" DEFAULT "gen_random_uuid" () NOT NULL,
  "created_by" "uuid" NOT NULL,
  "created_at" timestamp with time zone DEFAULT "now" (),
  "updated_at" timestamp with time zone DEFAULT "now" (),
  "logo" "text",
  "name" "text" NOT NULL,
  "management_email" "text" NOT NULL,
  "customer_id" character varying
);

ALTER TABLE "public"."orgs" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."plans" (
  "created_at" timestamp with time zone DEFAULT "now" () NOT NULL,
  "updated_at" timestamp with time zone DEFAULT "now" () NOT NULL,
  "name" character varying DEFAULT ''::character varying NOT NULL,
  "description" character varying DEFAULT ''::character varying NOT NULL,
  "price_m" bigint DEFAULT '0'::bigint NOT NULL,
  "price_y" bigint DEFAULT '0'::bigint NOT NULL,
  "stripe_id" character varying DEFAULT ''::character varying NOT NULL,
  "version" bigint DEFAULT '0'::bigint NOT NULL,
  "id" "uuid" DEFAULT "extensions"."uuid_generate_v4" () NOT NULL,
  "price_m_id" character varying NOT NULL,
  "price_y_id" character varying NOT NULL,
  "storage" bigint NOT NULL,
  "bandwidth" bigint NOT NULL,
  "mau" bigint DEFAULT '0'::bigint NOT NULL,
  "market_desc" character varying DEFAULT ''::character varying,
  "storage_unit" double precision DEFAULT '0'::double precision,
  "bandwidth_unit" double precision DEFAULT '0'::double precision,
  "mau_unit" double precision DEFAULT '0'::double precision,
  "price_m_storage_id" "text",
  "price_m_bandwidth_id" "text",
  "price_m_mau_id" "text"
);

ALTER TABLE "public"."plans" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."stats" (
  "created_at" timestamp with time zone NOT NULL,
  "action" "public"."stats_action" NOT NULL,
  "device_id" character varying(36) NOT NULL,
  "version" bigint NOT NULL,
  "app_id" character varying(50) NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY
);

ALTER TABLE "public"."stats" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."storage_usage" (
  "id" integer NOT NULL,
  "device_id" character varying(255) NOT NULL,
  "app_id" character varying(255) NOT NULL,
  "file_size" bigint NOT NULL,
  "timestamp" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE "public"."storage_usage" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."storage_usage_id_seq" AS integer START
WITH
  1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

ALTER TABLE "public"."storage_usage_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."storage_usage_id_seq" OWNED BY "public"."storage_usage"."id";

CREATE TABLE IF NOT EXISTS "public"."stripe_info" (
  "created_at" timestamp with time zone DEFAULT "now" () NOT NULL,
  "updated_at" timestamp with time zone DEFAULT "now" () NOT NULL,
  "subscription_id" character varying,
  "customer_id" character varying NOT NULL,
  "status" "public"."stripe_status",
  "product_id" character varying NOT NULL,
  "trial_at" timestamp with time zone DEFAULT "now" () NOT NULL,
  "price_id" character varying,
  "is_good_plan" boolean DEFAULT true,
  "plan_usage" bigint DEFAULT '0'::bigint,
  "subscription_metered" "json" DEFAULT '{}'::"json" NOT NULL,
  "subscription_anchor_start" timestamp with time zone DEFAULT "now" () NOT NULL,
  "subscription_anchor_end" timestamp with time zone DEFAULT "public"."one_month_ahead" () NOT NULL,
  "canceled_at" timestamp with time zone,
  "mau_exceeded" boolean DEFAULT false,
  "storage_exceeded" boolean DEFAULT false,
  "bandwidth_exceeded" boolean DEFAULT false,
  "id" integer NOT NULL
);

ALTER TABLE "public"."stripe_info" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."stripe_info_id_seq" AS integer START
WITH
  1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

ALTER TABLE "public"."stripe_info_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."stripe_info_id_seq" OWNED BY "public"."stripe_info"."id";

CREATE TABLE IF NOT EXISTS "public"."users" (
  "created_at" timestamp with time zone DEFAULT "now" (),
  "image_url" character varying,
  "first_name" character varying,
  "last_name" character varying,
  "country" character varying,
  "email" character varying NOT NULL,
  "id" "uuid" NOT NULL,
  "updated_at" timestamp with time zone DEFAULT "now" (),
  "enableNotifications" boolean DEFAULT false NOT NULL,
  "optForNewsletters" boolean DEFAULT false NOT NULL,
  "legalAccepted" boolean DEFAULT false NOT NULL,
  "customer_id" character varying,
  "billing_email" "text",
  "ban_time" timestamp with time zone
);

ALTER TABLE "public"."users" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."version_meta" (
  "timestamp" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "app_id" character varying(255) NOT NULL,
  "version_id" bigint NOT NULL,
  "size" bigint NOT NULL
);

ALTER TABLE "public"."version_meta" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."version_usage" (
  "timestamp" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "app_id" character varying(50) NOT NULL,
  "version_id" bigint NOT NULL,
  "action" "public"."version_action" NOT NULL
);

ALTER TABLE "public"."version_usage" OWNER TO "postgres";

ALTER TABLE ONLY "public"."bandwidth_usage"
ALTER COLUMN "id"
SET DEFAULT "nextval" ('"public"."bandwidth_usage_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."daily_bandwidth"
ALTER COLUMN "id"
SET DEFAULT "nextval" ('"public"."daily_bandwidth_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."daily_mau"
ALTER COLUMN "id"
SET DEFAULT "nextval" ('"public"."daily_mau_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."daily_storage"
ALTER COLUMN "id"
SET DEFAULT "nextval" ('"public"."daily_storage_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."device_usage"
ALTER COLUMN "id"
SET DEFAULT "nextval" ('"public"."device_usage_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."manifest"
ALTER COLUMN "id"
SET DEFAULT "nextval" ('"public"."manifest_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."storage_usage"
ALTER COLUMN "id"
SET DEFAULT "nextval" ('"public"."storage_usage_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."stripe_info"
ALTER COLUMN "id"
SET DEFAULT "nextval" ('"public"."stripe_info_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."apikeys"
ADD CONSTRAINT "apikeys_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."app_versions_meta"
ADD CONSTRAINT "app_versions_meta_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."app_versions"
ADD CONSTRAINT "app_versions_name_app_id_key" UNIQUE ("name", "app_id");

ALTER TABLE ONLY "public"."app_versions"
ADD CONSTRAINT "app_versions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."apps"
ADD CONSTRAINT "apps_pkey" PRIMARY KEY ("app_id");

ALTER TABLE ONLY "public"."bandwidth_usage"
ADD CONSTRAINT "bandwidth_usage_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."channel_devices"
ADD CONSTRAINT "channel_devices_app_id_device_id_key" UNIQUE ("app_id", "device_id");

ALTER TABLE ONLY "public"."channels"
ADD CONSTRAINT "channel_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."daily_bandwidth"
ADD CONSTRAINT "daily_bandwidth_pkey" PRIMARY KEY ("app_id", "date");

ALTER TABLE ONLY "public"."daily_mau"
ADD CONSTRAINT "daily_mau_pkey" PRIMARY KEY ("app_id", "date");

ALTER TABLE ONLY "public"."daily_storage"
ADD CONSTRAINT "daily_storage_pkey" PRIMARY KEY ("app_id", "date");

ALTER TABLE ONLY "public"."daily_version"
ADD CONSTRAINT "daily_version_pkey" PRIMARY KEY ("date", "app_id", "version_id");

ALTER TABLE ONLY "public"."deleted_account"
ADD CONSTRAINT "deleted_account_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."deleted_apps"
ADD CONSTRAINT "deleted_apps_app_id_owner_org_key" UNIQUE ("app_id", "owner_org");

ALTER TABLE ONLY "public"."deleted_apps"
ADD CONSTRAINT "deleted_apps_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."deploy_history"
ADD CONSTRAINT "deploy_history_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."device_usage"
ADD CONSTRAINT "device_usage_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."devices"
ADD CONSTRAINT "devices_pkey" PRIMARY KEY ("app_id", "device_id");

ALTER TABLE ONLY "public"."global_stats"
ADD CONSTRAINT "global_stats_pkey" PRIMARY KEY ("date_id");

ALTER TABLE ONLY "public"."manifest"
ADD CONSTRAINT "manifest_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."notifications"
ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("event", "uniq_id");

ALTER TABLE ONLY "public"."org_users"
ADD CONSTRAINT "org_users_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."orgs"
ADD CONSTRAINT "orgs_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."plans"
ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("name", "stripe_id", "id");

ALTER TABLE ONLY "public"."plans"
ADD CONSTRAINT "plans_stripe_id_key" UNIQUE ("stripe_id");

ALTER TABLE ONLY "public"."storage_usage"
ADD CONSTRAINT "storage_usage_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."stripe_info"
ADD CONSTRAINT "stripe_info_pkey" PRIMARY KEY ("customer_id");

ALTER TABLE ONLY "public"."orgs"
ADD CONSTRAINT "unique customer_id on orgs" UNIQUE ("customer_id");

ALTER TABLE ONLY "public"."channel_devices"
ADD CONSTRAINT "unique_device_app" UNIQUE ("device_id", "app_id");

ALTER TABLE ONLY "public"."channels"
ADD CONSTRAINT "unique_name_app_id" UNIQUE ("name", "app_id");

ALTER TABLE ONLY "public"."orgs"
ADD CONSTRAINT "unique_name_created_by" UNIQUE ("name", "created_by");

ALTER TABLE ONLY "public"."users"
ADD CONSTRAINT "users_customer_id_key" UNIQUE ("customer_id");

ALTER TABLE ONLY "public"."users"
ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."version_meta"
ADD CONSTRAINT "version_meta_pkey" PRIMARY KEY ("timestamp", "app_id", "version_id", "size");

ALTER TABLE ONLY "public"."version_usage"
ADD CONSTRAINT "version_usage_pkey" PRIMARY KEY ("timestamp", "app_id", "version_id", "action");

CREATE INDEX "apikeys_key_idx" ON "public"."apikeys" USING "btree" ("key");

CREATE INDEX "app_versions_meta_app_id_idx" ON "public"."app_versions_meta" USING "btree" ("app_id");

CREATE INDEX "channel_devices_device_id_idx" ON "public"."channel_devices" USING "btree" ("device_id");

CREATE INDEX "deploy_history_app_id_idx" ON "public"."deploy_history" USING "btree" ("app_id");

CREATE INDEX "deploy_history_app_version_idx" ON "public"."deploy_history" USING "btree" ("app_id", "version_id");

CREATE INDEX "deploy_history_channel_app_idx" ON "public"."deploy_history" USING "btree" ("channel_id", "app_id");

CREATE INDEX "deploy_history_channel_deployed_idx" ON "public"."deploy_history" USING "btree" ("channel_id", "deployed_at");

CREATE INDEX "deploy_history_channel_id_idx" ON "public"."deploy_history" USING "btree" ("channel_id");

CREATE INDEX "deploy_history_deployed_at_idx" ON "public"."deploy_history" USING "btree" ("deployed_at");

CREATE INDEX "deploy_history_version_id_idx" ON "public"."deploy_history" USING "btree" ("version_id");

CREATE INDEX "devices_app_id_device_id_updated_at_idx" ON "public"."devices" USING "btree" ("app_id", "device_id", "updated_at");

CREATE INDEX "devices_app_id_updated_at_idx" ON "public"."devices" USING "btree" ("app_id", "updated_at");

CREATE INDEX "finx_apikeys_user_id" ON "public"."apikeys" USING "btree" ("user_id");

CREATE INDEX "finx_app_versions_meta_owner_org" ON "public"."app_versions_meta" USING "btree" ("owner_org");

CREATE INDEX "finx_app_versions_owner_org" ON "public"."app_versions" USING "btree" ("owner_org");

CREATE INDEX "finx_apps_owner_org" ON "public"."apps" USING "btree" ("owner_org");

CREATE INDEX "finx_apps_user_id" ON "public"."apps" USING "btree" ("user_id");

CREATE INDEX "finx_channel_devices_app_id" ON "public"."channel_devices" USING "btree" ("app_id");

CREATE INDEX "finx_channel_devices_channel_id" ON "public"."channel_devices" USING "btree" ("channel_id");

CREATE INDEX "finx_channel_devices_owner_org" ON "public"."channel_devices" USING "btree" ("owner_org");

CREATE INDEX "finx_channels_app_id" ON "public"."channels" USING "btree" ("app_id");

CREATE INDEX "finx_channels_owner_org" ON "public"."channels" USING "btree" ("owner_org");

CREATE INDEX "finx_channels_version" ON "public"."channels" USING "btree" ("version");

CREATE INDEX "finx_notifications_owner_org" ON "public"."notifications" USING "btree" ("owner_org");

CREATE INDEX "finx_org_users_channel_id" ON "public"."org_users" USING "btree" ("channel_id");

CREATE INDEX "finx_org_users_org_id" ON "public"."org_users" USING "btree" ("org_id");

CREATE INDEX "finx_org_users_user_id" ON "public"."org_users" USING "btree" ("user_id");

CREATE INDEX "finx_orgs_created_by" ON "public"."orgs" USING "btree" ("created_by");

CREATE INDEX "finx_orgs_stripe_info" ON "public"."stripe_info" USING "btree" ("product_id");

CREATE INDEX "idx_app_id_app_versions" ON "public"."app_versions" USING "btree" ("app_id");

CREATE UNIQUE INDEX "idx_app_id_device_id_channel_id_channel_devices" ON "public"."channel_devices" USING "btree" ("app_id", "device_id", "channel_id");

CREATE INDEX "idx_app_id_name_app_versions" ON "public"."app_versions" USING "btree" ("app_id", "name");

CREATE INDEX "idx_app_id_public_channel" ON "public"."channels" USING "btree" ("app_id", "public");

CREATE INDEX "idx_app_id_version_devices" ON "public"."devices" USING "btree" ("app_id", "version");

CREATE INDEX "idx_app_versions_created_at" ON "public"."app_versions" USING "btree" ("created_at");

CREATE INDEX "idx_app_versions_created_at_app_id" ON "public"."app_versions" USING "btree" ("created_at", "app_id");

CREATE INDEX "idx_app_versions_deleted" ON "public"."app_versions" USING "btree" ("deleted");

CREATE INDEX "idx_app_versions_retention_cleanup" ON "public"."app_versions" USING "btree" ("deleted", "created_at", "app_id")
WHERE
  ("deleted" = false);

CREATE INDEX "idx_app_versions_id" ON "public"."app_versions" USING "btree" ("id");

CREATE INDEX "idx_app_versions_meta_id" ON "public"."app_versions_meta" USING "btree" ("id");

CREATE INDEX "idx_app_versions_name" ON "public"."app_versions" USING "btree" ("name");

CREATE INDEX "idx_channels_app_id_name" ON "public"."channels" USING "btree" ("app_id", "name");

CREATE INDEX "idx_channels_app_id_version" ON "public"."channels" USING "btree" ("app_id", "version");

CREATE INDEX "idx_channels_public_app_id_android" ON "public"."channels" USING "btree" ("public", "app_id", "android");

CREATE INDEX "idx_channels_public_app_id_ios" ON "public"."channels" USING "btree" ("public", "app_id", "ios");

CREATE INDEX "idx_daily_bandwidth_app_id_date" ON "public"."daily_bandwidth" USING "btree" ("app_id", "date");

CREATE INDEX "idx_daily_mau_app_id_date" ON "public"."daily_mau" USING "btree" ("app_id", "date");

CREATE INDEX "idx_daily_storage_app_id_date" ON "public"."daily_storage" USING "btree" ("app_id", "date");

CREATE INDEX "idx_daily_version_app_id" ON "public"."daily_version" USING "btree" ("app_id");

CREATE INDEX "idx_deleted_apps_app_id" ON "public"."deleted_apps" USING "btree" ("app_id");

CREATE INDEX "idx_deleted_apps_deleted_at" ON "public"."deleted_apps" USING "btree" ("deleted_at");

CREATE INDEX "idx_deleted_apps_owner_org" ON "public"."deleted_apps" USING "btree" ("owner_org");

CREATE INDEX "idx_deploy_history_created_by" ON "public"."deploy_history" USING "btree" ("created_by");

CREATE INDEX "idx_manifest_app_version_id" ON "public"."manifest" USING "btree" ("app_version_id");

CREATE INDEX "idx_orgs_customer_id" ON "public"."orgs" USING "btree" ("customer_id");

CREATE INDEX "idx_stats_app_id_action" ON "public"."stats" USING "btree" ("app_id", "action");

CREATE INDEX "idx_stats_app_id_created_at" ON "public"."stats" USING "btree" ("app_id", "created_at");

CREATE INDEX "idx_stats_app_id_device_id" ON "public"."stats" USING "btree" ("app_id", "device_id");

CREATE INDEX "idx_stats_app_id_version" ON "public"."stats" USING "btree" ("app_id", "version");

CREATE INDEX "idx_stripe_info_customer_id" ON "public"."stripe_info" USING "btree" ("customer_id");

CREATE INDEX "idx_stripe_info_status_plan" ON "public"."stripe_info" USING "btree" ("status", "is_good_plan")
WHERE
  (
    ("status" = 'succeeded'::"public"."stripe_status")
    AND ("is_good_plan" = true)
  );

CREATE INDEX "idx_stripe_info_trial" ON "public"."stripe_info" USING "btree" ("trial_at")
WHERE
  ("trial_at" IS NOT NULL);

CREATE INDEX "notifications_uniq_id_idx" ON "public"."notifications" USING "btree" ("uniq_id");

CREATE INDEX "org_users_app_id_idx" ON "public"."org_users" USING "btree" ("app_id");

CREATE OR REPLACE TRIGGER "check_if_org_can_exist_org_users"
AFTER DELETE ON "public"."org_users" FOR EACH ROW
EXECUTE FUNCTION "public"."check_if_org_can_exist" ();

CREATE OR REPLACE TRIGGER "check_privilages" BEFORE INSERT
OR
UPDATE ON "public"."org_users" FOR EACH ROW
EXECUTE FUNCTION "public"."check_org_user_privilages" ();

CREATE OR REPLACE TRIGGER "force_valid_apikey_name" BEFORE INSERT
OR
UPDATE ON "public"."apikeys" FOR EACH ROW
EXECUTE FUNCTION "public"."auto_apikey_name_by_id" ();

CREATE OR REPLACE TRIGGER "force_valid_owner_org_app_versions" BEFORE INSERT
OR
UPDATE ON "public"."app_versions" FOR EACH ROW
EXECUTE FUNCTION "public"."auto_owner_org_by_app_id" ();

CREATE OR REPLACE TRIGGER "force_valid_owner_org_app_versions_meta" BEFORE INSERT
OR
UPDATE ON "public"."app_versions_meta" FOR EACH ROW
EXECUTE FUNCTION "public"."auto_owner_org_by_app_id" ();

CREATE OR REPLACE TRIGGER "force_valid_owner_org_channel_devices" BEFORE INSERT
OR
UPDATE ON "public"."channel_devices" FOR EACH ROW
EXECUTE FUNCTION "public"."auto_owner_org_by_app_id" ();

CREATE OR REPLACE TRIGGER "force_valid_owner_org_channels" BEFORE INSERT
OR
UPDATE ON "public"."channels" FOR EACH ROW
EXECUTE FUNCTION "public"."auto_owner_org_by_app_id" ();

CREATE OR REPLACE TRIGGER "generate_org_on_user_create"
AFTER INSERT ON "public"."users" FOR EACH ROW
EXECUTE FUNCTION "public"."generate_org_on_user_create" ();

CREATE OR REPLACE TRIGGER "generate_org_user_on_org_create"
AFTER INSERT ON "public"."orgs" FOR EACH ROW
EXECUTE FUNCTION "public"."generate_org_user_on_org_create" ();

CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE
UPDATE ON "public"."apikeys" FOR EACH ROW
EXECUTE FUNCTION "extensions"."moddatetime" ('updated_at');

CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE
UPDATE ON "public"."app_versions" FOR EACH ROW
EXECUTE FUNCTION "extensions"."moddatetime" ('updated_at');

CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE
UPDATE ON "public"."app_versions_meta" FOR EACH ROW
EXECUTE FUNCTION "extensions"."moddatetime" ('updated_at');

CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE
UPDATE ON "public"."apps" FOR EACH ROW
EXECUTE FUNCTION "extensions"."moddatetime" ('updated_at');

CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE
UPDATE ON "public"."channel_devices" FOR EACH ROW
EXECUTE FUNCTION "extensions"."moddatetime" ('updated_at');

CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE
UPDATE ON "public"."channels" FOR EACH ROW
EXECUTE FUNCTION "extensions"."moddatetime" ('updated_at');

CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE
UPDATE ON "public"."org_users" FOR EACH ROW
EXECUTE FUNCTION "extensions"."moddatetime" ('updated_at');

CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE
UPDATE ON "public"."plans" FOR EACH ROW
EXECUTE FUNCTION "extensions"."moddatetime" ('updated_at');

CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE
UPDATE ON "public"."stripe_info" FOR EACH ROW
EXECUTE FUNCTION "extensions"."moddatetime" ('updated_at');

CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE
UPDATE ON "public"."users" FOR EACH ROW
EXECUTE FUNCTION "extensions"."moddatetime" ('updated_at');

CREATE OR REPLACE TRIGGER "noupdate" BEFORE
UPDATE ON "public"."channels" FOR EACH ROW
EXECUTE FUNCTION "public"."noupdate" ();

CREATE OR REPLACE TRIGGER "on_app_create"
AFTER INSERT ON "public"."apps" FOR EACH ROW
EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function" ('on_app_create');

CREATE OR REPLACE TRIGGER "on_app_delete"
AFTER DELETE ON "public"."apps" FOR EACH ROW
EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function" ('on_app_delete');

CREATE OR REPLACE TRIGGER "on_channel_update"
AFTER
UPDATE ON "public"."channels" FOR EACH ROW
EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function" ('on_channel_update');

CREATE OR REPLACE TRIGGER "on_manifest_create"
AFTER INSERT ON "public"."manifest" FOR EACH ROW
EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function" ('on_manifest_create');

CREATE OR REPLACE TRIGGER "on_org_create"
AFTER INSERT ON "public"."orgs" FOR EACH ROW
EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function" ('on_organization_create');

CREATE OR REPLACE TRIGGER "on_organization_delete"
AFTER DELETE ON "public"."orgs" FOR EACH ROW
EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function" ('on_organization_delete');

CREATE OR REPLACE TRIGGER "on_user_create"
AFTER INSERT ON "public"."users" FOR EACH ROW
EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function" ('on_user_create');

CREATE OR REPLACE TRIGGER "on_user_delete"
AFTER DELETE ON "public"."users" FOR EACH ROW
EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function" ('on_user_delete');

CREATE OR REPLACE TRIGGER "on_user_update"
AFTER
UPDATE ON "public"."users" FOR EACH ROW
EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function" ('on_user_update');

CREATE OR REPLACE TRIGGER "on_version_create"
AFTER INSERT ON "public"."app_versions" FOR EACH ROW
EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function" ('on_version_create');

CREATE OR REPLACE TRIGGER "on_version_delete"
AFTER DELETE ON "public"."app_versions" FOR EACH ROW
EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function" ('on_version_delete');

CREATE OR REPLACE TRIGGER "on_version_update"
AFTER
UPDATE ON "public"."app_versions" FOR EACH ROW
EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function" ('on_version_update');

CREATE OR REPLACE TRIGGER "record_deployment_history_trigger"
AFTER
UPDATE OF "version" ON "public"."channels" FOR EACH ROW
EXECUTE FUNCTION "public"."record_deployment_history" ();

CREATE OR REPLACE TRIGGER "replicate_app_versions"
AFTER INSERT
OR DELETE
OR
UPDATE ON "public"."app_versions" FOR EACH ROW
EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function_d1" ();

CREATE OR REPLACE TRIGGER "replicate_apps"
AFTER INSERT
OR DELETE
OR
UPDATE ON "public"."apps" FOR EACH ROW
EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function_d1" ();

CREATE OR REPLACE TRIGGER "replicate_channel_devices"
AFTER INSERT
OR DELETE
OR
UPDATE ON "public"."channel_devices" FOR EACH ROW
EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function_d1" ();

CREATE OR REPLACE TRIGGER "replicate_channels"
AFTER INSERT
OR DELETE
OR
UPDATE ON "public"."channels" FOR EACH ROW
EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function_d1" ();

CREATE OR REPLACE TRIGGER "replicate_manifest"
AFTER INSERT
OR DELETE ON "public"."manifest" FOR EACH ROW
EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function_d1" ();

CREATE OR REPLACE TRIGGER "replicate_orgs"
AFTER INSERT
OR DELETE
OR
UPDATE ON "public"."orgs" FOR EACH ROW
EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function_d1" ();

CREATE OR REPLACE TRIGGER "replicate_stripe_info"
AFTER INSERT
OR DELETE
OR
UPDATE ON "public"."stripe_info" FOR EACH ROW
EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function_d1" ();

ALTER TABLE ONLY "public"."apikeys"
ADD CONSTRAINT "apikeys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."app_versions"
ADD CONSTRAINT "app_versions_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps" ("app_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."app_versions_meta"
ADD CONSTRAINT "app_versions_meta_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps" ("app_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."app_versions_meta"
ADD CONSTRAINT "app_versions_meta_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."app_versions" ("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."apps"
ADD CONSTRAINT "apps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."channel_devices"
ADD CONSTRAINT "channel_devices_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps" ("app_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."channel_devices"
ADD CONSTRAINT "channel_devices_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels" ("id");

ALTER TABLE ONLY "public"."channels"
ADD CONSTRAINT "channels_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps" ("app_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."channels"
ADD CONSTRAINT "channels_version_fkey" FOREIGN KEY ("version") REFERENCES "public"."app_versions" ("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."deploy_history"
ADD CONSTRAINT "deploy_history_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps" ("app_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."deploy_history"
ADD CONSTRAINT "deploy_history_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels" ("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."deploy_history"
ADD CONSTRAINT "deploy_history_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users" ("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."deploy_history"
ADD CONSTRAINT "deploy_history_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "public"."app_versions" ("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."manifest"
ADD CONSTRAINT "manifest_app_version_id_fkey" FOREIGN KEY ("app_version_id") REFERENCES "public"."app_versions" ("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."org_users"
ADD CONSTRAINT "org_users_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps" ("app_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."org_users"
ADD CONSTRAINT "org_users_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels" ("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."org_users"
ADD CONSTRAINT "org_users_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs" ("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."org_users"
ADD CONSTRAINT "org_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."orgs"
ADD CONSTRAINT "orgs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users" ("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."orgs"
ADD CONSTRAINT "orgs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."stripe_info" ("customer_id");

ALTER TABLE ONLY "public"."apps"
ADD CONSTRAINT "owner_org_id_fkey" FOREIGN KEY ("owner_org") REFERENCES "public"."orgs" ("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."app_versions"
ADD CONSTRAINT "owner_org_id_fkey" FOREIGN KEY ("owner_org") REFERENCES "public"."orgs" ("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."app_versions_meta"
ADD CONSTRAINT "owner_org_id_fkey" FOREIGN KEY ("owner_org") REFERENCES "public"."orgs" ("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."channel_devices"
ADD CONSTRAINT "owner_org_id_fkey" FOREIGN KEY ("owner_org") REFERENCES "public"."orgs" ("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."channels"
ADD CONSTRAINT "owner_org_id_fkey" FOREIGN KEY ("owner_org") REFERENCES "public"."orgs" ("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."notifications"
ADD CONSTRAINT "owner_org_id_fkey" FOREIGN KEY ("owner_org") REFERENCES "public"."orgs" ("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."stripe_info"
ADD CONSTRAINT "stripe_info_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."plans" ("stripe_id");

ALTER TABLE ONLY "public"."users"
ADD CONSTRAINT "users_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."stripe_info" ("customer_id");

ALTER TABLE ONLY "public"."users"
ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users" ("id") ON DELETE CASCADE;

CREATE POLICY "Allow all for auth (super_admin+)" ON "public"."app_versions" FOR DELETE TO "authenticated" USING (
  "public"."check_min_rights" (
    'super_admin'::"public"."user_min_right",
    "public"."get_identity" (),
    "owner_org",
    "app_id",
    NULL::bigint
  )
);

CREATE POLICY "Allow for auth, api keys (read+)" ON "public"."app_versions" FOR
SELECT
  TO "authenticated",
  "anon" USING (
    "public"."check_min_rights" (
      'read'::"public"."user_min_right",
      "public"."get_identity_org_appid" (
        '{read,upload,write,all}'::"public"."key_mode" [],
        "owner_org",
        "app_id"
      ),
      "owner_org",
      "app_id",
      NULL::bigint
    )
  );

CREATE POLICY "Allow all for auth (super_admin+)" ON "public"."apps" FOR DELETE TO "authenticated" USING (
  "public"."check_min_rights" (
    'super_admin'::"public"."user_min_right",
    "public"."get_identity" (),
    "owner_org",
    "app_id",
    NULL::bigint
  )
);

CREATE POLICY "Allow for auth, api keys (read+)" ON "public"."apps" FOR
SELECT
  TO "authenticated",
  "anon" USING (
    "public"."check_min_rights" (
      'read'::"public"."user_min_right",
      "public"."get_identity_org_appid" (
        '{read,upload,write,all}'::"public"."key_mode" [],
        "owner_org",
        "app_id"
      ),
      "owner_org",
      "app_id",
      NULL::bigint
    )
  );

CREATE POLICY "Allow anon to select" ON "public"."global_stats" FOR
SELECT
  TO "anon" USING (true);

CREATE POLICY "Allow apikey to read" ON "public"."stats" FOR
SELECT
  TO "anon" USING (
    "public"."is_allowed_capgkey" (
      (
        SELECT
          "public"."get_apikey_header" ()
      ),
      '{all,write}'::"public"."key_mode" [],
      "app_id"
    )
  );

CREATE POLICY "Allow delete for auth, api keys (write+)" ON "public"."channel_devices" FOR DELETE TO "authenticated",
"anon" USING (
  "public"."check_min_rights" (
    'write'::"public"."user_min_right",
    "public"."get_identity_org_appid" (
      '{write,all}'::"public"."key_mode" [],
      "owner_org",
      "app_id"
    ),
    "owner_org",
    "app_id",
    NULL::bigint
  )
);

CREATE POLICY "Allow insert for api keys (write,all,upload) (upload+)" ON "public"."app_versions" FOR INSERT TO "anon"
WITH
  CHECK (
    "public"."check_min_rights" (
      'upload'::"public"."user_min_right",
      "public"."get_identity_org_appid" (
        '{write,all,upload}'::"public"."key_mode" [],
        "owner_org",
        "app_id"
      ),
      "owner_org",
      "app_id",
      NULL::bigint
    )
  );

CREATE POLICY "Allow insert for apikey (write,all) (admin+)" ON "public"."apps" FOR INSERT TO "anon"
WITH
  CHECK (
    "public"."check_min_rights" (
      'admin'::"public"."user_min_right",
      "public"."get_identity_org_appid" (
        '{write,all}'::"public"."key_mode" [],
        "owner_org",
        "app_id"
      ),
      "owner_org",
      "app_id",
      NULL::bigint
    )
  );

CREATE POLICY "Allow insert for auth (write+)" ON "public"."channel_devices" FOR INSERT TO "authenticated"
WITH
  CHECK (
    "public"."check_min_rights" (
      'write'::"public"."user_min_right",
      "public"."get_identity" (),
      "owner_org",
      "app_id",
      NULL::bigint
    )
  );

CREATE POLICY "Allow org delete for super_admin" ON "public"."orgs" FOR DELETE TO "authenticated" USING (
  "public"."check_min_rights" (
    'super_admin'::"public"."user_min_right",
    "public"."get_identity" (),
    "id",
    NULL::character varying,
    NULL::bigint
  )
);

CREATE POLICY "Allow owner to update" ON "public"."devices"
FOR UPDATE
  TO "authenticated" USING (
    "public"."is_app_owner" (
      (
        SELECT
          "auth"."uid" () AS "uid"
      ),
      "app_id"
    )
  )
WITH
  CHECK (
    "public"."is_app_owner" (
      (
        SELECT
          "auth"."uid" () AS "uid"
      ),
      "app_id"
    )
  );

CREATE POLICY "Allow devices select" ON "public"."devices" FOR
SELECT
  TO "authenticated" USING (
    "public"."is_admin" (
      (
        SELECT
          "auth"."uid" () AS "uid"
      )
    )
    OR "public"."is_app_owner" (
      (
        SELECT
          "auth"."uid" () AS "uid"
      ),
      "app_id"
    )
    OR "public"."has_app_right_userid" (
      "app_id",
      'read'::"public"."user_min_right",
      "public"."get_identity" ()
    )
    OR "public"."check_min_rights" (
      'read'::"public"."user_min_right",
      (
        SELECT
          "auth"."uid" () AS "uid"
      ),
      "public"."get_user_main_org_id_by_app_id" (("app_id")::"text"),
      "app_id",
      NULL::bigint
    )
  );

CREATE POLICY "Allow read for auth (read+)" ON "public"."app_versions_meta" FOR
SELECT
  TO "authenticated",
  "anon" USING (
    "public"."check_min_rights" (
      'read'::"public"."user_min_right",
      "public"."get_identity_org_appid" (
        '{read,upload,write,all}'::"public"."key_mode" [],
        "owner_org",
        "app_id"
      ),
      "owner_org",
      "app_id",
      NULL::bigint
    )
  );

CREATE POLICY "Allow read for auth, api keys (read+)" ON "public"."channel_devices" FOR
SELECT
  TO "authenticated",
  "anon" USING (
    "public"."check_min_rights" (
      'read'::"public"."user_min_right",
      "public"."get_identity_org_appid" (
        '{read,upload,write,all}'::"public"."key_mode" [],
        "owner_org",
        "app_id"
      ),
      "owner_org",
      "app_id",
      NULL::bigint
    )
  );

CREATE POLICY "Allow read for auth (read+)" ON "public"."daily_bandwidth" FOR
SELECT
  TO "authenticated" USING (
    "public"."has_app_right_userid" (
      "app_id",
      'read'::"public"."user_min_right",
      "public"."get_identity" ()
    )
  );

CREATE POLICY "Allow read for auth (read+)" ON "public"."daily_mau" FOR
SELECT
  TO "authenticated" USING (
    "public"."has_app_right_userid" (
      "app_id",
      'read'::"public"."user_min_right",
      "public"."get_identity" ()
    )
  );

CREATE POLICY "Allow read for auth (read+)" ON "public"."daily_storage" FOR
SELECT
  TO "authenticated" USING (
    "public"."has_app_right_userid" (
      "app_id",
      'read'::"public"."user_min_right",
      "public"."get_identity" ()
    )
  );

CREATE POLICY "Allow read for auth (read+)" ON "public"."daily_version" FOR
SELECT
  TO "authenticated" USING (
    "public"."has_app_right_userid" (
      "app_id",
      'read'::"public"."user_min_right",
      "public"."get_identity" ()
    )
  );

CREATE POLICY "Allow read for auth (read+)" ON "public"."stats" FOR
SELECT
  TO "authenticated" USING (
    "public"."has_app_right_userid" (
      "app_id",
      'read'::"public"."user_min_right",
      "public"."get_identity" ()
    )
  );

CREATE POLICY "Allow select for auth, api keys (read+)" ON "public"."orgs" FOR
SELECT
  TO "authenticated",
  "anon" USING (
    "public"."check_min_rights" (
      'read'::"public"."user_min_right",
      "public"."get_identity_org_allowed" (
        '{read,upload,write,all}'::"public"."key_mode" [],
        "id"
      ),
      "id",
      NULL::character varying,
      NULL::bigint
    )
  );

CREATE POLICY "Allow self to modify self" ON "public"."users" TO "authenticated" USING (
  (
    (
      (
        (
          SELECT
            "auth"."uid" () AS "uid"
        ) = "id"
      )
      AND "public"."is_not_deleted" (
        (
          (
            SELECT
              "auth"."email" () AS "email"
          )
        )::character varying
      )
    )
    OR "public"."is_admin" (
      (
        SELECT
          "auth"."uid" () AS "uid"
      )
    )
  )
)
WITH
  CHECK (
    (
      (
        (
          (
            SELECT
              "auth"."uid" () AS "uid"
          ) = "id"
        )
        AND "public"."is_not_deleted" (
          (
            (
              SELECT
                "auth"."email" () AS "email"
            )
          )::character varying
        )
      )
      OR "public"."is_admin" (
        (
          SELECT
            "auth"."uid" () AS "uid"
        )
      )
    )
  );

-- SELECT
CREATE POLICY "Allow memeber and owner to select" ON "public"."org_users" FOR
SELECT
  TO "authenticated",
  "anon" USING (
    "public"."is_member_of_org" (
      (
        SELECT
          "public"."get_identity_org_allowed" (
            '{read,upload,write,all}'::"public"."key_mode" [],
            "org_users"."org_id"
          ) AS "get_identity_org_allowed"
      ),
      "org_id"
    )
  );

-- UPDATE
CREATE POLICY "Allow org admin to update" ON "public"."org_users"
FOR UPDATE
  TO "authenticated",
  "anon" USING (
    "public"."check_min_rights" (
      'admin'::"public"."user_min_right",
      (
        SELECT
          "public"."get_identity_org_allowed" (
            '{all}'::"public"."key_mode" [],
            "org_users"."org_id"
          ) AS "get_identity_org_allowed"
      ),
      "org_id",
      NULL::character varying,
      NULL::bigint
    )
  )
WITH
  CHECK (
    "public"."check_min_rights" (
      'admin'::"public"."user_min_right",
      (
        SELECT
          "public"."get_identity_org_allowed" (
            '{all}'::"public"."key_mode" [],
            "org_users"."org_id"
          ) AS "get_identity_org_allowed"
      ),
      "org_id",
      NULL::character varying,
      NULL::bigint
    )
  );

-- DELETE
CREATE POLICY "Allow to self delete" ON "public"."org_users" FOR DELETE TO "authenticated",
"anon" USING (
  (
    "public"."check_min_rights" (
      'admin'::"public"."user_min_right",
      (
        SELECT
          "public"."get_identity_org_allowed" (
            '{all}'::"public"."key_mode" [],
            "org_users"."org_id"
          ) AS "get_identity_org_allowed"
      ),
      "org_id",
      NULL::character varying,
      NULL::bigint
    )
  )
  OR (
    "user_id" = (
      SELECT
        "public"."get_identity_org_allowed" (
          '{read,upload,write,all}'::"public"."key_mode" [],
          "org_users"."org_id"
        ) AS "get_identity_org_allowed"
    )
  )
);

-- INSERT
CREATE POLICY "Allow org admin to insert" ON "public"."org_users" FOR INSERT TO "authenticated",
"anon"
WITH
  CHECK (
    "public"."check_min_rights" (
      'admin'::"public"."user_min_right",
      (
        SELECT
          "public"."get_identity_org_allowed" (
            '{all}'::"public"."key_mode" [],
            "org_users"."org_id"
          ) AS "get_identity_org_allowed"
      ),
      "org_id",
      NULL::character varying,
      NULL::bigint
    )
  );

CREATE POLICY "Allow update for auth (admin+)" ON "public"."orgs"
FOR UPDATE
  TO "authenticated",
  "anon" USING (
    "public"."check_min_rights" (
      'admin'::"public"."user_min_right",
      "public"."get_identity_org_allowed" ('{all,write}'::"public"."key_mode" [], "id"),
      "id",
      NULL::character varying,
      NULL::bigint
    )
  )
WITH
  CHECK (
    "public"."check_min_rights" (
      'admin'::"public"."user_min_right",
      "public"."get_identity_org_allowed" ('{all,write}'::"public"."key_mode" [], "id"),
      "id",
      NULL::character varying,
      NULL::bigint
    )
  );

CREATE POLICY "Allow update for auth (write+)" ON "public"."app_versions"
FOR UPDATE
  TO "authenticated" USING (
    "public"."check_min_rights" (
      'write'::"public"."user_min_right",
      "public"."get_identity_org_appid" (
        '{write,all,upload}'::"public"."key_mode" [],
        "owner_org",
        "app_id"
      ),
      "owner_org",
      "app_id",
      NULL::bigint
    )
  )
WITH
  CHECK (
    "public"."check_min_rights" (
      'write'::"public"."user_min_right",
      "public"."get_identity_org_appid" (
        '{write,all,upload}'::"public"."key_mode" [],
        "owner_org",
        "app_id"
      ),
      "owner_org",
      "app_id",
      NULL::bigint
    )
  );

CREATE POLICY "Allow update for api keys (write,all,upload) (upload+)" ON "public"."app_versions"
FOR UPDATE
  TO "anon" USING (
    "public"."check_min_rights" (
      'upload'::"public"."user_min_right",
      "public"."get_identity_org_appid" (
        '{write,all,upload}'::"public"."key_mode" [],
        "owner_org",
        "app_id"
      ),
      "owner_org",
      "app_id",
      NULL::bigint
    )
  )
WITH
  CHECK (
    "public"."check_min_rights" (
      'upload'::"public"."user_min_right",
      "public"."get_identity_org_appid" (
        '{write,all,upload}'::"public"."key_mode" [],
        "owner_org",
        "app_id"
      ),
      "owner_org",
      "app_id",
      NULL::bigint
    )
  );

CREATE POLICY "Allow update for auth, api keys (write+)" ON "public"."channel_devices"
FOR UPDATE
  TO "authenticated",
  "anon" USING (
    "public"."check_min_rights" (
      'write'::"public"."user_min_right",
      "public"."get_identity" ('{write,all}'::"public"."key_mode" []),
      "owner_org",
      "app_id",
      NULL::bigint
    )
  )
WITH
  CHECK (
    "public"."check_min_rights" (
      'write'::"public"."user_min_right",
      "public"."get_identity" ('{write,all}'::"public"."key_mode" []),
      "owner_org",
      "app_id",
      NULL::bigint
    )
  );

CREATE POLICY "Allow update for auth, api keys (write, all) (admin+)" ON "public"."apps"
FOR UPDATE
  TO "authenticated",
  "anon" USING (
    "public"."check_min_rights" (
      'admin'::"public"."user_min_right",
      "public"."get_identity_org_appid" (
        '{write,all}'::"public"."key_mode" [],
        "owner_org",
        "app_id"
      ),
      "owner_org",
      "app_id",
      NULL::bigint
    )
  )
WITH
  CHECK (
    "public"."check_min_rights" (
      'admin'::"public"."user_min_right",
      "public"."get_identity_org_appid" (
        '{write,all}'::"public"."key_mode" [],
        "owner_org",
        "app_id"
      ),
      "owner_org",
      "app_id",
      NULL::bigint
    )
  );

CREATE POLICY "Allow delete for auth (admin+) (all apikey)" ON "public"."channels" FOR DELETE TO "authenticated",
"anon" USING (
  "public"."check_min_rights" (
    'admin'::"public"."user_min_right",
    "public"."get_identity_org_appid" (
      '{all}'::"public"."key_mode" [],
      "owner_org",
      "app_id"
    ),
    "owner_org",
    "app_id",
    NULL::bigint
  )
);

CREATE POLICY "Allow insert for auth, api keys (write, all) (admin+)" ON "public"."channels" FOR INSERT TO "authenticated",
"anon"
WITH
  CHECK (
    "public"."check_min_rights" (
      'admin'::"public"."user_min_right",
      "public"."get_identity_org_appid" (
        '{write,all}'::"public"."key_mode" [],
        "owner_org",
        "app_id"
      ),
      "owner_org",
      "app_id",
      NULL::bigint
    )
  );

CREATE POLICY "Allow select for auth, api keys (read+)" ON "public"."channels" FOR
SELECT
  TO "authenticated",
  "anon" USING (
    "public"."check_min_rights" (
      'read'::"public"."user_min_right",
      "public"."get_identity_org_appid" (
        '{read,upload,write,all}'::"public"."key_mode" [],
        "owner_org",
        "app_id"
      ),
      "owner_org",
      "app_id",
      NULL::bigint
    )
  );

CREATE POLICY "Allow update for auth, api keys (write, all) (write+)" ON "public"."channels"
FOR UPDATE
  TO "authenticated",
  "anon" USING (
    "public"."check_min_rights" (
      'write'::"public"."user_min_right",
      "public"."get_identity_org_appid" (
        '{write,all}'::"public"."key_mode" [],
        "owner_org",
        "app_id"
      ),
      "owner_org",
      "app_id",
      NULL::bigint
    )
  )
WITH
  CHECK (
    "public"."check_min_rights" (
      'write'::"public"."user_min_right",
      "public"."get_identity_org_appid" (
        '{write,all}'::"public"."key_mode" [],
        "owner_org",
        "app_id"
      ),
      "owner_org",
      "app_id",
      NULL::bigint
    )
  );

CREATE POLICY "Allow user to self get" ON "public"."stripe_info" FOR
SELECT
  TO "authenticated" USING (
    (
      (
        (
          SELECT
            "auth"."uid" () AS "uid"
        ) IN (
          SELECT
            "users"."id"
          FROM
            "public"."users"
          WHERE
            (
              ("users"."customer_id")::"text" = ("users"."customer_id")::"text"
            )
        )
      )
      OR "public"."is_admin" (
        (
          SELECT
            "auth"."uid" () AS "uid"
        )
      )
    )
  );

CREATE POLICY "Allow users to delete manifest entries" ON "public"."manifest" FOR DELETE TO "authenticated" USING (
  (
    EXISTS (
      SELECT
        1
      FROM
        (
          "public"."app_versions" "av"
          JOIN "public"."apps" "a" ON (
            (("av"."app_id")::"text" = ("a"."app_id")::"text")
          )
        )
      WHERE
        (
          ("av"."id" = "manifest"."app_version_id")
          AND (
            "a"."owner_org" IN (
              SELECT
                "o"."id"
              FROM
                "public"."orgs" "o"
              WHERE
                (
                  "o"."id" IN (
                    SELECT
                      "ou"."org_id"
                    FROM
                      "public"."org_users" "ou"
                    WHERE
                      (
                        "ou"."user_id" = (
                          SELECT
                            "auth"."uid" () AS "uid"
                        )
                      )
                  )
                )
            )
          )
        )
    )
  )
);

CREATE POLICY "Allow users to insert manifest entries" ON "public"."manifest" FOR INSERT TO "authenticated"
WITH
  CHECK (
    (
      EXISTS (
        SELECT
          1
        FROM
          (
            "public"."app_versions" "av"
            JOIN "public"."apps" "a" ON (
              (("av"."app_id")::"text" = ("a"."app_id")::"text")
            )
          )
        WHERE
          (
            ("av"."id" = "manifest"."app_version_id")
            AND (
              "a"."owner_org" IN (
                SELECT
                  "o"."id"
                FROM
                  "public"."orgs" "o"
                WHERE
                  (
                    "o"."id" IN (
                      SELECT
                        "ou"."org_id"
                      FROM
                        "public"."org_users" "ou"
                      WHERE
                        (
                          "ou"."user_id" = (
                            SELECT
                              "auth"."uid" () AS "uid"
                          )
                        )
                    )
                  )
              )
            )
          )
      )
    )
  );

CREATE POLICY "Allow users to read any manifest entry" ON "public"."manifest" FOR
SELECT
  TO "authenticated" USING (true);

CREATE POLICY "Allow users to view deploy history for their org" ON "public"."deploy_history" FOR
SELECT
  TO "authenticated" USING (
    (
      SELECT
        (
          select
            auth.uid ()
        ) IN (
          SELECT
            public."org_users"."user_id"
          FROM
            "public"."org_users"
          WHERE
            (
              "org_users"."org_id" = "deploy_history"."owner_org"
            )
        )
    )
  );

CREATE POLICY "Allow users with write permissions to insert deploy history" ON "public"."deploy_history" FOR INSERT
WITH
  CHECK (false);

CREATE POLICY "Allow webapp to insert" ON "public"."orgs" FOR INSERT TO "authenticated"
WITH
  CHECK (
    (
      (
        SELECT
          "auth"."uid" () AS "uid"
      ) = "created_by"
    )
  );

CREATE POLICY "Deny delete on deploy history" ON "public"."deploy_history" FOR DELETE USING (false);

CREATE POLICY "Disable for all" ON "public"."bandwidth_usage" USING (false)
WITH
  CHECK (false);

CREATE POLICY "Disable for all" ON "public"."device_usage" USING (false)
WITH
  CHECK (false);

CREATE POLICY "Disable for all" ON "public"."notifications" USING (false)
WITH
  CHECK (false);

CREATE POLICY "Disable for all" ON "public"."storage_usage" USING (false)
WITH
  CHECK (false);

CREATE POLICY "Disable for all" ON "public"."version_meta" USING (false)
WITH
  CHECK (false);

CREATE POLICY "Disable for all" ON "public"."version_usage" USING (false)
WITH
  CHECK (false);

CREATE POLICY "Enable all for user based on user_id" ON "public"."apikeys" TO "authenticated" USING (
  (
    (
      SELECT
        "auth"."uid" () AS "uid"
    ) = "user_id"
  )
)
WITH
  CHECK (
    (
      (
        SELECT
          "auth"."uid" () AS "uid"
      ) = "user_id"
    )
  );

CREATE POLICY "Enable select for anyone" ON "public"."plans" FOR
SELECT
  TO "authenticated",
  "anon" USING (true);

CREATE POLICY "Enable update for users based on email" ON "public"."deleted_account" TO "authenticated"
WITH
  CHECK (
    (
      "encode" (
        "extensions"."digest" (
          (
            SELECT
              "auth"."email" () AS "email"
          ),
          'sha256'::"text"
        ),
        'hex'::"text"
      ) = ("email")::"text"
    )
  );

CREATE POLICY "Prevent non 2FA access" ON "public"."apikeys" AS RESTRICTIVE TO "authenticated" USING ("public"."verify_mfa" ());

CREATE POLICY "Prevent non 2FA access" ON "public"."app_versions" AS RESTRICTIVE TO "authenticated" USING ("public"."verify_mfa" ());

CREATE POLICY "Prevent non 2FA access" ON "public"."apps" AS RESTRICTIVE TO "authenticated" USING ("public"."verify_mfa" ());

CREATE POLICY "Prevent non 2FA access" ON "public"."channel_devices" AS RESTRICTIVE TO "authenticated" USING ("public"."verify_mfa" ());

CREATE POLICY "Prevent non 2FA access" ON "public"."channels" AS RESTRICTIVE TO "authenticated" USING ("public"."verify_mfa" ());

CREATE POLICY "Prevent non 2FA access" ON "public"."org_users" AS RESTRICTIVE TO "authenticated" USING ("public"."verify_mfa" ());

CREATE POLICY "Prevent non 2FA access" ON "public"."orgs" AS RESTRICTIVE TO "authenticated" USING ("public"."verify_mfa" ());

CREATE POLICY "Prevent update on deploy history" ON "public"."deploy_history"
FOR UPDATE
  USING (false)
WITH
  CHECK (false);

CREATE POLICY "Prevent users from updating manifest entries" ON "public"."manifest"
FOR UPDATE
  TO "authenticated" USING (false);

ALTER TABLE "public"."apikeys" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."app_versions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."app_versions_meta" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."apps" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."bandwidth_usage" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."channel_devices" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."channels" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."daily_bandwidth" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."daily_mau" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."daily_storage" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."daily_version" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."deleted_account" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."deleted_apps" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_access" ON "public"."deleted_apps" USING (false)
WITH
  CHECK (false);

ALTER TABLE "public"."deploy_history" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."device_usage" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."devices" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."global_stats" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."manifest" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."org_users" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."orgs" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."plans" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."stats" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."storage_usage" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."stripe_info" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."version_meta" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."version_usage" ENABLE ROW LEVEL SECURITY;

ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";

ALTER PUBLICATION "supabase_realtime"
ADD TABLE ONLY "public"."app_versions";

ALTER PUBLICATION "supabase_realtime"
ADD TABLE ONLY "public"."apps";

REVOKE USAGE ON SCHEMA "public"
FROM
  PUBLIC;

GRANT USAGE ON SCHEMA "public" TO "anon";

GRANT USAGE ON SCHEMA "public" TO "authenticated";

GRANT USAGE ON SCHEMA "public" TO "service_role";

GRANT ALL ON FUNCTION "public"."accept_invitation_to_org" ("org_id" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."accept_invitation_to_org" ("org_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."accept_invitation_to_org" ("org_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."auto_apikey_name_by_id" () TO "anon";

GRANT ALL ON FUNCTION "public"."auto_apikey_name_by_id" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."auto_apikey_name_by_id" () TO "service_role";

GRANT ALL ON FUNCTION "public"."auto_owner_org_by_app_id" () TO "anon";

GRANT ALL ON FUNCTION "public"."auto_owner_org_by_app_id" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."auto_owner_org_by_app_id" () TO "service_role";

GRANT ALL ON FUNCTION "public"."check_if_org_can_exist" () TO "anon";

GRANT ALL ON FUNCTION "public"."check_if_org_can_exist" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."check_if_org_can_exist" () TO "service_role";

GRANT ALL ON FUNCTION "public"."check_min_rights" (
  "min_right" "public"."user_min_right",
  "org_id" "uuid",
  "app_id" character varying,
  "channel_id" bigint
) TO "anon";

GRANT ALL ON FUNCTION "public"."check_min_rights" (
  "min_right" "public"."user_min_right",
  "org_id" "uuid",
  "app_id" character varying,
  "channel_id" bigint
) TO "authenticated";

GRANT ALL ON FUNCTION "public"."check_min_rights" (
  "min_right" "public"."user_min_right",
  "org_id" "uuid",
  "app_id" character varying,
  "channel_id" bigint
) TO "service_role";

GRANT ALL ON FUNCTION "public"."check_min_rights" (
  "min_right" "public"."user_min_right",
  "user_id" "uuid",
  "org_id" "uuid",
  "app_id" character varying,
  "channel_id" bigint
) TO "anon";

GRANT ALL ON FUNCTION "public"."check_min_rights" (
  "min_right" "public"."user_min_right",
  "user_id" "uuid",
  "org_id" "uuid",
  "app_id" character varying,
  "channel_id" bigint
) TO "authenticated";

GRANT ALL ON FUNCTION "public"."check_min_rights" (
  "min_right" "public"."user_min_right",
  "user_id" "uuid",
  "org_id" "uuid",
  "app_id" character varying,
  "channel_id" bigint
) TO "service_role";

GRANT ALL ON FUNCTION "public"."check_org_user_privilages" () TO "anon";

GRANT ALL ON FUNCTION "public"."check_org_user_privilages" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."check_org_user_privilages" () TO "service_role";

GRANT ALL ON FUNCTION "public"."check_revert_to_builtin_version" ("appid" character varying) TO "anon";

GRANT ALL ON FUNCTION "public"."check_revert_to_builtin_version" ("appid" character varying) TO "authenticated";

GRANT ALL ON FUNCTION "public"."check_revert_to_builtin_version" ("appid" character varying) TO "service_role";

REVOKE ALL ON FUNCTION "public"."cleanup_frequent_job_details" ()
FROM
  PUBLIC;

GRANT ALL ON FUNCTION "public"."cleanup_frequent_job_details" () TO "anon";

GRANT ALL ON FUNCTION "public"."cleanup_frequent_job_details" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."cleanup_frequent_job_details" () TO "service_role";

REVOKE ALL ON FUNCTION "public"."cleanup_queue_messages" ()
FROM
  PUBLIC;

GRANT ALL ON FUNCTION "public"."cleanup_queue_messages" () TO "anon";

GRANT ALL ON FUNCTION "public"."cleanup_queue_messages" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."cleanup_queue_messages" () TO "service_role";

GRANT ALL ON FUNCTION "public"."convert_bytes_to_gb" ("byt" double precision) TO "anon";

GRANT ALL ON FUNCTION "public"."convert_bytes_to_gb" ("byt" double precision) TO "authenticated";

GRANT ALL ON FUNCTION "public"."convert_bytes_to_gb" ("byt" double precision) TO "service_role";

GRANT ALL ON FUNCTION "public"."convert_bytes_to_mb" ("byt" double precision) TO "anon";

GRANT ALL ON FUNCTION "public"."convert_bytes_to_mb" ("byt" double precision) TO "authenticated";

GRANT ALL ON FUNCTION "public"."convert_bytes_to_mb" ("byt" double precision) TO "service_role";

GRANT ALL ON FUNCTION "public"."convert_gb_to_bytes" ("gb" double precision) TO "anon";

GRANT ALL ON FUNCTION "public"."convert_gb_to_bytes" ("gb" double precision) TO "authenticated";

GRANT ALL ON FUNCTION "public"."convert_gb_to_bytes" ("gb" double precision) TO "service_role";

GRANT ALL ON FUNCTION "public"."convert_mb_to_bytes" ("gb" double precision) TO "anon";

GRANT ALL ON FUNCTION "public"."convert_mb_to_bytes" ("gb" double precision) TO "authenticated";

GRANT ALL ON FUNCTION "public"."convert_mb_to_bytes" ("gb" double precision) TO "service_role";

GRANT ALL ON FUNCTION "public"."convert_number_to_percent" (
  "val" double precision,
  "max_val" double precision
) TO "anon";

GRANT ALL ON FUNCTION "public"."convert_number_to_percent" (
  "val" double precision,
  "max_val" double precision
) TO "authenticated";

GRANT ALL ON FUNCTION "public"."convert_number_to_percent" (
  "val" double precision,
  "max_val" double precision
) TO "service_role";

GRANT ALL ON FUNCTION "public"."count_active_users" ("app_ids" character varying[]) TO "anon";

GRANT ALL ON FUNCTION "public"."count_active_users" ("app_ids" character varying[]) TO "authenticated";

GRANT ALL ON FUNCTION "public"."count_active_users" ("app_ids" character varying[]) TO "service_role";

REVOKE ALL ON FUNCTION "public"."count_all_need_upgrade" ()
FROM
  PUBLIC;

GRANT ALL ON FUNCTION "public"."count_all_need_upgrade" () TO "anon";

GRANT ALL ON FUNCTION "public"."count_all_need_upgrade" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."count_all_need_upgrade" () TO "service_role";

REVOKE ALL ON FUNCTION "public"."count_all_onboarded" ()
FROM
  PUBLIC;

GRANT ALL ON FUNCTION "public"."count_all_onboarded" () TO "anon";

GRANT ALL ON FUNCTION "public"."count_all_onboarded" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."count_all_onboarded" () TO "service_role";

REVOKE ALL ON FUNCTION "public"."count_all_plans_v2" ()
FROM
  PUBLIC;

GRANT ALL ON FUNCTION "public"."count_all_plans_v2" () TO "anon";

GRANT ALL ON FUNCTION "public"."count_all_plans_v2" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."count_all_plans_v2" () TO "service_role";

REVOKE ALL ON FUNCTION "public"."delete_http_response" ("request_id" bigint)
FROM
  PUBLIC;

GRANT ALL ON FUNCTION "public"."delete_http_response" ("request_id" bigint) TO "anon";

GRANT ALL ON FUNCTION "public"."delete_http_response" ("request_id" bigint) TO "authenticated";

GRANT ALL ON FUNCTION "public"."delete_http_response" ("request_id" bigint) TO "service_role";

GRANT ALL ON FUNCTION "public"."delete_old_deleted_apps" () TO "anon";

GRANT ALL ON FUNCTION "public"."delete_old_deleted_apps" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."delete_old_deleted_apps" () TO "service_role";

GRANT ALL ON FUNCTION "public"."delete_user" () TO "anon";

GRANT ALL ON FUNCTION "public"."delete_user" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."delete_user" () TO "service_role";

GRANT ALL ON FUNCTION "public"."exist_app_v2" ("appid" character varying) TO "anon";

GRANT ALL ON FUNCTION "public"."exist_app_v2" ("appid" character varying) TO "authenticated";

GRANT ALL ON FUNCTION "public"."exist_app_v2" ("appid" character varying) TO "service_role";

GRANT ALL ON FUNCTION "public"."exist_app_versions" (
  "appid" character varying,
  "name_version" character varying,
  "apikey" "text"
) TO "anon";

GRANT ALL ON FUNCTION "public"."exist_app_versions" (
  "appid" character varying,
  "name_version" character varying,
  "apikey" "text"
) TO "authenticated";

GRANT ALL ON FUNCTION "public"."exist_app_versions" (
  "appid" character varying,
  "name_version" character varying,
  "apikey" "text"
) TO "service_role";

GRANT ALL ON FUNCTION "public"."force_valid_user_id_on_app" () TO "anon";

GRANT ALL ON FUNCTION "public"."force_valid_user_id_on_app" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."force_valid_user_id_on_app" () TO "service_role";

GRANT ALL ON FUNCTION "public"."generate_org_on_user_create" () TO "anon";

GRANT ALL ON FUNCTION "public"."generate_org_on_user_create" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."generate_org_on_user_create" () TO "service_role";

GRANT ALL ON FUNCTION "public"."generate_org_user_on_org_create" () TO "anon";

GRANT ALL ON FUNCTION "public"."generate_org_user_on_org_create" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."generate_org_user_on_org_create" () TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_apikey" ()
FROM
  PUBLIC;

GRANT ALL ON FUNCTION "public"."get_apikey" () TO "anon";

GRANT ALL ON FUNCTION "public"."get_apikey" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_apikey" () TO "service_role";

GRANT ALL ON FUNCTION "public"."get_app_metrics" ("org_id" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."get_app_metrics" ("org_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_app_metrics" ("org_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_app_metrics" (
  "org_id" "uuid",
  "start_date" "date",
  "end_date" "date"
) TO "anon";

GRANT ALL ON FUNCTION "public"."get_app_metrics" (
  "org_id" "uuid",
  "start_date" "date",
  "end_date" "date"
) TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_app_metrics" (
  "org_id" "uuid",
  "start_date" "date",
  "end_date" "date"
) TO "service_role";

GRANT ALL ON FUNCTION "public"."get_app_versions" (
  "appid" character varying,
  "name_version" character varying,
  "apikey" "text"
) TO "anon";

GRANT ALL ON FUNCTION "public"."get_app_versions" (
  "appid" character varying,
  "name_version" character varying,
  "apikey" "text"
) TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_app_versions" (
  "appid" character varying,
  "name_version" character varying,
  "apikey" "text"
) TO "service_role";

GRANT ALL ON FUNCTION "public"."get_current_plan_max_org" ("orgid" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."get_current_plan_max_org" ("orgid" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_current_plan_max_org" ("orgid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_current_plan_name_org" ("orgid" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."get_current_plan_name_org" ("orgid" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_current_plan_name_org" ("orgid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_customer_counts" () TO "anon";

GRANT ALL ON FUNCTION "public"."get_customer_counts" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_customer_counts" () TO "service_role";

GRANT ALL ON FUNCTION "public"."get_cycle_info_org" ("orgid" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."get_cycle_info_org" ("orgid" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_cycle_info_org" ("orgid" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_d1_webhook_signature" ()
FROM
  PUBLIC;

GRANT ALL ON FUNCTION "public"."get_d1_webhook_signature" () TO "anon";

GRANT ALL ON FUNCTION "public"."get_d1_webhook_signature" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_d1_webhook_signature" () TO "service_role";

GRANT ALL ON FUNCTION "public"."get_db_url" () TO "anon";

GRANT ALL ON FUNCTION "public"."get_db_url" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_db_url" () TO "service_role";

GRANT ALL ON FUNCTION "public"."get_global_metrics" ("org_id" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."get_global_metrics" ("org_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_global_metrics" ("org_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_global_metrics" (
  "org_id" "uuid",
  "start_date" "date",
  "end_date" "date"
) TO "anon";

GRANT ALL ON FUNCTION "public"."get_global_metrics" (
  "org_id" "uuid",
  "start_date" "date",
  "end_date" "date"
) TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_global_metrics" (
  "org_id" "uuid",
  "start_date" "date",
  "end_date" "date"
) TO "service_role";

GRANT ALL ON FUNCTION "public"."get_identity" () TO "anon";

GRANT ALL ON FUNCTION "public"."get_identity" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_identity" () TO "service_role";

GRANT ALL ON FUNCTION "public"."get_identity" ("keymode" "public"."key_mode" []) TO "anon";

GRANT ALL ON FUNCTION "public"."get_identity" ("keymode" "public"."key_mode" []) TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_identity" ("keymode" "public"."key_mode" []) TO "service_role";

GRANT ALL ON FUNCTION "public"."get_identity_apikey_only" ("keymode" "public"."key_mode" []) TO "anon";

GRANT ALL ON FUNCTION "public"."get_identity_apikey_only" ("keymode" "public"."key_mode" []) TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_identity_apikey_only" ("keymode" "public"."key_mode" []) TO "service_role";

GRANT ALL ON FUNCTION "public"."get_identity_org_allowed" ("keymode" "public"."key_mode" [], "org_id" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."get_identity_org_allowed" ("keymode" "public"."key_mode" [], "org_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_identity_org_allowed" ("keymode" "public"."key_mode" [], "org_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_identity_org_appid" (
  "keymode" "public"."key_mode" [],
  "org_id" "uuid",
  "app_id" character varying
) TO "anon";

GRANT ALL ON FUNCTION "public"."get_identity_org_appid" (
  "keymode" "public"."key_mode" [],
  "org_id" "uuid",
  "app_id" character varying
) TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_identity_org_appid" (
  "keymode" "public"."key_mode" [],
  "org_id" "uuid",
  "app_id" character varying
) TO "service_role";

GRANT ALL ON FUNCTION "public"."get_metered_usage" () TO "anon";

GRANT ALL ON FUNCTION "public"."get_metered_usage" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_metered_usage" () TO "service_role";

GRANT ALL ON FUNCTION "public"."get_metered_usage" ("orgid" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."get_metered_usage" ("orgid" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_metered_usage" ("orgid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_next_cron_time" (
  "p_schedule" "text",
  "p_timestamp" timestamp with time zone
) TO "anon";

GRANT ALL ON FUNCTION "public"."get_next_cron_time" (
  "p_schedule" "text",
  "p_timestamp" timestamp with time zone
) TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_next_cron_time" (
  "p_schedule" "text",
  "p_timestamp" timestamp with time zone
) TO "service_role";

GRANT ALL ON FUNCTION "public"."get_next_cron_value" (
  "pattern" "text",
  "current_val" integer,
  "max_val" integer
) TO "anon";

GRANT ALL ON FUNCTION "public"."get_next_cron_value" (
  "pattern" "text",
  "current_val" integer,
  "max_val" integer
) TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_next_cron_value" (
  "pattern" "text",
  "current_val" integer,
  "max_val" integer
) TO "service_role";

GRANT ALL ON FUNCTION "public"."get_org_members" ("guild_id" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."get_org_members" ("guild_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_org_members" ("guild_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_org_members" ("user_id" "uuid", "guild_id" "uuid")
FROM
  PUBLIC;

GRANT ALL ON FUNCTION "public"."get_org_members" ("user_id" "uuid", "guild_id" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."get_org_members" ("user_id" "uuid", "guild_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_org_members" ("user_id" "uuid", "guild_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_org_owner_id" ("apikey" "text", "app_id" "text") TO "anon";

GRANT ALL ON FUNCTION "public"."get_org_owner_id" ("apikey" "text", "app_id" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_org_owner_id" ("apikey" "text", "app_id" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_org_perm_for_apikey" ("apikey" "text", "app_id" "text") TO "anon";

GRANT ALL ON FUNCTION "public"."get_org_perm_for_apikey" ("apikey" "text", "app_id" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_org_perm_for_apikey" ("apikey" "text", "app_id" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_organization_cli_warnings" ("orgid" "uuid", "cli_version" "text") TO "anon";

GRANT ALL ON FUNCTION "public"."get_organization_cli_warnings" ("orgid" "uuid", "cli_version" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_organization_cli_warnings" ("orgid" "uuid", "cli_version" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_orgs_v6" () TO "anon";

GRANT ALL ON FUNCTION "public"."get_orgs_v6" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_orgs_v6" () TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_orgs_v6" ("userid" "uuid")
FROM
  PUBLIC;

GRANT ALL ON FUNCTION "public"."get_orgs_v6" ("userid" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."get_orgs_v6" ("userid" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_orgs_v6" ("userid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_plan_usage_percent_detailed" ("orgid" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."get_plan_usage_percent_detailed" ("orgid" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_plan_usage_percent_detailed" ("orgid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_plan_usage_percent_detailed" (
  "orgid" "uuid",
  "cycle_start" "date",
  "cycle_end" "date"
) TO "anon";

GRANT ALL ON FUNCTION "public"."get_plan_usage_percent_detailed" (
  "orgid" "uuid",
  "cycle_start" "date",
  "cycle_end" "date"
) TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_plan_usage_percent_detailed" (
  "orgid" "uuid",
  "cycle_start" "date",
  "cycle_end" "date"
) TO "service_role";

GRANT ALL ON FUNCTION "public"."get_process_cron_stats_job_info" () TO "anon";

GRANT ALL ON FUNCTION "public"."get_process_cron_stats_job_info" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_process_cron_stats_job_info" () TO "service_role";

GRANT ALL ON FUNCTION "public"."get_total_app_storage_size_orgs" ("org_id" "uuid", "app_id" character varying) TO "anon";

GRANT ALL ON FUNCTION "public"."get_total_app_storage_size_orgs" ("org_id" "uuid", "app_id" character varying) TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_total_app_storage_size_orgs" ("org_id" "uuid", "app_id" character varying) TO "service_role";

GRANT ALL ON FUNCTION "public"."get_total_metrics" ("org_id" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."get_total_metrics" ("org_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_total_metrics" ("org_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_total_metrics" (
  "org_id" "uuid",
  "start_date" "date",
  "end_date" "date"
) TO "anon";

GRANT ALL ON FUNCTION "public"."get_total_metrics" (
  "org_id" "uuid",
  "start_date" "date",
  "end_date" "date"
) TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_total_metrics" (
  "org_id" "uuid",
  "start_date" "date",
  "end_date" "date"
) TO "service_role";

GRANT ALL ON FUNCTION "public"."get_total_storage_size_org" ("org_id" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."get_total_storage_size_org" ("org_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_total_storage_size_org" ("org_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_update_stats" () TO "anon";

GRANT ALL ON FUNCTION "public"."get_update_stats" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_update_stats" () TO "service_role";

GRANT ALL ON FUNCTION "public"."get_user_id" ("apikey" "text") TO "anon";

GRANT ALL ON FUNCTION "public"."get_user_id" ("apikey" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_user_id" ("apikey" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_user_id" ("apikey" "text", "app_id" "text") TO "anon";

GRANT ALL ON FUNCTION "public"."get_user_id" ("apikey" "text", "app_id" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_user_id" ("apikey" "text", "app_id" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_user_main_org_id" ("user_id" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."get_user_main_org_id" ("user_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_user_main_org_id" ("user_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_user_main_org_id_by_app_id" ("app_id" "text") TO "anon";

GRANT ALL ON FUNCTION "public"."get_user_main_org_id_by_app_id" ("app_id" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_user_main_org_id_by_app_id" ("app_id" "text") TO "service_role";

GRANT ALL ON TABLE "public"."app_versions" TO "anon";

GRANT ALL ON TABLE "public"."app_versions" TO "authenticated";

GRANT ALL ON TABLE "public"."app_versions" TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_versions_with_no_metadata" ()
FROM
  PUBLIC;

GRANT ALL ON FUNCTION "public"."get_versions_with_no_metadata" () TO "service_role";

GRANT ALL ON FUNCTION "public"."get_weekly_stats" ("app_id" character varying) TO "anon";

GRANT ALL ON FUNCTION "public"."get_weekly_stats" ("app_id" character varying) TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_weekly_stats" ("app_id" character varying) TO "service_role";

GRANT ALL ON FUNCTION "public"."has_app_right" (
  "appid" character varying,
  "right" "public"."user_min_right"
) TO "anon";

GRANT ALL ON FUNCTION "public"."has_app_right" (
  "appid" character varying,
  "right" "public"."user_min_right"
) TO "authenticated";

GRANT ALL ON FUNCTION "public"."has_app_right" (
  "appid" character varying,
  "right" "public"."user_min_right"
) TO "service_role";

GRANT ALL ON FUNCTION "public"."has_app_right_apikey" (
  "appid" character varying,
  "right" "public"."user_min_right",
  "userid" "uuid",
  "apikey" "text"
) TO "anon";

GRANT ALL ON FUNCTION "public"."has_app_right_apikey" (
  "appid" character varying,
  "right" "public"."user_min_right",
  "userid" "uuid",
  "apikey" "text"
) TO "authenticated";

GRANT ALL ON FUNCTION "public"."has_app_right_apikey" (
  "appid" character varying,
  "right" "public"."user_min_right",
  "userid" "uuid",
  "apikey" "text"
) TO "service_role";

REVOKE ALL ON FUNCTION "public"."has_app_right_userid" (
  "appid" character varying,
  "right" "public"."user_min_right",
  "userid" "uuid"
)
FROM
  PUBLIC;

GRANT ALL ON FUNCTION "public"."has_app_right_userid" (
  "appid" character varying,
  "right" "public"."user_min_right",
  "userid" "uuid"
) TO "anon";

GRANT ALL ON FUNCTION "public"."has_app_right_userid" (
  "appid" character varying,
  "right" "public"."user_min_right",
  "userid" "uuid"
) TO "authenticated";

GRANT ALL ON FUNCTION "public"."has_app_right_userid" (
  "appid" character varying,
  "right" "public"."user_min_right",
  "userid" "uuid"
) TO "service_role";

GRANT ALL ON FUNCTION "public"."invite_user_to_org" (
  "email" character varying,
  "org_id" "uuid",
  "invite_type" "public"."user_min_right"
) TO "anon";

GRANT ALL ON FUNCTION "public"."invite_user_to_org" (
  "email" character varying,
  "org_id" "uuid",
  "invite_type" "public"."user_min_right"
) TO "authenticated";

GRANT ALL ON FUNCTION "public"."invite_user_to_org" (
  "email" character varying,
  "org_id" "uuid",
  "invite_type" "public"."user_min_right"
) TO "service_role";

GRANT ALL ON FUNCTION "public"."is_admin" () TO "anon";

GRANT ALL ON FUNCTION "public"."is_admin" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_admin" () TO "service_role";

GRANT ALL ON FUNCTION "public"."is_admin" ("userid" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."is_admin" ("userid" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_admin" ("userid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_allowed_action" ("apikey" "text", "appid" "text") TO "anon";

GRANT ALL ON FUNCTION "public"."is_allowed_action" ("apikey" "text", "appid" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_allowed_action" ("apikey" "text", "appid" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_allowed_action_org" ("orgid" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."is_allowed_action_org" ("orgid" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_allowed_action_org" ("orgid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_allowed_action_org_action" (
  "orgid" "uuid",
  "actions" "public"."action_type" []
) TO "anon";

GRANT ALL ON FUNCTION "public"."is_allowed_action_org_action" (
  "orgid" "uuid",
  "actions" "public"."action_type" []
) TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_allowed_action_org_action" (
  "orgid" "uuid",
  "actions" "public"."action_type" []
) TO "service_role";

GRANT ALL ON FUNCTION "public"."is_allowed_capgkey" ("apikey" "text", "keymode" "public"."key_mode" []) TO "anon";

GRANT ALL ON FUNCTION "public"."is_allowed_capgkey" ("apikey" "text", "keymode" "public"."key_mode" []) TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_allowed_capgkey" ("apikey" "text", "keymode" "public"."key_mode" []) TO "service_role";

GRANT ALL ON FUNCTION "public"."is_allowed_capgkey" (
  "apikey" "text",
  "keymode" "public"."key_mode" [],
  "app_id" character varying
) TO "anon";

GRANT ALL ON FUNCTION "public"."is_allowed_capgkey" (
  "apikey" "text",
  "keymode" "public"."key_mode" [],
  "app_id" character varying
) TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_allowed_capgkey" (
  "apikey" "text",
  "keymode" "public"."key_mode" [],
  "app_id" character varying
) TO "service_role";

GRANT ALL ON FUNCTION "public"."is_app_owner" ("appid" character varying) TO "anon";

GRANT ALL ON FUNCTION "public"."is_app_owner" ("appid" character varying) TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_app_owner" ("appid" character varying) TO "service_role";

GRANT ALL ON FUNCTION "public"."is_app_owner" ("apikey" "text", "appid" character varying) TO "anon";

GRANT ALL ON FUNCTION "public"."is_app_owner" ("apikey" "text", "appid" character varying) TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_app_owner" ("apikey" "text", "appid" character varying) TO "service_role";

GRANT ALL ON FUNCTION "public"."is_app_owner" ("userid" "uuid", "appid" character varying) TO "anon";

GRANT ALL ON FUNCTION "public"."is_app_owner" ("userid" "uuid", "appid" character varying) TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_app_owner" ("userid" "uuid", "appid" character varying) TO "service_role";

GRANT ALL ON FUNCTION "public"."is_bandwidth_exceeded_by_org" ("org_id" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."is_bandwidth_exceeded_by_org" ("org_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_bandwidth_exceeded_by_org" ("org_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_canceled_org" ("orgid" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."is_canceled_org" ("orgid" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_canceled_org" ("orgid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_good_plan_v5_org" ("orgid" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."is_good_plan_v5_org" ("orgid" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_good_plan_v5_org" ("orgid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_mau_exceeded_by_org" ("org_id" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."is_mau_exceeded_by_org" ("org_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_mau_exceeded_by_org" ("org_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_member_of_org" ("user_id" "uuid", "org_id" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."is_member_of_org" ("user_id" "uuid", "org_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_member_of_org" ("user_id" "uuid", "org_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_not_deleted" ("email_check" character varying) TO "anon";

GRANT ALL ON FUNCTION "public"."is_not_deleted" ("email_check" character varying) TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_not_deleted" ("email_check" character varying) TO "service_role";

GRANT ALL ON FUNCTION "public"."is_numeric" ("text") TO "anon";

GRANT ALL ON FUNCTION "public"."is_numeric" ("text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_numeric" ("text") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_onboarded_org" ("orgid" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."is_onboarded_org" ("orgid" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_onboarded_org" ("orgid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_onboarding_needed_org" ("orgid" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."is_onboarding_needed_org" ("orgid" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_onboarding_needed_org" ("orgid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_org_yearly" ("orgid" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."is_org_yearly" ("orgid" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_org_yearly" ("orgid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_paying_and_good_plan_org" ("orgid" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."is_paying_and_good_plan_org" ("orgid" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_paying_and_good_plan_org" ("orgid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_paying_and_good_plan_org_action" (
  "orgid" "uuid",
  "actions" "public"."action_type" []
) TO "anon";

GRANT ALL ON FUNCTION "public"."is_paying_and_good_plan_org_action" (
  "orgid" "uuid",
  "actions" "public"."action_type" []
) TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_paying_and_good_plan_org_action" (
  "orgid" "uuid",
  "actions" "public"."action_type" []
) TO "service_role";

GRANT ALL ON FUNCTION "public"."is_paying_org" ("orgid" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."is_paying_org" ("orgid" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_paying_org" ("orgid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_storage_exceeded_by_org" ("org_id" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."is_storage_exceeded_by_org" ("org_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_storage_exceeded_by_org" ("org_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_trial_org" ("orgid" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."is_trial_org" ("orgid" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_trial_org" ("orgid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."noupdate" () TO "anon";

GRANT ALL ON FUNCTION "public"."noupdate" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."noupdate" () TO "service_role";

GRANT ALL ON FUNCTION "public"."one_month_ahead" () TO "anon";

GRANT ALL ON FUNCTION "public"."one_month_ahead" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."one_month_ahead" () TO "service_role";

GRANT ALL ON FUNCTION "public"."parse_cron_field" (
  "field" "text",
  "current_val" integer,
  "max_val" integer
) TO "anon";

GRANT ALL ON FUNCTION "public"."parse_cron_field" (
  "field" "text",
  "current_val" integer,
  "max_val" integer
) TO "authenticated";

GRANT ALL ON FUNCTION "public"."parse_cron_field" (
  "field" "text",
  "current_val" integer,
  "max_val" integer
) TO "service_role";

GRANT ALL ON FUNCTION "public"."parse_step_pattern" ("pattern" "text") TO "anon";

GRANT ALL ON FUNCTION "public"."parse_step_pattern" ("pattern" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."parse_step_pattern" ("pattern" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."process_admin_stats" ()
FROM
  PUBLIC;

GRANT ALL ON FUNCTION "public"."process_admin_stats" () TO "anon";

GRANT ALL ON FUNCTION "public"."process_admin_stats" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."process_admin_stats" () TO "service_role";

GRANT ALL ON FUNCTION "public"."process_cron_stats_jobs" () TO "anon";

GRANT ALL ON FUNCTION "public"."process_cron_stats_jobs" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."process_cron_stats_jobs" () TO "service_role";

REVOKE ALL ON FUNCTION "public"."process_d1_replication_batch" ()
FROM
  PUBLIC;

GRANT ALL ON FUNCTION "public"."process_d1_replication_batch" () TO "anon";

GRANT ALL ON FUNCTION "public"."process_d1_replication_batch" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."process_d1_replication_batch" () TO "service_role";

REVOKE ALL ON FUNCTION "public"."process_failed_uploads" ()
FROM
  PUBLIC;

GRANT ALL ON FUNCTION "public"."process_failed_uploads" () TO "service_role";

REVOKE ALL ON FUNCTION "public"."process_free_trial_expired" ()
FROM
  PUBLIC;

GRANT ALL ON FUNCTION "public"."process_free_trial_expired" () TO "anon";

GRANT ALL ON FUNCTION "public"."process_free_trial_expired" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."process_free_trial_expired" () TO "service_role";

REVOKE ALL ON FUNCTION "public"."process_function_queue" ("queue_name" "text")
FROM
  PUBLIC;

GRANT ALL ON FUNCTION "public"."process_function_queue" ("queue_name" "text") TO "anon";

GRANT ALL ON FUNCTION "public"."process_function_queue" ("queue_name" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."process_function_queue" ("queue_name" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."process_stats_email_monthly" ()
FROM
  PUBLIC;

GRANT ALL ON FUNCTION "public"."process_stats_email_monthly" () TO "anon";

GRANT ALL ON FUNCTION "public"."process_stats_email_monthly" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."process_stats_email_monthly" () TO "service_role";

REVOKE ALL ON FUNCTION "public"."process_stats_email_weekly" ()
FROM
  PUBLIC;

GRANT ALL ON FUNCTION "public"."process_stats_email_weekly" () TO "anon";

GRANT ALL ON FUNCTION "public"."process_stats_email_weekly" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."process_stats_email_weekly" () TO "service_role";

REVOKE ALL ON FUNCTION "public"."process_subscribed_orgs" ()
FROM
  PUBLIC;

GRANT ALL ON FUNCTION "public"."process_subscribed_orgs" () TO "anon";

GRANT ALL ON FUNCTION "public"."process_subscribed_orgs" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."process_subscribed_orgs" () TO "service_role";

REVOKE ALL ON FUNCTION "public"."read_bandwidth_usage" (
  "p_app_id" character varying,
  "p_period_start" timestamp without time zone,
  "p_period_end" timestamp without time zone
)
FROM
  PUBLIC;

GRANT ALL ON FUNCTION "public"."read_bandwidth_usage" (
  "p_app_id" character varying,
  "p_period_start" timestamp without time zone,
  "p_period_end" timestamp without time zone
) TO "anon";

GRANT ALL ON FUNCTION "public"."read_bandwidth_usage" (
  "p_app_id" character varying,
  "p_period_start" timestamp without time zone,
  "p_period_end" timestamp without time zone
) TO "authenticated";

GRANT ALL ON FUNCTION "public"."read_bandwidth_usage" (
  "p_app_id" character varying,
  "p_period_start" timestamp without time zone,
  "p_period_end" timestamp without time zone
) TO "service_role";

REVOKE ALL ON FUNCTION "public"."read_device_usage" (
  "p_app_id" character varying,
  "p_period_start" timestamp without time zone,
  "p_period_end" timestamp without time zone
)
FROM
  PUBLIC;

GRANT ALL ON FUNCTION "public"."read_device_usage" (
  "p_app_id" character varying,
  "p_period_start" timestamp without time zone,
  "p_period_end" timestamp without time zone
) TO "anon";

GRANT ALL ON FUNCTION "public"."read_device_usage" (
  "p_app_id" character varying,
  "p_period_start" timestamp without time zone,
  "p_period_end" timestamp without time zone
) TO "authenticated";

GRANT ALL ON FUNCTION "public"."read_device_usage" (
  "p_app_id" character varying,
  "p_period_start" timestamp without time zone,
  "p_period_end" timestamp without time zone
) TO "service_role";

GRANT ALL ON FUNCTION "public"."read_storage_usage" (
  "p_app_id" character varying,
  "p_period_start" timestamp without time zone,
  "p_period_end" timestamp without time zone
) TO "anon";

GRANT ALL ON FUNCTION "public"."read_storage_usage" (
  "p_app_id" character varying,
  "p_period_start" timestamp without time zone,
  "p_period_end" timestamp without time zone
) TO "authenticated";

GRANT ALL ON FUNCTION "public"."read_storage_usage" (
  "p_app_id" character varying,
  "p_period_start" timestamp without time zone,
  "p_period_end" timestamp without time zone
) TO "service_role";

GRANT ALL ON FUNCTION "public"."read_version_usage" (
  "p_app_id" character varying,
  "p_period_start" timestamp without time zone,
  "p_period_end" timestamp without time zone
) TO "anon";

GRANT ALL ON FUNCTION "public"."read_version_usage" (
  "p_app_id" character varying,
  "p_period_start" timestamp without time zone,
  "p_period_end" timestamp without time zone
) TO "authenticated";

GRANT ALL ON FUNCTION "public"."read_version_usage" (
  "p_app_id" character varying,
  "p_period_start" timestamp without time zone,
  "p_period_end" timestamp without time zone
) TO "service_role";

REVOKE ALL ON FUNCTION "public"."record_deployment_history" ()
FROM
  PUBLIC;

GRANT ALL ON FUNCTION "public"."record_deployment_history" () TO "anon";

GRANT ALL ON FUNCTION "public"."record_deployment_history" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."record_deployment_history" () TO "service_role";

REVOKE ALL ON FUNCTION "public"."remove_old_jobs" ()
FROM
  PUBLIC;

GRANT ALL ON FUNCTION "public"."remove_old_jobs" () TO "anon";

GRANT ALL ON FUNCTION "public"."remove_old_jobs" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."remove_old_jobs" () TO "service_role";

REVOKE ALL ON FUNCTION "public"."set_bandwidth_exceeded_by_org" ("org_id" "uuid", "disabled" boolean)
FROM
  PUBLIC;

GRANT ALL ON FUNCTION "public"."set_bandwidth_exceeded_by_org" ("org_id" "uuid", "disabled" boolean) TO "service_role";

REVOKE ALL ON FUNCTION "public"."set_mau_exceeded_by_org" ("org_id" "uuid", "disabled" boolean)
FROM
  PUBLIC;

GRANT ALL ON FUNCTION "public"."set_mau_exceeded_by_org" ("org_id" "uuid", "disabled" boolean) TO "service_role";

REVOKE ALL ON FUNCTION "public"."set_storage_exceeded_by_org" ("org_id" "uuid", "disabled" boolean)
FROM
  PUBLIC;

GRANT ALL ON FUNCTION "public"."set_storage_exceeded_by_org" ("org_id" "uuid", "disabled" boolean) TO "service_role";

GRANT ALL ON FUNCTION "public"."transfer_app" (
  "p_app_id" character varying,
  "p_new_org_id" "uuid"
) TO "anon";

GRANT ALL ON FUNCTION "public"."transfer_app" (
  "p_app_id" character varying,
  "p_new_org_id" "uuid"
) TO "authenticated";

GRANT ALL ON FUNCTION "public"."transfer_app" (
  "p_app_id" character varying,
  "p_new_org_id" "uuid"
) TO "service_role";

GRANT ALL ON FUNCTION "public"."trigger_http_queue_post_to_function" () TO "anon";

GRANT ALL ON FUNCTION "public"."trigger_http_queue_post_to_function" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."trigger_http_queue_post_to_function" () TO "service_role";

REVOKE ALL ON FUNCTION "public"."trigger_http_queue_post_to_function_d1" ()
FROM
  PUBLIC;

GRANT ALL ON FUNCTION "public"."trigger_http_queue_post_to_function_d1" () TO "anon";

GRANT ALL ON FUNCTION "public"."trigger_http_queue_post_to_function_d1" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."trigger_http_queue_post_to_function_d1" () TO "service_role";

GRANT ALL ON FUNCTION "public"."update_app_versions_retention" () TO "anon";

GRANT ALL ON FUNCTION "public"."update_app_versions_retention" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."update_app_versions_retention" () TO "service_role";

GRANT ALL ON FUNCTION "public"."verify_mfa" () TO "anon";

GRANT ALL ON FUNCTION "public"."verify_mfa" () TO "authenticated";

GRANT ALL ON FUNCTION "public"."verify_mfa" () TO "service_role";

GRANT ALL ON TABLE "public"."apikeys" TO "anon";

GRANT ALL ON TABLE "public"."apikeys" TO "authenticated";

GRANT ALL ON TABLE "public"."apikeys" TO "service_role";

GRANT ALL ON SEQUENCE "public"."apikeys_id_seq" TO "anon";

GRANT ALL ON SEQUENCE "public"."apikeys_id_seq" TO "authenticated";

GRANT ALL ON SEQUENCE "public"."apikeys_id_seq" TO "service_role";

GRANT ALL ON SEQUENCE "public"."app_versions_id_seq" TO "anon";

GRANT ALL ON SEQUENCE "public"."app_versions_id_seq" TO "authenticated";

GRANT ALL ON SEQUENCE "public"."app_versions_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."app_versions_meta" TO "anon";

GRANT ALL ON TABLE "public"."app_versions_meta" TO "authenticated";

GRANT ALL ON TABLE "public"."app_versions_meta" TO "service_role";

GRANT ALL ON SEQUENCE "public"."app_versions_meta_id_seq" TO "anon";

GRANT ALL ON SEQUENCE "public"."app_versions_meta_id_seq" TO "authenticated";

GRANT ALL ON SEQUENCE "public"."app_versions_meta_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."apps" TO "anon";

GRANT ALL ON TABLE "public"."apps" TO "authenticated";

GRANT ALL ON TABLE "public"."apps" TO "service_role";

GRANT ALL ON TABLE "public"."bandwidth_usage" TO "anon";

GRANT ALL ON TABLE "public"."bandwidth_usage" TO "authenticated";

GRANT ALL ON TABLE "public"."bandwidth_usage" TO "service_role";

GRANT ALL ON SEQUENCE "public"."bandwidth_usage_id_seq" TO "anon";

GRANT ALL ON SEQUENCE "public"."bandwidth_usage_id_seq" TO "authenticated";

GRANT ALL ON SEQUENCE "public"."bandwidth_usage_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."channel_devices" TO "anon";

GRANT ALL ON TABLE "public"."channel_devices" TO "authenticated";

GRANT ALL ON TABLE "public"."channel_devices" TO "service_role";

GRANT ALL ON SEQUENCE "public"."channel_devices_id_seq" TO "anon";

GRANT ALL ON SEQUENCE "public"."channel_devices_id_seq" TO "authenticated";

GRANT ALL ON SEQUENCE "public"."channel_devices_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."channels" TO "anon";

GRANT ALL ON TABLE "public"."channels" TO "authenticated";

GRANT ALL ON TABLE "public"."channels" TO "service_role";

GRANT ALL ON SEQUENCE "public"."channel_id_seq" TO "anon";

GRANT ALL ON SEQUENCE "public"."channel_id_seq" TO "authenticated";

GRANT ALL ON SEQUENCE "public"."channel_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."daily_bandwidth" TO "anon";

GRANT ALL ON TABLE "public"."daily_bandwidth" TO "authenticated";

GRANT ALL ON TABLE "public"."daily_bandwidth" TO "service_role";

GRANT ALL ON SEQUENCE "public"."daily_bandwidth_id_seq" TO "anon";

GRANT ALL ON SEQUENCE "public"."daily_bandwidth_id_seq" TO "authenticated";

GRANT ALL ON SEQUENCE "public"."daily_bandwidth_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."daily_mau" TO "anon";

GRANT ALL ON TABLE "public"."daily_mau" TO "authenticated";

GRANT ALL ON TABLE "public"."daily_mau" TO "service_role";

GRANT ALL ON SEQUENCE "public"."daily_mau_id_seq" TO "anon";

GRANT ALL ON SEQUENCE "public"."daily_mau_id_seq" TO "authenticated";

GRANT ALL ON SEQUENCE "public"."daily_mau_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."daily_storage" TO "anon";

GRANT ALL ON TABLE "public"."daily_storage" TO "authenticated";

GRANT ALL ON TABLE "public"."daily_storage" TO "service_role";

GRANT ALL ON SEQUENCE "public"."daily_storage_id_seq" TO "anon";

GRANT ALL ON SEQUENCE "public"."daily_storage_id_seq" TO "authenticated";

GRANT ALL ON SEQUENCE "public"."daily_storage_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."daily_version" TO "anon";

GRANT ALL ON TABLE "public"."daily_version" TO "authenticated";

GRANT ALL ON TABLE "public"."daily_version" TO "service_role";

GRANT ALL ON TABLE "public"."deleted_account" TO "anon";

GRANT ALL ON TABLE "public"."deleted_account" TO "authenticated";

GRANT ALL ON TABLE "public"."deleted_account" TO "service_role";

GRANT ALL ON TABLE "public"."deleted_apps" TO "anon";

GRANT ALL ON TABLE "public"."deleted_apps" TO "authenticated";

GRANT ALL ON TABLE "public"."deleted_apps" TO "service_role";

GRANT ALL ON SEQUENCE "public"."deleted_apps_id_seq" TO "anon";

GRANT ALL ON SEQUENCE "public"."deleted_apps_id_seq" TO "authenticated";

GRANT ALL ON SEQUENCE "public"."deleted_apps_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."deploy_history" TO "anon";

GRANT ALL ON TABLE "public"."deploy_history" TO "authenticated";

GRANT ALL ON TABLE "public"."deploy_history" TO "service_role";

GRANT ALL ON SEQUENCE "public"."deploy_history_id_seq" TO "anon";

GRANT ALL ON SEQUENCE "public"."deploy_history_id_seq" TO "authenticated";

GRANT ALL ON SEQUENCE "public"."deploy_history_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."device_usage" TO "anon";

GRANT ALL ON TABLE "public"."device_usage" TO "authenticated";

GRANT ALL ON TABLE "public"."device_usage" TO "service_role";

GRANT ALL ON SEQUENCE "public"."device_usage_id_seq" TO "anon";

GRANT ALL ON SEQUENCE "public"."device_usage_id_seq" TO "authenticated";

GRANT ALL ON SEQUENCE "public"."device_usage_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."devices" TO "anon";

GRANT ALL ON TABLE "public"."devices" TO "authenticated";

GRANT ALL ON TABLE "public"."devices" TO "service_role";

GRANT ALL ON TABLE "public"."global_stats" TO "anon";

GRANT ALL ON TABLE "public"."global_stats" TO "authenticated";

GRANT ALL ON TABLE "public"."global_stats" TO "service_role";

GRANT ALL ON TABLE "public"."manifest" TO "anon";

GRANT ALL ON TABLE "public"."manifest" TO "authenticated";

GRANT ALL ON TABLE "public"."manifest" TO "service_role";

GRANT ALL ON SEQUENCE "public"."manifest_id_seq" TO "anon";

GRANT ALL ON SEQUENCE "public"."manifest_id_seq" TO "authenticated";

GRANT ALL ON SEQUENCE "public"."manifest_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."notifications" TO "anon";

GRANT ALL ON TABLE "public"."notifications" TO "authenticated";

GRANT ALL ON TABLE "public"."notifications" TO "service_role";

GRANT ALL ON TABLE "public"."org_users" TO "anon";

GRANT ALL ON TABLE "public"."org_users" TO "authenticated";

GRANT ALL ON TABLE "public"."org_users" TO "service_role";

GRANT ALL ON SEQUENCE "public"."org_users_id_seq" TO "anon";

GRANT ALL ON SEQUENCE "public"."org_users_id_seq" TO "authenticated";

GRANT ALL ON SEQUENCE "public"."org_users_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."orgs" TO "anon";

GRANT ALL ON TABLE "public"."orgs" TO "authenticated";

GRANT ALL ON TABLE "public"."orgs" TO "service_role";

GRANT ALL ON TABLE "public"."plans" TO "anon";

GRANT ALL ON TABLE "public"."plans" TO "authenticated";

GRANT ALL ON TABLE "public"."plans" TO "service_role";

GRANT ALL ON TABLE "public"."stats" TO "anon";

GRANT ALL ON TABLE "public"."stats" TO "authenticated";

GRANT ALL ON TABLE "public"."stats" TO "service_role";

GRANT ALL ON SEQUENCE "public"."stats_id_seq" TO "anon";

GRANT ALL ON SEQUENCE "public"."stats_id_seq" TO "authenticated";

GRANT ALL ON SEQUENCE "public"."stats_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."storage_usage" TO "anon";

GRANT ALL ON TABLE "public"."storage_usage" TO "authenticated";

GRANT ALL ON TABLE "public"."storage_usage" TO "service_role";

GRANT ALL ON SEQUENCE "public"."storage_usage_id_seq" TO "anon";

GRANT ALL ON SEQUENCE "public"."storage_usage_id_seq" TO "authenticated";

GRANT ALL ON SEQUENCE "public"."storage_usage_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."stripe_info" TO "anon";

GRANT ALL ON TABLE "public"."stripe_info" TO "authenticated";

GRANT ALL ON TABLE "public"."stripe_info" TO "service_role";

GRANT ALL ON SEQUENCE "public"."stripe_info_id_seq" TO "anon";

GRANT ALL ON SEQUENCE "public"."stripe_info_id_seq" TO "authenticated";

GRANT ALL ON SEQUENCE "public"."stripe_info_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."users" TO "anon";

GRANT ALL ON TABLE "public"."users" TO "authenticated";

GRANT ALL ON TABLE "public"."users" TO "service_role";

GRANT ALL ON TABLE "public"."version_meta" TO "anon";

GRANT ALL ON TABLE "public"."version_meta" TO "authenticated";

GRANT ALL ON TABLE "public"."version_meta" TO "service_role";

GRANT ALL ON TABLE "public"."version_usage" TO "anon";

GRANT ALL ON TABLE "public"."version_usage" TO "authenticated";

GRANT ALL ON TABLE "public"."version_usage" TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
GRANT ALL ON SEQUENCES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
GRANT ALL ON SEQUENCES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
GRANT ALL ON SEQUENCES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
GRANT ALL ON SEQUENCES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
GRANT ALL ON FUNCTIONS TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
GRANT ALL ON FUNCTIONS TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
GRANT ALL ON FUNCTIONS TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
GRANT ALL ON FUNCTIONS TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
GRANT ALL ON TABLES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
GRANT ALL ON TABLES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
GRANT ALL ON TABLES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
GRANT ALL ON TABLES TO "service_role";

RESET ALL;

--
-- Dumped schema changes for auth and storage
--
CREATE POLICY "All all users to act" ON "storage"."objects" USING (true)
WITH
  CHECK (true);

CREATE POLICY "Allow user or apikey to delete they own folder in images" ON "storage"."objects" FOR DELETE USING (
  (
    ("bucket_id" = 'images'::"text")
    AND (
      (
        (
          (
            SELECT
              "auth"."uid" () AS "uid"
          )
        )::"text" = ("storage"."foldername" ("name")) [0]
      )
      OR (
        (
          (
            "public"."get_user_id" (("public"."get_apikey_header" ()))
          )::"text" = ("storage"."foldername" ("name")) [0]
        )
        AND "public"."is_allowed_capgkey" (
          (
            SELECT
              "public"."get_apikey_header" ()
          ),
          '{all}'::"public"."key_mode" [],
          (("storage"."foldername" ("name")) [1])::character varying
        )
      )
    )
  )
);

CREATE POLICY "Allow user or apikey to update they own folder in images" ON "storage"."objects"
FOR UPDATE
  USING (
    (
      ("bucket_id" = 'images'::"text")
      AND (
        (
          (
            (
              SELECT
                "auth"."uid" () AS "uid"
            )
          )::"text" = ("storage"."foldername" ("name")) [0]
        )
        OR (
          (
            (
              "public"."get_user_id" (("public"."get_apikey_header" ()))
            )::"text" = ("storage"."foldername" ("name")) [0]
          )
          AND "public"."is_allowed_capgkey" (
            (
              SELECT
                "public"."get_apikey_header" ()
            ),
            '{write,all}'::"public"."key_mode" [],
            (("storage"."foldername" ("name")) [1])::character varying
          )
        )
      )
    )
  );

CREATE POLICY "Allow user or apikey to insert they own folder in images" ON "storage"."objects" FOR INSERT
WITH
  CHECK (
    (
      ("bucket_id" = 'images'::"text")
      AND (
        (
          (
            (
              SELECT
                "auth"."uid" () AS "uid"
            )
          )::"text" = ("storage"."foldername" ("name")) [0]
        )
        OR (
          (
            (
              "public"."get_user_id" (
                (
                  SELECT
                    "public"."get_apikey_header" ()
                )
              )
            )::"text" = ("storage"."foldername" ("name")) [0]
          )
          AND "public"."is_allowed_capgkey" (
            (
              SELECT
                "public"."get_apikey_header" ()
            ),
            '{write,all}'::"public"."key_mode" [],
            (("storage"."foldername" ("name")) [1])::character varying
          )
        )
      )
    )
  );

CREATE POLICY "Allow user or apikey to read they own folder in images" ON "storage"."objects" FOR
SELECT
  USING (
    (
      ("bucket_id" = 'images'::"text")
      AND (
        (
          (
            (
              SELECT
                "auth"."uid" () AS "uid"
            )
          )::"text" = ("storage"."foldername" ("name")) [0]
        )
        OR (
          (
            (
              "public"."get_user_id" ("public"."get_apikey_header" ())
            )::"text" = ("storage"."foldername" ("name")) [0]
          )
          AND "public"."is_allowed_capgkey" (
            (
              SELECT
                "public"."get_apikey_header" ()
            ),
            '{read,all}'::"public"."key_mode" [],
            (("storage"."foldername" ("name")) [1])::character varying
          )
        )
      )
    )
  );

CREATE POLICY "Allow user or apikey to delete they own folder in apps" ON "storage"."objects" FOR DELETE USING (
  (
    ("bucket_id" = 'apps'::"text")
    AND (
      (
        (
          (
            SELECT
              "auth"."uid" () AS "uid"
          )
        )::"text" = ("storage"."foldername" ("name")) [0]
      )
      OR (
        (
          (
            "public"."get_user_id" (("public"."get_apikey_header" ()))
          )::"text" = ("storage"."foldername" ("name")) [0]
        )
        AND "public"."is_allowed_capgkey" (
          (
            SELECT
              "public"."get_apikey_header" ()
          ),
          '{all}'::"public"."key_mode" [],
          (("storage"."foldername" ("name")) [1])::character varying
        )
      )
    )
  )
);

CREATE POLICY "Allow user or apikey to update they own folder in apps" ON "storage"."objects"
FOR UPDATE
  USING (
    (
      ("bucket_id" = 'apps'::"text")
      AND (
        (
          (
            (
              SELECT
                "auth"."uid" () AS "uid"
            )
          )::"text" = ("storage"."foldername" ("name")) [0]
        )
        OR (
          (
            (
              "public"."get_user_id" (("public"."get_apikey_header" ()))
            )::"text" = ("storage"."foldername" ("name")) [0]
          )
          AND "public"."is_allowed_capgkey" (
            (
              SELECT
                "public"."get_apikey_header" ()
            ),
            '{write,all}'::"public"."key_mode" [],
            (("storage"."foldername" ("name")) [1])::character varying
          )
        )
      )
    )
  );

CREATE POLICY "Allow user or apikey to insert they own folder in apps" ON "storage"."objects" FOR INSERT
WITH
  CHECK (
    (
      ("bucket_id" = 'apps'::"text")
      AND (
        (
          (
            (
              SELECT
                "auth"."uid" () AS "uid"
            )
          )::"text" = ("storage"."foldername" ("name")) [0]
        )
        OR (
          (
            (
              "public"."get_user_id" (
                (
                  SELECT
                    "public"."get_apikey_header" ()
                )
              )
            )::"text" = ("storage"."foldername" ("name")) [0]
          )
          AND "public"."is_allowed_capgkey" (
            (
              SELECT
                "public"."get_apikey_header" ()
            ),
            '{write,all}'::"public"."key_mode" [],
            (("storage"."foldername" ("name")) [1])::character varying
          )
        )
      )
    )
  );

CREATE POLICY "Allow user or apikey to read they own folder in apps" ON "storage"."objects" FOR
SELECT
  USING (
    (
      ("bucket_id" = 'apps'::"text")
      AND (
        (
          (
            (
              SELECT
                "auth"."uid" () AS "uid"
            )
          )::"text" = ("storage"."foldername" ("name")) [0]
        )
        OR (
          (
            (
              "public"."get_user_id" ("public"."get_apikey_header" ())
            )::"text" = ("storage"."foldername" ("name")) [0]
          )
          AND "public"."is_allowed_capgkey" (
            (
              SELECT
                "public"."get_apikey_header" ()
            ),
            '{read,all}'::"public"."key_mode" [],
            (("storage"."foldername" ("name")) [1])::character varying
          )
        )
      )
    )
  );

CREATE POLICY "Disable act bucket for users" ON "storage"."buckets" USING (false)
WITH
  CHECK (false);

--  CREATE ALL QUEUES
SELECT
  pgmq.create ('cron_stats');

SELECT
  pgmq.create ('cron_plan');

SELECT
  pgmq.create ('cron_clear_versions');

SELECT
  pgmq.create ('cron_email');

SELECT
  pgmq.create ('on_app_create');

SELECT
  pgmq.create ('on_channel_update');

SELECT
  pgmq.create ('on_organization_create');

SELECT
  pgmq.create ('on_organization_delete');

SELECT
  pgmq.create ('on_user_create');

SELECT
  pgmq.create ('on_user_update');

SELECT
  pgmq.create ('on_version_create');

SELECT
  pgmq.create ('on_version_delete');

SELECT
  pgmq.create ('on_version_update');

SELECT
  pgmq.create ('replicate_data');

SELECT
  pgmq.create ('on_user_delete');

SELECT
  pgmq.create ('on_app_delete');

SELECT
  pgmq.create ('on_manifest_create');

SELECT
  pgmq.create ('cron_plan_queue');

SELECT
  pgmq.create ('cron_email_queue');

SELECT
  pgmq.create ('on_deploy_history_create');

SELECT
  pgmq.create ('admin_stats');

-- CREATE ALL CRON JOBS
SELECT
  cron.schedule (
    'Delete old app version',
    '40 0 * * *',
    'SELECT update_app_versions_retention();'
  );

SELECT
  cron.schedule (
    'process_subscribed_orgs',
    '0 3 * * *',
    'SELECT process_subscribed_orgs();'
  );

SELECT
  cron.schedule (
    'process_free_trial_expired',
    '0 0 * * *',
    'SELECT process_free_trial_expired();'
  );

SELECT
  cron.schedule (
    'delete-job-run-details',
    '0 12 * * *',
    'DELETE FROM cron.job_run_details WHERE end_time < now() - interval ''7 days'';'
  );

SELECT
  cron.schedule (
    'cleanup_queue_messages',
    '0 0 * * *',
    'SELECT cleanup_queue_messages();'
  );

SELECT
  cron.schedule (
    'process_cron_stats_jobs',
    '0 */2 * * *',
    'SELECT process_cron_stats_jobs();'
  );

SELECT
  cron.schedule (
    'delete_old_deleted_apps',
    '0 0 * * *',
    'SELECT delete_old_deleted_apps();'
  );

SELECT
  cron.schedule (
    'process_manifest_create_queue',
    '5 seconds',
    'SELECT process_function_queue(''on_manifest_create'');'
  );

SELECT
  cron.schedule (
    'Send stats email every month',
    '0 12 1 * *',
    'SELECT process_stats_email_monthly();'
  );

SELECT
  cron.schedule (
    'create_admin_stats',
    '0 14 1 * *',
    'SELECT public.process_admin_stats()'
  );

SELECT
  cron.schedule (
    'Send stats email every week',
    '0 12 * * 6',
    'SELECT process_stats_email_weekly();'
  );

SELECT
  cron.schedule (
    'process_d1_replication_batch',
    '1 seconds',
    'SELECT process_d1_replication_batch();'
  );

SELECT
  cron.schedule (
    'Cleanup frequent job details',
    '0 * * * *',
    'CALL cleanup_frequent_job_details()'
  );

SELECT
  cron.schedule (
    'Remove old jobs',
    '0 0 * * *',
    'CALL remove_old_jobs()'
  );

SELECT
  cron.schedule (
    'process_admin_stats',
    '0 */2 * * *',
    'SELECT public.process_function_queue(''admin_stats'')'
  );

SELECT
  cron.schedule (
    'process_cron_stats_queue',
    '10 seconds',
    'SELECT public.process_function_queue(''cron_stats'')'
  );

SELECT
  cron.schedule (
    'process_channel_update_queue',
    '10 seconds',
    'SELECT public.process_function_queue(''on_channel_update'')'
  );

SELECT
  cron.schedule (
    'process_user_create_queue',
    '10 seconds',
    'SELECT public.process_function_queue(''on_user_create'')'
  );

SELECT
  cron.schedule (
    'process_user_update_queue',
    '10 seconds',
    'SELECT public.process_function_queue(''on_user_update'')'
  );

SELECT
  cron.schedule (
    'process_version_delete_queue',
    '10 seconds',
    'SELECT public.process_function_queue(''on_version_delete'')'
  );

SELECT
  cron.schedule (
    'process_version_update_queue',
    '10 seconds',
    'SELECT public.process_function_queue(''on_version_update'')'
  );

SELECT
  cron.schedule (
    'process_app_delete_queue',
    '10 seconds',
    'SELECT public.process_function_queue(''on_app_delete'')'
  );

SELECT
  cron.schedule (
    'process_cron_plan_queue',
    '0 */2 * * *',
    'SELECT public.process_function_queue(''cron_plan_queue'')'
  );

SELECT
  cron.schedule (
    'process_cron_email_queue',
    '0 */2 * * *',
    'SELECT public.process_function_queue(''cron_email_queue'')'
  );

SELECT
  cron.schedule (
    'process_app_create_queue',
    '0 */2 * * *',
    'SELECT public.process_function_queue(''on_app_create'')'
  );

SELECT
  cron.schedule (
    'process_version_create_queue',
    '0 */2 * * *',
    'SELECT public.process_function_queue(''on_version_create'')'
  );

SELECT
  cron.schedule (
    'process_organization_create_queue',
    '10 seconds',
    'SELECT public.process_function_queue(''on_organization_create'')'
  );

SELECT
  cron.schedule (
    'process_organization_delete_queue',
    '0 */2 * * *',
    'SELECT public.process_function_queue(''on_organization_delete'')'
  );

SELECT
  cron.schedule (
    'process_deploy_history_create_queue',
    '0 */2 * * *',
    'SELECT public.process_function_queue(''on_deploy_history_create'')'
  );
