
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

CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pgsodium" WITH SCHEMA "pgsodium";

ALTER SCHEMA "public" OWNER TO "postgres";

CREATE SCHEMA "stripe";

CREATE EXTENSION IF NOT EXISTS "http" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "moddatetime" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";

CREATE EXTENSION IF NOT EXISTS "pg_stat_monitor" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "postgres_fdw" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";

CREATE EXTENSION IF NOT EXISTS "supautils" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "wrappers" WITH SCHEMA "extensions";

CREATE TYPE "public"."key_mode" AS ENUM (
    'read',
    'write',
    'all',
    'upload'
);

CREATE TYPE "public"."usage_mode" AS ENUM (
    '5min',
    'day',
    'cycle'
);

CREATE TYPE "public"."platform_os" AS ENUM (
    'ios',
    'android'
);

CREATE TYPE "public"."stats_table" AS (
	"mau" bigint,
	"bandwidth" double precision,
	"storage" double precision
);

CREATE TYPE "public"."stripe_status" AS ENUM (
    'created',
    'succeeded',
    'updated',
    'failed',
    'deleted',
    'canceled'
);

CREATE TYPE "public"."user_min_right" AS ENUM (
    'read',
    'upload',
    'write',
    'admin'
);

CREATE TYPE "public"."user_role" AS ENUM (
    'read',
    'upload',
    'write',
    'admin'
);

CREATE FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    user_right_record RECORD;
BEGIN
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


CREATE FUNCTION "public"."convert_bytes_to_gb"("byt" double precision) RETURNS double precision
    LANGUAGE "plpgsql"
    AS $$
Begin
  RETURN byt / 1024.0 / 1024.0 / 1024.0;
End;
$$;


CREATE FUNCTION "public"."convert_bytes_to_mb"("byt" double precision) RETURNS double precision
    LANGUAGE "plpgsql"
    AS $$
Begin
  RETURN byt / 1024.0 / 1024.0;
End;
$$;


CREATE FUNCTION "public"."convert_gb_to_bytes"("gb" double precision) RETURNS double precision
    LANGUAGE "plpgsql"
    AS $$
Begin
  RETURN gb * 1024 * 1024 * 1024;
End;
$$;


CREATE FUNCTION "public"."convert_mb_to_bytes"("gb" double precision) RETURNS double precision
    LANGUAGE "plpgsql"
    AS $$
Begin
  RETURN gb * 1024 * 1024;
End;
$$;


CREATE FUNCTION "public"."convert_number_to_percent"("val" double precision, "max_val" double precision) RETURNS double precision
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN round(((val * 100) / max_val)::numeric, 2);
END;
$$;


CREATE FUNCTION "public"."count_all_apps"() RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
Begin
  RETURN (SELECT COUNT(*) FROM (
    SELECT app_id FROM apps
    UNION
    SELECT DISTINCT app_id FROM store_apps where (onprem = true or capgo = true) and url != ''
  ) AS temp);
End;  
$$;


CREATE FUNCTION "public"."count_all_need_upgrade"() RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
Begin
  RETURN (SELECT COUNT(*) FROM stripe_info WHERE is_good_plan = false AND status = 'succeeded');
End;  
$$;


CREATE FUNCTION "public"."count_all_onboarded"() RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
Begin
  RETURN (SELECT COUNT(DISTINCT user_id) FROM apps);
End;  
$$;


CREATE FUNCTION "public"."count_all_paying"() RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
Begin
  RETURN (SELECT COUNT(*) FROM stripe_info WHERE status = 'succeeded');
End;  
$$;


CREATE FUNCTION "public"."count_all_plans"() RETURNS TABLE("product_id" character varying, "count" bigint)
    LANGUAGE "plpgsql"
    AS $$
Begin
  RETURN QUERY (SELECT stripe_info.product_id, COUNT(*) AS count
    FROM stripe_info
    GROUP BY stripe_info.product_id);
End;  
$$;


CREATE FUNCTION "public"."count_all_trial"() RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
Begin
  RETURN (SELECT COUNT(*) FROM stripe_info WHERE trial_at > NOW());
End;  
$$;


CREATE FUNCTION "public"."count_all_updates"() RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
Begin
  RETURN (SELECT
(SELECT SUM(updates) + SUM(installs) FROM store_apps
WHERE (onprem = true) OR (capgo = true))+
(SELECT COUNT(*) FROM stats WHERE action='set')
AS SumCount);
End;  
$$;


CREATE FUNCTION "public"."exist_app_v2"("appid" character varying) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM apps
  WHERE app_id=appid));
End;  
$$;


CREATE FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM app_versions
  WHERE app_id=appid
  AND name=name_version
  AND user_id=get_user_id(apikey)));
End;  
$$;


CREATE FUNCTION "public"."exist_user"("e_mail" character varying) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT id
  FROM auth.users
  WHERE email=e_mail);
End;  
$$;


CREATE FUNCTION "public"."find_best_plan_v3"("mau" bigint, "bandwidth" double precision, "storage" double precision) RETURNS character varying
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT name
  FROM plans
  WHERE plans.mau>=find_best_plan_v3.mau
    AND plans.storage>=find_best_plan_v3.storage
    AND plans.bandwidth>=find_best_plan_v3.bandwidth
    OR plans.name = 'Pay as you go'
    ORDER BY app
    LIMIT 1);
End;  
$$;


CREATE FUNCTION "public"."find_fit_plan_v3"("mau" bigint, "bandwidth" double precision, "storage" double precision) RETURNS TABLE("name" character varying)
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
  ORDER BY app
);

END;
$$;


CREATE FUNCTION "public"."get_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT id
  FROM app_versions
  WHERE app_id=appid
  AND name=name_version
  AND user_id=get_user_id(apikey));
End;  
$$;


CREATE FUNCTION "public"."get_current_plan_max"("userid" "uuid") RETURNS TABLE("mau" bigint, "bandwidth" double precision, "storage" double precision)
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
        from users
        where id=userid)
  ));
End;  
$$;

CREATE FUNCTION "public"."get_current_plan_name"("userid" "uuid") RETURNS character varying
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN 
  (SELECT name
  FROM plans
    WHERE stripe_id=(SELECT product_id
    from stripe_info
    where customer_id=(SELECT customer_id from users where id=userid)
    ));
End;  
$$;

CREATE FUNCTION "public"."get_devices_version"("app_id" character varying, "version_id" bigint) RETURNS bigint
    LANGUAGE "plpgsql"
    AS $$
Begin
  RETURN 
  (SELECT COUNT(*) FROM devices WHERE devices.app_id = get_devices_version.app_id and version = get_devices_version.version_id);
End;  
$$;

CREATE FUNCTION "public"."get_max_plan"("userid" "uuid") RETURNS TABLE("mau" bigint, "storage" bigint, "bandwidth" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  -- RETURN QUERY SELECT 
  --   SUM(devices)::bigint AS mau,
  --   SUM(version_size)::bigint AS storage,
  --   SUM(app_stats.bandwidth)::bigint AS bandwidth
  -- FROM app_stats
  -- WHERE user_id = userid
  -- AND date_id=dateid;
  RETURN QUERY SELECT 
     count(*)::bigint as mau,
     count(*)::bigint as bandwidth,
     count(*)::bigint as storage
  FROM apps;  
End;  
$$;

CREATE FUNCTION "public"."get_metered_usage"("userid" "uuid") RETURNS "public"."stats_table"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    current_usage stats_table;
    max_plan stats_table;
    result stats_table;
BEGIN
  -- Get the total values for the user's current usage
  SELECT * INTO current_usage FROM public.get_total_stats_v2(userid, to_char(now(), 'YYYY-MM'));
  SELECT * INTO max_plan FROM public.get_current_plan_max(userid);
  result.mau = current_usage.mau::bigint - max_plan.mau::bigint;
  result.mau = (CASE WHEN result.mau > 0 THEN result.mau ELSE 0 END);
  result.bandwidth = current_usage.bandwidth::float - max_plan.bandwidth::float;
  result.bandwidth = (CASE WHEN result.bandwidth > 0 THEN result.bandwidth ELSE 0 END);
  result.storage = current_usage.storage::float - max_plan.storage::float;
  result.storage = (CASE WHEN result.storage > 0 THEN result.storage ELSE 0 END);
  RETURN result;
END;
$$;

CREATE FUNCTION "public"."get_plan_usage_percent"("userid" "uuid", "dateid" character varying) RETURNS double precision
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    current_plan_max stats_table;
    total_stats stats_table;
    percent_mau float;
    percent_bandwidth float;
    percent_storage float;
BEGIN
  -- Get the maximum values for the user's current plan
  current_plan_max := public.get_current_plan_max(userid);
  -- Get the user's maximum usage stats for the current date
  total_stats := public.get_total_stats_v2(userid, dateid);
  -- Calculate the percentage of usage for each stat and return the average
  percent_mau := convert_number_to_percent(total_stats.mau, current_plan_max.mau);
  percent_bandwidth := convert_number_to_percent(total_stats.bandwidth, current_plan_max.bandwidth);
  percent_storage := convert_number_to_percent(total_stats.storage, current_plan_max.storage);

  RETURN round(GREATEST(percent_mau, percent_bandwidth, percent_storage)::numeric, 2);
END;
$$;

CREATE FUNCTION "public"."get_total_stats_v2"("userid" "uuid", "dateid" character varying) RETURNS TABLE("mau" bigint, "bandwidth" double precision, "storage" double precision)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN QUERY SELECT 
    COALESCE(SUM(devices), 0)::bigint AS mau,
    COALESCE(round(convert_bytes_to_gb(SUM(app_stats.bandwidth))::numeric,2), 0)::float AS bandwidth,
    COALESCE(round(convert_bytes_to_gb(SUM(version_size))::numeric,2), 0)::float AS storage
  FROM app_stats
  WHERE user_id = userid
  AND date_id=dateid;
End;  
$$;

CREATE FUNCTION "public"."get_user_id"("apikey" "text") RETURNS "uuid"
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

CREATE FUNCTION "public"."has_min_right"("_userid" "uuid", "_orgid" "uuid", "_right" "public"."user_min_right", "_appid" character varying DEFAULT NULL::character varying, "_channelid" bigint DEFAULT NULL::bigint) RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
DECLARE 
    _userRight user_min_right;
BEGIN
    -- Check for Channel Rights
    IF _channelID IS NOT NULL THEN
        SELECT user_right INTO _userRight
        FROM org_users
        WHERE user_id = _userID AND org_id = _orgID AND channel_id = _channelID;
        IF _userRight IS NOT NULL THEN
            RETURN _userRight >= _right;
        END IF;
    END IF;

    -- Check for App Rights
    IF _appID IS NOT NULL THEN
        SELECT user_right INTO _userRight
        FROM org_users
        WHERE user_id = _userID AND org_id = _orgID AND app_id = _appID;
        IF _userRight IS NOT NULL THEN
            RETURN _userRight >= _right;
        END IF;
    END IF;

    -- Check for Org Rights
    SELECT user_right INTO _userRight
    FROM org_users
    WHERE user_id = _userID AND org_id = _orgID;

    -- If userRight is NULL, the user does not exist
    IF _userRight IS NULL THEN 
        RETURN false;
    -- Compare rights
    ELSE
        RETURN _userRight >= _right;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."increment_store"("app_id" character varying, "updates" integer)
RETURNS void AS $$
BEGIN
  update store_apps 
  set updates = store_apps.updates + increment_store.updates
  where store_apps.app_id = increment_store.app_id;
END;
$$ LANGUAGE plpgsql;


-- TODO: use auth.uid() instead of passing it as argument for better security
CREATE FUNCTION "public"."is_admin"("userid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN userid::text = (select decrypted_secret from vault.decrypted_secrets where name = 'admin_user');
End;  
$$;


-- TODO: use auth.uid() instead of passing it as argument for better security
CREATE FUNCTION "public"."is_allowed_action"("apikey" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN is_allowed_action_user(get_user_id(apikey));
End;
$$;

-- TODO: use auth.uid() instead of passing it as argument for better security
CREATE FUNCTION "public"."is_allowed_action_user"("userid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
    RETURN is_trial(userid) > 0
      or is_free_usage(userid)
      or (is_good_plan_v3(userid) and is_paying(userid));
End;
$$;


CREATE FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[]) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM apikeys
  WHERE key=apikey
  AND mode=ANY(keymode)));
End;  
$$;


CREATE FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[], "app_id" character varying) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM apikeys
  WHERE key=apikey
  AND mode=ANY(keymode))) AND is_app_owner(get_user_id(apikey), app_id);
