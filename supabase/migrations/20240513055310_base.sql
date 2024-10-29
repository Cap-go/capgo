
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";

ALTER SCHEMA "public" OWNER TO "postgres";

COMMENT ON SCHEMA "public" IS 'standard public schema';

CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pgsodium" WITH SCHEMA "pgsodium";

CREATE EXTENSION IF NOT EXISTS "http" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "moddatetime" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";

CREATE EXTENSION IF NOT EXISTS "pg_stat_monitor" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "postgres_fdw" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "wrappers" WITH SCHEMA "extensions";

CREATE TYPE "public"."disable_update" AS ENUM (
    'major',
    'minor',
    'patch',
    'version_number',
    'none'
);

ALTER TYPE "public"."disable_update" OWNER TO "postgres";

CREATE TYPE "public"."key_mode" AS ENUM (
    'read',
    'write',
    'all',
    'upload'
);

ALTER TYPE "public"."key_mode" OWNER TO "postgres";

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

CREATE TYPE "public"."platform_os" AS ENUM (
    'ios',
    'android'
);

ALTER TYPE "public"."platform_os" OWNER TO "postgres";

CREATE TYPE "public"."queue_job_status" AS ENUM (
    'inserted',
    'requested',
    'failed'
);

ALTER TYPE "public"."queue_job_status" OWNER TO "postgres";

CREATE TYPE "public"."stats_table" AS (
	"mau" bigint,
	"bandwidth" bigint,
	"storage" bigint
);

ALTER TYPE "public"."stats_table" OWNER TO "postgres";

CREATE TYPE "public"."stripe_status" AS ENUM (
    'created',
    'succeeded',
    'updated',
    'failed',
    'deleted',
    'canceled'
);

ALTER TYPE "public"."stripe_status" OWNER TO "postgres";

CREATE TYPE "public"."usage_mode" AS ENUM (
    'last_saved',
    '5min',
    'day',
    'cycle'
);

ALTER TYPE "public"."usage_mode" OWNER TO "postgres";

CREATE TYPE "public"."user_min_right" AS ENUM (
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

CREATE TYPE "public"."user_role" AS ENUM (
    'read',
    'upload',
    'write',
    'admin'
);

ALTER TYPE "public"."user_role" OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."accept_invitation_to_org"("org_id" "uuid") RETURNS character varying
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Declare  
 invite record;
Begin
  SELECT org_users.* FROM org_users
  INTO invite
  WHERE org_users.org_id=accept_invitation_to_org.org_id and (select auth.uid())=org_users.user_id;

  IF invite IS NULL THEN
    return 'NO_INVITE';
  else
    IF NOT (invite.user_right::varchar ilike 'invite_'||'%') THEN
      return 'INVALID_ROLE';
    END IF;

    UPDATE org_users
    SET user_right = REPLACE(invite.user_right::varchar, 'invite_', '')::user_min_right
    WHERE org_users.id=invite.id;

    return 'OK';
  end if;
End;
$$;

ALTER FUNCTION "public"."accept_invitation_to_org"("org_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."auto_owner_org_by_app_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$BEGIN
  IF NEW."app_id" is distinct from OLD."app_id" AND OLD."app_id" is distinct from NULL THEN
    RAISE EXCEPTION 'changing the app_id is not allowed';
  END IF;

  NEW.owner_org = get_user_main_org_id_by_app_id(NEW."app_id");

   RETURN NEW;
END;$$;

ALTER FUNCTION "public"."auto_owner_org_by_app_id"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."check_if_org_can_exist"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  delete from orgs
  where
  (
      (
      select
          count(*)
      from
          org_users
      where
          org_users.user_right = 'super_admin'
          AND org_users.user_id != OLD.user_id
          AND org_users.org_id=orgs.id
      ) = 0
  ) 
  AND orgs.id=OLD.org_id;

  RETURN OLD;
END;$$;

ALTER FUNCTION "public"."check_if_org_can_exist"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN check_min_rights(min_right, (select auth.uid()), org_id, app_id, channel_id);
END;  
$$;

ALTER FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    user_right_record RECORD;
BEGIN
    IF user_id = NULL THEN
        RETURN false;
    END IF;

    FOR user_right_record IN 
        SELECT org_users.user_right, org_users.app_id, org_users.channel_id 
        FROM org_users 
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

ALTER FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."convert_bytes_to_gb"("byt" double precision) RETURNS double precision
    LANGUAGE "plpgsql"
    AS $$
Begin
  RETURN byt / 1024.0 / 1024.0 / 1024.0;
End;
$$;

ALTER FUNCTION "public"."convert_bytes_to_gb"("byt" double precision) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."convert_bytes_to_mb"("byt" double precision) RETURNS double precision
    LANGUAGE "plpgsql"
    AS $$
Begin
  RETURN byt / 1024.0 / 1024.0;
End;
$$;

ALTER FUNCTION "public"."convert_bytes_to_mb"("byt" double precision) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."convert_gb_to_bytes"("gb" double precision) RETURNS double precision
    LANGUAGE "plpgsql"
    AS $$
Begin
  RETURN gb * 1024 * 1024 * 1024;
End;
$$;

ALTER FUNCTION "public"."convert_gb_to_bytes"("gb" double precision) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."convert_mb_to_bytes"("gb" double precision) RETURNS double precision
    LANGUAGE "plpgsql"
    AS $$
Begin
  RETURN gb * 1024 * 1024;
End;
$$;

ALTER FUNCTION "public"."convert_mb_to_bytes"("gb" double precision) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."convert_number_to_percent"("val" double precision, "max_val" double precision) RETURNS double precision
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF max_val = 0 THEN
    RETURN 0;
  ELSE
    RETURN round(((val * 100) / max_val)::numeric, 2);
  END IF;
END;
$$;

ALTER FUNCTION "public"."convert_number_to_percent"("val" double precision, "max_val" double precision) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."count_active_users"("app_ids" character varying[]) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN (
        SELECT COUNT(DISTINCT user_id)
        FROM apps
        WHERE app_id = ANY(app_ids)
    );
END;
$$;

ALTER FUNCTION "public"."count_active_users"("app_ids" character varying[]) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."count_all_need_upgrade"() RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
Begin
  RETURN (SELECT COUNT(*) FROM stripe_info WHERE is_good_plan = false AND status = 'succeeded');
End;  
$$;

ALTER FUNCTION "public"."count_all_need_upgrade"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."count_all_onboarded"() RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
Begin
  RETURN (SELECT COUNT(DISTINCT owner_org) FROM apps);
End;  
$$;

ALTER FUNCTION "public"."count_all_onboarded"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."count_all_plans_v2"() RETURNS TABLE("plan_name" character varying, "count" bigint)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY 
  WITH AllProducts AS (
    SELECT p.name AS product_name
    FROM stripe_info si
    INNER JOIN plans p ON si.product_id = p.stripe_id
    UNION
    SELECT 'Trial' AS product_name
  ),
  StatusCounts AS (
    SELECT 
      p.name AS product_name, 
      COUNT(*) AS count
    FROM stripe_info si
    INNER JOIN plans p ON si.product_id = p.stripe_id AND si.status = 'succeeded'
    GROUP BY p.name
    
    UNION ALL
    
    SELECT 
      'Trial' AS product_name, 
      COUNT(*) AS count
    FROM stripe_info si
    WHERE si.trial_at > NOW() AND si.status is NULL
  )
  SELECT
    ap.product_name,
    COALESCE(sc.count, 0) AS count
  FROM AllProducts ap
  LEFT JOIN StatusCounts sc ON ap.product_name = sc.product_name
  ORDER BY ap.product_name;
END;
$$;

ALTER FUNCTION "public"."count_all_plans_v2"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."delete_failed_jobs"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    DELETE FROM job_queue
    WHERE status = 'failed'
      AND created_at < NOW() - INTERVAL '7 days';
END;
$$;

ALTER FUNCTION "public"."delete_failed_jobs"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."delete_user"() RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
   delete from auth.users where id = (select auth.uid());
$$;

ALTER FUNCTION "public"."delete_user"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."exist_app_v2"("appid" character varying) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM apps
  WHERE app_id=appid));
End;  
$$;

ALTER FUNCTION "public"."exist_app_v2"("appid" character varying) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM app_versions
  WHERE app_id=appid
  AND name=name_version));
End;  
$$;

ALTER FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."find_best_plan_v3"("mau" bigint, "bandwidth" double precision, "storage" double precision) RETURNS character varying
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT name
  FROM plans
  WHERE plans.mau>=find_best_plan_v3.mau
    AND plans.storage>=find_best_plan_v3.storage
    AND plans.bandwidth>=find_best_plan_v3.bandwidth
    OR plans.name = 'Pay as you go'
    ORDER BY plans.mau
    LIMIT 1);
End;  
$$;

ALTER FUNCTION "public"."find_best_plan_v3"("mau" bigint, "bandwidth" double precision, "storage" double precision) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."find_fit_plan_v3"("mau" bigint, "bandwidth" bigint, "storage" bigint) RETURNS TABLE("name" character varying)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN

RETURN QUERY (
  SELECT plans.name
  FROM plans
  WHERE plans.mau >= find_fit_plan_v3.mau
    AND plans.storage >= find_fit_plan_v3.storage
    AND plans.bandwidth >= find_fit_plan_v3.bandwidth
    OR plans.name = 'Pay as you go'
  ORDER BY plans.mau
);
END;
$$;

ALTER FUNCTION "public"."find_fit_plan_v3"("mau" bigint, "bandwidth" bigint, "storage" bigint) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."force_valid_user_id_on_app"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$BEGIN
  NEW.user_id = (select created_by from orgs where id = (NEW."owner_org"));

   RETURN NEW;
END;$$;

ALTER FUNCTION "public"."force_valid_user_id_on_app"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."generate_org_on_user_create"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  org_record record;
BEGIN
    -- Add management_email compared to old fn
    INSERT INTO orgs (created_by, name, management_email) values (NEW.id, format('%s organization', NEW.first_name), NEW.email) RETURNING * into org_record;
    INSERT INTO org_users (user_id, org_id, user_right) values (NEW.id, org_record.id, 'super_admin'::"user_min_right");

    RETURN NEW;
END $$;

ALTER FUNCTION "public"."generate_org_on_user_create"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_apikey"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER PARALLEL SAFE
    AS $$
    SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='apikey';
$$;

ALTER FUNCTION "public"."get_apikey"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_app_metrics"("org_id" "uuid") RETURNS TABLE("app_id" character varying, "date" "date", "mau" bigint, "storage" bigint, "bandwidth" bigint, "get" bigint, "fail" bigint, "install" bigint, "uninstall" bigint)
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    cycle_start timestamp with time zone;
    cycle_end timestamp with time zone;
BEGIN
    SELECT subscription_anchor_start, subscription_anchor_end 
    INTO cycle_start, cycle_end
    FROM get_cycle_info_org(org_id);
    
    RETURN QUERY
    SELECT * FROM get_app_metrics(org_id, cycle_start::date, cycle_end::date);
END;
$$;

ALTER FUNCTION "public"."get_app_metrics"("org_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_app_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") RETURNS TABLE("app_id" character varying, "date" "date", "mau" bigint, "storage" bigint, "bandwidth" bigint, "get" bigint, "fail" bigint, "install" bigint, "uninstall" bigint)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    WITH DateSeries AS (
        SELECT generate_series(start_date, end_date, '1 day'::interval)::date AS "date"
    )
    SELECT
        a.app_id,
        ds.date::date,
        COALESCE(dm.mau, 0) AS mau,
        COALESCE(dst.storage, 0) AS storage,
        COALESCE(db.bandwidth, 0) AS bandwidth,
        COALESCE(SUM(dv.get)::bigint, 0) AS get,
        COALESCE(SUM(dv.fail)::bigint, 0) AS fail,
        COALESCE(SUM(dv.install)::bigint, 0) AS install,
        COALESCE(SUM(dv.uninstall)::bigint, 0) AS uninstall
    FROM 
        apps a
    CROSS JOIN 
        DateSeries ds
    LEFT JOIN 
        daily_mau dm ON a.app_id = dm.app_id AND ds.date = dm.date
    LEFT JOIN 
        daily_storage dst ON a.app_id = dst.app_id AND ds.date = dst.date
    LEFT JOIN 
        daily_bandwidth db ON a.app_id = db.app_id AND ds.date = db.date
    LEFT JOIN 
        daily_version dv ON a.app_id = dv.app_id AND ds.date = dv.date
    WHERE 
        a.owner_org = org_id 
    GROUP BY 
        a.app_id, ds.date, dm.mau, dst.storage, db.bandwidth
    ORDER BY
        a.app_id, ds.date; 
END;
$$;

ALTER FUNCTION "public"."get_app_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT id
  FROM app_versions
  WHERE app_id=appid
  AND name=name_version
  AND owner_org=(select gid from get_orgs_v5(get_user_id(apikey, appid))));
End;  
$$;

ALTER FUNCTION "public"."get_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_cloudflare_function_url"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER PARALLEL SAFE
    AS $$
    SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cloudflare_function_url';
$$;

ALTER FUNCTION "public"."get_cloudflare_function_url"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_current_plan_max_org"("orgid" "uuid") RETURNS TABLE("mau" bigint, "bandwidth" bigint, "storage" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN QUERY
  (SELECT plans.mau, plans.bandwidth, plans.storage
  FROM plans
    WHERE stripe_id=(
      SELECT product_id
      from stripe_info
      where customer_id=(
        SELECT customer_id
        from orgs
        where id=orgid)
  ));
End;  
$$;