End;  
$$;


-- TODO: use auth.uid() instead of passing it as argument for better security
CREATE FUNCTION "public"."is_app_owner"("userid" "uuid", "appid" character varying) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM apps
  WHERE app_id=appid
  AND user_id=userid));
End;  
$$;

-- TODO: use auth.uid() instead of passing it as argument for better security
CREATE FUNCTION "public"."is_app_shared"("userid" "uuid", "appid" character varying) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM channel_users
  WHERE app_id=appid
  AND user_id=userid));
End;  
$$;

-- TODO: use auth.uid() instead of passing it as argument for better security
CREATE OR REPLACE FUNCTION public.is_canceled(userid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  from stripe_info
  where customer_id=(SELECT customer_id from users where id=userid)
  AND status = 'canceled'));
End;  
$function$;

CREATE OR REPLACE FUNCTION public.update_app_usage(minutes_interval INT) RETURNS VOID AS $$
DECLARE
    one_minute_ago TIMESTAMP;
    n_minutes_ago TIMESTAMP;
    thirty_days_ago TIMESTAMP;
BEGIN
    -- Initialize time variables
    one_minute_ago := NOW() - INTERVAL '1 minute';
    n_minutes_ago := NOW() - INTERVAL '1 minute' * minutes_interval;
    thirty_days_ago := NOW() - INTERVAL '30 days';

    WITH bandwidth AS (
        SELECT stats.app_id, SUM(app_versions_meta.size) AS bandwidth, 0 AS storage, 0 AS mau
        FROM stats
        JOIN app_versions_meta ON stats.app_id = app_versions_meta.app_id
        WHERE stats.action = 'get' AND stats.created_at BETWEEN n_minutes_ago AND one_minute_ago
        GROUP BY stats.app_id
    ), storage AS (
        SELECT app_versions.app_id, 0 AS bandwidth, SUM(app_versions_meta.size) AS storage, 0 AS mau
        FROM app_versions
        JOIN app_versions_meta ON app_versions.app_id = app_versions_meta.app_id
        WHERE app_versions.created_at BETWEEN n_minutes_ago AND one_minute_ago AND app_versions.deleted IS FALSE
        GROUP BY app_versions.app_id
    ), deleted_storage AS (
        SELECT app_versions.app_id, 0 AS bandwidth, SUM(app_versions_meta.size) AS storage, 0 AS mau
        FROM app_versions
        JOIN app_versions_meta ON app_versions.app_id = app_versions_meta.app_id
        WHERE app_versions.updated_at BETWEEN n_minutes_ago AND one_minute_ago AND app_versions.deleted IS TRUE
        GROUP BY app_versions.app_id
    ), mau AS (
        SELECT devices.app_id, 0 AS bandwidth, 0 AS storage, COUNT(*) AS mau
        FROM devices
        WHERE (devices.created_at BETWEEN n_minutes_ago AND one_minute_ago OR devices.updated_at BETWEEN n_minutes_ago AND one_minute_ago)
        AND (devices.last_MAU IS NULL OR devices.last_MAU < thirty_days_ago)
        GROUP BY devices.app_id
    ), combined AS (
        SELECT * FROM bandwidth
        UNION ALL
        SELECT * FROM storage
        UNION ALL
        SELECT * FROM mau
        UNION ALL
        SELECT app_id, bandwidth, -storage, mau FROM deleted_storage
    )
    INSERT INTO app_usage (app_id, created_at, bandwidth, storage, mau)
    SELECT app_id, NOW(), SUM(bandwidth), SUM(storage), SUM(mau)
    FROM combined
    GROUP BY app_id;

    -- Update last_MAU for counted devices
    UPDATE devices SET last_MAU = NOW()
    WHERE (created_at BETWEEN n_minutes_ago AND one_minute_ago OR updated_at BETWEEN n_minutes_ago AND one_minute_ago)
    AND (last_MAU IS NULL OR last_MAU < thirty_days_ago);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.calculate_daily_app_usage() RETURNS VOID AS $$
DECLARE
    twenty_four_hours_ago TIMESTAMP;
BEGIN
    -- Initialize time variable
    twenty_four_hours_ago := NOW() - INTERVAL '24 hours';

    WITH daily_usage AS (
        SELECT app_id, SUM(bandwidth) AS daily_bandwidth, SUM(storage) AS daily_storage, SUM(mau) AS daily_mau
        FROM app_usage
        WHERE created_at >= twenty_four_hours_ago AND mode = '5min'
        GROUP BY app_id
    )
    INSERT INTO app_usage (app_id, created_at, bandwidth, storage, mau, mode)
    SELECT app_id, NOW(), daily_bandwidth, daily_storage, daily_mau, 'day'
    FROM daily_usage;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.calculate_cycle_usage() RETURNS VOID AS $$
BEGIN
    WITH cycle_usage AS (
        SELECT apps.app_id, SUM(app_usage.bandwidth) AS cycle_bandwidth, SUM(app_usage.storage) AS cycle_storage, SUM(app_usage.mau) AS cycle_mau
        FROM app_usage
        JOIN apps ON app_usage.app_id = apps.app_id
        JOIN users ON apps.user_id = users.id
        JOIN stripe_info ON users.customer_id = stripe_info.customer_id
        WHERE app_usage.created_at BETWEEN stripe_info.subscription_anchor_start AND stripe_info.subscription_anchor_end
        AND app_usage.mode = 'day'
        GROUP BY apps.app_id
    )
    INSERT INTO app_usage (app_id, created_at, bandwidth, storage, mau, mode)
    SELECT app_id, NOW(), cycle_bandwidth, cycle_storage, cycle_mau, 'cycle'
    FROM cycle_usage;
END;
$$ LANGUAGE plpgsql;

-- TODO: use auth.uid() instead of passing it as argument for better security
CREATE FUNCTION "public"."is_free_usage"("userid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
    RETURN COALESCE(get_current_plan_name(userid), 'Free') = 'Free';
End;
$$;

-- TODO: use auth.uid() instead of passing it as argument for better security
CREATE FUNCTION "public"."is_good_plan_v3"("userid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    current_plan_total stats_table;
BEGIN
  -- Get the total values for the user's current usage
  SELECT * INTO current_plan_total FROM public.get_total_stats_v2(userid, to_char(now(), 'YYYY-MM'));
  RETURN (select 1 from  find_fit_plan_v3(
    current_plan_total.mau,
    current_plan_total.bandwidth,
    current_plan_total.storage) where find_fit_plan_v3.name = (SELECT get_current_plan_name(userid)));
END;
$$;


-- TODO: use auth.uid() instead of passing it as argument for better security
CREATE FUNCTION "public"."is_in_channel"("userid" "uuid", "ownerid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
Begin
  RETURN (SELECT EXISTS (
    SELECT user_id
    FROM channel_users
    WHERE user_id=userid
    AND created_by=ownerid
  ));
End;
$$;


CREATE FUNCTION "public"."is_not_deleted"("email_check" character varying) RETURNS boolean
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

-- TODO: use auth.uid() instead of passing it as argument for better security
CREATE FUNCTION "public"."is_onboarded"("userid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM apps
  WHERE user_id=userid)) AND (SELECT EXISTS (SELECT 1
  FROM app_versions
  WHERE user_id=userid));
End;
$$;

-- TODO: use auth.uid() instead of passing it as argument for better security
CREATE FUNCTION "public"."is_onboarding_needed"("userid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (NOT is_onboarded(userid)) AND is_trial(userid) = 0;
End;
$$;

-- TODO: use auth.uid() instead of passing it as argument for better security
CREATE FUNCTION "public"."is_paying"("userid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  from stripe_info
  where customer_id=(SELECT customer_id from users where id=userid)
  AND status = 'succeeded'));
End;  
$$;

-- TODO: use auth.uid() instead of passing it as argument for better security
CREATE FUNCTION "public"."is_trial"("userid" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT GREATEST((trial_at::date - (now())::date), 0) AS days
  from stripe_info
  where customer_id=(SELECT customer_id from users where id=userid));
End;  
$$;

-- TODO: use auth.uid() instead of passing it as argument for better security
CREATE FUNCTION "public"."is_version_shared"("userid" "uuid", "versionid" bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM(SELECT version
  FROM channels
  WHERE id IN (
    SELECT channel_id
    FROM channel_users 
      WHERE user_id=userid
  )) as derivedTable
  WHERE version=versionid));
End;  
$$;


SET default_tablespace = '';

SET default_table_access_method = "heap";

CREATE TABLE "public"."apikeys" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" NOT NULL,
    "key" character varying NOT NULL,
    "mode" "public"."key_mode" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."apikeys" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."apikeys_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE "public"."app_usage" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "app_id" character varying NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    -- main stats
    "mau" bigint DEFAULT '0'::bigint NOT NULL,
    "storage" bigint DEFAULT '0'::bigint NOT NULL,
    "bandwidth" bigint DEFAULT '0'::bigint NOT NULL,
    mode "public"."usage_mode" not null default '5min'::"public"."usage_mode"
);

CREATE TABLE "public"."app_stats" (
    "app_id" character varying NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "channels" smallint DEFAULT '0'::smallint NOT NULL,
    "mlu" bigint DEFAULT '0'::bigint NOT NULL,
    "versions" bigint DEFAULT '0'::bigint NOT NULL,
    "shared" bigint DEFAULT '0'::bigint NOT NULL,
    "mlu_real" bigint DEFAULT '0'::bigint NOT NULL,
    "devices" bigint DEFAULT '0'::bigint NOT NULL,
    "date_id" character varying DEFAULT '2022-05'::character varying NOT NULL,
    "version_size" bigint DEFAULT '0'::bigint NOT NULL,
    "bandwidth" bigint DEFAULT '0'::bigint NOT NULL,
    "devices_real" bigint DEFAULT '0'::bigint NOT NULL
);

ALTER TABLE "public"."app_stats" OWNER TO "postgres";

CREATE TABLE "public"."app_versions" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "app_id" character varying NOT NULL,
    "name" character varying NOT NULL,
    "bucket_id" character varying,
    "user_id" "uuid" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted" boolean DEFAULT false NOT NULL,
    "external_url" character varying,
    "checksum" character varying,
    "session_key" character varying,
    "storage_provider" "text" DEFAULT 'r2'::"text" NOT NULL
);

ALTER TABLE "public"."app_versions"
ADD COLUMN "checksum_partial_update" character varying DEFAULT NULL;

ALTER TABLE "public"."app_versions" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."app_versions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE "public"."app_versions_meta" (
    "created_at" timestamp with time zone DEFAULT "now"(),
    "app_id" character varying NOT NULL,
    "user_id" "uuid" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "checksum" character varying NOT NULL,
    "size" bigint NOT NULL,
    "id" bigint NOT NULL,
    "devices" bigint DEFAULT '0'::bigint,
    "fails" bigint DEFAULT '0'::bigint,
    "installs" bigint DEFAULT '0'::bigint,
    "uninstalls" bigint DEFAULT '0'::bigint
);


ALTER TABLE "public"."app_versions_meta" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."app_versions_meta_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE "public"."apps" (
    "created_at" timestamp with time zone DEFAULT "now"(),
    "app_id" character varying NOT NULL,
    "icon_url" character varying NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" character varying,
    "last_version" character varying,
    "updated_at" timestamp with time zone,
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"(),
    "retention" bigint NOT NULL DEFAULT '0'::bigint
);


CREATE TABLE "public"."channel_devices" (
    "created_at" timestamp with time zone DEFAULT "now"(),
    "channel_id" bigint NOT NULL,
    "app_id" character varying NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "device_id" "text" NOT NULL
);


CREATE TABLE "public"."channels" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" character varying NOT NULL,
    "app_id" character varying NOT NULL,
    "version" bigint NOT NULL,
    "created_by" "uuid" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "public" boolean DEFAULT false NOT NULL,
    "disableAutoUpdateUnderNative" boolean DEFAULT true NOT NULL,
    "enableAbTesting" boolean not null default false,
    "enable_progressive_deploy" boolean not null default false,
    "secondaryVersionPercentage" double precision not null default '0'::double precision,
    "secondVersion" bigint NULL,
    "disableAutoUpdateToMajor" boolean DEFAULT true NOT NULL,
    "beta" boolean DEFAULT false NOT NULL,
    "ios" boolean DEFAULT true NOT NULL,
    "android" boolean DEFAULT true NOT NULL,
    "allow_device_self_set" boolean DEFAULT false NOT NULL,
    "allow_emulator" boolean DEFAULT true NOT NULL,
    "allow_dev" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."channels" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."channel_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE "public"."channel_users" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" NOT NULL,
    "channel_id" bigint NOT NULL,
    "app_id" character varying NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);


ALTER TABLE "public"."channel_users" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."channel_users_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE "public"."deleted_account" (
    "created_at" timestamp with time zone DEFAULT "now"(),
    "email" character varying NOT NULL,
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL
);


CREATE TABLE "public"."devices" (
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "last_mau" timestamp with time zone DEFAULT "now"(),
    "device_id" "text" NOT NULL,
    "version" bigint NOT NULL,
    "app_id" character varying NOT NULL,
    "platform" "public"."platform_os",
    "plugin_version" "text" DEFAULT '2.3.3'::"text" NOT NULL,
    "os_version" character varying,
    "date_id" character varying DEFAULT ''::character varying,
    "version_build" "text" DEFAULT 'builtin'::"text",
    "custom_id" "text" DEFAULT ''::"text" NOT NULL,
    "is_prod" boolean DEFAULT true,
    "is_emulator" boolean DEFAULT false
);


CREATE TABLE "public"."devices_override" (
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "device_id" "text" NOT NULL,
    "version" bigint NOT NULL,
    "app_id" character varying NOT NULL,
    "created_by" "uuid"
);


CREATE TABLE "public"."global_stats" (
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
    "onboarded" bigint DEFAULT '0'::bigint
);


CREATE TABLE "public"."notifications" (
    "id" character varying NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" NOT NULL,
    "last_send_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "total_send" bigint DEFAULT '1'::bigint NOT NULL
);


CREATE TABLE "public"."org_users" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "app_id" character varying,
    "channel_id" bigint,
    "user_right" "public"."user_min_right"
);


ALTER TABLE "public"."org_users" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."org_users_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE "public"."orgs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "logo" "text",
    "name" "text" NOT NULL
);