ALTER FUNCTION "public"."get_current_plan_max_org"("orgid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_current_plan_name_org"("orgid" "uuid") RETURNS character varying
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN 
  (SELECT name
  FROM plans
    WHERE stripe_id=(SELECT product_id
    from stripe_info
    where customer_id=(SELECT customer_id from orgs where id=orgid)
    ));
End;  
$$;

ALTER FUNCTION "public"."get_current_plan_name_org"("orgid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_customer_counts"() RETURNS TABLE("yearly" bigint, "monthly" bigint, "total" bigint)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(CASE WHEN p.price_y_id = s.price_id AND s.status = 'succeeded' THEN s.customer_id END) AS yearly,
    COUNT(CASE WHEN p.price_m_id = s.price_id AND s.status = 'succeeded' THEN s.customer_id END) AS monthly,
    COUNT(CASE WHEN s.status = 'succeeded' THEN s.customer_id END) AS total
  FROM
    stripe_info s
    JOIN plans p ON s.price_id = p.price_y_id OR s.price_id = p.price_m_id
  WHERE
    s.status = 'succeeded';
END;
$$;

ALTER FUNCTION "public"."get_customer_counts"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_cycle_info_org"("orgid" "uuid")
RETURNS TABLE (
    subscription_anchor_start timestamp with time zone,
    subscription_anchor_end timestamp with time zone
) AS $$
DECLARE
    customer_id_var text;
    stripe_info_row stripe_info%ROWTYPE;
    anchor_day INTERVAL;
    start_date timestamp with time zone;
    end_date timestamp with time zone;
BEGIN
    SELECT customer_id INTO customer_id_var FROM orgs WHERE id = orgid;

    -- Get the stripe_info using the customer_id
    SELECT * INTO stripe_info_row FROM stripe_info WHERE customer_id = customer_id_var;

    -- Extract the day of the month from subscription_anchor_start as an INTERVAL, default to '0 DAYS' if null
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
$$ LANGUAGE plpgsql;

ALTER FUNCTION "public"."get_cycle_info_org"("orgid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_db_url"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER PARALLEL SAFE
    AS $$
    SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='db_url';
$$;

ALTER FUNCTION "public"."get_db_url"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_global_metrics"("org_id" "uuid") RETURNS TABLE("date" "date", "mau" bigint, "storage" bigint, "bandwidth" bigint, "get" bigint, "fail" bigint, "install" bigint, "uninstall" bigint)
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    cycle_start timestamp with time zone;
    cycle_end timestamp with time zone;
BEGIN
    SELECT subscription_anchor_start, subscription_anchor_end 
    INTO cycle_start, cycle_end
    FROM get_cycle_info_org(org_id);
    
    RETURN QUERY
    SELECT * FROM get_global_metrics(org_id, cycle_start::date, cycle_end::date);
END;
$$;

ALTER FUNCTION "public"."get_global_metrics"("org_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_global_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") RETURNS TABLE("date" "date", "mau" bigint, "storage" bigint, "bandwidth" bigint, "get" bigint, "fail" bigint, "install" bigint, "uninstall" bigint)
    LANGUAGE "plpgsql"
    AS $$
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
        get_app_metrics(org_id, start_date, end_date) AS metrics
    GROUP BY
        metrics.date
    ORDER BY
        metrics.date;
END;
$$;

ALTER FUNCTION "public"."get_global_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_identity"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    auth_uid uuid;
    api_key_text text;
    api_key record;
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

ALTER FUNCTION "public"."get_identity"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_identity"("keymode" "public"."key_mode"[]) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    auth_uid uuid;
    api_key_text text;
    api_key record;
Begin
  SELECT auth.uid() into auth_uid;

  IF auth_uid IS NOT NULL THEN
    RETURN auth_uid;
  END IF;

  SELECT (("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text") into api_key_text;

  -- No api key found in headers, return
  IF api_key_text IS NULL THEN
    RETURN NULL;
  END IF;

  -- Fetch the api key
  select * from apikeys 
  where key=api_key_text AND
  mode=ANY(keymode)
  limit 1 into api_key;

  if api_key IS DISTINCT FROM  NULL THEN
    RETURN api_key.user_id;
  END IF;

  RETURN NULL;
End;
$$;

ALTER FUNCTION "public"."get_identity"("keymode" "public"."key_mode"[]) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_identity_apikey_only"("keymode" "public"."key_mode"[]) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    api_key_text text;
    api_key record;
Begin
  SELECT (("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text") into api_key_text;

  -- No api key found in headers, return
  IF api_key_text IS NULL THEN
    RETURN NULL;
  END IF;

  -- Fetch the api key
  select * from apikeys 
  where key=api_key_text AND
  mode=ANY(keymode)
  limit 1 into api_key;

  if api_key IS DISTINCT FROM NULL THEN
    RETURN api_key.user_id;
  END IF;

  RETURN NULL;
End;
$$;

ALTER FUNCTION "public"."get_identity_apikey_only"("keymode" "public"."key_mode"[]) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_metered_usage"() RETURNS double precision
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN get_metered_usage((select auth.uid()));
END;  
$$;

ALTER FUNCTION "public"."get_metered_usage"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_metered_usage"("orgid" "uuid") RETURNS "public"."stats_table"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    current_usage stats_table;
    max_plan stats_table;
    result stats_table;
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

ALTER FUNCTION "public"."get_metered_usage"("orgid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_netlify_function_url"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER PARALLEL SAFE
    AS $$
    SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='netlify_function_url';
$$;

ALTER FUNCTION "public"."get_netlify_function_url"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_org_members"("guild_id" "uuid") RETURNS TABLE("aid" bigint, "uid" "uuid", "email" character varying, "image_url" character varying, "role" "public"."user_min_right")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  IF NOT (is_owner_of_org((select auth.uid()), get_org_members.guild_id) OR check_min_rights('read'::user_min_right, (select auth.uid()), get_org_members.guild_id, NULL::character varying, NULL::bigint)) THEN
    raise exception 'NO_RIGHTS';
  END IF;

  return query select o.id as aid, users.id as uid, users.email, users.image_url, o.user_right as role from org_users as o
  join users on users.id = o.user_id
  where o.org_id=get_org_members.guild_id
  AND (is_member_of_org(users.id, o.org_id) OR is_owner_of_org(users.id, o.org_id));
End;
$$;

ALTER FUNCTION "public"."get_org_members"("guild_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_org_perm_for_apikey"("apikey" "text", "app_id" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
<<get_org_perm_for_apikey>>
Declare  
  apikey_user_id uuid;
  org_id uuid;
  user_perm "public"."user_min_right";
BEGIN
  SELECT get_user_id(apikey) into apikey_user_id;

  IF apikey_user_id IS NULL THEN
    return 'INVALID_APIKEY';
  END IF;

  SELECT owner_org from apps
  INTO org_id
  WHERE apps.app_id=get_org_perm_for_apikey.app_id
  limit 1;

  IF org_id IS NULL THEN
    return 'NO_APP';
  END IF;

  SELECT user_right from org_users
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

ALTER FUNCTION "public"."get_org_perm_for_apikey"("apikey" "text", "app_id" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_orgs_v5"() RETURNS TABLE("gid" "uuid", "created_by" "uuid", "logo" "text", "name" "text", "role" character varying, "paying" boolean, "trial_left" integer, "can_use_more" boolean, "is_canceled" boolean, "app_count" bigint, "subscription_start" timestamp with time zone, "subscription_end" timestamp with time zone, "management_email" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  user_id uuid;
BEGIN
  SELECT get_identity('{read,upload,write,all}'::"public"."key_mode"[]) into user_id;
  IF user_id IS NOT DISTINCT FROM NULL THEN
    RAISE EXCEPTION 'Cannot do that as postgres!';
  END IF;

  return query select * from get_orgs_v5("user_id");
END;  
$$;

ALTER FUNCTION "public"."get_orgs_v5"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_orgs_v5"("userid" "uuid") RETURNS TABLE("gid" "uuid", "created_by" "uuid", "logo" "text", "name" "text", "role" character varying, "paying" boolean, "trial_left" integer, "can_use_more" boolean, "is_canceled" boolean, "app_count" bigint, "subscription_start" timestamp with time zone, "subscription_end" timestamp with time zone, "management_email" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  return query select 
  sub.id as gid, 
  sub.created_by, 
  sub.logo, 
  sub.name, 
  org_users.user_right::varchar, 
  is_paying_org(sub.id) as paying, 
  is_trial_org(sub.id) as trial_left, 
  is_allowed_action_org(sub.id) as can_use_more,
  is_canceled_org(sub.id) as is_canceled,
  (select count(*) from apps where owner_org = sub.id) as app_count,
  (sub.f).subscription_anchor_start as subscription_start,
  (sub.f).subscription_anchor_end as subscription_end,
  sub.management_email as management_email
  from (
    select get_cycle_info_org(o.id) as f, o.* as o from orgs as o
  ) sub
  join org_users on (org_users."user_id"=get_orgs_v5.userid and sub.id = org_users."org_id");
END;  
$$;

ALTER FUNCTION "public"."get_orgs_v5"("userid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid") RETURNS TABLE("total_percent" double precision, "mau_percent" double precision, "bandwidth_percent" double precision, "storage_percent" double precision)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    cycle_start date;
    cycle_end date;
BEGIN
  -- Get the start and end dates of the current billing cycle
  SELECT subscription_anchor_start::date, subscription_anchor_end::date
  INTO cycle_start, cycle_end
  FROM get_cycle_info_org(orgid);
  
  -- Call the function with billing cycle dates as parameters
  RETURN QUERY
  SELECT * FROM public.get_plan_usage_percent_detailed(orgid, cycle_start, cycle_end);
END;
$$;

ALTER FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid", "cycle_start" "date", "cycle_end" "date") RETURNS TABLE("total_percent" double precision, "mau_percent" double precision, "bandwidth_percent" double precision, "storage_percent" double precision)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    current_plan_max stats_table;
    total_stats stats_table;
    percent_mau double precision;
    percent_bandwidth double precision;
    percent_storage double precision;
BEGIN
  -- Get the maximum values for the user's current plan
  current_plan_max := public.get_current_plan_max_org(orgid);
  
  -- Get the user's maximum usage stats for the specified billing cycle
  SELECT mau, bandwidth, storage
  INTO total_stats
  FROM get_total_metrics(orgid, cycle_start, cycle_end);
  
  -- Calculate the percentage of usage for each stat
  percent_mau := convert_number_to_percent(total_stats.mau, current_plan_max.mau);
  percent_bandwidth := convert_number_to_percent(total_stats.bandwidth, current_plan_max.bandwidth);
  percent_storage := convert_number_to_percent(total_stats.storage, current_plan_max.storage);

  -- Return the total usage percentage and the individual usage percentages
  RETURN QUERY SELECT
    GREATEST(percent_mau, percent_bandwidth, percent_storage) AS total_percent,
    percent_mau AS mau_percent,
    percent_bandwidth AS bandwidth_percent,
    percent_storage AS storage_percent;
END;
$$;

ALTER FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid", "cycle_start" "date", "cycle_end" "date") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_total_app_storage_size_orgs"("org_id" "uuid", "app_id" character varying) RETURNS double precision
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    total_size double precision := 0;
BEGIN
    SELECT COALESCE(SUM(app_versions_meta.size), 0) INTO total_size
    FROM app_versions
    INNER JOIN app_versions_meta ON app_versions.id = app_versions_meta.id
    WHERE app_versions.owner_org = org_id
    AND app_versions.app_id = get_total_app_storage_size_orgs.app_id
    AND app_versions.deleted = false;

    RETURN total_size;
END;  
$$;

ALTER FUNCTION "public"."get_total_app_storage_size_orgs"("org_id" "uuid", "app_id" character varying) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_total_metrics"("org_id" "uuid") RETURNS TABLE("mau" bigint, "storage" bigint, "bandwidth" bigint, "get" bigint, "fail" bigint, "install" bigint, "uninstall" bigint)
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    cycle_start timestamp with time zone;
    cycle_end timestamp with time zone;
BEGIN
    SELECT subscription_anchor_start, subscription_anchor_end 
    INTO cycle_start, cycle_end
    FROM get_cycle_info_org(org_id);
    
    RETURN QUERY
    SELECT * FROM get_total_metrics(org_id, cycle_start::date, cycle_end::date);
END;
$$;

ALTER FUNCTION "public"."get_total_metrics"("org_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_total_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") RETURNS TABLE("mau" bigint, "storage" bigint, "bandwidth" bigint, "get" bigint, "fail" bigint, "install" bigint, "uninstall" bigint)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        SUM(metrics.mau)::bigint AS mau,
        get_total_storage_size_org(org_id)::bigint AS storage,
        SUM(metrics.bandwidth)::bigint AS bandwidth,
        SUM(metrics.get)::bigint AS get,
        SUM(metrics.fail)::bigint AS fail,
        SUM(metrics.install)::bigint AS install,
        SUM(metrics.uninstall)::bigint AS uninstall
    FROM
        get_app_metrics(org_id, start_date, end_date) AS metrics;
END;
$$;

ALTER FUNCTION "public"."get_total_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_total_stats_v5_org"("orgid" "uuid") RETURNS TABLE("mau" bigint, "bandwidth" double precision, "storage" double precision)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    cycle_info RECORD;
    response http_response;
    url text;
    req_headers http_header[];
    req_body text;
    app_activity jsonb; -- Declare app_activity as jsonb
    total_mau bigint := 0;
    total_bandwidth numeric := 0;
    total_storage double precision;
BEGIN
    -- Retrieve the subscription anchor start and end dates using get_cycle_info function
    SELECT * INTO cycle_info FROM public.get_cycle_info_org(orgid) LIMIT 1;

    -- Get the total storage size by calling the get_total_storage_size function
    SELECT get_total_storage_size_org(orgid) INTO total_storage;

    -- Construct the URL
    url := get_db_url() || '/functions/v1/' || '/triggers/get_total_stats'; -- Use the confirmed URL

    -- Set up the headers
    req_headers := ARRAY[
        http_header('apisecret', get_apikey()) -- Replace with your actual API secret
    ];

    -- Prepare the body with the necessary parameters, using the correct keys and dates from get_cycle_info
    req_body := jsonb_build_object(
        'orgId', orgId::text,
        'startDate', to_char(cycle_info.subscription_anchor_start, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'endDate', to_char(cycle_info.subscription_anchor_end, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )::text;

    -- Make the synchronous HTTP POST request, including the headers
    response := http((
        'POST',
        url,
        req_headers,
        'application/json',
        req_body
    )::http_request);

    -- Check if the request was successful
    IF response.status = 200 THEN
        -- Parse the JSON response and loop through each app activity
        FOR app_activity IN SELECT * FROM jsonb_array_elements(response.content::jsonb)
        LOOP
            total_mau := total_mau + (app_activity ->> 'mau')::bigint;
            total_bandwidth := total_bandwidth + (app_activity ->> 'bandwidth')::numeric;
        END LOOP;

        -- Return the aggregated results
        RETURN QUERY SELECT
            total_mau AS mau,
            ROUND(convert_bytes_to_gb(total_bandwidth)::numeric, 2)::double precision AS bandwidth,
            ROUND(convert_bytes_to_gb(total_storage)::numeric, 2)::double precision AS storage;
    ELSE
        -- If the request was not successful, return empty data
        RETURN QUERY SELECT
            0::bigint AS mau,
            0::double precision AS bandwidth,
            0::double precision AS storage;
    END IF;
END;
$$;

ALTER FUNCTION "public"."get_total_stats_v5_org"("orgid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_total_storage_size_org"("org_id" "uuid") RETURNS double precision
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    total_size double precision := 0;
BEGIN
    SELECT COALESCE(SUM(app_versions_meta.size), 0) INTO total_size
    FROM app_versions
    INNER JOIN app_versions_meta ON app_versions.id = app_versions_meta.id
    WHERE app_versions.owner_org = org_id
    AND app_versions.deleted = false;

    RETURN total_size;
END;  
$$;

ALTER FUNCTION "public"."get_total_storage_size_org"("org_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_user_id"("apikey" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Declare  
 is_found uuid;
Begin
  SELECT user_id
  INTO is_found
  FROM apikeys
  WHERE key=apikey;
  RETURN is_found;
End;  
$$;

ALTER FUNCTION "public"."get_user_id"("apikey" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_user_id"("apikey" "text", "app_id" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Declare  
 org_owner_id uuid;
 real_user_id uuid;
 org_id uuid;
Begin
  SELECT apps.user_id FROM apps WHERE apps.app_id=get_user_id.app_id into org_owner_id;
  SELECT get_user_main_org_id(org_owner_id) INTO org_id;

  -- (public.is_member_of_org((select auth.uid()), org_id) OR public.is_owner_of_org((select auth.uid()), org_id))
  SELECT user_id
  INTO real_user_id
  FROM apikeys
  WHERE key=apikey;

  IF NOT ((public.is_member_of_org(real_user_id, org_id) OR public.is_owner_of_org(real_user_id, org_id)))
  THEN
    raise exception 'NO_RIGHTS';
  END IF;

  RETURN org_owner_id;
End;  
$$;

ALTER FUNCTION "public"."get_user_id"("apikey" "text", "app_id" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.get_user_main_org_id(user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  org_id uuid;
begin
  select orgs.id from orgs
  into org_id
  where orgs.created_by=get_user_main_org_id.user_id
  limit 1;

  return org_id;
End;
$function$;

ALTER FUNCTION "public"."get_user_main_org_id"(user_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_user_main_org_id_by_app_id"("app_id" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  org_id uuid;
begin
  select apps.owner_org from apps
  into org_id
  where ((apps.app_id)::text = (get_user_main_org_id_by_app_id.app_id)::text)
  limit 1;

  return org_id;
End;
$$;

ALTER FUNCTION "public"."get_user_main_org_id_by_app_id"("app_id" "text") OWNER TO "postgres";

CREATE
OR REPLACE FUNCTION public.get_weekly_stats (app_id CHARACTER VARYING) RETURNS TABLE (
  all_updates BIGINT,
  failed_updates BIGINT,
  open_app BIGINT
) LANGUAGE plpgsql AS $$
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

ALTER FUNCTION "public"."get_weekly_stats"("app_id" character varying) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."guard_r2_path"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$BEGIN
  IF NEW."r2_path" is not distinct from NULL THEN
    RETURN NEW;
  END IF;

  IF NEW."r2_path" is distinct from (select format('orgs/%s/apps/%s/%s.zip', NEW.owner_org, NEW.app_id, NEW.id)) THEN
    RAISE EXCEPTION 'The expected r2_path is %', (select format('orgs/%s/apps/%s/%s.zip', NEW.owner_org, NEW.app_id), NEW.id);
  END IF;

   RETURN NEW;
END;$$;

ALTER FUNCTION "public"."guard_r2_path"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."has_app_right"("appid" character varying, "right" "public"."user_min_right") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN has_app_right_userid("appid", "right", (select auth.uid()));
End;
$$;

ALTER FUNCTION "public"."has_app_right"("appid" character varying, "right" "public"."user_min_right") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."has_app_right_userid"("appid" character varying, "right" "public"."user_min_right", "userid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE 
  org_id uuid;
Begin
  org_id := get_user_main_org_id_by_app_id(appid);

  RETURN (is_owner_of_org(userid, org_id) OR check_min_rights("right", userid, org_id, "appid", NULL::bigint));
End;
$$;

ALTER FUNCTION "public"."has_app_right_userid"("appid" character varying, "right" "public"."user_min_right", "userid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."http_post_helper"("function_name" "text", "function_type" "text", "body" "jsonb") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
<<declared>>
DECLARE 
  request_id text;
  headers jsonb;
  url text;
BEGIN 
  headers := jsonb_build_object(
    'Content-Type',
    'application/json',
    'apisecret',
    get_apikey()
  );
  -- Determine the URL based on the function_type
  CASE function_type
  WHEN 'netlify' THEN
    url := get_netlify_function_url() || '/triggers/' || function_name;
  WHEN 'cloudflare' THEN
    url := get_cloudflare_function_url() || '/triggers/' || function_name;
  ELSE
    url := get_db_url() || '/functions/v1/triggers/' || function_name;
  END CASE;

  -- Make an async HTTP POST request using pg_net
  SELECT INTO request_id net.http_post(
    url := declared.url,
    headers := declared.headers,
    body := body,
    timeout_milliseconds := 15000
  );
  return request_id;
END;
$$;

ALTER FUNCTION "public"."http_post_helper"("function_name" "text", "function_type" "text", "body" "jsonb") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."invite_user_to_org"("email" character varying, "org_id" "uuid", "invite_type" "public"."user_min_right") RETURNS character varying
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Declare  
  org record;
  invited_user record;
  current_record record;
Begin
  SELECT * FROM ORGS
  INTO org
  WHERE orgs.id=invite_user_to_org.org_id;

  IF org IS NULL THEN
    return 'NO_ORG';
  END IF;

  IF NOT (org.created_by= (select auth.uid())) THEN
      if NOT (check_min_rights('admin'::user_min_right, (select auth.uid()), invite_user_to_org.org_id, NULL::character varying, NULL::bigint)) THEN
          return 'NO_RIGHTS';
      END IF;
  END IF;

  SELECT users.id FROM USERS
  INTO invited_user
  WHERE users.email=invite_user_to_org.email;

  IF invited_user IS NOT NULL THEN
    -- INSERT INTO org_users (user_id, org_id, user_right)
    -- VALUES (invited_user.id, invite_user_to_org.org_id, invite_type);

    IF (org.created_by=invited_user.id) THEN
      RETURN 'CAN_NOT_INVITE_OWNER';
    END IF;

    SELECT org_users.id from org_users 
    INTO current_record
    WHERE org_users.user_id=invited_user.id
    AND org_users.org_id=invite_user_to_org.org_id;

    IF current_record IS NOT NULL THEN
      RETURN 'ALREADY_INVITED';
    ELSE
      INSERT INTO org_users (user_id, org_id, user_right)
      VALUES (invited_user.id, invite_user_to_org.org_id, invite_type);

      RETURN 'OK';
    END IF;
  ELSE
    return 'NO_EMAIL';
  END IF;
End;
$$;

ALTER FUNCTION "public"."invite_user_to_org"("email" character varying, "org_id" "uuid", "invite_type" "public"."user_min_right") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN is_admin((select auth.uid()));
END;  
$$;

ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_admin"("userid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  admin_ids_jsonb JSONB;
  is_admin_flag BOOLEAN;
BEGIN
  -- Fetch the JSONB string of admin user IDs from the vault
  SELECT decrypted_secret INTO admin_ids_jsonb FROM vault.decrypted_secrets WHERE name = 'admin_users';
  
  -- Check if the provided userid is within the JSONB array of admin user IDs
  is_admin_flag := (admin_ids_jsonb ? userid::text);
  
  -- An admin with no logged 2FA should not have his admin perms granted
  RETURN is_admin_flag AND verify_mfa();
END;  
$$;

ALTER FUNCTION "public"."is_admin"("userid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_allowed_action"("apikey" "text", "appid" "text") RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
Begin
  RETURN is_allowed_action_org((select owner_org from apps where app_id=appid));
End;
$$;

ALTER FUNCTION "public"."is_allowed_action"("apikey" "text", "appid" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_allowed_action_org"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
    RETURN is_paying_and_good_plan_org(orgid);
End;
$$;

ALTER FUNCTION "public"."is_allowed_action_org"("orgid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[]) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM apikeys
  WHERE key=apikey
  AND mode=ANY(keymode)));
End;  
$$;

ALTER FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[]) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[], "app_id" character varying) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM apikeys
  WHERE key=apikey
  AND mode=ANY(keymode))) AND is_app_owner(get_user_id(apikey), app_id);
End;  
$$;

ALTER FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[], "app_id" character varying) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_app_owner"("appid" character varying) RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN is_app_owner((select auth.uid()), appid);
END;  
$$;

ALTER FUNCTION "public"."is_app_owner"("appid" character varying) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_app_owner"("apikey" "text", "appid" character varying) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN is_app_owner(get_user_id(apikey), appid);
End;
$$;

ALTER FUNCTION "public"."is_app_owner"("apikey" "text", "appid" character varying) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_app_owner"("userid" "uuid", "appid" character varying) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM apps
  WHERE app_id=appid
  AND user_id=userid));
End;  
$$;

ALTER FUNCTION "public"."is_app_owner"("userid" "uuid", "appid" character varying) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_canceled_org"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  from stripe_info
  where customer_id=(SELECT customer_id from orgs where id=orgid)
  AND status = 'canceled'));
End;  
$$;

ALTER FUNCTION "public"."is_canceled_org"("orgid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_good_plan_v5_org"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    total_metrics RECORD;
    current_plan_name TEXT;
BEGIN
  SELECT * INTO total_metrics FROM public.get_total_metrics(orgid);
  current_plan_name := (SELECT get_current_plan_name_org(orgid));
  
  RETURN EXISTS (
    SELECT 1 
    FROM find_fit_plan_v3(
      total_metrics.mau,
      total_metrics.bandwidth,
      total_metrics.storage
    ) 
    WHERE find_fit_plan_v3.name = current_plan_name
  );
END;
$$;

ALTER FUNCTION "public"."is_good_plan_v5_org"("orgid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_member_of_org"("user_id" "uuid", "org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Declare
 is_found integer;
Begin
  SELECT count(*)
  INTO is_found
  FROM orgs
  JOIN org_users on org_users.org_id = orgs.id
  WhERE org_users.user_id = is_member_of_org.user_id AND
  orgs.id = is_member_of_org.org_id;
  RETURN is_found != 0;
End;
$$;

ALTER FUNCTION "public"."is_member_of_org"("user_id" "uuid", "org_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_not_deleted"("email_check" character varying) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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

ALTER FUNCTION "public"."is_not_deleted"("email_check" character varying) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_onboarded_org"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM apps
  WHERE owner_org=orgid)) AND (SELECT EXISTS (SELECT 1
  FROM app_versions
  WHERE owner_org=orgid));
End;
$$;

ALTER FUNCTION "public"."is_onboarded_org"("orgid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_onboarding_needed_org"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (NOT is_onboarded_org(orgid)) AND is_trial_org(orgid) = 0;
End;
$$;

ALTER FUNCTION "public"."is_onboarding_needed_org"("orgid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_owner_of_org"("user_id" "uuid", "org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Declare
 is_found integer;
Begin
  SELECT count(*)
  INTO is_found
  FROM orgs
  WHERE orgs.id = org_id
  AND orgs.created_by = user_id;
  RETURN is_found != 0;
End;
$$;

ALTER FUNCTION "public"."is_owner_of_org"("user_id" "uuid", "org_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION public.is_paying_and_good_plan_org(orgid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  from stripe_info
  where customer_id=(SELECT customer_id from orgs where id=orgid)
  AND (
    (status = 'succeeded' AND is_good_plan = true) -- is_good_plan = true AND <-- TODO: reenable is_good_plan in the future
    OR (subscription_id = 'free') -- TODO: allow free plan again
    -- OR (subscription_id = 'free' or subscription_id is null)
    OR (trial_at::date - (now())::date > 0)
  )
  )
);
End;  
$function$;

ALTER FUNCTION "public"."is_paying_and_good_plan_org"("orgid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_paying_org"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  from stripe_info
  where customer_id=(SELECT customer_id from orgs where id=orgid)
  AND status = 'succeeded'));
End;  
$$;

ALTER FUNCTION "public"."is_paying_org"("orgid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_trial_org"("orgid" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT GREATEST((trial_at::date - (now())::date), 0) AS days
  from stripe_info
  where customer_id=(SELECT customer_id from orgs where id=orgid));
End;  
$$;

ALTER FUNCTION "public"."is_trial_org"("orgid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."noupdate"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $_$
DECLARE
    val RECORD;
    is_diffrent boolean;
BEGIN
    -- API key? We do not care
    IF (select auth.uid()) IS NULL THEN
        RETURN NEW;
    END IF;

    -- If the user has the 'admin' role then we do not care
    IF check_min_rights('admin'::user_min_right, (select auth.uid()), OLD.owner_org, NULL::character varying, NULL::bigint) THEN
        RETURN NEW;
    END IF;

    for val in
      select * from json_each_text(row_to_json(NEW))
    loop
      -- raise warning '?? % % %', val.key, val.value, format('SELECT (NEW."%s" <> OLD."%s")', val.key, val.key);

      EXECUTE format('SELECT ($1."%s" is distinct from $2."%s")', val.key, val.key) using NEW, OLD
      INTO is_diffrent;

      IF is_diffrent AND val.key <> 'version' AND val.key <> 'secondVersion' AND key.value <> 'updated_at' THEN
          RAISE EXCEPTION 'not allowed %', val.key;
      END IF;
    end loop;

   RETURN NEW;
END;$_$;

ALTER FUNCTION "public"."noupdate"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."one_month_ahead"() RETURNS timestamp without time zone
    LANGUAGE "plpgsql"
    AS $$
BEGIN
   RETURN NOW() + INTERVAL '1 month';
END;
$$;

ALTER FUNCTION "public"."one_month_ahead"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."prevent_steal_org"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$BEGIN
  IF (select current_user) IS NOT DISTINCT FROM 'postgres' THEN
    RETURN NEW;
  END IF;
  
  IF NEW.created_by IS DISTINCT FROM OLD.created_by
  THEN
    RAISE EXCEPTION '"created_by" must not be updated';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
  THEN
    RAISE EXCEPTION '"id" must not be updated';
  END IF;

  RETURN NEW;
END;$$;

ALTER FUNCTION "public"."prevent_steal_org"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."process_cron_stats_jobs"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  app_record RECORD;
BEGIN
  FOR app_record IN (
    SELECT DISTINCT av.app_id, av.owner_org
    FROM app_versions av
    WHERE av.created_at >= NOW() - INTERVAL '30 days'
    
    UNION
    
    SELECT DISTINCT dm.app_id, av.owner_org
    FROM daily_mau dm
    JOIN app_versions av ON dm.app_id = av.app_id
    WHERE dm.date >= NOW() - INTERVAL '30 days' AND dm.mau > 0
  )
  LOOP
    INSERT INTO job_queue (job_type, payload, function_type, function_name)
    VALUES (
      'TRIGGER',
      json_build_object('appId', app_record.app_id, 'orgId', app_record.owner_org, 'todayOnly', true)::text,
      'cloudflare',
      'cron_stats'
    );
  END LOOP;
END;
$$;

ALTER FUNCTION "public"."process_cron_stats_jobs"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."process_current_jobs_if_unlocked"() RETURNS SETOF bigint
    LANGUAGE "plpgsql"
    AS $$
<<declared>>
DECLARE
    worker RECORD;
    current_job RECORD;
    request_id bigint;
BEGIN
    -- Find an unlocked worker
    SELECT * INTO worker FROM workers FOR UPDATE SKIP LOCKED LIMIT 1;
    IF worker IS NOT NULL THEN
        RAISE NOTICE 'Using worker_id: %', worker.id;
        -- Lock the worker (this is already done by the SELECT ... FOR UPDATE)

        -- Here let's do the logic ;-)
        -- Limit of 100 rows, idk why but it sound good
        FOR current_job IN SELECT * FROM job_queue 
        WHERE job_queue.status = 'inserted'::"public"."queue_job_status"
        limit 100
        FOR UPDATE SKIP LOCKED
        LOOP
            RAISE NOTICE 'Processing job_id: %, payload: %', current_job.job_id, current_job.payload;

            IF (current_job.job_type = 'TRIGGER' AND current_job.function_name IS NOT NULL) THEN
                SELECT http_post_helper(current_job.function_name, current_job.function_type, current_job.payload::jsonb) INTO request_id;
                return next request_id;
            END IF;

            -- Note: In 20231020160052_queue_system.sql there is a section for APP_DELETE etc.
            -- Here I deleted it, it's not needed
            -- When selfhosting capgo concider readding that section here ;-)

            -- Delete the job from the queue
            RAISE NOTICE 'Delete job_id: %, payload: %', current_job.job_id, current_job.payload;
            UPDATE job_queue SET status='requested'::"public"."queue_job_status", request_id=declared.request_id WHERE job_id = current_job.job_id;
        END LOOP;

        -- Unlock the worker
        UPDATE workers SET locked = FALSE WHERE id = worker.id;
    ELSE
        RAISE NOTICE 'No unlocked workers available';
    END IF;
END;
$$;

ALTER FUNCTION "public"."process_current_jobs_if_unlocked"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."process_free_trial_expired"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE stripe_info
  SET is_good_plan = false
  WHERE status <> 'succeeded' AND trial_at < NOW();
END;
$$;

ALTER FUNCTION "public"."process_free_trial_expired"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."process_requested_jobs"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    requested_job RECORD;
BEGIN
    FOR requested_job IN SELECT net._http_response.id, net._http_response.status_code, net._http_response.content, net._http_response.error_msg from job_queue  
    left join net._http_response on net._http_response.id=job_queue.request_id 
    where status='requested'::"public"."queue_job_status" AND request_id is distinct from NULL
    limit 500
    FOR UPDATE OF "job_queue" SKIP LOCKED
    LOOP
        -- RAISE NOTICE 'Checking request: %', requested_job.id;

        IF (requested_job.error_msg is not distinct from NULL AND requested_job.status_code BETWEEN 199 AND 299) THEN
            -- RAISE NOTICE 'Delete request: %', requested_job.id;
            DELETE FROM net._http_response WHERE id=requested_job.id;
            DELETE FROM job_queue WHERE job_queue.request_id=requested_job.id;
        ELSE
            -- RAISE NOTICE 'Job failed: %', requested_job.id;
            UPDATE job_queue set status='failed'::"public"."queue_job_status", extra_info=jsonb_build_object('status_code', requested_job.status_code, 'content', requested_job.content, 'error_msg', requested_job.error_msg) where request_id=requested_job.id;
        END IF;
    END LOOP;
END;
$$;

ALTER FUNCTION "public"."process_requested_jobs"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."process_subscribed_orgs"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  org_record RECORD;
BEGIN
  FOR org_record IN (
    SELECT o.id, o.customer_id
    FROM orgs o
    JOIN stripe_info si ON o.customer_id = si.customer_id
    WHERE si.status = 'succeeded' AND si.product_id != 'free'
  )
  LOOP
    INSERT INTO job_queue (job_type, payload, function_type, function_name)
    VALUES (
      'TRIGGER',
      json_build_object('orgId', org_record.id, 'customerId', org_record.customer_id)::text,
      'cloudflare',
      'cron_plan'
    );
  END LOOP;
END;
$$;

ALTER FUNCTION "public"."process_subscribed_orgs"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."read_bandwidth_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) RETURNS TABLE("date" "date", "bandwidth" bigint, "app_id" character varying)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE_TRUNC('day', timestamp) AS date,
    SUM(file_size) AS bandwidth,
    app_id
  FROM bandwidth_usage
  WHERE
    timestamp >= p_period_start
    AND timestamp < p_period_end
    AND app_id = p_app_id
  GROUP BY date
  ORDER BY date;
END;
$$;

ALTER FUNCTION "public"."read_bandwidth_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."read_device_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) RETURNS TABLE("date" "date", "mau" bigint, "app_id" character varying)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE_TRUNC('day', timestamp) AS date,
    COUNT(DISTINCT device_id) AS mau,
    app_id
  FROM device_usage
  WHERE
    app_id = p_app_id
    AND timestamp >= p_period_start
    AND timestamp < p_period_end
  GROUP BY app_id, date
  ORDER BY date;
END;
$$;

ALTER FUNCTION "public"."read_device_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."read_storage_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) RETURNS TABLE("app_id" character varying, "date" "date", "storage" bigint)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    p_app_id AS app_id,
    DATE_TRUNC('day', timestamp)::DATE AS date,
    SUM(size)::BIGINT AS storage
  FROM version_meta
  WHERE
    timestamp >= p_period_start
    AND timestamp < p_period_end
    AND version_meta.app_id = p_app_id
  GROUP BY version_meta.app_id, date
  ORDER BY date;
END;
$$;

ALTER FUNCTION "public"."read_storage_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."read_version_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) RETURNS TABLE("app_id" character varying, "version_id" bigint, "date" "date", "get" bigint, "fail" bigint, "install" bigint, "uninstall" bigint)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    app_id,
    version as version_id,
    DATE_TRUNC('day', timestamp) AS date,
    SUM(CASE WHEN action = 'get' THEN 1 ELSE 0 END) AS get,
    SUM(CASE WHEN action = 'fail' THEN 1 ELSE 0 END) AS fail,
    SUM(CASE WHEN action = 'install' THEN 1 ELSE 0 END) AS install,
    SUM(CASE WHEN action = 'uninstall' THEN 1 ELSE 0 END) AS uninstall
  FROM version_usage
  WHERE
    app_id = p_app_id
    AND timestamp >= p_period_start
    AND timestamp < p_period_end
  GROUP BY date, app_id, version_id
  ORDER BY date;
END;
$$;

ALTER FUNCTION "public"."read_version_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."reset_and_seed_data"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
BEGIN
    -- Truncate tables
    TRUNCATE TABLE "auth"."users" CASCADE;
    TRUNCATE TABLE "public"."plans" CASCADE;
    TRUNCATE TABLE "storage"."buckets" CASCADE;
    TRUNCATE TABLE "public"."stripe_info" CASCADE;
    TRUNCATE TABLE "public"."users" CASCADE;
    TRUNCATE TABLE "public"."orgs" CASCADE;
    TRUNCATE TABLE "public"."apikeys" CASCADE;
    TRUNCATE TABLE "public"."apps" CASCADE;
    TRUNCATE TABLE "public"."app_versions" CASCADE;
    TRUNCATE TABLE "public"."app_versions_meta" CASCADE;
    TRUNCATE TABLE "public"."channels" CASCADE;

    -- Insert seed data
    -- (Include all your INSERT statements here)

    -- Seed data
    INSERT INTO "auth"."users" ("instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at", "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token", "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at", "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin", "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change", "phone_change_token", "phone_change_sent_at", "email_change_token_current", "email_change_confirm_status", "banned_until", "reauthentication_token", "reauthentication_sent_at") VALUES
    ('00000000-0000-0000-0000-000000000000', 'c591b04e-cf29-4945-b9a0-776d0672061a', 'authenticated', 'authenticated', 'admin@capgo.app', '$2a$10$I4wgil64s1Kku/7aUnCOVuc1W5nCAeeKvHMiSKk10jo1J5fSVkK1S', now(), now(), 'oljikwwipqrkwilfsyto', now(), '', NULL, '', '', NULL, now(), '{"provider": "email", "providers": ["email"]}', '{"activation": {"legal": true, "formFilled": true, "optForNewsletters": true, "enableNotifications": true}, "test_identifier": "test_admin"}', 'f', now(), now(), NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL),
    ('00000000-0000-0000-0000-000000000000', '6aa76066-55ef-4238-ade6-0b32334a4097', 'authenticated', 'authenticated', 'test@capgo.app', '$2a$10$0CErXxryZPucjJWq3O7qXeTJgN.tnNU5XCZy9pXKDWRi/aS9W7UFi', now(), now(), 'oljikwwipqrkwilfsyty', now(), '', NULL, '', '', NULL, now(), '{"provider": "email", "providers": ["email"]}', '{"activation": {"legal": true, "formFilled": true, "optForNewsletters": true, "enableNotifications": true}, "test_identifier": "test_user"}', 'f', now(), now(), NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL),
    ('00000000-0000-0000-0000-000000000000', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', 'authenticated', 'authenticated', 'test2@capgo.app', '$2a$10$0CErXxryZPucjJWq3O7qXeTJgN.tnNU5XCZy9pXKDWRi/aS9W7UFi', now(), now(), 'oljikwwipqrkwilfsytt', now(), '', NULL, '', '', NULL, now(), '{"provider": "email", "providers": ["email"]}', '{"activation": {"legal": true, "formFilled": true, "optForNewsletters": true, "enableNotifications": true}, "test_identifier": "test_user2"}', 'f', now(), now(), NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL);

    INSERT INTO "public"."plans" ("created_at", "updated_at", "name", "description", "price_m", "price_y", "stripe_id", "version", "id", "price_m_id", "price_y_id", "storage", "bandwidth", "mau", "market_desc", "storage_unit", "bandwidth_unit", "mau_unit", "price_m_storage_id", "price_m_bandwidth_id", "price_m_mau_id") VALUES
    (now(), now(), 'Maker', 'plan.maker.desc', 39, 396, 'prod_LQIs1Yucml9ChU', 100, '440cfd69-0cfd-486e-b59b-cb99f7ae76a0', 'price_1KjSGyGH46eYKnWwL4h14DsK', 'price_1KjSKIGH46eYKnWwFG9u4tNi', 3221225472, 268435456000, 5000, 'Best for small business owners', 0, 0, 0, NULL, NULL, NULL),
    (now(), now(), 'Pay as you go', 'plan.payasyougo.desc', 499, 4799, 'prod_MH5Jh6ajC9e7ZH', 1000, '745d7ab3-6cd6-4d65-b257-de6782d5ba50', 'price_1LYX8yGH46eYKnWwzeBjISvW', 'price_1LYX8yGH46eYKnWwzeBjISvW', 12884901888, 3221225472000, 40000, 'Best for scalling enterprises', 0.05, 0.1, 0.0006, 'price_1LYXD8GH46eYKnWwaVvggvyy', 'price_1LYXDoGH46eYKnWwPEYVZXui', 'price_1LYXE2GH46eYKnWwo5qd4BTU'),
    (now(), now(), 'Solo', 'plan.solo.desc', 14, 146, 'prod_LQIregjtNduh4q', 10, '526e11d8-3c51-4581-ac92-4770c602f47c', 'price_1LVvuZGH46eYKnWwuGKOf4DK', 'price_1LVvuIGH46eYKnWwHMDCrxcH', 1073741824, 13958643712, 500, 'Best for independent developers', 0, 0, 0, NULL, NULL, NULL),
    (now(), now(), 'Team', 'plan.team.desc', 99, 998, 'prod_LQIugvJcPrxhda', 1000, 'abd76414-8f90-49a5-b3a4-8ff4d2e12c77', 'price_1KjSIUGH46eYKnWwWHvg8XYs', 'price_1KjSLlGH46eYKnWwAwMW2wiW', 6442450944, 536870912000, 10000, 'Best for medium enterprises', 0, 0, 0, NULL, NULL, NULL);

    INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public") VALUES
    ('capgo', 'capgo', NULL, now(), now(), 't'),
    ('apps', 'apps', NULL, now(), now(), 'f'),
    ('images', 'images', NULL, now(), now(), 't');

    INSERT INTO "public"."stripe_info" ("created_at", "updated_at", "subscription_id", "customer_id", "status", "product_id", "trial_at", "price_id", "is_good_plan", "plan_usage", "subscription_metered", "subscription_anchor_start", "subscription_anchor_end") VALUES
    (now(), now(), 'sub_1', 'cus_Pa0k8TO6HVln6A', 'succeeded', 'prod_LQIregjtNduh4q', now() + interval '15 days', NULL, 't', 2, '{}', now() - interval '15 days', now() + interval '15 days'),
    (now(), now(), 'sub_2', 'cus_Q38uE91NP8Ufqc', 'succeeded', 'prod_LQIregjtNduh4q', now() + interval '15 days', NULL, 't', 2, '{}', now() - interval '15 days', now() + interval '15 days'),
    (now(), now(), 'sub_3', 'cus_Pa0f3M6UCQ8g5Q', 'succeeded', 'prod_LQIregjtNduh4q', now() + interval '15 days', NULL, 't', 2, '{}', now() - interval '15 days', now() + interval '15 days');

    -- Do not insert new orgs
    ALTER TABLE users DISABLE TRIGGER generate_org_on_user_create;
    INSERT INTO "public"."users" ("created_at", "image_url", "first_name", "last_name", "country", "email", "id", "updated_at", "enableNotifications", "optForNewsletters", "legalAccepted", "customer_id", "billing_email") VALUES
    ('2022-06-03 05:54:15+00', '', 'admin', 'Capgo', NULL, 'admin@capgo.app', 'c591b04e-cf29-4945-b9a0-776d0672061a', now(), 'f', 'f', 'f', NULL, NULL),
    ('2022-06-03 05:54:15+00', '', 'test', 'Capgo', NULL, 'test@capgo.app', '6aa76066-55ef-4238-ade6-0b32334a4097', now(), 'f', 'f', 'f', NULL, NULL),
    ('2022-06-03 05:54:15+00', '', 'test2', 'Capgo', NULL, 'test2@capgo.app', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', now(), 'f', 'f', 'f', NULL, NULL);
    ALTER TABLE users ENABLE TRIGGER generate_org_on_user_create;

    ALTER TABLE orgs DISABLE TRIGGER generate_org_user_on_org_create;
    INSERT INTO "public"."orgs" ("id", "created_by", "created_at", "updated_at", "logo", "name", "management_email", "customer_id") VALUES
    ('22dbad8a-b885-4309-9b3b-a09f8460fb6d', 'c591b04e-cf29-4945-b9a0-776d0672061a', now(), now(), '', 'Admin org', 'admin@capgo.app', 'cus_Pa0k8TO6HVln6A'),
    ('046a36ac-e03c-4590-9257-bd6c9dba9ee8', '6aa76066-55ef-4238-ade6-0b32334a4097', now(), now(), '', 'Demo org', 'test@capgo.app', 'cus_Q38uE91NP8Ufqc'),
    ('34a8c55d-2d0f-4652-a43f-684c7a9403ac', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', now(), now(), '', 'Test2 org', 'test2@capgo.app', 'cus_Pa0f3M6UCQ8g5Q');
    ALTER TABLE orgs ENABLE TRIGGER generate_org_user_on_org_create;

    INSERT INTO "public"."org_users" ("org_id", "user_id", "user_right", "app_id", "channel_id") VALUES
    ('22dbad8a-b885-4309-9b3b-a09f8460fb6d', 'c591b04e-cf29-4945-b9a0-776d0672061a', 'super_admin'::"user_min_right", null, null),
    ('046a36ac-e03c-4590-9257-bd6c9dba9ee8', '6aa76066-55ef-4238-ade6-0b32334a4097', 'super_admin'::"user_min_right", null, null),
    ('34a8c55d-2d0f-4652-a43f-684c7a9403ac', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', 'super_admin'::"user_min_right", null, null),
    ('046a36ac-e03c-4590-9257-bd6c9dba9ee8', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', 'upload'::"user_min_right", null, null);

    INSERT INTO "public"."apikeys" ("id", "created_at", "user_id", "key", "mode", "updated_at") VALUES
    (901, now(), 'c591b04e-cf29-4945-b9a0-776d0672061a', 'c591b04e-cf29-4945-b9a0-776d0672061e', 'upload', now()),
    (902, now(), 'c591b04e-cf29-4945-b9a0-776d0672061a', '67eeaff4-ae4c-49a6-8eb1-0875f5369de1', 'read', now()),
    (903, now(), 'c591b04e-cf29-4945-b9a0-776d0672061a', 'ae6e7458-c46d-4c00-aa3b-153b0b8520eb', 'all', now()),
    (911, now(), '6aa76066-55ef-4238-ade6-0b32334a4097', 'c591b04e-cf29-4945-b9a0-776d0672061b', 'upload', now()),
    (912, now(), '6aa76066-55ef-4238-ade6-0b32334a4097', '67eeaff4-ae4c-49a6-8eb1-0875f5369de0', 'read', now()),
    (913, now(), '6aa76066-55ef-4238-ade6-0b32334a4097', 'ae6e7458-c46d-4c00-aa3b-153b0b8520ea', 'all', now()),
    (916, now(), '6aa76066-55ef-4238-ade6-0b32334a4097', '985640ce-4031-4cfd-8095-d1d1066b6b3b', 'write', now()),
    (915, now(), '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', 'ab4d9a98-ec25-4af8-933c-2aae4aa52b85', 'upload', now()),
    (917, now(), '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', 'ac4d9a98-ec25-4af8-933c-2aae4aa52b85', 'all', now());

    INSERT INTO "public"."apps" ("created_at", "app_id", "icon_url", "name", "last_version", "updated_at", "owner_org", "user_id") VALUES
    (now(), 'com.demoadmin.app', '', 'Demo Admin app', '1.0.0', now(), '22dbad8a-b885-4309-9b3b-a09f8460fb6d', 'c591b04e-cf29-4945-b9a0-776d0672061a'),
    (now(), 'com.demo.app', '', 'Demo app', '1.0.0', now(), '046a36ac-e03c-4590-9257-bd6c9dba9ee8', '6aa76066-55ef-4238-ade6-0b32334a4097');

    INSERT INTO "public"."app_versions" ("id", "created_at", "app_id", "name", "bucket_id", "updated_at", "deleted", "external_url", "checksum", "session_key", "storage_provider", "owner_org") VALUES
    (1884, now(), 'com.demo.app', 'builtin', NULL, now(), 't', NULL, NULL, NULL, 'supabase', '046a36ac-e03c-4590-9257-bd6c9dba9ee8'),
    (1883, now(), 'com.demo.app', 'unknown', NULL, now(), 't', NULL, NULL, NULL, 'supabase', '046a36ac-e03c-4590-9257-bd6c9dba9ee8'),
    (9655, now(), 'com.demo.app', '1.0.1', 'test-bucket.zip', now(), 'f', NULL, '', NULL, 'r2-direct', '046a36ac-e03c-4590-9257-bd6c9dba9ee8'),
    (9654, now(), 'com.demo.app', '1.0.0', '8093d4ad-7d4b-427b-8d73-fc2a97b79ab9.zip', now(), 'f', NULL, '3885ee49', NULL, 'r2', '046a36ac-e03c-4590-9257-bd6c9dba9ee8'),
    (9653, now(), 'com.demo.app', '1.361.0', '3dfe0df9-94fa-4ae8-b538-3f1a9b305687.zip', now(), 'f', NULL, '9d4f798a', NULL, 'r2', '046a36ac-e03c-4590-9257-bd6c9dba9ee8'),
    (9652, now(), 'com.demo.app', '1.360.0', 'ae4d9a98-ec25-4af8-933c-2aae4aa52b85.zip', now(), 'f', NULL, '44913a9f', NULL, 'r2', '046a36ac-e03c-4590-9257-bd6c9dba9ee8'),
    (9601, now(), 'com.demo.app', '1.359.0', '8aafd924-bd31-43be-8f35-3f6957890ff9.zip', now(), 'f', NULL, '9f74e70a', NULL, 'r2', '046a36ac-e03c-4590-9257-bd6c9dba9ee8');

    INSERT INTO "public"."app_versions_meta" ("created_at", "app_id", "updated_at", "checksum", "size", "id", "devices") VALUES
    (now(), 'com.demo.app', now(), '', 0, 9655, 10),
    (now(), 'com.demo.app', now(), '3885ee49', 1012506, 9654, 10),
    (now(), 'com.demo.app', now(), '9d4f798a', 1012529, 9653, 20),
    (now(), 'com.demo.app', now(), '44913a9f', 1012541, 9652, 30),
    (now(), 'com.demo.app', now(), '9f74e70a', 1012548, 9601, 40);

    INSERT INTO "public"."channels" ("id", "created_at", "name", "app_id", "version", "updated_at", "public", "disable_auto_update_under_native", "disable_auto_update", "beta", "ios", "android", "allow_device_self_set", "allow_emulator", "allow_dev") VALUES
    (22, now(), 'production', 'com.demo.app', 9654, now(), 't', 't', 'major'::"public"."disable_update", 'f', 'f', 't', 't', 't', 't'),
    (23, now(), 'no_access', 'com.demo.app', 9653, now(), 'f', 't', 'major'::"public"."disable_update", 'f', 't', 't', 't', 't', 't'),
    (24, now(), 'two_default', 'com.demo.app', 9654, now(), 't', 't', 'major'::"public"."disable_update", 'f', 't', 'f', 't', 't', 't');

    -- Drop replicated orgs but keet the the seed ones
    DELETE from "orgs" where POSITION('organization' in orgs.name)=1;
END;
$_$;

ALTER FUNCTION "public"."reset_and_seed_data"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."reset_and_seed_app_data"("p_app_id" character varying) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    org_id uuid := '046a36ac-e03c-4590-9257-bd6c9dba9ee8';
    user_id uuid := '6aa76066-55ef-4238-ade6-0b32334a4097';
BEGIN

    -- Delete existing data for the specified app_id
    DELETE FROM channels WHERE app_id = p_app_id;
    DELETE FROM app_versions WHERE app_id = p_app_id;
    DELETE FROM apps WHERE app_id = p_app_id;

    -- Insert new app data
    INSERT INTO "public"."apps" ("created_at", "app_id", "icon_url", "name", "last_version", "updated_at", "owner_org", "user_id")
    VALUES (now(), p_app_id, '', 'Seeded App', '1.0.0', now(), org_id, user_id);

    -- Insert app versions
    INSERT INTO "public"."app_versions" ("created_at", "app_id", "name", "bucket_id", "updated_at", "deleted", "external_url", "checksum", "storage_provider", "owner_org")
    VALUES
    (now(), p_app_id, 'builtin', NULL, now(), 't', NULL, NULL, 'supabase', org_id),
    (now(), p_app_id, 'unknown', NULL, now(), 't', NULL, NULL, 'supabase', org_id),
    (now(), p_app_id, '1.0.1', 'test-bucket.zip', now(), 'f', NULL, '', 'r2-direct', org_id),
    (now(), p_app_id, '1.0.0', '8093d4ad-7d4b-427b-8d73-fc2a97b79ab9.zip', now(), 'f', NULL, '3885ee49', 'r2', org_id),
    (now(), p_app_id, '1.361.0', '3dfe0df9-94fa-4ae8-b538-3f1a9b305687.zip', now(), 'f', NULL, '9d4f798a', 'r2', org_id),
    (now(), p_app_id, '1.360.0', 'ae4d9a98-ec25-4af8-933c-2aae4aa52b85.zip', now(), 'f', NULL, '44913a9f', 'r2', org_id),
    (now(), p_app_id, '1.359.0', '8aafd924-bd31-43be-8f35-3f6957890ff9.zip', now(), 'f', NULL, '9f74e70a', 'r2', org_id);

    -- Insert channels
    INSERT INTO "public"."channels" ("created_at", "name", "app_id", "version", "updated_at", "public", "disable_auto_update_under_native", "disable_auto_update", "beta", "ios", "android", "allow_device_self_set", "allow_emulator", "allow_dev")
    VALUES
    (now(), 'production', p_app_id, (SELECT id FROM app_versions WHERE app_id = p_app_id AND name = '1.0.0'), now(), 't', 't', 'major', 'f', 'f', 't', 't', 't', 't'),
    (now(), 'no_access', p_app_id, (SELECT id FROM app_versions WHERE app_id = p_app_id AND name = '1.361.0'), now(), 'f', 't', 'major', 'f', 't', 't', 't', 't', 't'),
    (now(), 'two_default', p_app_id, (SELECT id FROM app_versions WHERE app_id = p_app_id AND name = '1.0.0'), now(), 't', 't', 'major', 'f', 't', 'f', 't', 't', 't');

END;
$$;

ALTER FUNCTION "public"."reset_and_seed_app_data"("p_app_id" character varying) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."reset_and_seed_app_data"("p_app_id" character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_and_seed_app_data"("p_app_id" character varying) TO "service_role";

CREATE OR REPLACE FUNCTION "public"."reset_and_seed_stats_data"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  start_date TIMESTAMP := CURRENT_DATE - INTERVAL '15 days';
  end_date TIMESTAMP := CURRENT_DATE;
  curr_date DATE;
  random_mau INTEGER;
  random_bandwidth BIGINT;
  random_storage BIGINT;
  random_file_size BIGINT;
  random_uuid UUID;
  random_version_id BIGINT := 9654;
  random_action VARCHAR(20);
  random_timestamp TIMESTAMP;
BEGIN
  -- Truncate all tables
  TRUNCATE TABLE daily_mau, daily_bandwidth, daily_storage, daily_version, storage_usage, version_usage, device_usage, bandwidth_usage, devices, stats;

  -- Generate a random UUID
  random_uuid := gen_random_uuid();

  INSERT INTO devices (updated_at, device_id, version, app_id, platform, plugin_version, os_version, version_build, custom_id, is_prod, is_emulator) VALUES
    (now(), random_uuid, random_version_id, 'com.demo.app', 'android', '4.15.3', '9', '1.223.0', '', 't', 't');

  --  insert a fix device id for test
  INSERT INTO devices (updated_at, device_id, version, app_id, platform, plugin_version, os_version, version_build, custom_id, is_prod, is_emulator) VALUES
    (now(), '00000000-0000-0000-0000-000000000000', random_version_id, 'com.demo.app', 'android', '4.15.3', '9', '1.223.0', '', 't', 't');

  INSERT INTO stats (created_at, action, device_id, version, app_id) VALUES
    (now(), 'get'::"public"."stats_action", random_uuid, random_version_id, 'com.demo.app'),
    (now(), 'set'::"public"."stats_action", random_uuid, random_version_id, 'com.demo.app');

  -- Seed data for daily_mau, daily_bandwidth, and daily_storage
  curr_date := start_date::DATE;
  WHILE curr_date <= end_date::DATE LOOP
    random_mau := FLOOR(RANDOM() * 1000) + 1;
    random_bandwidth := FLOOR(RANDOM() * 1000000000) + 1;
    random_storage := FLOOR(RANDOM() * 1000000000) + 1;
    
    INSERT INTO daily_mau (app_id, date, mau) VALUES ('com.demo.app', curr_date, random_mau);
    INSERT INTO daily_bandwidth (app_id, date, bandwidth) VALUES ('com.demo.app', curr_date, random_bandwidth);
    INSERT INTO daily_storage (app_id, date, storage) VALUES ('com.demo.app', curr_date, random_storage);
    
    curr_date := curr_date + INTERVAL '1 day';
  END LOOP;

  -- Seed data for daily_version
  curr_date := start_date::DATE;
  WHILE curr_date <= end_date::DATE LOOP
    INSERT INTO daily_version (date, app_id, version_id, get, fail, install, uninstall)
    VALUES (curr_date, 'com.demo.app', random_version_id, FLOOR(RANDOM() * 100) + 1, FLOOR(RANDOM() * 10) + 1, FLOOR(RANDOM() * 50) + 1, FLOOR(RANDOM() * 20) + 1);
    
    curr_date := curr_date + INTERVAL '1 day';
  END LOOP;

  -- Seed data for storage_usage
  FOR i IN 1..20 LOOP
    random_file_size := FLOOR(RANDOM() * 10485760) - 5242880; -- Random size between -5MB and 5MB
    INSERT INTO storage_usage (device_id, app_id, file_size) VALUES (random_uuid, 'com.demo.app', random_file_size);
  END LOOP;

  -- Seed data for version_usage
  FOR i IN 1..30 LOOP
    random_timestamp := start_date + (RANDOM() * (end_date - start_date));
    random_action := (ARRAY['get', 'fail', 'install', 'uninstall'])[FLOOR(RANDOM() * 4) + 1];
    INSERT INTO version_usage (timestamp, app_id, version_id, action)
    VALUES (random_timestamp, 'com.demo.app', random_version_id, random_action::"public"."version_action");
  END LOOP;

  -- Seed data for device_usage
  FOR i IN 1..50 LOOP
    INSERT INTO device_usage (device_id, app_id) VALUES (random_uuid, 'com.demo.app');
  END LOOP;

  -- Seed data for bandwidth_usage
  FOR i IN 1..40 LOOP
    random_file_size := FLOOR(RANDOM() * 10485760) + 1; -- Random size between 1 byte and 10MB
    INSERT INTO bandwidth_usage (device_id, app_id, file_size) VALUES (random_uuid, 'com.demo.app', random_file_size);
  END LOOP;
END;
$$;

ALTER FUNCTION "public"."reset_and_seed_stats_data"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."reset_and_seed_app_stats_data"("p_app_id" character varying) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  start_date TIMESTAMP := CURRENT_DATE - INTERVAL '15 days';
  end_date TIMESTAMP := CURRENT_DATE;
  curr_date DATE;
  random_mau INTEGER;
  random_bandwidth BIGINT;
  random_storage BIGINT;
  random_file_size BIGINT;
  random_uuid UUID;
  random_version_id BIGINT := 9654;
  random_action VARCHAR(20);
  random_timestamp TIMESTAMP;
BEGIN
  -- Delete existing data for the specified app_id
  DELETE FROM daily_mau WHERE app_id = p_app_id;
  DELETE FROM daily_bandwidth WHERE app_id = p_app_id;
  DELETE FROM daily_storage WHERE app_id = p_app_id;
  DELETE FROM daily_version WHERE app_id = p_app_id;
  DELETE FROM storage_usage WHERE app_id = p_app_id;
  DELETE FROM version_usage WHERE app_id = p_app_id;
  DELETE FROM device_usage WHERE app_id = p_app_id;
  DELETE FROM bandwidth_usage WHERE app_id = p_app_id;
  DELETE FROM devices WHERE app_id = p_app_id;
  DELETE FROM stats WHERE app_id = p_app_id;

  -- Generate a random UUID
  random_uuid := gen_random_uuid();

  -- Insert device data
  INSERT INTO devices (updated_at, device_id, version, app_id, platform, plugin_version, os_version, version_build, custom_id, is_prod, is_emulator) VALUES
    (now(), random_uuid, random_version_id, p_app_id, 'android', '4.15.3', '9', '1.223.0', '', 't', 't'),
    (now(), '00000000-0000-0000-0000-000000000000', random_version_id, p_app_id, 'android', '4.15.3', '9', '1.223.0', '', 't', 't');

  -- Insert stats data
  INSERT INTO stats (created_at, action, device_id, version, app_id) VALUES
    (now(), 'get'::"public"."stats_action", random_uuid, random_version_id, p_app_id),
    (now(), 'set'::"public"."stats_action", random_uuid, random_version_id, p_app_id);

  -- Seed data for daily_mau, daily_bandwidth, and daily_storage
  curr_date := start_date::DATE;
  WHILE curr_date <= end_date::DATE LOOP
    random_mau := FLOOR(RANDOM() * 1000) + 1;
    random_bandwidth := FLOOR(RANDOM() * 1000000000) + 1;
    random_storage := FLOOR(RANDOM() * 1000000000) + 1;
    
    INSERT INTO daily_mau (app_id, date, mau) VALUES (p_app_id, curr_date, random_mau);
    INSERT INTO daily_bandwidth (app_id, date, bandwidth) VALUES (p_app_id, curr_date, random_bandwidth);
    INSERT INTO daily_storage (app_id, date, storage) VALUES (p_app_id, curr_date, random_storage);
    
    curr_date := curr_date + INTERVAL '1 day';
  END LOOP;

  -- Seed data for daily_version
  curr_date := start_date::DATE;
  WHILE curr_date <= end_date::DATE LOOP
    INSERT INTO daily_version (date, app_id, version_id, get, fail, install, uninstall)
    VALUES (curr_date, p_app_id, random_version_id, FLOOR(RANDOM() * 100) + 1, FLOOR(RANDOM() * 10) + 1, FLOOR(RANDOM() * 50) + 1, FLOOR(RANDOM() * 20) + 1);
    
    curr_date := curr_date + INTERVAL '1 day';
  END LOOP;

  -- Seed data for storage_usage
  FOR i IN 1..20 LOOP
    random_file_size := FLOOR(RANDOM() * 10485760) - 5242880; -- Random size between -5MB and 5MB
    INSERT INTO storage_usage (device_id, app_id, file_size) VALUES (random_uuid, p_app_id, random_file_size);
  END LOOP;

  -- Seed data for version_usage
  FOR i IN 1..30 LOOP
    random_timestamp := start_date + (RANDOM() * (end_date - start_date));
    random_action := (ARRAY['get', 'fail', 'install', 'uninstall'])[FLOOR(RANDOM() * 4) + 1];
    INSERT INTO version_usage (timestamp, app_id, version_id, action)
    VALUES (random_timestamp, p_app_id, random_version_id, random_action::"public"."version_action");
  END LOOP;

  -- Seed data for device_usage
  FOR i IN 1..50 LOOP
    INSERT INTO device_usage (device_id, app_id) VALUES (random_uuid, p_app_id);
  END LOOP;

  -- Seed data for bandwidth_usage
  FOR i IN 1..40 LOOP
    random_file_size := FLOOR(RANDOM() * 10485760) + 1; -- Random size between 1 byte and 10MB
    INSERT INTO bandwidth_usage (device_id, app_id, file_size) VALUES (random_uuid, p_app_id, random_file_size);
  END LOOP;
END;
$$;

ALTER FUNCTION "public"."reset_and_seed_app_stats_data"("p_app_id" character varying) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."reset_and_seed_app_stats_data"("p_app_id" character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_and_seed_app_stats_data"("p_app_id" character varying) TO "service_role";


CREATE OR REPLACE FUNCTION "public"."retry_failed_jobs"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    update job_queue set status = 'inserted'::"public"."queue_job_status" where status = 'failed'::"public"."queue_job_status";
END;
$$;

ALTER FUNCTION "public"."retry_failed_jobs"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trigger_http_queue_post_to_function"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE 
  payload jsonb;
BEGIN 
  -- Build the payload
  payload := jsonb_build_object(
    'old_record', OLD, 
    'record', NEW, 
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA
  );

  -- Insert into job_queue
  INSERT INTO job_queue (job_type, payload, function_name, function_type) VALUES ('TRIGGER', payload::text, TG_ARGV[0], TG_ARGV[1]);

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trigger_http_queue_post_to_function"() OWNER TO "postgres";

CREATE PROCEDURE "public"."update_app_versions_retention"()
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE app_versions
    SET deleted = true
    FROM apps, app_versions_meta
    WHERE app_versions_meta.app_id = app_versions.app_id
    AND app_versions.app_id = apps.app_id
    AND app_versions.id not in (select app_versions.id from app_versions join channels on app_versions.id = channels.version)
    AND app_versions.deleted = false
    AND apps.retention > 0
    AND extract(epoch from now()) - extract(epoch from app_versions_meta.created_at) > apps.retention
    AND extract(epoch from now()) - extract(epoch from app_versions_meta.updated_at) > apps.retention;
END;
$$;

ALTER PROCEDURE "public"."update_app_versions_retention"() OWNER TO "postgres";

CREATE PROCEDURE "public"."update_channels_progressive_deploy"()
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE channels
    SET "secondaryVersionPercentage" = CASE 
        WHEN channels."secondVersion" not in (select version from stats where stats.action='update_fail' and 10800 > extract(epoch from now()) - extract(epoch from stats.created_at)) 
        THEN "secondaryVersionPercentage" + 0.1 
        ELSE 0 
    END
    WHERE channels.enable_progressive_deploy = true
    AND channels."secondaryVersionPercentage" between 0 AND 0.9;
END;
$$;

ALTER PROCEDURE "public"."update_channels_progressive_deploy"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."verify_mfa"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
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

ALTER FUNCTION "public"."verify_mfa"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";

CREATE TABLE IF NOT EXISTS "public"."apikeys" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" NOT NULL,
    "key" character varying NOT NULL,
    "mode" "public"."key_mode" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."apikeys" OWNER TO "postgres";

ALTER TABLE "public"."apikeys" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."apikeys_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE IF NOT EXISTS "public"."app_versions" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "app_id" character varying NOT NULL,
    "name" character varying NOT NULL,
    "bucket_id" character varying,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted" boolean DEFAULT false NOT NULL,
    "external_url" character varying,
    "checksum" character varying,
    "session_key" character varying,
    "storage_provider" "text" DEFAULT 'r2'::"text" NOT NULL,
    "minUpdateVersion" character varying,
    "native_packages" "jsonb"[],
    "owner_org" "uuid" NOT NULL,
    "user_id" "uuid",
    "r2_path" character varying
);

ALTER TABLE "public"."app_versions" OWNER TO "postgres";

ALTER TABLE "public"."app_versions" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."app_versions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE IF NOT EXISTS "public"."app_versions_meta" (
    "created_at" timestamp with time zone DEFAULT "now"(),
    "app_id" character varying NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
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

ALTER TABLE "public"."app_versions_meta" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."app_versions_meta_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE IF NOT EXISTS "public"."apps" (
    "created_at" timestamp with time zone DEFAULT "now"(),
    "app_id" character varying NOT NULL,
    "icon_url" character varying NOT NULL,
    "user_id" "uuid",
    "name" character varying,
    "last_version" character varying,
    "updated_at" timestamp with time zone,
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"(),
    "retention" bigint DEFAULT '2592000'::bigint NOT NULL,
    "owner_org" "uuid" NOT NULL
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

CREATE SEQUENCE IF NOT EXISTS "public"."bandwidth_usage_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."bandwidth_usage_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."bandwidth_usage_id_seq" OWNED BY "public"."bandwidth_usage"."id";

CREATE TABLE IF NOT EXISTS "public"."channel_devices" (
    "created_at" timestamp with time zone DEFAULT "now"(),
    "channel_id" bigint NOT NULL,
    "app_id" character varying NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "device_id" "text" NOT NULL,
    "id" bigint NOT NULL,
    "owner_org" "uuid" NOT NULL
);

ALTER TABLE "public"."channel_devices" OWNER TO "postgres";

ALTER TABLE "public"."channel_devices" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."channel_devices_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE IF NOT EXISTS "public"."channels" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" character varying NOT NULL,
    "app_id" character varying NOT NULL,
    "version" bigint NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "public" boolean DEFAULT false NOT NULL,
    "disableAutoUpdateUnderNative" boolean DEFAULT true NOT NULL,
    "enableAbTesting" boolean DEFAULT false NOT NULL,
    "enable_progressive_deploy" boolean DEFAULT false NOT NULL,
    "secondaryVersionPercentage" double precision DEFAULT '0'::double precision NOT NULL,
    "secondVersion" bigint,
    "beta" boolean DEFAULT false NOT NULL,
    "ios" boolean DEFAULT true NOT NULL,
    "android" boolean DEFAULT true NOT NULL,
    "allow_device_self_set" boolean DEFAULT false NOT NULL,
    "allow_emulator" boolean DEFAULT true NOT NULL,
    "allow_dev" boolean DEFAULT true NOT NULL,
    "disableAutoUpdate" "public"."disable_update" DEFAULT 'major'::"public"."disable_update" NOT NULL,
    "owner_org" "uuid" NOT NULL,
    "created_by" "uuid"
);

ALTER TABLE "public"."channels" OWNER TO "postgres";

ALTER TABLE "public"."channels" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."channel_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE IF NOT EXISTS "public"."daily_bandwidth" (
    "id" integer NOT NULL,
    "app_id" character varying(255) NOT NULL,
    "date" "date" NOT NULL,
    "bandwidth" bigint NOT NULL
);

ALTER TABLE "public"."daily_bandwidth" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."daily_bandwidth_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."daily_bandwidth_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."daily_bandwidth_id_seq" OWNED BY "public"."daily_bandwidth"."id";

CREATE TABLE IF NOT EXISTS "public"."daily_mau" (
    "id" integer NOT NULL,
    "app_id" character varying(255) NOT NULL,
    "date" "date" NOT NULL,
    "mau" bigint NOT NULL
);

ALTER TABLE "public"."daily_mau" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."daily_mau_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."daily_mau_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."daily_mau_id_seq" OWNED BY "public"."daily_mau"."id";

CREATE TABLE IF NOT EXISTS "public"."daily_storage" (
    "id" integer NOT NULL,
    "app_id" character varying(255) NOT NULL,
    "date" "date" NOT NULL,
    "storage" bigint NOT NULL
);

ALTER TABLE "public"."daily_storage" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."daily_storage_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

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
    "created_at" timestamp with time zone DEFAULT "now"(),
    "email" character varying NOT NULL,
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL
);

ALTER TABLE "public"."deleted_account" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."device_usage" (
    "id" integer NOT NULL,
    "device_id" character varying(255) NOT NULL,
    "app_id" character varying(255) NOT NULL,
    "timestamp" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE "public"."device_usage" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."device_usage_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."device_usage_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."device_usage_id_seq" OWNED BY "public"."device_usage"."id";

CREATE TABLE IF NOT EXISTS "public"."devices" (
    "updated_at" timestamp with time zone NOT NULL,
    "device_id" "text" NOT NULL,
    "version" bigint NOT NULL,
    "app_id" character varying NOT NULL,
    "platform" "public"."platform_os",
    "plugin_version" "text" DEFAULT '2.3.3'::"text" NOT NULL,
    "os_version" character varying,
    "version_build" "text" DEFAULT 'builtin'::"text",
    "custom_id" "text" DEFAULT ''::"text" NOT NULL,
    "is_prod" boolean DEFAULT true,
    "is_emulator" boolean DEFAULT false
);

ALTER TABLE "public"."devices" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."devices_override" (
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "device_id" "text" NOT NULL,
    "version" bigint NOT NULL,
    "app_id" character varying NOT NULL,
    "id" bigint NOT NULL,
    "owner_org" "uuid" NOT NULL
);

ALTER TABLE "public"."devices_override" OWNER TO "postgres";

ALTER TABLE "public"."devices_override" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."devices_override_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE IF NOT EXISTS "public"."global_stats" (
    "created_at" timestamp with time zone DEFAULT "now"(),
    "date_id" character varying NOT NULL,
    "apps" bigint NOT NULL,
    "updates" bigint NOT NULL,
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
    "paying_monthly" integer DEFAULT 0
);

ALTER TABLE "public"."global_stats" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."job_queue" (
    "job_id" integer NOT NULL,
    "job_type" "text" NOT NULL,
    "payload" "text" NOT NULL,
    "function_type" "text",
    "function_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "status" "public"."queue_job_status" DEFAULT 'inserted'::"public"."queue_job_status" NOT NULL,
    "request_id" bigint,
    "extra_info" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "job_queue_job_type_check" CHECK (("job_type" = ANY (ARRAY['TRIGGER'::"text", 'APP_DELETE'::"text", 'APP_VERSION_DELETE'::"text", 'DEVICE_DELETE'::"text"])))
);

ALTER TABLE "public"."job_queue" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."job_queue_job_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."job_queue_job_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."job_queue_job_id_seq" OWNED BY "public"."job_queue"."job_id";

CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "last_send_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "total_send" bigint DEFAULT '1'::bigint NOT NULL,
    "owner_org" "uuid" NOT NULL,
    "event" character varying(255) NOT NULL,
    "uniq_id" character varying(255) NOT NULL
);

ALTER TABLE "public"."notifications" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."org_users" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "app_id" character varying,
    "channel_id" bigint,
    "user_right" "public"."user_min_right"
);

ALTER TABLE "public"."org_users" OWNER TO "postgres";

ALTER TABLE "public"."org_users" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."org_users_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE IF NOT EXISTS "public"."orgs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "logo" "text",
    "name" "text" NOT NULL,
    "management_email" "text" NOT NULL,
    "customer_id" character varying
);

ALTER TABLE "public"."orgs" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."plans" (
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" character varying DEFAULT ''::character varying NOT NULL,
    "description" character varying DEFAULT ''::character varying NOT NULL,
    "price_m" bigint DEFAULT '0'::bigint NOT NULL,
    "price_y" bigint DEFAULT '0'::bigint NOT NULL,
    "stripe_id" character varying DEFAULT ''::character varying NOT NULL,
    "version" bigint DEFAULT '0'::bigint NOT NULL,
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
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
    "action" "text" NOT NULL,
    "device_id" "text" NOT NULL,
    "version" bigint NOT NULL,
    "app_id" character varying NOT NULL
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

CREATE SEQUENCE IF NOT EXISTS "public"."storage_usage_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."storage_usage_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."storage_usage_id_seq" OWNED BY "public"."storage_usage"."id";

CREATE TABLE IF NOT EXISTS "public"."stripe_info" (
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "subscription_id" character varying,
    "customer_id" character varying NOT NULL,
    "status" "public"."stripe_status",
    "product_id" character varying NOT NULL,
    "trial_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "price_id" character varying,
    "is_good_plan" boolean DEFAULT true,
    "plan_usage" bigint DEFAULT '0'::bigint,
    "subscription_metered" "json" DEFAULT '{}'::"json" NOT NULL,
    "subscription_anchor_start" timestamp with time zone DEFAULT "now"() NOT NULL,
    "subscription_anchor_end" timestamp with time zone DEFAULT "public"."one_month_ahead"() NOT NULL
);

ALTER TABLE "public"."stripe_info" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."users" (
    "created_at" timestamp with time zone DEFAULT "now"(),
    "image_url" character varying,
    "first_name" character varying,
    "last_name" character varying,
    "country" character varying,
    "email" character varying NOT NULL,
    "id" "uuid" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "enableNotifications" boolean DEFAULT false NOT NULL,
    "optForNewsletters" boolean DEFAULT false NOT NULL,
    "legalAccepted" boolean DEFAULT false NOT NULL,
    "customer_id" character varying,
    "billing_email" "text"
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
    "app_id" character varying(255) NOT NULL,
    "version_id" bigint NOT NULL,
    "action" character varying(20) NOT NULL
);

ALTER TABLE "public"."version_usage" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."workers" (
    "id" integer NOT NULL,
    "locked" boolean DEFAULT false NOT NULL
);

ALTER TABLE "public"."workers" OWNER TO "postgres";

CREATE SEQUENCE IF NOT EXISTS "public"."workers_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE "public"."workers_id_seq" OWNER TO "postgres";

ALTER SEQUENCE "public"."workers_id_seq" OWNED BY "public"."workers"."id";

ALTER TABLE ONLY "public"."bandwidth_usage" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."bandwidth_usage_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."daily_bandwidth" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."daily_bandwidth_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."daily_mau" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."daily_mau_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."daily_storage" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."daily_storage_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."device_usage" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."device_usage_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."job_queue" ALTER COLUMN "job_id" SET DEFAULT "nextval"('"public"."job_queue_job_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."storage_usage" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."storage_usage_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."workers" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."workers_id_seq"'::"regclass");

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
    ADD CONSTRAINT "channel_devices_pkey" PRIMARY KEY ("device_id");

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

ALTER TABLE ONLY "public"."device_usage"
    ADD CONSTRAINT "device_usage_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."devices_override"
    ADD CONSTRAINT "devices_override_pkey" PRIMARY KEY ("device_id");

ALTER TABLE ONLY "public"."devices"
    ADD CONSTRAINT "devices_pkey" PRIMARY KEY ("app_id", "device_id");

ALTER TABLE ONLY "public"."global_stats"
    ADD CONSTRAINT "global_stats_pkey" PRIMARY KEY ("date_id");

ALTER TABLE ONLY "public"."job_queue"
    ADD CONSTRAINT "job_queue_pkey" PRIMARY KEY ("job_id");

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

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_customer_id_key" UNIQUE ("customer_id");

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."version_meta"
    ADD CONSTRAINT "version_meta_pkey" PRIMARY KEY ("timestamp", "app_id", "version_id", "size");

ALTER TABLE ONLY "public"."version_usage"
    ADD CONSTRAINT "version_usage_pkey" PRIMARY KEY ("timestamp", "app_id", "version_id", "action");

ALTER TABLE ONLY "public"."workers"
    ADD CONSTRAINT "workers_pkey" PRIMARY KEY ("id");

CREATE INDEX "app_versions_meta_app_id_idx" ON "public"."app_versions_meta" USING "btree" ("app_id");

CREATE INDEX "idx_app_id_app_versions" ON "public"."app_versions" USING "btree" ("app_id");

CREATE INDEX "devices_app_id_device_id_updated_at_idx" ON "public"."devices" USING "btree" ("app_id", "device_id", "updated_at");

CREATE INDEX "devices_app_id_updated_at_idx" ON "public"."devices" USING "btree" ("app_id", "updated_at");

CREATE INDEX "idx_app_id_created_at_devices" ON "public"."devices" USING "btree" ("app_id", "updated_at");

CREATE INDEX "idx_app_id_version_devices" ON "public"."devices" USING "btree" ("app_id", "version");

CREATE INDEX "idx_app_id_device_id_channel_devices" ON "public"."channel_devices" USING "btree" ("app_id", "device_id");

CREATE INDEX "idx_app_id_device_id_devices_override" ON "public"."devices_override" USING "btree" ("app_id", "device_id");

CREATE INDEX "idx_app_id_name_app_versions" ON "public"."app_versions" USING "btree" ("app_id", "name");

CREATE INDEX "idx_app_id_public_channel" ON "public"."channels" USING "btree" ("app_id", "public");

CREATE INDEX "idx_app_versions_created_at" ON "public"."app_versions" USING "btree" ("created_at");

CREATE INDEX "idx_app_versions_deleted" ON "public"."app_versions" USING "btree" ("deleted");

CREATE INDEX "idx_app_versions_id" ON "public"."app_versions" USING "btree" ("id");

CREATE INDEX "idx_app_versions_meta_id" ON "public"."app_versions_meta" USING "btree" ("id");

CREATE INDEX "idx_app_versions_name" ON "public"."app_versions" USING "btree" ("name");

CREATE INDEX "idx_bandwidth_usage_app_id" ON "public"."bandwidth_usage" USING "btree" ("app_id");

CREATE INDEX "idx_bandwidth_usage_device_id" ON "public"."bandwidth_usage" USING "btree" ("device_id");

CREATE INDEX "idx_bandwidth_usage_timestamp" ON "public"."bandwidth_usage" USING "btree" ("timestamp");

CREATE INDEX "idx_daily_bandwidth_app_id_date" ON "public"."daily_bandwidth" USING "btree" ("app_id", "date");

CREATE INDEX "idx_daily_mau_app_id_date" ON "public"."daily_mau" USING "btree" ("app_id", "date");

CREATE INDEX "idx_daily_storage_app_id_date" ON "public"."daily_storage" USING "btree" ("app_id", "date");

CREATE INDEX "idx_daily_version_app_id" ON "public"."daily_version" USING "btree" ("app_id");

CREATE INDEX "idx_daily_version_date" ON "public"."daily_version" USING "btree" ("date");

CREATE INDEX "idx_daily_version_version" ON "public"."daily_version" USING "btree" ("version_id");

CREATE INDEX "idx_device_usage_app_id" ON "public"."device_usage" USING "btree" ("app_id");

CREATE INDEX "idx_device_usage_device_id" ON "public"."device_usage" USING "btree" ("device_id");

CREATE INDEX "idx_device_usage_timestamp" ON "public"."device_usage" USING "btree" ("timestamp");

CREATE INDEX "idx_stats_app_id_action" ON "public"."stats" USING "btree" ("app_id", "action");

CREATE INDEX "idx_stats_app_id_created_at" ON "public"."stats" USING "btree" ("app_id", "created_at");

CREATE INDEX "idx_stats_app_id_device_id" ON "public"."stats" USING "btree" ("app_id", "device_id");

CREATE INDEX "idx_stats_app_id_version" ON "public"."stats" USING "btree" ("app_id", "version");

CREATE INDEX "org_users_app_id_idx" ON "public"."org_users" USING "btree" ("app_id");

CREATE OR REPLACE TRIGGER "check_if_org_can_exist_org_users" AFTER DELETE ON "public"."org_users" FOR EACH ROW EXECUTE FUNCTION "public"."check_if_org_can_exist"();

CREATE OR REPLACE TRIGGER "force_valid_owner_org_app_versions" BEFORE INSERT OR UPDATE ON "public"."app_versions" FOR EACH ROW EXECUTE FUNCTION "public"."auto_owner_org_by_app_id"();

CREATE OR REPLACE TRIGGER "force_valid_owner_org_app_versions_meta" BEFORE INSERT OR UPDATE ON "public"."app_versions_meta" FOR EACH ROW EXECUTE FUNCTION "public"."auto_owner_org_by_app_id"();

CREATE OR REPLACE TRIGGER "force_valid_owner_org_channel_devices" BEFORE INSERT OR UPDATE ON "public"."channel_devices" FOR EACH ROW EXECUTE FUNCTION "public"."auto_owner_org_by_app_id"();

CREATE OR REPLACE TRIGGER "force_valid_owner_org_channels" BEFORE INSERT OR UPDATE ON "public"."channels" FOR EACH ROW EXECUTE FUNCTION "public"."auto_owner_org_by_app_id"();

CREATE OR REPLACE TRIGGER "force_valid_owner_org_devices_override" BEFORE INSERT OR UPDATE ON "public"."devices_override" FOR EACH ROW EXECUTE FUNCTION "public"."auto_owner_org_by_app_id"();

CREATE OR REPLACE TRIGGER "force_valid_user_id_apps" BEFORE INSERT OR UPDATE ON "public"."apps" FOR EACH ROW EXECUTE FUNCTION "public"."force_valid_user_id_on_app"();

CREATE OR REPLACE TRIGGER "generate_org_on_user_create" AFTER INSERT ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."generate_org_on_user_create"();

CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."apikeys" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');

CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."app_versions" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');

CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."app_versions_meta" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');

CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."apps" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');

CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."channel_devices" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');

CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."channels" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');

CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."devices_override" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');

CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."org_users" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');

CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."plans" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');

CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."stripe_info" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');

CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');

CREATE OR REPLACE TRIGGER "noupdate" BEFORE UPDATE ON "public"."channels" FOR EACH ROW EXECUTE FUNCTION "public"."noupdate"();

CREATE OR REPLACE TRIGGER "on_app_create" AFTER INSERT ON "public"."apps" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('on_app_create');

CREATE OR REPLACE TRIGGER "on_channel_update" AFTER UPDATE ON "public"."channels" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('on_channel_update');

CREATE OR REPLACE TRIGGER "on_org_create" AFTER INSERT ON "public"."orgs" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('on_organization_create');

CREATE OR REPLACE TRIGGER "on_organization_delete" AFTER DELETE ON "public"."orgs" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('on_organization_delete');

CREATE OR REPLACE TRIGGER "on_user_create" AFTER INSERT ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('on_user_create');

CREATE OR REPLACE TRIGGER "on_user_update" AFTER UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('on_user_update');

CREATE OR REPLACE TRIGGER "on_version_create" AFTER INSERT ON "public"."app_versions" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('on_version_create');

CREATE OR REPLACE TRIGGER "on_version_delete" AFTER DELETE ON "public"."app_versions" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('on_version_delete');

CREATE OR REPLACE TRIGGER "on_version_update" AFTER UPDATE ON "public"."app_versions" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('on_version_update');

CREATE OR REPLACE TRIGGER "prevent_steal_org" BEFORE UPDATE ON "public"."orgs" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_steal_org"();

CREATE OR REPLACE TRIGGER "zzz_guard_r2_path" BEFORE INSERT OR UPDATE ON "public"."app_versions" FOR EACH ROW EXECUTE FUNCTION "public"."guard_r2_path"();

ALTER TABLE ONLY "public"."apikeys"
    ADD CONSTRAINT "apikeys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."app_versions"
    ADD CONSTRAINT "app_versions_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."app_versions_meta"
    ADD CONSTRAINT "app_versions_meta_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."app_versions_meta"
    ADD CONSTRAINT "app_versions_meta_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."app_versions"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."apps"
    ADD CONSTRAINT "apps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."channel_devices"
    ADD CONSTRAINT "channel_devices_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."channel_devices"
    ADD CONSTRAINT "channel_devices_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "channels_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "channels_secondVersion_fkey" FOREIGN KEY ("secondVersion") REFERENCES "public"."app_versions"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "channels_version_fkey" FOREIGN KEY ("version") REFERENCES "public"."app_versions"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."devices_override"
    ADD CONSTRAINT "devices_override_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."devices_override"
    ADD CONSTRAINT "devices_override_version_fkey" FOREIGN KEY ("version") REFERENCES "public"."app_versions"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."org_users"
    ADD CONSTRAINT "org_users_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."org_users"
    ADD CONSTRAINT "org_users_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."org_users"
    ADD CONSTRAINT "org_users_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."org_users"
    ADD CONSTRAINT "org_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."orgs"
    ADD CONSTRAINT "orgs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."orgs"
    ADD CONSTRAINT "orgs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."stripe_info"("customer_id");

ALTER TABLE ONLY "public"."apps"
    ADD CONSTRAINT "owner_org_id_fkey" FOREIGN KEY ("owner_org") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."app_versions"
    ADD CONSTRAINT "owner_org_id_fkey" FOREIGN KEY ("owner_org") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."app_versions_meta"
    ADD CONSTRAINT "owner_org_id_fkey" FOREIGN KEY ("owner_org") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."channel_devices"
    ADD CONSTRAINT "owner_org_id_fkey" FOREIGN KEY ("owner_org") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."devices_override"
    ADD CONSTRAINT "owner_org_id_fkey" FOREIGN KEY ("owner_org") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "owner_org_id_fkey" FOREIGN KEY ("owner_org") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "owner_org_id_fkey" FOREIGN KEY ("owner_org") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."stripe_info"
    ADD CONSTRAINT "stripe_info_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."plans"("stripe_id");

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."stripe_info"("customer_id");

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

-- CREATE POLICY "Allow all for auth (admin+)" ON "public"."channels" TO "authenticated" USING ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity"(), "owner_org", "app_id", NULL::bigint)) WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity"(), "owner_org", "app_id", NULL::bigint));

CREATE POLICY "Allow all for auth (super_admin+)" ON "public"."app_versions" TO "authenticated" USING ("public"."check_min_rights"('super_admin'::"public"."user_min_right", "public"."get_identity"(), "owner_org", "app_id", NULL::bigint)) WITH CHECK ("public"."check_min_rights"('super_admin'::"public"."user_min_right", "public"."get_identity"(), "owner_org", "app_id", NULL::bigint));

CREATE POLICY "Allow all for auth (super_admin+)" ON "public"."apps" TO "authenticated" USING ("public"."check_min_rights"('super_admin'::"public"."user_min_right", "public"."get_identity"(), "owner_org", "app_id", NULL::bigint)) WITH CHECK ("public"."check_min_rights"('super_admin'::"public"."user_min_right", "public"."get_identity"(), "owner_org", "app_id", NULL::bigint));

CREATE POLICY "Allow anon to select" ON "public"."global_stats" FOR SELECT TO "anon" USING (true);

CREATE POLICY "Allow apikey to read" ON "public"."stats" FOR SELECT TO "anon" USING ("public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{all,write}'::"public"."key_mode"[], "app_id"));

CREATE POLICY "Allow delete for auth (write+)" ON "public"."channel_devices" FOR DELETE TO "authenticated" USING ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity"(), "owner_org", "app_id", NULL::bigint));

CREATE POLICY "Allow delete for auth (write+)" ON "public"."devices_override" FOR DELETE TO "authenticated" USING ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity"(), "owner_org", "app_id", NULL::bigint));

CREATE POLICY "Allow for auth, api keys (read+)" ON "public"."app_versions" FOR SELECT TO "authenticated", "anon" USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity"('{read,upload,write,all}'::"public"."key_mode"[]), "owner_org", "app_id", NULL::bigint));

CREATE POLICY "Allow for auth, api keys (read+)" ON "public"."apps" FOR SELECT TO "authenticated", "anon" USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity"('{read,upload,write,all}'::"public"."key_mode"[]), "owner_org", "app_id", NULL::bigint));

CREATE POLICY "Allow insert for api keys (write,all,upload) (upload+)" ON "public"."app_versions" FOR INSERT TO "authenticated", "anon" WITH CHECK ("public"."check_min_rights"('upload'::"public"."user_min_right", "public"."get_identity_apikey_only"('{write,all,upload}'::"public"."key_mode"[]), "owner_org", "app_id", NULL::bigint));

CREATE POLICY "Allow insert for apikey (write,all) (admin+)" ON "public"."apps" FOR INSERT TO "anon" WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity_apikey_only"('{write,all}'::"public"."key_mode"[]), "owner_org", NULL::character varying, NULL::bigint));

CREATE POLICY "Allow insert for auth (write+)" ON "public"."channel_devices" FOR INSERT TO "authenticated" WITH CHECK ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity"(), "owner_org", "app_id", NULL::bigint));

CREATE POLICY "Allow insert for auth (write+)" ON "public"."devices_override" FOR INSERT TO "authenticated" WITH CHECK ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity"(), "owner_org", "app_id", NULL::bigint));

CREATE POLICY "Allow insert for auth, api keys (write, all) (admin+)" ON "public"."channels" FOR INSERT TO "authenticated", "anon" WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity"('{write,all}'::"public"."key_mode"[]), "owner_org", "app_id", NULL::bigint));

CREATE POLICY "Allow memeber and owner to select" ON "public"."org_users" FOR SELECT USING (("public"."is_member_of_org"((select auth.uid()), "org_id") OR "public"."is_owner_of_org"((select auth.uid()), "org_id")));

CREATE POLICY "Allow org admin to all" ON "public"."org_users" TO "authenticated" USING ("public"."check_min_rights"('admin'::"public"."user_min_right", (select auth.uid()), "org_id", NULL::character varying, NULL::bigint)) WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", (select auth.uid()), "org_id", NULL::character varying, NULL::bigint));

CREATE POLICY "Allow org members to select" ON "public"."devices" FOR SELECT USING ("public"."check_min_rights"('read'::"public"."user_min_right", (select auth.uid()), "public"."get_user_main_org_id_by_app_id"(("app_id")::"text"), "app_id", NULL::bigint));

CREATE POLICY "Allow org owner to all" ON "public"."org_users" TO "authenticated" USING ("public"."is_owner_of_org"((select auth.uid()), "org_id")) WITH CHECK ("public"."is_owner_of_org"((select auth.uid()), "org_id"));

CREATE POLICY "Allow owner to update" ON "public"."devices" FOR UPDATE TO "authenticated" USING ("public"."is_app_owner"((select auth.uid()), "app_id")) WITH CHECK ("public"."is_app_owner"((select auth.uid()), "app_id"));

CREATE POLICY "Allow read for auth (read+)" ON "public"."app_versions_meta" FOR SELECT TO "authenticated", "anon" USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity"(), "owner_org", "app_id", NULL::bigint));

CREATE POLICY "Allow read for auth (read+)" ON "public"."channel_devices" FOR SELECT TO "authenticated" USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity"(), "owner_org", "app_id", NULL::bigint));

CREATE POLICY "Allow read for auth (read+)" ON "public"."daily_bandwidth" FOR SELECT TO "authenticated" USING ("public"."has_app_right_userid"("app_id", 'read'::"public"."user_min_right", "public"."get_identity"()));

CREATE POLICY "Allow read for auth (read+)" ON "public"."daily_mau" FOR SELECT TO "authenticated" USING ("public"."has_app_right_userid"("app_id", 'read'::"public"."user_min_right", "public"."get_identity"()));

CREATE POLICY "Allow read for auth (read+)" ON "public"."daily_storage" FOR SELECT TO "authenticated" USING ("public"."has_app_right_userid"("app_id", 'read'::"public"."user_min_right", "public"."get_identity"()));

CREATE POLICY "Allow read for auth (read+)" ON "public"."daily_version" FOR SELECT TO "authenticated" USING ("public"."has_app_right_userid"("app_id", 'read'::"public"."user_min_right", "public"."get_identity"()));

CREATE POLICY "Allow read for auth (read+)" ON "public"."devices" FOR SELECT TO "authenticated" USING ("public"."has_app_right_userid"("app_id", 'read'::"public"."user_min_right", "public"."get_identity"()));

CREATE POLICY "Allow read for auth (read+)" ON "public"."devices_override" FOR SELECT TO "authenticated" USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity"(), "owner_org", "app_id", NULL::bigint));

CREATE POLICY "Allow read for auth (read+)" ON "public"."stats" FOR SELECT TO "authenticated" USING ("public"."has_app_right_userid"("app_id", 'read'::"public"."user_min_right", "public"."get_identity"()));

CREATE POLICY "Allow select app owner" ON "public"."devices" FOR SELECT TO "authenticated" USING (("public"."is_app_owner"((select auth.uid()), "app_id") OR "public"."is_admin"((select auth.uid()))));

CREATE POLICY "Allow select for auth, api keys (read+)" ON "public"."channels" FOR SELECT TO "authenticated", "anon" USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity"('{read,upload,write,all}'::"public"."key_mode"[]), "owner_org", "app_id", NULL::bigint));

CREATE POLICY "Allow select for auth, api keys (read+)" ON "public"."orgs" FOR SELECT TO "authenticated", "anon" USING ("public"."check_min_rights"('read'::"public"."user_min_right", "public"."get_identity"('{read,upload,write,all}'::"public"."key_mode"[]), "id", NULL::character varying, NULL::bigint));

CREATE POLICY "Allow self to modify self" ON "public"."users" TO "authenticated" USING (((((select auth.uid()) = "id") AND "public"."is_not_deleted"((select auth.email())::character varying)) OR "public"."is_admin"((select auth.uid())))) WITH CHECK (((((select auth.uid()) = "id") AND "public"."is_not_deleted"((select auth.email())::character varying)) OR "public"."is_admin"((select auth.uid()))));

CREATE POLICY "Allow to self delete" ON "public"."org_users" FOR DELETE USING (("user_id" = (select auth.uid())));

CREATE POLICY "Allow update for api keys (write,all,upload) (upload+)" ON "public"."app_versions" FOR UPDATE TO "authenticated", "anon" USING ("public"."check_min_rights"('upload'::"public"."user_min_right", "public"."get_identity_apikey_only"('{write,all,upload}'::"public"."key_mode"[]), "owner_org", "app_id", NULL::bigint)) WITH CHECK ("public"."check_min_rights"('upload'::"public"."user_min_right", "public"."get_identity_apikey_only"('{write,all,upload}'::"public"."key_mode"[]), "owner_org", "app_id", NULL::bigint));

CREATE POLICY "Allow update for auth (admin+)" ON "public"."orgs" FOR UPDATE TO "authenticated" USING ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity"(), "id", NULL::character varying, NULL::bigint)) WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity"(), "id", NULL::character varying, NULL::bigint));

CREATE POLICY "Allow update for auth (write+)" ON "public"."app_versions" FOR UPDATE TO "authenticated", "anon" USING ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity"(), "owner_org", "app_id", NULL::bigint)) WITH CHECK ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity"(), "owner_org", "app_id", NULL::bigint));

CREATE POLICY "Allow update for auth, api keys (write, all) (admin+)" ON "public"."apps" FOR UPDATE TO "authenticated", "anon" USING ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity"('{write,all}'::"public"."key_mode"[]), "owner_org", "app_id", NULL::bigint)) WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity"('{write,all}'::"public"."key_mode"[]), "owner_org", "app_id", NULL::bigint));

CREATE POLICY "Allow update for auth, api keys (write, all, upload) (write+)" ON "public"."channels" FOR UPDATE TO "authenticated", "anon" USING ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity"('{write,all,upload}'::"public"."key_mode"[]), "owner_org", "app_id", NULL::bigint)) WITH CHECK ("public"."check_min_rights"('write'::"public"."user_min_right", "public"."get_identity"('{write,all,upload}'::"public"."key_mode"[]), "owner_org", "app_id", NULL::bigint));

CREATE POLICY "Allow user to self get" ON "public"."stripe_info" FOR SELECT TO "authenticated" USING ((((select auth.uid()) IN ( SELECT "users"."id"
   FROM "public"."users"
  WHERE (("users"."customer_id")::"text" = ("users"."customer_id")::"text"))) OR "public"."is_admin"((select auth.uid()))));

CREATE POLICY "Disable for all" ON "public"."bandwidth_usage" USING (false) WITH CHECK (false);

CREATE POLICY "Disable for all" ON "public"."device_usage" USING (false) WITH CHECK (false);

CREATE POLICY "Disable for all" ON "public"."notifications" USING (false) WITH CHECK (false);

CREATE POLICY "Disable for all" ON "public"."storage_usage" USING (false) WITH CHECK (false);

CREATE POLICY "Disable for all" ON "public"."version_meta" USING (false) WITH CHECK (false);

CREATE POLICY "Disable for all" ON "public"."job_queue" USING (false) WITH CHECK (false);

CREATE POLICY "Disable for all" ON "public"."workers" USING (false) WITH CHECK (false);

CREATE POLICY "Disable for all" ON "public"."version_usage" USING (false) WITH CHECK (false);

CREATE POLICY "Enable all for user based on user_id" ON "public"."apikeys" TO "authenticated" USING ((((select auth.uid()) = "user_id") OR "public"."is_admin"((select auth.uid())))) WITH CHECK ((((select auth.uid()) = "user_id") OR "public"."is_admin"((select auth.uid()))));

CREATE POLICY "Enable select for anyone" ON "public"."plans" FOR SELECT TO "authenticated", "anon" USING (true);

CREATE POLICY "Prevent non 2FA access" ON "public"."apikeys" AS RESTRICTIVE TO "authenticated" USING ("public"."verify_mfa"());

CREATE POLICY "Prevent non 2FA access" ON "public"."app_versions" AS RESTRICTIVE TO "authenticated" USING ("public"."verify_mfa"());

CREATE POLICY "Prevent non 2FA access" ON "public"."apps" AS RESTRICTIVE TO "authenticated" USING ("public"."verify_mfa"());

CREATE POLICY "Prevent non 2FA access" ON "public"."channel_devices" AS RESTRICTIVE TO "authenticated" USING ("public"."verify_mfa"());

CREATE POLICY "Prevent non 2FA access" ON "public"."channels" AS RESTRICTIVE TO "authenticated" USING ("public"."verify_mfa"());

CREATE POLICY "Prevent non 2FA access" ON "public"."devices_override" AS RESTRICTIVE TO "authenticated" USING ("public"."verify_mfa"());

CREATE POLICY "Prevent non 2FA access" ON "public"."org_users" AS RESTRICTIVE TO "authenticated" USING ("public"."verify_mfa"());

CREATE POLICY "Prevent non 2FA access" ON "public"."orgs" AS RESTRICTIVE TO "authenticated" USING ("public"."verify_mfa"());

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

ALTER TABLE "public"."device_usage" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."devices" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."devices_override" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."global_stats" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."job_queue" ENABLE ROW LEVEL SECURITY;

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

ALTER TABLE "public"."workers" ENABLE ROW LEVEL SECURITY;

ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";

REVOKE USAGE ON SCHEMA "public" FROM PUBLIC;
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

GRANT ALL ON FUNCTION "public"."accept_invitation_to_org"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_invitation_to_org"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_invitation_to_org"("org_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."auto_owner_org_by_app_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_owner_org_by_app_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_owner_org_by_app_id"() TO "service_role";

GRANT ALL ON FUNCTION "public"."check_if_org_can_exist"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_if_org_can_exist"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_if_org_can_exist"() TO "service_role";

GRANT ALL ON FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "service_role";

GRANT ALL ON FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "service_role";
GRANT ALL ON FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "authenticated";

GRANT ALL ON FUNCTION "public"."convert_bytes_to_gb"("byt" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."convert_bytes_to_gb"("byt" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."convert_bytes_to_gb"("byt" double precision) TO "service_role";

GRANT ALL ON FUNCTION "public"."convert_bytes_to_mb"("byt" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."convert_bytes_to_mb"("byt" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."convert_bytes_to_mb"("byt" double precision) TO "service_role";

GRANT ALL ON FUNCTION "public"."convert_gb_to_bytes"("gb" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."convert_gb_to_bytes"("gb" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."convert_gb_to_bytes"("gb" double precision) TO "service_role";

GRANT ALL ON FUNCTION "public"."convert_mb_to_bytes"("gb" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."convert_mb_to_bytes"("gb" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."convert_mb_to_bytes"("gb" double precision) TO "service_role";

GRANT ALL ON FUNCTION "public"."convert_number_to_percent"("val" double precision, "max_val" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."convert_number_to_percent"("val" double precision, "max_val" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."convert_number_to_percent"("val" double precision, "max_val" double precision) TO "service_role";

GRANT ALL ON FUNCTION "public"."count_active_users"("app_ids" character varying[]) TO "anon";
GRANT ALL ON FUNCTION "public"."count_active_users"("app_ids" character varying[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_active_users"("app_ids" character varying[]) TO "service_role";

REVOKE ALL ON FUNCTION "public"."count_all_need_upgrade"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."count_all_need_upgrade"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."count_all_onboarded"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."count_all_onboarded"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."count_all_plans_v2"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."count_all_plans_v2"() TO "service_role";

GRANT ALL ON FUNCTION "public"."delete_failed_jobs"() TO "anon";
GRANT ALL ON FUNCTION "public"."delete_failed_jobs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_failed_jobs"() TO "service_role";

GRANT ALL ON FUNCTION "public"."delete_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."delete_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_user"() TO "service_role";

GRANT ALL ON FUNCTION "public"."exist_app_v2"("appid" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."exist_app_v2"("appid" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."exist_app_v2"("appid" character varying) TO "service_role";

GRANT ALL ON FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."force_valid_user_id_on_app"() TO "anon";
GRANT ALL ON FUNCTION "public"."force_valid_user_id_on_app"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."force_valid_user_id_on_app"() TO "service_role";

GRANT ALL ON FUNCTION "public"."generate_org_on_user_create"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_org_on_user_create"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_org_on_user_create"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_apikey"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_apikey"() TO "service_role";

GRANT ALL ON FUNCTION "public"."get_app_metrics"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_app_metrics"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_app_metrics"("org_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_app_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_app_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_app_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_cloudflare_function_url"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_cloudflare_function_url"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_cloudflare_function_url"() TO "service_role";

GRANT ALL ON FUNCTION "public"."get_current_plan_max_org"("orgid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_plan_max_org"("orgid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_plan_max_org"("orgid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_current_plan_name_org"("orgid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_plan_name_org"("orgid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_plan_name_org"("orgid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_customer_counts"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_customer_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_customer_counts"() TO "service_role";

GRANT ALL ON FUNCTION "public"."get_cycle_info_org"("orgid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_cycle_info_org"("orgid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_cycle_info_org"("orgid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_db_url"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_db_url"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_db_url"() TO "service_role";

GRANT ALL ON FUNCTION "public"."get_global_metrics"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_global_metrics"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_global_metrics"("org_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_global_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_global_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_global_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_identity"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_identity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_identity"() TO "service_role";

GRANT ALL ON FUNCTION "public"."get_identity"("keymode" "public"."key_mode"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_identity"("keymode" "public"."key_mode"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_identity"("keymode" "public"."key_mode"[]) TO "service_role";

GRANT ALL ON FUNCTION "public"."get_identity_apikey_only"("keymode" "public"."key_mode"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_identity_apikey_only"("keymode" "public"."key_mode"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_identity_apikey_only"("keymode" "public"."key_mode"[]) TO "service_role";

GRANT ALL ON FUNCTION "public"."get_metered_usage"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_metered_usage"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_metered_usage"() TO "service_role";

GRANT ALL ON FUNCTION "public"."get_metered_usage"("orgid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_metered_usage"("orgid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_metered_usage"("orgid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_netlify_function_url"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_netlify_function_url"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_netlify_function_url"() TO "service_role";

GRANT ALL ON FUNCTION "public"."get_org_members"("guild_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_org_members"("guild_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_org_members"("guild_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_org_perm_for_apikey"("apikey" "text", "app_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_org_perm_for_apikey"("apikey" "text", "app_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_org_perm_for_apikey"("apikey" "text", "app_id" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_orgs_v5"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_orgs_v5"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_orgs_v5"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_orgs_v5"("userid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_orgs_v5"("userid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid", "cycle_start" "date", "cycle_end" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid", "cycle_start" "date", "cycle_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid", "cycle_start" "date", "cycle_end" "date") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_total_app_storage_size_orgs"("org_id" "uuid", "app_id" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."get_total_app_storage_size_orgs"("org_id" "uuid", "app_id" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_total_app_storage_size_orgs"("org_id" "uuid", "app_id" character varying) TO "service_role";

GRANT ALL ON FUNCTION "public"."get_total_metrics"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_total_metrics"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_total_metrics"("org_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_total_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_total_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_total_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_total_stats_v5_org"("orgid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_total_stats_v5_org"("orgid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_total_stats_v5_org"("orgid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_total_storage_size_org"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_total_storage_size_org"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_total_storage_size_org"("org_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_user_id"("apikey" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_id"("apikey" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_id"("apikey" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_user_id"("apikey" "text", "app_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_id"("apikey" "text", "app_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_id"("apikey" "text", "app_id" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_user_main_org_id_by_app_id"("app_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_main_org_id_by_app_id"("app_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_main_org_id_by_app_id"("app_id" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_weekly_stats"("app_id" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."get_weekly_stats"("app_id" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_weekly_stats"("app_id" character varying) TO "service_role";

GRANT ALL ON FUNCTION "public"."guard_r2_path"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_r2_path"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_r2_path"() TO "service_role";

GRANT ALL ON FUNCTION "public"."has_app_right"("appid" character varying, "right" "public"."user_min_right") TO "anon";
GRANT ALL ON FUNCTION "public"."has_app_right"("appid" character varying, "right" "public"."user_min_right") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_app_right"("appid" character varying, "right" "public"."user_min_right") TO "service_role";

REVOKE ALL ON FUNCTION "public"."has_app_right_userid"("appid" character varying, "right" "public"."user_min_right", "userid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_app_right_userid"("appid" character varying, "right" "public"."user_min_right", "userid" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."has_app_right_userid"("appid" character varying, "right" "public"."user_min_right", "userid" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."http_post_helper"("function_name" "text", "function_type" "text", "body" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."http_post_helper"("function_name" "text", "function_type" "text", "body" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_post_helper"("function_name" "text", "function_type" "text", "body" "jsonb") TO "service_role";

GRANT ALL ON FUNCTION "public"."invite_user_to_org"("email" character varying, "org_id" "uuid", "invite_type" "public"."user_min_right") TO "anon";
GRANT ALL ON FUNCTION "public"."invite_user_to_org"("email" character varying, "org_id" "uuid", "invite_type" "public"."user_min_right") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invite_user_to_org"("email" character varying, "org_id" "uuid", "invite_type" "public"."user_min_right") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";

GRANT ALL ON FUNCTION "public"."is_admin"("userid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"("userid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"("userid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_allowed_action"("apikey" "text", "appid" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_allowed_action"("apikey" "text", "appid" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_allowed_action"("apikey" "text", "appid" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_allowed_action_org"("orgid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_allowed_action_org"("orgid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_allowed_action_org"("orgid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[]) TO "service_role";

GRANT ALL ON FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[], "app_id" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[], "app_id" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[], "app_id" character varying) TO "service_role";

GRANT ALL ON FUNCTION "public"."is_app_owner"("appid" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."is_app_owner"("appid" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_app_owner"("appid" character varying) TO "service_role";

GRANT ALL ON FUNCTION "public"."is_app_owner"("apikey" "text", "appid" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."is_app_owner"("apikey" "text", "appid" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_app_owner"("apikey" "text", "appid" character varying) TO "service_role";

GRANT ALL ON FUNCTION "public"."is_app_owner"("userid" "uuid", "appid" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."is_app_owner"("userid" "uuid", "appid" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_app_owner"("userid" "uuid", "appid" character varying) TO "service_role";

GRANT ALL ON FUNCTION "public"."is_canceled_org"("orgid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_canceled_org"("orgid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_canceled_org"("orgid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_good_plan_v5_org"("orgid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_good_plan_v5_org"("orgid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_good_plan_v5_org"("orgid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_member_of_org"("user_id" "uuid", "org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_member_of_org"("user_id" "uuid", "org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_member_of_org"("user_id" "uuid", "org_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_not_deleted"("email_check" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."is_not_deleted"("email_check" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_not_deleted"("email_check" character varying) TO "service_role";

GRANT ALL ON FUNCTION "public"."is_onboarded_org"("orgid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_onboarded_org"("orgid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_onboarded_org"("orgid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_onboarding_needed_org"("orgid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_onboarding_needed_org"("orgid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_onboarding_needed_org"("orgid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_owner_of_org"("user_id" "uuid", "org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_owner_of_org"("user_id" "uuid", "org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_owner_of_org"("user_id" "uuid", "org_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_paying_and_good_plan_org"("orgid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_paying_and_good_plan_org"("orgid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_paying_and_good_plan_org"("orgid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_paying_org"("orgid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_paying_org"("orgid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_paying_org"("orgid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_trial_org"("orgid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_trial_org"("orgid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_trial_org"("orgid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."noupdate"() TO "anon";
GRANT ALL ON FUNCTION "public"."noupdate"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."noupdate"() TO "service_role";

GRANT ALL ON FUNCTION "public"."one_month_ahead"() TO "anon";
GRANT ALL ON FUNCTION "public"."one_month_ahead"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."one_month_ahead"() TO "service_role";

GRANT ALL ON FUNCTION "public"."prevent_steal_org"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_steal_org"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_steal_org"() TO "service_role";

GRANT ALL ON FUNCTION "public"."process_cron_stats_jobs"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_cron_stats_jobs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_cron_stats_jobs"() TO "service_role";

GRANT ALL ON FUNCTION "public"."process_current_jobs_if_unlocked"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."process_free_trial_expired"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_free_trial_expired"() TO "service_role";

GRANT ALL ON FUNCTION "public"."process_requested_jobs"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."process_subscribed_orgs"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_subscribed_orgs"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."read_bandwidth_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."read_bandwidth_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."read_device_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."read_device_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "service_role";

GRANT ALL ON FUNCTION "public"."read_storage_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."read_storage_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."read_storage_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "service_role";

GRANT ALL ON FUNCTION "public"."read_version_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."read_version_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."read_version_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."reset_and_seed_data"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_and_seed_data"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."reset_and_seed_stats_data"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_and_seed_stats_data"() TO "service_role";

GRANT ALL ON FUNCTION "public"."retry_failed_jobs"() TO "service_role";

GRANT ALL ON FUNCTION "public"."trigger_http_queue_post_to_function"() TO "service_role";

GRANT ALL ON PROCEDURE "public"."update_app_versions_retention"() TO "anon";
GRANT ALL ON PROCEDURE "public"."update_app_versions_retention"() TO "authenticated";
GRANT ALL ON PROCEDURE "public"."update_app_versions_retention"() TO "service_role";

GRANT ALL ON PROCEDURE "public"."update_channels_progressive_deploy"() TO "anon";
GRANT ALL ON PROCEDURE "public"."update_channels_progressive_deploy"() TO "authenticated";
GRANT ALL ON PROCEDURE "public"."update_channels_progressive_deploy"() TO "service_role";

GRANT ALL ON FUNCTION "public"."verify_mfa"() TO "anon";
GRANT ALL ON FUNCTION "public"."verify_mfa"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_mfa"() TO "service_role";

GRANT ALL ON TABLE "public"."apikeys" TO "anon";
GRANT ALL ON TABLE "public"."apikeys" TO "authenticated";
GRANT ALL ON TABLE "public"."apikeys" TO "service_role";

GRANT ALL ON SEQUENCE "public"."apikeys_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."apikeys_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."apikeys_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."app_versions" TO "anon";
GRANT ALL ON TABLE "public"."app_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."app_versions" TO "service_role";

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

GRANT ALL ON TABLE "public"."device_usage" TO "anon";
GRANT ALL ON TABLE "public"."device_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."device_usage" TO "service_role";

GRANT ALL ON SEQUENCE "public"."device_usage_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."device_usage_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."device_usage_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."devices" TO "anon";
GRANT ALL ON TABLE "public"."devices" TO "authenticated";
GRANT ALL ON TABLE "public"."devices" TO "service_role";

GRANT ALL ON TABLE "public"."devices_override" TO "anon";
GRANT ALL ON TABLE "public"."devices_override" TO "authenticated";
GRANT ALL ON TABLE "public"."devices_override" TO "service_role";

GRANT ALL ON SEQUENCE "public"."devices_override_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."devices_override_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."devices_override_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."global_stats" TO "anon";
GRANT ALL ON TABLE "public"."global_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."global_stats" TO "service_role";

GRANT ALL ON TABLE "public"."job_queue" TO "anon";
GRANT ALL ON TABLE "public"."job_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."job_queue" TO "service_role";

GRANT ALL ON SEQUENCE "public"."job_queue_job_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."job_queue_job_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."job_queue_job_id_seq" TO "service_role";

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

GRANT ALL ON TABLE "public"."storage_usage" TO "anon";
GRANT ALL ON TABLE "public"."storage_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."storage_usage" TO "service_role";

GRANT ALL ON SEQUENCE "public"."storage_usage_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."storage_usage_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."storage_usage_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."stripe_info" TO "anon";
GRANT ALL ON TABLE "public"."stripe_info" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_info" TO "service_role";

GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";

GRANT ALL ON TABLE "public"."version_meta" TO "anon";
GRANT ALL ON TABLE "public"."version_meta" TO "authenticated";
GRANT ALL ON TABLE "public"."version_meta" TO "service_role";

GRANT ALL ON TABLE "public"."version_usage" TO "anon";
GRANT ALL ON TABLE "public"."version_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."version_usage" TO "service_role";

GRANT ALL ON TABLE "public"."workers" TO "anon";
GRANT ALL ON TABLE "public"."workers" TO "authenticated";
GRANT ALL ON TABLE "public"."workers" TO "service_role";

GRANT ALL ON SEQUENCE "public"."workers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."workers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."workers_id_seq" TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";

RESET ALL;

--
-- Dumped schema changes for auth and storage
--

CREATE POLICY "All all users to act" ON "storage"."objects" USING (true) WITH CHECK (true);

CREATE POLICY "All user to manage they own folder 1ffg0oo_0" ON "storage"."objects" FOR DELETE USING ((("bucket_id" = 'images'::"text") AND ((((select auth.uid()))::"text" = ("storage"."foldername"("name"))[0]) OR ((("public"."get_user_id"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text")))::"text" = ("storage"."foldername"("name"))[0]) AND "public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{all}'::"public"."key_mode"[], (("storage"."foldername"("name"))[1])::character varying)))));

CREATE POLICY "All user to manage they own folder 1ffg0oo_1" ON "storage"."objects" FOR UPDATE USING ((("bucket_id" = 'images'::"text") AND ((((select auth.uid()))::"text" = ("storage"."foldername"("name"))[0]) OR ((("public"."get_user_id"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text")))::"text" = ("storage"."foldername"("name"))[0]) AND "public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{write,all}'::"public"."key_mode"[], (("storage"."foldername"("name"))[1])::character varying)))));

CREATE POLICY "All user to manage they own folder 1ffg0oo_2" ON "storage"."objects" FOR INSERT WITH CHECK ((("bucket_id" = 'images'::"text") AND ((((select auth.uid()))::"text" = ("storage"."foldername"("name"))[0]) OR ((("public"."get_user_id"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text")))::"text" = ("storage"."foldername"("name"))[0]) AND "public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{write,all}'::"public"."key_mode"[], (("storage"."foldername"("name"))[1])::character varying)))));

CREATE POLICY "All user to manage they own folder 1ffg0oo_3" ON "storage"."objects" FOR SELECT USING ((("bucket_id" = 'images'::"text") AND ((((select auth.uid()))::"text" = ("storage"."foldername"("name"))[0]) OR ((("public"."get_user_id"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text")))::"text" = ("storage"."foldername"("name"))[0]) AND "public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{read,all}'::"public"."key_mode"[], (("storage"."foldername"("name"))[1])::character varying)))));

CREATE POLICY "Disable act bucket for users" ON "storage"."buckets" USING (false) WITH CHECK (false);


/*---------------------
---- install dbdev ----
----------------------
Requires:
  - pg_tle: https://github.com/aws/pg_tle
  - pgsql-http: https://github.com/pramsey/pgsql-http
-- */
-- create extension if not exists http with schema extensions;
-- create extension if not exists pg_tle;
-- drop extension if exists "supabase-dbdev";
-- select pgtle.uninstall_extension_if_exists('supabase-dbdev');
-- select
--     pgtle.install_extension(
--         'supabase-dbdev',
--         resp.contents ->> 'version',
--         'PostgreSQL package manager',
--         resp.contents ->> 'sql'
--     )
-- from http(
--     (
--         'GET',
--         'https://api.database.dev/rest/v1/'
--         || 'package_versions?select=sql,version'
--         || '&package_name=eq.supabase-dbdev'
--         || '&order=version.desc'
--         || '&limit=1',
--         array[
--             (
--                 'apiKey',
--                 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJp'
--                 || 'c3MiOiJzdXBhYmFzZSIsInJlZiI6InhtdXB0cHBsZnZpaWZyY'
--                 || 'ndtbXR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE2ODAxMDczNzI'
--                 || 'sImV4cCI6MTk5NTY4MzM3Mn0.z2CN0mvO2No8wSi46Gw59DFGCTJ'
--                 || 'rzM0AQKsu_5k134s'
--             )::http_header
--         ],
--         null,
--         null
--     )
-- ) x,
-- lateral (
--     select
--         ((row_to_json(x) -> 'content') #>> '{}')::json -> 0
-- ) resp(contents);
-- create extension "supabase-dbdev";
-- select dbdev.install('supabase-dbdev');
-- drop extension if exists "supabase-dbdev";
-- create extension "supabase-dbdev";

-- select dbdev.install('basejump-supabase_test_helpers');