CREATE TABLE "public"."plans" (
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" character varying DEFAULT ''::character varying NOT NULL,
    "description" character varying DEFAULT ''::character varying NOT NULL,
    "price_m" bigint DEFAULT '0'::bigint NOT NULL,
    "price_y" bigint DEFAULT '0'::bigint NOT NULL,
    "stripe_id" character varying DEFAULT ''::character varying NOT NULL,
    "app" bigint DEFAULT '0'::bigint NOT NULL,
    "channel" bigint DEFAULT '0'::bigint NOT NULL,
    "update" bigint DEFAULT '0'::bigint NOT NULL,
    "version" bigint DEFAULT '0'::bigint NOT NULL,
    "shared" bigint DEFAULT '0'::bigint NOT NULL,
    "abtest" boolean DEFAULT false NOT NULL,
    "progressive_deploy" boolean DEFAULT false NOT NULL,
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "price_m_id" character varying NOT NULL,
    "price_y_id" character varying NOT NULL,
    "storage" double precision NOT NULL,
    "bandwidth" double precision NOT NULL,
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

CREATE TABLE "public"."stats" (
    "created_at" timestamp with time zone DEFAULT "now"(),
    "platform" "public"."platform_os" NOT NULL,
    "action" "text" NOT NULL,
    "device_id" "text" NOT NULL,
    "version_build" "text" NOT NULL,
    "version" bigint NOT NULL,
    "app_id" character varying NOT NULL
);

CREATE TABLE "public"."store_apps" (
    "created_at" timestamp with time zone DEFAULT "now"(),
    "url" "text" DEFAULT ''::"text" NOT NULL,
    "app_id" "text" NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "summary" "text" DEFAULT ''::"text" NOT NULL,
    "icon" "text" DEFAULT ''::"text" NOT NULL,
    "free" boolean DEFAULT true NOT NULL,
    "category" "text" DEFAULT ''::"text" NOT NULL,
    "capacitor" boolean DEFAULT false NOT NULL,
    "developer_email" "text" DEFAULT ''::"text" NOT NULL,
    "installs" bigint DEFAULT '0'::bigint NOT NULL,
    "developer" "text" DEFAULT ''::"text" NOT NULL,
    "score" double precision DEFAULT '0'::double precision NOT NULL,
    "to_get_framework" boolean DEFAULT true NOT NULL,
    "onprem" boolean DEFAULT false NOT NULL,
    "updates" bigint DEFAULT '0'::bigint NOT NULL,
    "to_get_info" boolean DEFAULT true NOT NULL,
    "error_get_framework" "text" DEFAULT ''::"text" NOT NULL,
    "to_get_similar" boolean DEFAULT true NOT NULL,
    "error_get_similar" "text" DEFAULT ''::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "error_get_info" "text" DEFAULT ''::"text" NOT NULL,
    "cordova" boolean DEFAULT false NOT NULL,
    "react_native" boolean DEFAULT false NOT NULL,
    "capgo" boolean DEFAULT false NOT NULL,
    "kotlin" boolean DEFAULT false NOT NULL,
    "flutter" boolean DEFAULT false NOT NULL,
    "native_script" boolean DEFAULT false NOT NULL,
    "lang" "text",
    "developer_id" "text"
);

CREATE OR REPLACE FUNCTION public.remove_enum_value(enum_type regtype, enum_value text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    _enum_value text;
BEGIN
    FOR _enum_value IN SELECT enumlabel FROM pg_enum WHERE enumtypid = enum_type AND enumlabel <> enum_value LOOP
        EXECUTE format('ALTER TYPE %s RENAME VALUE %L TO %L', enum_type, _enum_value, _enum_value || '_old');
        EXECUTE format('ALTER TYPE %s RENAME VALUE %L TO %L', enum_type, _enum_value || '_old', _enum_value);
    END LOOP;
    EXECUTE format('ALTER TYPE %s RENAME VALUE %L TO %L', enum_type, enum_value, enum_value || '_old');
    EXECUTE format('ALTER TYPE %s RENAME VALUE %L TO %L', enum_type, enum_value || '_old', enum_value);
END;
$function$;

CREATE OR REPLACE FUNCTION public.one_month_ahead()
RETURNS timestamp AS 
$$
BEGIN
   RETURN NOW() + INTERVAL '1 month';
END;
$$ LANGUAGE plpgsql;

CREATE TABLE "public"."stripe_info" (
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "subscription_id" character varying,
    "customer_id" character varying NOT NULL,
    "status" "public"."stripe_status",
    "product_id" character varying DEFAULT 'free'::character varying NOT NULL,
    "trial_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "price_id" character varying,
    "is_good_plan" boolean DEFAULT true,
    "plan_usage" bigint DEFAULT '0'::bigint,
    "subscription_metered" "json" DEFAULT '{}'::"json" NOT NULL,
    "subscription_anchor_start" timestamp with time zone DEFAULT "now"() NOT NULL,
    "subscription_anchor_end" timestamp with time zone DEFAULT public.one_month_ahead() NOT NULL
);


CREATE TABLE "public"."users" (
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

CREATE OR REPLACE FUNCTION "public"."delete_user"() RETURNS void
LANGUAGE SQL SECURITY DEFINER 
AS $$
   delete from auth.users where id = auth.uid();
$$;

ALTER TABLE ONLY "public"."app_usage"
    ADD CONSTRAINT "app_usage_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."apikeys"
    ADD CONSTRAINT "apikeys_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."app_stats"
    ADD CONSTRAINT "app_stats_pkey" PRIMARY KEY ("app_id", "date_id");

ALTER TABLE ONLY "public"."app_versions_meta"
    ADD CONSTRAINT "app_versions_meta_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."app_versions"
    ADD CONSTRAINT "app_versions_name_app_id_key" UNIQUE ("name", "app_id");

ALTER TABLE ONLY "public"."app_versions"
    ADD CONSTRAINT "app_versions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."apps"
    ADD CONSTRAINT "apps_pkey" PRIMARY KEY ("app_id");

ALTER TABLE ONLY "public"."channel_devices"
    ADD CONSTRAINT "channel_devices_pkey" PRIMARY KEY ("device_id");

ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "channel_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."channel_users"
    ADD CONSTRAINT "channel_users_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."deleted_account"
    ADD CONSTRAINT "deleted_account_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."devices_override"
    ADD CONSTRAINT "devices_override_pkey" PRIMARY KEY ("device_id");

ALTER TABLE ONLY "public"."devices"
    ADD CONSTRAINT "devices_pkey" PRIMARY KEY ("device_id");

ALTER TABLE ONLY "public"."global_stats"
    ADD CONSTRAINT "global_stats_pkey" PRIMARY KEY ("date_id");

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."org_users"
    ADD CONSTRAINT "org_users_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."orgs"
    ADD CONSTRAINT "orgs_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("name", "stripe_id", "id");

ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_stripe_id_key" UNIQUE ("stripe_id");

ALTER TABLE ONLY "public"."store_apps"
    ADD CONSTRAINT "store_apps_pkey" PRIMARY KEY ("app_id");

ALTER TABLE ONLY "public"."stripe_info"
    ADD CONSTRAINT "stripe_info_pkey" PRIMARY KEY ("customer_id");

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_customer_id_key" UNIQUE ("customer_id");

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");

CREATE INDEX "app_versions_meta_app_id_idx" ON "public"."app_versions_meta" USING "btree" ("app_id");

CREATE INDEX "idx_app_id_created_at" ON "public"."app_usage" USING "btree" ("app_id", "created_at");

CREATE INDEX "idx_action_logs" ON "public"."stats" USING "btree" ("action");

CREATE INDEX "idx_app_id_app_versions" ON "public"."app_versions" USING "btree" ("app_id");

CREATE INDEX "idx_app_id_devices" ON "public"."devices" USING "btree" ("app_id");

CREATE INDEX "idx_app_id_name_app_versions" ON "public"."app_versions" USING "btree" ("app_id", "name");

CREATE INDEX "idx_app_id_device_id_devices" ON "public"."devices" USING "btree" ("app_id", "device_id");

CREATE INDEX "idx_app_id_public_channel" ON "public"."channels" USING "btree" ("app_id", "public");

CREATE INDEX "idx_app_id_device_id_channel_devices" ON "public"."channel_devices" USING "btree" ("app_id", "device_id");

CREATE INDEX "idx_app_id_device_id_devices_override" ON "public"."devices_override" USING "btree" ("app_id", "device_id");

CREATE INDEX "idx_app_id_logs" ON "public"."stats" USING "btree" ("app_id");

CREATE INDEX "idx_app_versions_id" ON "public"."app_versions" USING "btree" ("id");

CREATE INDEX "idx_app_versions_created_at" ON "public"."app_versions" USING "btree" ("created_at");

CREATE INDEX "idx_app_versions_deleted" ON "public"."app_versions" USING "btree" ("deleted");

CREATE INDEX "idx_app_versions_name" ON "public"."app_versions" USING "btree" ("name");

CREATE INDEX "idx_created_at_logs" ON "public"."stats" USING "btree" ("created_at");

CREATE INDEX "idx_device_id_logs" ON "public"."stats" USING "btree" ("device_id");

CREATE INDEX "idx_devices_created_at" ON "public"."devices" USING "btree" ("device_id", "created_at" DESC);

CREATE INDEX "idx_devices_last_mau" ON "public"."devices" USING "btree" ("last_mau");

CREATE INDEX "idx_devices_created_at_updated_at" ON "public"."devices" USING "btree" ("created_at", "updated_at");

CREATE INDEX idx_app_id_version_devices ON "public"."devices" USING "btree" ("app_id", "version");

CREATE INDEX "idx_platform_logs" ON "public"."stats" USING "btree" ("platform");

CREATE INDEX "idx_store_apps" ON "public"."store_apps" USING "btree" ("capacitor");

CREATE INDEX "idx_store_apps_capacitor" ON "public"."store_apps" USING "btree" ("capacitor", "installs" DESC);

CREATE INDEX "idx_store_apps_cordova" ON "public"."store_apps" USING "btree" ("cordova", "capacitor", "installs" DESC);

CREATE INDEX "idx_store_apps_flutter" ON "public"."store_apps" USING "btree" ("flutter", "installs" DESC);

CREATE INDEX "idx_store_apps_install" ON "public"."store_apps" USING "btree" ("capacitor", "installs");

CREATE INDEX "idx_store_apps_kotlin" ON "public"."store_apps" USING "btree" ("kotlin", "installs" DESC);

CREATE INDEX "idx_store_apps_native_script" ON "public"."store_apps" USING "btree" ("native_script", "installs" DESC);

CREATE INDEX "idx_store_apps_react_native" ON "public"."store_apps" USING "btree" ("react_native", "installs" DESC);

CREATE INDEX "idx_store_capgo" ON "public"."store_apps" USING "btree" ("capgo");

CREATE INDEX "idx_store_on_prem" ON "public"."store_apps" USING "btree" ("onprem");

CREATE INDEX "idx_version_build_logs" ON "public"."stats" USING "btree" ("version_build");

CREATE INDEX "idx_version_logs" ON "public"."stats" USING "btree" ("version");

CREATE UNIQUE INDEX "store_app_pkey" ON "public"."store_apps" USING "btree" ("app_id");

CREATE OR REPLACE FUNCTION public.get_cycle_info()
RETURNS TABLE (
    subscription_anchor_start timestamp with time zone,
    subscription_anchor_end timestamp with time zone
) AS $$
DECLARE
    customer_id_var text;
BEGIN
    -- Get the customer_id using auth.uid()
    SELECT customer_id INTO customer_id_var FROM users WHERE id = auth.uid();

    -- Get the stripe_info using the customer_id
    RETURN QUERY
    WITH cycle_info AS (
        SELECT stripe_info.subscription_anchor_start, stripe_info.subscription_anchor_end 
        FROM stripe_info 
        WHERE customer_id = customer_id_var
    )
    SELECT 
        CASE 
            WHEN now() BETWEEN cycle_info.subscription_anchor_start AND cycle_info.subscription_anchor_end THEN cycle_info.subscription_anchor_start
            ELSE date_trunc('MONTH', now()) + (cycle_info.subscription_anchor_start - date_trunc('MONTH', cycle_info.subscription_anchor_start))
        END,
        CASE 
            WHEN now() BETWEEN cycle_info.subscription_anchor_start AND cycle_info.subscription_anchor_end THEN cycle_info.subscription_anchor_end
            ELSE date_trunc('MONTH', now()) + (cycle_info.subscription_anchor_start - date_trunc('MONTH', cycle_info.subscription_anchor_start)) + INTERVAL '1 month'
        END
    FROM cycle_info;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION public.get_db_url() RETURNS TEXT LANGUAGE SQL AS $$
    SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='db_url';
$$ SECURITY DEFINER STABLE PARALLEL SAFE;

CREATE OR REPLACE FUNCTION public.get_apikey() RETURNS TEXT LANGUAGE SQL AS $$
    SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='apikey';
$$ SECURITY DEFINER STABLE PARALLEL SAFE;

REVOKE EXECUTE ON FUNCTION public.get_apikey() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_apikey() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_apikey() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_apikey() TO postgres;

CREATE OR REPLACE FUNCTION public.http_post_to_function() 
RETURNS trigger 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $BODY$
DECLARE 
  request_id text;
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

  -- Make an async HTTP POST request using pg_net
  SELECT INTO request_id net.http_post(
    url := get_db_url() || '/functions/v1/' || TG_ARGV[0],
    headers := jsonb_build_object(
      'Content-Type',
      'application/json',
      'apisecret',
      get_apikey()
    ),
    body := payload,
    timeout_milliseconds := 15000
  );

  RETURN NEW;
END;
$BODY$;

REVOKE EXECUTE ON FUNCTION public.http_post_to_function() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.http_post_to_function() FROM anon;
REVOKE EXECUTE ON FUNCTION public.http_post_to_function() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.http_post_to_function() TO postgres;

REVOKE EXECUTE ON FUNCTION public.count_all_apps() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.count_all_apps() FROM anon;
REVOKE EXECUTE ON FUNCTION public.count_all_apps() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.count_all_apps() TO postgres;

REVOKE EXECUTE ON FUNCTION public.count_all_need_upgrade() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.count_all_need_upgrade() FROM anon;
REVOKE EXECUTE ON FUNCTION public.count_all_need_upgrade() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.count_all_need_upgrade() TO postgres;

REVOKE EXECUTE ON FUNCTION public.count_all_onboarded() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.count_all_onboarded() FROM anon;
REVOKE EXECUTE ON FUNCTION public.count_all_onboarded() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.count_all_onboarded() TO postgres;

REVOKE EXECUTE ON FUNCTION public.count_all_paying() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.count_all_paying() FROM anon;
REVOKE EXECUTE ON FUNCTION public.count_all_paying() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.count_all_paying() TO postgres;

REVOKE EXECUTE ON FUNCTION public.count_all_plans() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.count_all_plans() FROM anon;
REVOKE EXECUTE ON FUNCTION public.count_all_plans() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.count_all_plans() TO postgres;

REVOKE EXECUTE ON FUNCTION public.count_all_trial() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.count_all_trial() FROM anon;
REVOKE EXECUTE ON FUNCTION public.count_all_trial() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.count_all_trial() TO postgres;

REVOKE EXECUTE ON FUNCTION public.count_all_updates() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.count_all_updates() FROM anon;
REVOKE EXECUTE ON FUNCTION public.count_all_updates() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.count_all_updates() TO postgres;

REVOKE EXECUTE ON FUNCTION public.get_current_plan_max(userid uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_current_plan_max(userid uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_current_plan_max(userid uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_plan_max(userid uuid) TO postgres;

REVOKE EXECUTE ON FUNCTION public.get_devices_version("app_id" character varying, "version_id" bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_devices_version("app_id" character varying, "version_id" bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_devices_version("app_id" character varying, "version_id" bigint) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_devices_version("app_id" character varying, "version_id" bigint) TO postgres;

REVOKE EXECUTE ON FUNCTION public.increment_store("app_id" character varying, "updates" integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_store("app_id" character varying, "updates" integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_store("app_id" character varying, "updates" integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_store("app_id" character varying, "updates" integer) TO postgres;

REVOKE EXECUTE ON FUNCTION public.remove_enum_value(enum_type regtype, enum_value text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.remove_enum_value(enum_type regtype, enum_value text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.remove_enum_value(enum_type regtype, enum_value text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.remove_enum_value(enum_type regtype, enum_value text) TO postgres;

REVOKE EXECUTE ON FUNCTION public.update_app_usage(minutes_interval INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_app_usage(minutes_interval INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_app_usage(minutes_interval INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.update_app_usage(minutes_interval INT) TO postgres;

REVOKE EXECUTE ON FUNCTION public.calculate_daily_app_usage() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_daily_app_usage() FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_daily_app_usage() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_daily_app_usage() TO postgres;

REVOKE EXECUTE ON FUNCTION public.calculate_cycle_usage() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_cycle_usage() FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_cycle_usage() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_cycle_usage() TO postgres;

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."apikeys" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."app_versions" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."app_versions_meta" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."apps" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."channel_devices" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."channel_users" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."channels" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."devices" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."devices_override" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."org_users" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."plans" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."stripe_info" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');

ALTER TABLE ONLY "public"."apikeys"
    ADD CONSTRAINT "apikeys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."app_stats"
    ADD CONSTRAINT "app_stats_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."app_stats"
    ADD CONSTRAINT "app_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."app_versions"
    ADD CONSTRAINT "app_versions_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."app_versions_meta"
    ADD CONSTRAINT "app_versions_meta_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."app_versions_meta"
    ADD CONSTRAINT "app_versions_meta_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."app_versions"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."app_versions_meta"
    ADD CONSTRAINT "app_versions_meta_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."app_versions"
    ADD CONSTRAINT "app_versions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."apps"
    ADD CONSTRAINT "apps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."channel_devices"
    ADD CONSTRAINT "channel_devices_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."channel_devices"
    ADD CONSTRAINT "channel_devices_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."channel_devices"
    ADD CONSTRAINT "channel_devices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");

ALTER TABLE ONLY "public"."channel_devices"
    ADD CONSTRAINT "channel_devices_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("device_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."channel_users"
    ADD CONSTRAINT "channel_users_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."channel_users"
    ADD CONSTRAINT "channel_users_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."channel_users"
    ADD CONSTRAINT "channel_users_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."channel_users"
    ADD CONSTRAINT "channel_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "channels_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "channels_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "channels_version_fkey" FOREIGN KEY ("version") REFERENCES "public"."app_versions"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "channels_secondVersion_fkey" FOREIGN KEY ("secondVersion") REFERENCES "public"."app_versions"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."devices"
    ADD CONSTRAINT "devices_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."devices_override"
    ADD CONSTRAINT "devices_override_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."devices_override"
    ADD CONSTRAINT "devices_override_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");

ALTER TABLE ONLY "public"."devices_override"
    ADD CONSTRAINT "devices_override_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("device_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."devices_override"
    ADD CONSTRAINT "devices_override_version_fkey" FOREIGN KEY ("version") REFERENCES "public"."app_versions"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."devices"
    ADD CONSTRAINT "devices_version_fkey" FOREIGN KEY ("version") REFERENCES "public"."app_versions"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."stats"
    ADD CONSTRAINT "logs_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."stats"
    ADD CONSTRAINT "logs_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("device_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."stats"
    ADD CONSTRAINT "logs_version_fkey" FOREIGN KEY ("version") REFERENCES "public"."app_versions"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");

ALTER TABLE ONLY "public"."org_users"
    ADD CONSTRAINT "org_users_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."org_users"
    ADD CONSTRAINT "org_users_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."org_users"
    ADD CONSTRAINT "org_users_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."org_users"
    ADD CONSTRAINT "org_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."stripe_info"
    ADD CONSTRAINT "stripe_info_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."plans"("stripe_id");

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."stripe_info"("customer_id");

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

CREATE POLICY " allow anon to select" ON "public"."global_stats" FOR SELECT TO "anon" USING (true);

CREATE POLICY "All all to api owner" ON "public"."channels" TO "anon" USING ("public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{all}'::"public"."key_mode"[], "app_id")) WITH CHECK ("public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{all}'::"public"."key_mode"[], "app_id"));

CREATE POLICY "All self to select" ON "public"."app_stats" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_id") OR "public"."is_admin"("auth"."uid"())));

CREATE POLICY "Allow all for app owner" ON "public"."channel_users" TO "authenticated" USING (("public"."is_app_owner"("auth"."uid"(), "app_id") OR "public"."is_admin"("auth"."uid"()))) WITH CHECK (("public"."is_app_owner"("auth"."uid"(), "app_id") OR "public"."is_admin"("auth"."uid"())));

CREATE POLICY "Allow all to app owner" ON "public"."channel_devices" TO "authenticated" USING (("public"."is_app_owner"("auth"."uid"(), "app_id") OR "public"."is_admin"("auth"."uid"()))) WITH CHECK (("public"."is_app_owner"("auth"."uid"(), "app_id") OR "public"."is_admin"("auth"."uid"())));

CREATE POLICY "Allow all to app owner" ON "public"."devices_override" TO "authenticated" USING ("public"."is_app_owner"("auth"."uid"(), "app_id")) WITH CHECK ("public"."is_app_owner"("auth"."uid"(), "app_id"));

CREATE POLICY "Allow all users to selec present in channel" ON "public"."users" FOR SELECT TO "authenticated" USING ("public"."is_in_channel"("id", "auth"."uid"()));

CREATE POLICY "Allow api to insert" ON "public"."channels" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{write}'::"public"."key_mode"[], "app_id") AND "public"."is_allowed_action"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"))));

CREATE POLICY "Allow api to update" ON "public"."channels" FOR UPDATE TO "authenticated" USING ("public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{write}'::"public"."key_mode"[], "app_id")) WITH CHECK ("public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{write}'::"public"."key_mode"[], "app_id"));

CREATE POLICY "Allow apikey to insert" ON "public"."app_versions" FOR INSERT TO "anon" WITH CHECK (("public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{upload,write,all}'::"public"."key_mode"[], "app_id") AND "public"."is_allowed_action"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"))));

CREATE POLICY "Allow apikey to insert" ON "public"."apps" FOR INSERT TO "anon" WITH CHECK (("public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{all,write}'::"public"."key_mode"[]) AND "public"."is_allowed_action"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"))));

CREATE POLICY "Allow apikey to read" ON "public"."stats" FOR SELECT TO "anon" USING ("public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{all,write}'::"public"."key_mode"[], "app_id"));

CREATE POLICY "Allow apikey to select" ON "public"."app_versions" FOR SELECT TO "anon" USING ("public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{read,all}'::"public"."key_mode"[], "app_id"));

CREATE POLICY "Allow apikey to update they app" ON "public"."apps" FOR UPDATE USING ("public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{all,write}'::"public"."key_mode"[], "app_id")) WITH CHECK ("public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{all,write}'::"public"."key_mode"[], "app_id"));

CREATE POLICY "Allow app owner or admin" ON "public"."channels" TO "authenticated" USING (("public"."is_app_owner"("auth"."uid"(), "app_id") OR "public"."is_admin"("auth"."uid"()))) WITH CHECK (("public"."is_app_owner"("auth"."uid"(), "app_id") OR "public"."is_admin"("auth"."uid"())));

CREATE POLICY "Allow app owner to all" ON "public"."apps" TO "authenticated" USING ((("auth"."uid"() = "user_id") OR "public"."is_admin"("auth"."uid"()))) WITH CHECK ((("auth"."uid"() = "user_id") OR "public"."is_admin"("auth"."uid"())));

CREATE POLICY "Allow app owner to read" ON "public"."stats" FOR SELECT TO "authenticated" USING (("public"."is_app_owner"("auth"."uid"(), "app_id") OR "public"."is_admin"("auth"."uid"())));

CREATE POLICY "Allow org admin to all" ON "public"."org_users" TO "authenticated" USING ("public"."check_min_rights"('admin'::"public"."user_min_right", "auth"."uid"(), "org_id", NULL::character varying, NULL::bigint)) WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", "auth"."uid"(), "org_id", NULL::character varying, NULL::bigint));

CREATE POLICY "Allow owner to all" ON "public"."app_versions" TO "authenticated" USING (("public"."is_app_owner"("auth"."uid"(), "app_id") OR "public"."is_admin"("auth"."uid"()))) WITH CHECK (("public"."is_app_owner"("auth"."uid"(), "app_id") OR "public"."is_admin"("auth"."uid"())));

CREATE POLICY "Allow owner to all" ON "public"."orgs" TO "authenticated" USING ("public"."check_min_rights"('admin'::"public"."user_min_right", "auth"."uid"(), "id", NULL::character varying, NULL::bigint)) WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", "auth"."uid"(), "id", NULL::character varying, NULL::bigint));

CREATE POLICY "Allow owner to listen insert" ON "public"."app_versions" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_app_owner"("auth"."uid"(), "app_id") OR "public"."is_admin"("auth"."uid"())));

CREATE POLICY "Allow owner to update" ON "public"."devices" FOR UPDATE TO "authenticated" USING ("public"."is_app_owner"("auth"."uid"(), "app_id")) WITH CHECK ("public"."is_app_owner"("auth"."uid"(), "app_id"));

CREATE POLICY "Allow select app owner" ON "public"."devices" FOR SELECT TO "authenticated" USING (("public"."is_app_owner"("auth"."uid"(), "app_id") OR "public"."is_admin"("auth"."uid"())));

CREATE POLICY "Allow self to modify self" ON "public"."users" TO "authenticated" USING (((("auth"."uid"() = "id") AND "public"."is_not_deleted"(("auth"."email"())::character varying)) OR "public"."is_admin"("auth"."uid"()))) WITH CHECK (((("auth"."uid"() = "id") AND "public"."is_not_deleted"(("auth"."email"())::character varying)) OR "public"."is_admin"("auth"."uid"())));

CREATE POLICY "Allow shared to see" ON "public"."app_versions" FOR SELECT TO "authenticated" USING (("public"."is_app_shared"("auth"."uid"(), "app_id") OR "public"."is_admin"("auth"."uid"())));

CREATE POLICY "Allow user to get they meta" ON "public"."app_versions_meta" FOR SELECT TO "authenticated" USING (("public"."is_app_owner"("auth"."uid"(), "app_id") OR "public"."is_admin"("auth"."uid"())));

CREATE POLICY "Allow user to self get" ON "public"."channel_users" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_id") OR "public"."is_admin"("auth"."uid"())));

CREATE POLICY "Allow user to self get" ON "public"."stripe_info" FOR SELECT TO "authenticated" USING ((("auth"."uid"() IN ( SELECT "users"."id"
   FROM "public"."users"
  WHERE (("users"."customer_id")::"text" = ("users"."customer_id")::"text"))) OR "public"."is_admin"("auth"."uid"())));

CREATE POLICY "Disable for all" ON "public"."notifications" USING (false) WITH CHECK (false);

CREATE POLICY "Disable for all" ON "public"."store_apps" USING (false) WITH CHECK (false);

CREATE POLICY "Enable all for user based on user_id" ON "public"."apikeys" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_id") OR "public"."is_admin"("auth"."uid"())));

CREATE POLICY "Enable select for authenticated users only" ON "public"."plans" FOR SELECT TO "authenticated" USING (true);

--CREATE POLICY "Enable update for users based on email" ON "public"."deleted_account" FOR INSERT TO "authenticated" WITH CHECK  (encode(digest(auth.email(), 'sha256'::text), 'hex'::text) = (email)::text)

CREATE POLICY "Select if app is shared with you or api" ON "public"."channels" FOR SELECT TO "authenticated" USING (("public"."is_app_shared"("auth"."uid"(), "app_id") OR "public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{read}'::"public"."key_mode"[], "app_id")));

CREATE POLICY "allow apikey to delete" ON "public"."app_versions" FOR DELETE TO "anon" USING (("public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{write,all}'::"public"."key_mode"[], "app_id") AND "public"."is_allowed_action"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"))));

CREATE POLICY "allow apikey to delete" ON "public"."apps" FOR DELETE TO "anon" USING ("public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{all}'::"public"."key_mode"[], "app_id"));

CREATE POLICY "allow apikey to select" ON "public"."apps" FOR SELECT TO "anon" USING ("public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{all,write}'::"public"."key_mode"[], "app_id"));

CREATE POLICY "allow for delete by the CLI" ON "public"."app_versions" FOR UPDATE TO "anon" USING ("public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{write,all}'::"public"."key_mode"[], "app_id")) WITH CHECK ("public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{write,all}'::"public"."key_mode"[], "app_id"));

CREATE POLICY "allowed shared to select" ON "public"."apps" FOR SELECT TO "authenticated" USING (("public"."is_app_shared"("auth"."uid"(), "app_id") OR "public"."is_admin"("auth"."uid"())));

CREATE POLICY "Allow user to get they app_usage" ON "public"."app_usage" FOR SELECT TO "authenticated" USING (("public"."is_app_owner"("auth"."uid"(), "app_id") OR "public"."is_admin"("auth"."uid"())));

CREATE POLICY "All all users to act" ON storage.objects USING (true) WITH CHECK (true);

CREATE POLICY "All user to manage they own folder 1ffg0oo_0" ON storage.objects FOR DELETE USING (((bucket_id = 'images'::text) AND (((auth.uid())::text = (storage.foldername(name))[0]) OR (((public.get_user_id(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text)))::text = (storage.foldername(name))[0]) AND public.is_allowed_capgkey(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{all}'::public.key_mode[], ((storage.foldername(name))[1])::character varying)))));

CREATE POLICY "All user to manage they own folder 1ffg0oo_1" ON storage.objects FOR UPDATE USING (((bucket_id = 'images'::text) AND (((auth.uid())::text = (storage.foldername(name))[0]) OR (((public.get_user_id(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text)))::text = (storage.foldername(name))[0]) AND public.is_allowed_capgkey(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{write,all}'::public.key_mode[], ((storage.foldername(name))[1])::character varying)))));

CREATE POLICY "All user to manage they own folder 1ffg0oo_2" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'images'::text) AND (((auth.uid())::text = (storage.foldername(name))[0]) OR (((public.get_user_id(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text)))::text = (storage.foldername(name))[0]) AND public.is_allowed_capgkey(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{write,all}'::public.key_mode[], ((storage.foldername(name))[1])::character varying)))));

CREATE POLICY "All user to manage they own folder 1ffg0oo_3" ON storage.objects FOR SELECT USING (((bucket_id = 'images'::text) AND (((auth.uid())::text = (storage.foldername(name))[0]) OR (((public.get_user_id(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text)))::text = (storage.foldername(name))[0]) AND public.is_allowed_capgkey(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{read,all}'::public.key_mode[], ((storage.foldername(name))[1])::character varying)))));

CREATE POLICY "Allow apikey manage they folder 1sbjm_0" ON storage.objects FOR UPDATE TO anon USING (((bucket_id = 'apps'::text) AND (((public.get_user_id(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text)))::text = (storage.foldername(name))[0]) AND public.is_allowed_capgkey(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{upload,write,all}'::public.key_mode[], ((storage.foldername(name))[1])::character varying))));

CREATE POLICY "Allow apikey to manage they folder  1sbjm_3" ON storage.objects FOR DELETE TO anon USING (((bucket_id = 'apps'::text) AND (((public.get_user_id(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text)))::text = (storage.foldername(name))[0]) AND public.is_allowed_capgkey(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{all}'::public.key_mode[], ((storage.foldername(name))[1])::character varying))));

CREATE POLICY "Allow apikey to manage they folder 1sbjm_1" ON storage.objects FOR INSERT TO anon WITH CHECK (((bucket_id = 'apps'::text) AND (((public.get_user_id(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text)))::text = (storage.foldername(name))[0]) AND public.is_allowed_capgkey(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{upload,write,all}'::public.key_mode[], ((storage.foldername(name))[1])::character varying))));

CREATE POLICY "Allow apikey to select 1sbjm_0" ON storage.objects FOR SELECT TO anon USING (((bucket_id = 'apps'::text) AND (((public.get_user_id(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text)))::text = (storage.foldername(name))[0]) AND public.is_allowed_capgkey(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{read,all}'::public.key_mode[], ((storage.foldername(name))[1])::character varying))));

CREATE POLICY "Allow user or shared to manage they folder 1sbjm_0" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'apps'::text) AND (((auth.uid())::text = (storage.foldername(name))[0]) OR public.is_app_shared(auth.uid(), ((storage.foldername(name))[1])::character varying))));

CREATE POLICY "Allow user to delete they folder 1sbjm_0" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'apps'::text) AND ((auth.uid())::text = (storage.foldername(name))[0])));

CREATE POLICY "Allow user to update version 1sbjm_0" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'apps'::text) AND ((auth.uid())::text = (storage.foldername(name))[0])));

CREATE POLICY "Alow user to insert in they folder 1sbjm_0" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'apps'::text) AND ((auth.uid())::text = (storage.foldername(name))[0])));

CREATE POLICY "Disable act bucket for users" ON storage.buckets USING (false) WITH CHECK (false);

ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

ALTER TABLE storage.migrations ENABLE ROW LEVEL SECURITY;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."apikeys" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."app_stats" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."app_usage" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."app_versions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."app_versions_meta" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."apps" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."channel_devices" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."channel_users" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."channels" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."deleted_account" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."devices" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."devices_override" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."global_stats" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."org_users" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."orgs" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."plans" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."stats" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."store_apps" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."stripe_info" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;

REVOKE USAGE ON SCHEMA "public" FROM PUBLIC;
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

GRANT ALL ON FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "postgres";
GRANT ALL ON FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_min_rights"("min_right" "public"."user_min_right", "user_id" "uuid", "org_id" "uuid", "app_id" character varying, "channel_id" bigint) TO "service_role";

GRANT ALL ON FUNCTION "public"."convert_bytes_to_gb"("byt" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."convert_bytes_to_gb"("byt" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."convert_bytes_to_gb"("byt" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."convert_bytes_to_gb"("byt" double precision) TO "service_role";

GRANT ALL ON FUNCTION "public"."convert_bytes_to_mb"("byt" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."convert_bytes_to_mb"("byt" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."convert_bytes_to_mb"("byt" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."convert_bytes_to_mb"("byt" double precision) TO "service_role";

GRANT ALL ON FUNCTION "public"."convert_gb_to_bytes"("gb" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."convert_gb_to_bytes"("gb" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."convert_gb_to_bytes"("gb" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."convert_gb_to_bytes"("gb" double precision) TO "service_role";

GRANT ALL ON FUNCTION "public"."convert_mb_to_bytes"("gb" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."convert_mb_to_bytes"("gb" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."convert_mb_to_bytes"("gb" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."convert_mb_to_bytes"("gb" double precision) TO "service_role";

GRANT ALL ON FUNCTION "public"."convert_number_to_percent"("val" double precision, "max_val" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."convert_number_to_percent"("val" double precision, "max_val" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."convert_number_to_percent"("val" double precision, "max_val" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."convert_number_to_percent"("val" double precision, "max_val" double precision) TO "service_role";

GRANT ALL ON FUNCTION "public"."count_all_apps"() TO "postgres";
GRANT ALL ON FUNCTION "public"."count_all_apps"() TO "anon";
GRANT ALL ON FUNCTION "public"."count_all_apps"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_all_apps"() TO "service_role";

GRANT ALL ON FUNCTION "public"."count_all_need_upgrade"() TO "postgres";
GRANT ALL ON FUNCTION "public"."count_all_need_upgrade"() TO "anon";
GRANT ALL ON FUNCTION "public"."count_all_need_upgrade"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_all_need_upgrade"() TO "service_role";

GRANT ALL ON FUNCTION "public"."count_all_onboarded"() TO "postgres";
GRANT ALL ON FUNCTION "public"."count_all_onboarded"() TO "anon";
GRANT ALL ON FUNCTION "public"."count_all_onboarded"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_all_onboarded"() TO "service_role";

GRANT ALL ON FUNCTION "public"."count_all_paying"() TO "postgres";
GRANT ALL ON FUNCTION "public"."count_all_paying"() TO "anon";
GRANT ALL ON FUNCTION "public"."count_all_paying"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_all_paying"() TO "service_role";

GRANT ALL ON FUNCTION "public"."count_all_plans"() TO "postgres";
GRANT ALL ON FUNCTION "public"."count_all_plans"() TO "anon";
GRANT ALL ON FUNCTION "public"."count_all_plans"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_all_plans"() TO "service_role";

GRANT ALL ON FUNCTION "public"."count_all_trial"() TO "postgres";
GRANT ALL ON FUNCTION "public"."count_all_trial"() TO "anon";
GRANT ALL ON FUNCTION "public"."count_all_trial"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_all_trial"() TO "service_role";

GRANT ALL ON FUNCTION "public"."count_all_updates"() TO "postgres";
GRANT ALL ON FUNCTION "public"."count_all_updates"() TO "anon";
GRANT ALL ON FUNCTION "public"."count_all_updates"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_all_updates"() TO "service_role";

GRANT ALL ON FUNCTION "public"."exist_app_v2"("appid" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."exist_app_v2"("appid" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."exist_app_v2"("appid" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."exist_app_v2"("appid" character varying) TO "service_role";

GRANT ALL ON FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."exist_user"("e_mail" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."exist_user"("e_mail" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."exist_user"("e_mail" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."exist_user"("e_mail" character varying) TO "service_role";

GRANT ALL ON FUNCTION "public"."get_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."get_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_current_plan_max"("userid" "uuid") TO "postgres";
GRANT ALL ON FUNCTION "public"."get_current_plan_max"("userid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_plan_max"("userid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_plan_max"("userid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_current_plan_name"("userid" "uuid") TO "postgres";
GRANT ALL ON FUNCTION "public"."get_current_plan_name"("userid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_plan_name"("userid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_plan_name"("userid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_devices_version"("app_id" character varying, "version_id" bigint) TO "postgres";
GRANT ALL ON FUNCTION "public"."get_devices_version"("app_id" character varying, "version_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."get_devices_version"("app_id" character varying, "version_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_devices_version"("app_id" character varying, "version_id" bigint) TO "service_role";

GRANT ALL ON FUNCTION "public"."get_max_plan"("userid" "uuid") TO "postgres";
GRANT ALL ON FUNCTION "public"."get_max_plan"("userid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_max_plan"("userid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_max_plan"("userid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_metered_usage"("userid" "uuid") TO "postgres";
GRANT ALL ON FUNCTION "public"."get_metered_usage"("userid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_metered_usage"("userid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_metered_usage"("userid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_plan_usage_percent"("userid" "uuid", "dateid" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."get_plan_usage_percent"("userid" "uuid", "dateid" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."get_plan_usage_percent"("userid" "uuid", "dateid" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_plan_usage_percent"("userid" "uuid", "dateid" character varying) TO "service_role";

GRANT ALL ON FUNCTION "public"."get_total_stats_v2"("userid" "uuid", "dateid" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."get_total_stats_v2"("userid" "uuid", "dateid" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."get_total_stats_v2"("userid" "uuid", "dateid" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_total_stats_v2"("userid" "uuid", "dateid" character varying) TO "service_role";

GRANT ALL ON FUNCTION "public"."get_user_id"("apikey" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."get_user_id"("apikey" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_id"("apikey" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_id"("apikey" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."has_min_right"("_userid" "uuid", "_orgid" "uuid", "_right" "public"."user_min_right", "_appid" character varying, "_channelid" bigint) TO "postgres";
GRANT ALL ON FUNCTION "public"."has_min_right"("_userid" "uuid", "_orgid" "uuid", "_right" "public"."user_min_right", "_appid" character varying, "_channelid" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."has_min_right"("_userid" "uuid", "_orgid" "uuid", "_right" "public"."user_min_right", "_appid" character varying, "_channelid" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_min_right"("_userid" "uuid", "_orgid" "uuid", "_right" "public"."user_min_right", "_appid" character varying, "_channelid" bigint) TO "service_role";

GRANT ALL ON FUNCTION "public"."increment_store"("app_id" character varying, "updates" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."increment_store"("app_id" character varying, "updates" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_store"("app_id" character varying, "updates" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_store"("app_id" character varying, "updates" integer) TO "service_role";

GRANT ALL ON FUNCTION "public"."is_admin"("userid" "uuid") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_admin"("userid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"("userid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"("userid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_allowed_action"("apikey" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_allowed_action"("apikey" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_allowed_action"("apikey" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_allowed_action"("apikey" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_allowed_action_user"("userid" "uuid") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_allowed_action_user"("userid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_allowed_action_user"("userid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_allowed_action_user"("userid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[]) TO "service_role";

GRANT ALL ON FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[], "app_id" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[], "app_id" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[], "app_id" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[], "app_id" character varying) TO "service_role";

GRANT ALL ON FUNCTION "public"."is_app_owner"("userid" "uuid", "appid" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."is_app_owner"("userid" "uuid", "appid" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."is_app_owner"("userid" "uuid", "appid" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_app_owner"("userid" "uuid", "appid" character varying) TO "service_role";

GRANT ALL ON FUNCTION "public"."is_app_shared"("userid" "uuid", "appid" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."is_app_shared"("userid" "uuid", "appid" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."is_app_shared"("userid" "uuid", "appid" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_app_shared"("userid" "uuid", "appid" character varying) TO "service_role";

GRANT ALL ON FUNCTION "public"."is_canceled"("userid" "uuid") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_canceled"("userid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_canceled"("userid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_canceled"("userid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_free_usage"("userid" "uuid") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_free_usage"("userid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_free_usage"("userid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_free_usage"("userid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_good_plan_v3"("userid" "uuid") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_good_plan_v3"("userid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_good_plan_v3"("userid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_good_plan_v3"("userid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_in_channel"("userid" "uuid", "ownerid" "uuid") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_in_channel"("userid" "uuid", "ownerid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_in_channel"("userid" "uuid", "ownerid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_in_channel"("userid" "uuid", "ownerid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_not_deleted"("email_check" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."is_not_deleted"("email_check" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."is_not_deleted"("email_check" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_not_deleted"("email_check" character varying) TO "service_role";

GRANT ALL ON FUNCTION "public"."is_onboarded"("userid" "uuid") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_onboarded"("userid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_onboarded"("userid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_onboarded"("userid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_onboarding_needed"("userid" "uuid") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_onboarding_needed"("userid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_onboarding_needed"("userid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_onboarding_needed"("userid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_paying"("userid" "uuid") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_paying"("userid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_paying"("userid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_paying"("userid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_trial"("userid" "uuid") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_trial"("userid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_trial"("userid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_trial"("userid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_version_shared"("userid" "uuid", "versionid" bigint) TO "postgres";
GRANT ALL ON FUNCTION "public"."is_version_shared"("userid" "uuid", "versionid" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."is_version_shared"("userid" "uuid", "versionid" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_version_shared"("userid" "uuid", "versionid" bigint) TO "service_role";

GRANT ALL ON TABLE "public"."apikeys" TO "postgres";
GRANT ALL ON TABLE "public"."apikeys" TO "anon";
GRANT ALL ON TABLE "public"."apikeys" TO "authenticated";
GRANT ALL ON TABLE "public"."apikeys" TO "service_role";

GRANT ALL ON SEQUENCE "public"."apikeys_id_seq" TO "postgres";
GRANT ALL ON SEQUENCE "public"."apikeys_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."apikeys_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."apikeys_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."app_stats" TO "anon";
GRANT ALL ON TABLE "public"."app_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."app_stats" TO "service_role";

GRANT ALL ON TABLE "public"."app_versions" TO "postgres";
GRANT ALL ON TABLE "public"."app_versions" TO "anon";
GRANT ALL ON TABLE "public"."app_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."app_versions" TO "service_role";

GRANT ALL ON SEQUENCE "public"."app_versions_id_seq" TO "postgres";
GRANT ALL ON SEQUENCE "public"."app_versions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."app_versions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."app_versions_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."app_versions_meta" TO "postgres";
GRANT ALL ON TABLE "public"."app_versions_meta" TO "anon";
GRANT ALL ON TABLE "public"."app_versions_meta" TO "authenticated";
GRANT ALL ON TABLE "public"."app_versions_meta" TO "service_role";

GRANT ALL ON SEQUENCE "public"."app_versions_meta_id_seq" TO "postgres";
GRANT ALL ON SEQUENCE "public"."app_versions_meta_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."app_versions_meta_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."app_versions_meta_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."apps" TO "postgres";
GRANT ALL ON TABLE "public"."apps" TO "anon";
GRANT ALL ON TABLE "public"."apps" TO "authenticated";
GRANT ALL ON TABLE "public"."apps" TO "service_role";

GRANT ALL ON TABLE "public"."channel_devices" TO "postgres";
GRANT ALL ON TABLE "public"."channel_devices" TO "anon";
GRANT ALL ON TABLE "public"."channel_devices" TO "authenticated";
GRANT ALL ON TABLE "public"."channel_devices" TO "service_role";

GRANT ALL ON TABLE "public"."channels" TO "postgres";
GRANT ALL ON TABLE "public"."channels" TO "anon";
GRANT ALL ON TABLE "public"."channels" TO "authenticated";
GRANT ALL ON TABLE "public"."channels" TO "service_role";

GRANT ALL ON SEQUENCE "public"."channel_id_seq" TO "postgres";
GRANT ALL ON SEQUENCE "public"."channel_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."channel_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."channel_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."channel_users" TO "postgres";
GRANT ALL ON TABLE "public"."channel_users" TO "anon";
GRANT ALL ON TABLE "public"."channel_users" TO "authenticated";
GRANT ALL ON TABLE "public"."channel_users" TO "service_role";

GRANT ALL ON SEQUENCE "public"."channel_users_id_seq" TO "postgres";
GRANT ALL ON SEQUENCE "public"."channel_users_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."channel_users_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."channel_users_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."deleted_account" TO "postgres";
GRANT ALL ON TABLE "public"."deleted_account" TO "anon";
GRANT ALL ON TABLE "public"."deleted_account" TO "authenticated";
GRANT ALL ON TABLE "public"."deleted_account" TO "service_role";

GRANT ALL ON TABLE "public"."devices" TO "postgres";
GRANT ALL ON TABLE "public"."devices" TO "anon";
GRANT ALL ON TABLE "public"."devices" TO "authenticated";
GRANT ALL ON TABLE "public"."devices" TO "service_role";

GRANT ALL ON TABLE "public"."devices_override" TO "postgres";
GRANT ALL ON TABLE "public"."devices_override" TO "anon";
GRANT ALL ON TABLE "public"."devices_override" TO "authenticated";
GRANT ALL ON TABLE "public"."devices_override" TO "service_role";

GRANT ALL ON TABLE "public"."global_stats" TO "postgres";
GRANT ALL ON TABLE "public"."global_stats" TO "anon";
GRANT ALL ON TABLE "public"."global_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."global_stats" TO "service_role";

GRANT ALL ON TABLE "public"."notifications" TO "postgres";
GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";

GRANT ALL ON TABLE "public"."org_users" TO "postgres";
GRANT ALL ON TABLE "public"."org_users" TO "anon";
GRANT ALL ON TABLE "public"."org_users" TO "authenticated";
GRANT ALL ON TABLE "public"."org_users" TO "service_role";

GRANT ALL ON SEQUENCE "public"."org_users_id_seq" TO "postgres";
GRANT ALL ON SEQUENCE "public"."org_users_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."org_users_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."org_users_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."orgs" TO "postgres";
GRANT ALL ON TABLE "public"."orgs" TO "anon";
GRANT ALL ON TABLE "public"."orgs" TO "authenticated";
GRANT ALL ON TABLE "public"."orgs" TO "service_role";

GRANT ALL ON TABLE "public"."plans" TO "anon";
GRANT ALL ON TABLE "public"."plans" TO "authenticated";
GRANT ALL ON TABLE "public"."plans" TO "service_role";

GRANT ALL ON TABLE "public"."stats" TO "postgres";
GRANT ALL ON TABLE "public"."stats" TO "anon";
GRANT ALL ON TABLE "public"."stats" TO "authenticated";
GRANT ALL ON TABLE "public"."stats" TO "service_role";

GRANT ALL ON TABLE "public"."store_apps" TO "postgres";
GRANT ALL ON TABLE "public"."store_apps" TO "anon";
GRANT ALL ON TABLE "public"."store_apps" TO "authenticated";
GRANT ALL ON TABLE "public"."store_apps" TO "service_role";

-- GRANT ALL ON TABLE "public"."stripe_customers" TO "postgres";
-- GRANT ALL ON TABLE "public"."stripe_customers" TO "anon";
-- GRANT ALL ON TABLE "public"."stripe_customers" TO "authenticated";
-- GRANT ALL ON TABLE "public"."stripe_customers" TO "service_role";

GRANT ALL ON TABLE "public"."stripe_info" TO "postgres";
GRANT ALL ON TABLE "public"."stripe_info" TO "anon";
GRANT ALL ON TABLE "public"."stripe_info" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_info" TO "service_role";

-- GRANT ALL ON TABLE "public"."stripe_products" TO "postgres";
-- GRANT ALL ON TABLE "public"."stripe_products" TO "anon";
-- GRANT ALL ON TABLE "public"."stripe_products" TO "authenticated";
-- GRANT ALL ON TABLE "public"."stripe_products" TO "service_role";

-- GRANT ALL ON TABLE "public"."stripe_subscriptions" TO "postgres";
-- GRANT ALL ON TABLE "public"."stripe_subscriptions" TO "anon";
-- GRANT ALL ON TABLE "public"."stripe_subscriptions" TO "authenticated";
-- GRANT ALL ON TABLE "public"."stripe_subscriptions" TO "service_role";

GRANT ALL ON TABLE "public"."users" TO "postgres";
GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";

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
