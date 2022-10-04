--
-- PostgreSQL database dump
--

-- Dumped from database version 14.1
-- Dumped by pg_dump version 14.5 (Debian 14.5-1.pgdg110+1)

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

--
-- Name: pg_cron; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "extensions";


--
-- Name: pg_net; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";


--
-- Name: http; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "http" WITH SCHEMA "extensions";


--
-- Name: moddatetime; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "moddatetime" WITH SCHEMA "extensions";


--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";


--
-- Name: pgjwt; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";


--
-- Name: app_mode; Type: TYPE; Schema: public; Owner: supabase_admin
--

CREATE TYPE "public"."app_mode" AS ENUM (
    'prod',
    'dev',
    'livereload'
);


ALTER TYPE "public"."app_mode" OWNER TO "supabase_admin";

--
-- Name: key_mode; Type: TYPE; Schema: public; Owner: supabase_admin
--

CREATE TYPE "public"."key_mode" AS ENUM (
    'read',
    'write',
    'all',
    'upload'
);


ALTER TYPE "public"."key_mode" OWNER TO "supabase_admin";

--
-- Name: pay_as_you_go_type; Type: TYPE; Schema: public; Owner: supabase_admin
--

CREATE TYPE "public"."pay_as_you_go_type" AS ENUM (
    'base',
    'units'
);


ALTER TYPE "public"."pay_as_you_go_type" OWNER TO "supabase_admin";

--
-- Name: platform_os; Type: TYPE; Schema: public; Owner: supabase_admin
--

CREATE TYPE "public"."platform_os" AS ENUM (
    'ios',
    'android'
);


ALTER TYPE "public"."platform_os" OWNER TO "supabase_admin";

--
-- Name: stripe_status; Type: TYPE; Schema: public; Owner: supabase_admin
--

CREATE TYPE "public"."stripe_status" AS ENUM (
    'created',
    'succeeded',
    'updated',
    'failed',
    'deleted',
    'canceled'
);


ALTER TYPE "public"."stripe_status" OWNER TO "supabase_admin";

--
-- Name: count_all_apps(); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION "public"."count_all_apps"() RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
Begin
  RETURN (SELECT
(SELECT COUNT(*) FROM apps)+
(SELECT COUNT(DISTINCT app_id) FROM devices_onprem)
AS SumCount);
End;  
$$;


ALTER FUNCTION "public"."count_all_apps"() OWNER TO "supabase_admin";

--
-- Name: count_all_updates(); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION "public"."count_all_updates"() RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
Begin
  RETURN (SELECT
(SELECT COUNT(*) FROM stats_onprem WHERE action='set')+
(SELECT COUNT(*) FROM stats WHERE action='set')
AS SumCount);
End;  
$$;


ALTER FUNCTION "public"."count_all_updates"() OWNER TO "supabase_admin";

--
-- Name: exist_app(character varying, "text"); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION "public"."exist_app"("appid" character varying, "apikey" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM apps
  WHERE app_id=appid
  AND user_id=get_user_id(apikey)));
End;  
$$;


ALTER FUNCTION "public"."exist_app"("appid" character varying, "apikey" "text") OWNER TO "supabase_admin";

--
-- Name: exist_app_versions(character varying, character varying, "text"); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

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


ALTER FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") OWNER TO "supabase_admin";

--
-- Name: exist_channel(character varying, character varying, "text"); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION "public"."exist_channel"("appid" character varying, "name_channel" character varying, "apikey" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM channels
  WHERE app_id=appid
  AND name=name_channel
  AND created_by=get_user_id(apikey)));
End;  
$$;


ALTER FUNCTION "public"."exist_channel"("appid" character varying, "name_channel" character varying, "apikey" "text") OWNER TO "supabase_admin";

--
-- Name: exist_user(character varying); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION "public"."exist_user"("e_mail" character varying) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT id
  FROM auth.users
  WHERE email=e_mail);
End;  
$$;


ALTER FUNCTION "public"."exist_user"("e_mail" character varying) OWNER TO "supabase_admin";

--
-- Name: find_best_plan(bigint, bigint, bigint, bigint, bigint); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION "public"."find_best_plan"("apps_n" bigint, "channels_n" bigint, "updates_n" bigint, "versions_n" bigint, "shared_n" bigint) RETURNS character varying
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT name
  FROM plans
  WHERE app>=apps_n
    AND channel>=channels_n
    AND update>=updates_n
    AND version>=versions_n
    AND shared>=shared_n
    ORDER BY app
    LIMIT 1);
End;  
$$;


ALTER FUNCTION "public"."find_best_plan"("apps_n" bigint, "channels_n" bigint, "updates_n" bigint, "versions_n" bigint, "shared_n" bigint) OWNER TO "supabase_admin";

--
-- Name: find_best_plan_v2(bigint, bigint, bigint); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION "public"."find_best_plan_v2"("mau" bigint, "storage" bigint, "bandwidth" bigint) RETURNS character varying
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT name
  FROM plans
  WHERE plans.mau>=find_best_plan_v2.mau
    AND plans.storage>=find_best_plan_v2.storage
    AND plans.bandwidth>=find_best_plan_v2.bandwidth
    ORDER BY app
    LIMIT 1);
End;  
$$;


ALTER FUNCTION "public"."find_best_plan_v2"("mau" bigint, "storage" bigint, "bandwidth" bigint) OWNER TO "supabase_admin";

--
-- Name: find_fit_plan(bigint, bigint, bigint, bigint, bigint); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION "public"."find_fit_plan"("apps_n" bigint, "channels_n" bigint, "updates_n" bigint, "versions_n" bigint, "shared_n" bigint) RETURNS TABLE("name" character varying)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
-- select array[contacts_primarycountry::text, contacts_othercountry::text]
  RETURN QUERY (SELECT plans.name
  FROM plans

  WHERE app>=apps_n
    AND channel>=channels_n
    AND update>=updates_n
    AND version>=versions_n
    AND shared>=shared_n
    ORDER BY app);
End;  
$$;


ALTER FUNCTION "public"."find_fit_plan"("apps_n" bigint, "channels_n" bigint, "updates_n" bigint, "versions_n" bigint, "shared_n" bigint) OWNER TO "supabase_admin";

--
-- Name: find_fit_plan_v2(bigint, bigint, bigint); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION "public"."find_fit_plan_v2"("mau" bigint, "storage" bigint, "bandwidth" bigint) RETURNS TABLE("name" character varying)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN QUERY (SELECT plans.name
  FROM plans
  WHERE plans.mau>=find_fit_plan_v2.mau
    AND plans.storage>=find_fit_plan_v2.storage
    AND plans.bandwidth>=find_fit_plan_v2.bandwidth
    ORDER BY app);
End;  
$$;


ALTER FUNCTION "public"."find_fit_plan_v2"("mau" bigint, "storage" bigint, "bandwidth" bigint) OWNER TO "supabase_admin";

--
-- Name: get_current_plan_name("uuid"); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

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
    AND status = 'succeeded'));
End;  
$$;


ALTER FUNCTION "public"."get_current_plan_name"("userid" "uuid") OWNER TO "supabase_admin";

--
-- Name: get_dl_by_month("uuid", integer); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION "public"."get_dl_by_month"("userid" "uuid", "pastmonth" integer) RETURNS TABLE("app_id" character varying, "maxdownload" bigint)
    LANGUAGE "plpgsql"
    AS $$

BEGIN
    RETURN QUERY
    SELECT stats.app_id, COUNT(stats.app_id) AS maxDownload
    FROM stats 
    WHERE stats.app_id IN (
      SELECT apps.app_id
      FROM apps 
      WHERE apps.user_id=userid
    )
    AND action='set'
    AND created_at
    
      BETWEEN date_trunc('month', current_date)-(pastMonth || ' months')::interval
      AND date_trunc('month', current_date)-(pastMonth || ' months')::interval+'1month'::interval-'1day'::interval
    GROUP BY stats.app_id;
END;
$$;


ALTER FUNCTION "public"."get_dl_by_month"("userid" "uuid", "pastmonth" integer) OWNER TO "supabase_admin";

--
-- Name: get_dl_by_month_by_app(integer, character varying); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION "public"."get_dl_by_month_by_app"("pastmonth" integer, "appid" character varying) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
BEGIN
   RETURN (
   SELECT count(stats.app_id)::int
   FROM stats
   WHERE stats.app_id = appid
    AND action='set'
    AND created_at
      BETWEEN date_trunc('month', current_date)-(pastMonth || ' months')::interval
      AND date_trunc('month', current_date)-(pastMonth || ' months')::interval+'1month'::interval-'1day'::interval
   );
END
$$;


ALTER FUNCTION "public"."get_dl_by_month_by_app"("pastmonth" integer, "appid" character varying) OWNER TO "supabase_admin";

--
-- Name: get_dl_by_month_by_app("uuid", integer, character varying); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION "public"."get_dl_by_month_by_app"("userid" "uuid", "pastmonth" integer, "appid" character varying) RETURNS TABLE("app_id" character varying, "maxdownload" bigint)
    LANGUAGE "plpgsql"
    AS $$

BEGIN
    RETURN QUERY
    SELECT 
    stats.app_id,
    COUNT(stats.app_id) AS maxDownload
    FROM stats 
    WHERE stats.app_id = appid
    AND action='set'
    AND created_at
    
      BETWEEN date_trunc('month', current_date)-(pastMonth || ' months')::interval
      AND date_trunc('month', current_date)-(pastMonth || ' months')::interval+'1month'::interval-'1day'::interval
    GROUP BY stats.app_id;
END;
$$;


ALTER FUNCTION "public"."get_dl_by_month_by_app"("userid" "uuid", "pastmonth" integer, "appid" character varying) OWNER TO "supabase_admin";

--
-- Name: get_max_channel("uuid"); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION "public"."get_max_channel"("userid" "uuid") RETURNS integer
    LANGUAGE "plpgsql"
    AS $$  
Declare  
 Channel_count integer;  
Begin
  SELECT MAX (maxChannel)
  INTO Channel_count
  FROM (
    SELECT app_id, COUNT(app_id) AS maxChannel
    FROM channels 
    WHERE created_by=userid
    GROUP BY app_id
  ) AS derivedTable;
  return Channel_count;
End;  
$$;


ALTER FUNCTION "public"."get_max_channel"("userid" "uuid") OWNER TO "supabase_admin";

--
-- Name: get_max_shared("uuid"); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION "public"."get_max_shared"("userid" "uuid") RETURNS integer
    LANGUAGE "plpgsql"
    AS $$  
Declare  
 Shared_count integer;  
Begin
  SELECT MAX (maxShared)
  INTO Shared_count
  FROM (
    SELECT app_id, COUNT(app_id) AS maxShared
    FROM channel_users 
    WHERE created_by=userid
    GROUP BY app_id
  ) AS derivedTable;
  return Shared_count;
End;  
$$;


ALTER FUNCTION "public"."get_max_shared"("userid" "uuid") OWNER TO "supabase_admin";

--
-- Name: get_max_stats("uuid", character varying); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION "public"."get_max_stats"("userid" "uuid", "dateid" character varying) RETURNS TABLE("max_channel" bigint, "max_shared" bigint, "max_update" bigint, "max_version" bigint, "max_app" bigint, "max_device" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN QUERY SELECT 
    MAX(channels)::bigint AS max_channel,
    MAX(shared)::bigint AS max_shared,
    (SELECT
      MAX(MyMaxName) 
    FROM ( VALUES 
              (MAX(mlu)), 
              (MAX(mlu_real)) 
          ) MyAlias(MyMaxName))::bigint AS max_update,
    MAX(versions)::bigint AS max_version,
    COUNT(app_id)::bigint AS max_app,
    MAX(devices)::bigint AS max_device
  FROM app_stats
  WHERE user_id = userid
  and date_id=dateid;
End;  
$$;


ALTER FUNCTION "public"."get_max_stats"("userid" "uuid", "dateid" character varying) OWNER TO "supabase_admin";

--
-- Name: get_max_version("uuid"); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION "public"."get_max_version"("userid" "uuid") RETURNS integer
    LANGUAGE "plpgsql"
    AS $$  
Declare  
 Version_count integer;  
Begin
  SELECT MAX (maxVersion)
  INTO Version_count
  FROM (
    SELECT app_id, COUNT(app_id) AS maxVersion
    FROM app_versions 
    WHERE user_id=userid
    GROUP BY app_id
  ) AS derivedTable;
  return Version_count;
End;  
$$;


ALTER FUNCTION "public"."get_max_version"("userid" "uuid") OWNER TO "supabase_admin";

--
-- Name: get_stats("uuid", character varying); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION "public"."get_stats"("userid" "uuid", "dateid" character varying) RETURNS TABLE("max_channel" bigint, "max_shared" bigint, "max_update" bigint, "max_version" bigint, "max_app" bigint, "max_device" bigint, "mau" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN QUERY SELECT 
    MAX(channels)::bigint AS max_channel,
    MAX(shared)::bigint AS max_shared,
    (SELECT
      MAX(MyMaxName) 
    FROM ( VALUES 
              (MAX(mlu)), 
              (MAX(mlu_real)) 
          ) MyAlias(MyMaxName))::bigint AS max_update,
    MAX(versions)::bigint AS max_version,
    COUNT(app_id)::bigint AS max_app,
    MAX(devices)::bigint AS max_device,
    SUM(devices)::bigint AS mau
  FROM app_stats
  WHERE user_id = userid
  and date_id=dateid;
End;  
$$;


ALTER FUNCTION "public"."get_stats"("userid" "uuid", "dateid" character varying) OWNER TO "supabase_admin";

--
-- Name: get_total_stats("uuid", character varying); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION "public"."get_total_stats"("userid" "uuid", "dateid" character varying) RETURNS TABLE("mau" bigint, "storage" bigint, "bandwidth" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN QUERY SELECT 
    SUM(devices)::bigint AS mau,
    SUM(version_size)::bigint AS storage,
    SUM(app_stats.bandwidth)::bigint AS bandwidth
  FROM app_stats
  WHERE user_id = userid
  AND date_id=dateid;
End;  
$$;


ALTER FUNCTION "public"."get_total_stats"("userid" "uuid", "dateid" character varying) OWNER TO "supabase_admin";

--
-- Name: get_user_id("text"); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

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


ALTER FUNCTION "public"."get_user_id"("apikey" "text") OWNER TO "supabase_admin";

--
-- Name: increment_stats(character varying, character varying, integer, integer, integer, integer, integer, integer, integer, integer); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION "public"."increment_stats"("app_id" character varying, "date_id" character varying, "bandwidth" integer, "version_size" integer, "channels" integer, "shared" integer, "mlu" integer, "mlu_real" integer, "versions" integer, "devices" integer) RETURNS "void"
    LANGUAGE "sql"
    AS $$
  update app_stats 
  set bandwidth = app_stats.bandwidth + increment_stats.bandwidth,
    version_size = app_stats.version_size + increment_stats.version_size,
    channels = app_stats.channels + increment_stats.channels,
    shared = app_stats.shared + increment_stats.shared,
    mlu = app_stats.mlu + increment_stats.mlu,
    devices = app_stats.devices + increment_stats.devices,
    mlu_real = app_stats.mlu_real + increment_stats.mlu_real,
    versions = app_stats.versions + increment_stats.versions
  where app_stats.date_id = increment_stats.date_id and
  app_stats.app_id = increment_stats.app_id
$$;


ALTER FUNCTION "public"."increment_stats"("app_id" character varying, "date_id" character varying, "bandwidth" integer, "version_size" integer, "channels" integer, "shared" integer, "mlu" integer, "mlu_real" integer, "versions" integer, "devices" integer) OWNER TO "supabase_admin";

--
-- Name: increment_version_stats(character varying, bigint, integer); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION "public"."increment_version_stats"("app_id" character varying, "version_id" bigint, "devices" integer) RETURNS "void"
    LANGUAGE "sql"
    AS $$
  update app_versions_meta 
  set devices = (CASE WHEN (app_versions_meta.devices + increment_version_stats.devices > 0) THEN app_versions_meta.devices + increment_version_stats.devices ELSE 0 END)
  where app_versions_meta.id = increment_version_stats.version_id and
  app_versions_meta.app_id = increment_version_stats.app_id
$$;


ALTER FUNCTION "public"."increment_version_stats"("app_id" character varying, "version_id" bigint, "devices" integer) OWNER TO "supabase_admin";

--
-- Name: is_allowed_action("text"); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION "public"."is_allowed_action"("apikey" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN is_trial(get_user_id(apikey)) > 0 or is_good_plan(get_user_id(apikey));
End;
$$;


ALTER FUNCTION "public"."is_allowed_action"("apikey" "text") OWNER TO "supabase_admin";

--
-- Name: is_allowed_capgkey("text", "public"."key_mode"[]); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

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


ALTER FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[]) OWNER TO "supabase_admin";

--
-- Name: is_allowed_capgkey("text", "public"."key_mode"[], character varying); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

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


ALTER FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[], "app_id" character varying) OWNER TO "supabase_admin";

--
-- Name: is_app_owner("uuid", character varying); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

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


ALTER FUNCTION "public"."is_app_owner"("userid" "uuid", "appid" character varying) OWNER TO "supabase_admin";

--
-- Name: is_app_shared("uuid", character varying); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

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


ALTER FUNCTION "public"."is_app_shared"("userid" "uuid", "appid" character varying) OWNER TO "supabase_admin";

--
-- Name: is_canceled("uuid"); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION "public"."is_canceled"("userid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  from stripe_info
  where customer_id=(SELECT customer_id from users where id=userid)
  AND status = 'canceled'));
End;  
$$;


ALTER FUNCTION "public"."is_canceled"("userid" "uuid") OWNER TO "supabase_admin";

--
-- Name: is_good_plan("uuid"); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION "public"."is_good_plan"("userid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (
    SELECT EXISTS (
      With
      max_stats AS (select * from  get_max_stats(userid, to_char(now(), 'YYYY-MM'))),
      best_plan AS (
        select * from find_fit_plan(
          (select max_app from max_stats),
          (select max_channel from max_stats),
          (select max_update from max_stats),
          (select max_version from max_stats),
          (select max_shared from max_stats)
        ))
    select 1 from best_plan where best_plan.name = (SELECT get_current_plan_name(userid))
    )
  );
End;
$$;


ALTER FUNCTION "public"."is_good_plan"("userid" "uuid") OWNER TO "supabase_admin";

--
-- Name: is_good_plan_v2("uuid"); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION "public"."is_good_plan_v2"("userid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (
    SELECT EXISTS (
      With
      total_stats AS (select * from  get_total_stats(userid, to_char(now(), 'YYYY-MM'))),
      best_plan AS (
        select * from find_fit_plan_v2(
          (select mau from total_stats),
          (select storage from total_stats),
          (select bandwidth from total_stats)
        ))
    select 1 from best_plan where best_plan.name = (SELECT get_current_plan_name(userid))
    )
  );
End;
$$;


ALTER FUNCTION "public"."is_good_plan_v2"("userid" "uuid") OWNER TO "supabase_admin";

--
-- Name: is_in_channel("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

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


ALTER FUNCTION "public"."is_in_channel"("userid" "uuid", "ownerid" "uuid") OWNER TO "supabase_admin";

--
-- Name: is_not_deleted(character varying); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

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


ALTER FUNCTION "public"."is_not_deleted"("email_check" character varying) OWNER TO "supabase_admin";

--
-- Name: is_paying("uuid"); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

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


ALTER FUNCTION "public"."is_paying"("userid" "uuid") OWNER TO "supabase_admin";

--
-- Name: is_trial("uuid"); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION "public"."is_trial"("userid" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT (trial_at::date - (now() - interval '1 month')::date) AS days
  from stripe_info
  where customer_id=(SELECT customer_id from users where id=userid)
  AND trial_at > (now() - interval '1 month'));
End;  
$$;


ALTER FUNCTION "public"."is_trial"("userid" "uuid") OWNER TO "supabase_admin";

--
-- Name: is_version_shared("uuid", bigint); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

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


ALTER FUNCTION "public"."is_version_shared"("userid" "uuid", "versionid" bigint) OWNER TO "supabase_admin";

SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: apikeys; Type: TABLE; Schema: public; Owner: supabase_admin
--

CREATE TABLE "public"."apikeys" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" NOT NULL,
    "key" character varying NOT NULL,
    "mode" "public"."key_mode" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."apikeys" OWNER TO "supabase_admin";

--
-- Name: apikeys_id_seq; Type: SEQUENCE; Schema: public; Owner: supabase_admin
--

ALTER TABLE "public"."apikeys" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."apikeys_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: app_stats; Type: TABLE; Schema: public; Owner: postgres
--

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
    "version_size" bigint DEFAULT '0'::bigint,
    "bandwidth" bigint DEFAULT '0'::bigint
);


ALTER TABLE "public"."app_stats" OWNER TO "postgres";

--
-- Name: app_stats_onprem; Type: TABLE; Schema: public; Owner: supabase_admin
--

CREATE TABLE "public"."app_stats_onprem" (
    "app_id" character varying NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "mlu" bigint DEFAULT '0'::bigint,
    "versions" bigint DEFAULT '0'::bigint,
    "mlu_real" bigint DEFAULT '0'::bigint,
    "date_id" character varying NOT NULL,
    "devices" bigint DEFAULT '0'::bigint
);


ALTER TABLE "public"."app_stats_onprem" OWNER TO "supabase_admin";

--
-- Name: app_versions; Type: TABLE; Schema: public; Owner: supabase_admin
--

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
    "checksum" character varying
);


ALTER TABLE "public"."app_versions" OWNER TO "supabase_admin";

--
-- Name: app_versions_id_seq; Type: SEQUENCE; Schema: public; Owner: supabase_admin
--

ALTER TABLE "public"."app_versions" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."app_versions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: app_versions_meta; Type: TABLE; Schema: public; Owner: supabase_admin
--

CREATE TABLE "public"."app_versions_meta" (
    "created_at" timestamp with time zone DEFAULT "now"(),
    "app_id" character varying NOT NULL,
    "user_id" "uuid" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "checksum" character varying NOT NULL,
    "size" bigint NOT NULL,
    "id" bigint NOT NULL,
    "devices" bigint DEFAULT '0'::bigint
);


ALTER TABLE "public"."app_versions_meta" OWNER TO "supabase_admin";

--
-- Name: app_versions_meta_id_seq; Type: SEQUENCE; Schema: public; Owner: supabase_admin
--

ALTER TABLE "public"."app_versions_meta" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."app_versions_meta_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: apps; Type: TABLE; Schema: public; Owner: supabase_admin
--

CREATE TABLE "public"."apps" (
    "created_at" timestamp with time zone DEFAULT "now"(),
    "app_id" character varying NOT NULL,
    "icon_url" character varying NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" character varying,
    "last_version" character varying,
    "updated_at" timestamp with time zone,
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"()
);


ALTER TABLE "public"."apps" OWNER TO "supabase_admin";

--
-- Name: channel_devices; Type: TABLE; Schema: public; Owner: supabase_admin
--

CREATE TABLE "public"."channel_devices" (
    "created_at" timestamp with time zone DEFAULT "now"(),
    "channel_id" bigint NOT NULL,
    "app_id" character varying NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "device_id" "text" NOT NULL
);


ALTER TABLE "public"."channel_devices" OWNER TO "supabase_admin";

--
-- Name: channels; Type: TABLE; Schema: public; Owner: supabase_admin
--

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
    "disableAutoUpdateToMajor" boolean DEFAULT true NOT NULL,
    "beta" boolean DEFAULT false NOT NULL,
    "ios" boolean DEFAULT true NOT NULL,
    "android" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."channels" OWNER TO "supabase_admin";

--
-- Name: channel_id_seq; Type: SEQUENCE; Schema: public; Owner: supabase_admin
--

ALTER TABLE "public"."channels" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."channel_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: channel_users; Type: TABLE; Schema: public; Owner: supabase_admin
--

CREATE TABLE "public"."channel_users" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" NOT NULL,
    "channel_id" bigint NOT NULL,
    "app_id" character varying NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);


ALTER TABLE "public"."channel_users" OWNER TO "supabase_admin";

--
-- Name: channel_users_id_seq; Type: SEQUENCE; Schema: public; Owner: supabase_admin
--

ALTER TABLE "public"."channel_users" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."channel_users_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: deleted_account; Type: TABLE; Schema: public; Owner: supabase_admin
--

CREATE TABLE "public"."deleted_account" (
    "created_at" timestamp with time zone DEFAULT "now"(),
    "email" character varying NOT NULL,
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL
);


ALTER TABLE "public"."deleted_account" OWNER TO "supabase_admin";

--
-- Name: devices; Type: TABLE; Schema: public; Owner: supabase_admin
--

CREATE TABLE "public"."devices" (
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "device_id" "text" NOT NULL,
    "version" bigint NOT NULL,
    "app_id" character varying NOT NULL,
    "platform" "public"."platform_os",
    "plugin_version" "text" DEFAULT '2.3.3'::"text" NOT NULL,
    "os_version" character varying,
    "date_id" character varying DEFAULT '""'::character varying,
    "version_build" "text" DEFAULT 'builtin'::"text"
);


ALTER TABLE "public"."devices" OWNER TO "supabase_admin";

--
-- Name: devices_onprem; Type: TABLE; Schema: public; Owner: supabase_admin
--

CREATE TABLE "public"."devices_onprem" (
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "platform" "public"."platform_os",
    "plugin_version" "text" DEFAULT '2.3.3'::"text" NOT NULL,
    "version" character varying,
    "app_id" character varying,
    "device_id" character varying,
    "os_version" character varying,
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "version_build" "text" DEFAULT 'builtin'::"text"
);


ALTER TABLE "public"."devices_onprem" OWNER TO "supabase_admin";

--
-- Name: devices_override; Type: TABLE; Schema: public; Owner: supabase_admin
--

CREATE TABLE "public"."devices_override" (
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "device_id" "text" NOT NULL,
    "version" bigint NOT NULL,
    "app_id" character varying NOT NULL,
    "created_by" "uuid"
);


ALTER TABLE "public"."devices_override" OWNER TO "supabase_admin";

--
-- Name: global_stats; Type: TABLE; Schema: public; Owner: supabase_admin
--

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
    "not_paying" bigint DEFAULT '0'::bigint
);


ALTER TABLE "public"."global_stats" OWNER TO "supabase_admin";

--
-- Name: pay_as_you_go; Type: TABLE; Schema: public; Owner: supabase_admin
--

CREATE TABLE "public"."pay_as_you_go" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "mau" double precision NOT NULL,
    "storage" double precision NOT NULL,
    "bandwidth" double precision NOT NULL,
    "type" "public"."pay_as_you_go_type" NOT NULL
);


ALTER TABLE "public"."pay_as_you_go" OWNER TO "supabase_admin";

--
-- Name: pay_as_you_go_id_seq; Type: SEQUENCE; Schema: public; Owner: supabase_admin
--

ALTER TABLE "public"."pay_as_you_go" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."pay_as_you_go_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: plans; Type: TABLE; Schema: public; Owner: postgres
--

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
    "storage" bigint DEFAULT '0'::bigint NOT NULL,
    "bandwidth" bigint DEFAULT '0'::bigint NOT NULL,
    "mau" bigint DEFAULT '0'::bigint NOT NULL,
    "market_desc" character varying DEFAULT ''::character varying
);


ALTER TABLE "public"."plans" OWNER TO "postgres";

--
-- Name: stats; Type: TABLE; Schema: public; Owner: supabase_admin
--

CREATE TABLE "public"."stats" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "platform" "public"."platform_os" NOT NULL,
    "action" "text" NOT NULL,
    "device_id" "text" NOT NULL,
    "version_build" "text" NOT NULL,
    "version" bigint NOT NULL,
    "app_id" character varying NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."stats" OWNER TO "supabase_admin";

--
-- Name: stats_id_seq; Type: SEQUENCE; Schema: public; Owner: supabase_admin
--

ALTER TABLE "public"."stats" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."stats_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: stats_onprem; Type: TABLE; Schema: public; Owner: supabase_admin
--

CREATE TABLE "public"."stats_onprem" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "platform" "public"."platform_os" NOT NULL,
    "action" "text" NOT NULL,
    "device_id" character varying NOT NULL,
    "version_build" "text" NOT NULL,
    "app_id" character varying NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "version" character varying NOT NULL
);


ALTER TABLE "public"."stats_onprem" OWNER TO "supabase_admin";

--
-- Name: stats_onprem_id_seq; Type: SEQUENCE; Schema: public; Owner: supabase_admin
--

ALTER TABLE "public"."stats_onprem" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."stats_onprem_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: stripe_info; Type: TABLE; Schema: public; Owner: supabase_admin
--

CREATE TABLE "public"."stripe_info" (
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "subscription_id" character varying,
    "customer_id" character varying NOT NULL,
    "status" "public"."stripe_status",
    "product_id" character varying DEFAULT 'free'::character varying NOT NULL,
    "trial_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "price_id" character varying,
    "is_good_plan" boolean DEFAULT true
);


ALTER TABLE "public"."stripe_info" OWNER TO "supabase_admin";

--
-- Name: users; Type: TABLE; Schema: public; Owner: supabase_admin
--

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
    "customer_id" character varying
);


ALTER TABLE "public"."users" OWNER TO "supabase_admin";

--
-- Name: apikeys apikeys_pkey; Type: CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."apikeys"
    ADD CONSTRAINT "apikeys_pkey" PRIMARY KEY ("id");


--
-- Name: app_stats_onprem app_stats_onprem_pkey; Type: CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."app_stats_onprem"
    ADD CONSTRAINT "app_stats_onprem_pkey" PRIMARY KEY ("app_id", "date_id");


--
-- Name: app_stats app_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."app_stats"
    ADD CONSTRAINT "app_stats_pkey" PRIMARY KEY ("app_id", "date_id");


--
-- Name: app_versions_meta app_versions_meta_pkey; Type: CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."app_versions_meta"
    ADD CONSTRAINT "app_versions_meta_pkey" PRIMARY KEY ("id");


--
-- Name: app_versions app_versions_name_app_id_key; Type: CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."app_versions"
    ADD CONSTRAINT "app_versions_name_app_id_key" UNIQUE ("name", "app_id");


--
-- Name: app_versions app_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."app_versions"
    ADD CONSTRAINT "app_versions_pkey" PRIMARY KEY ("id");


--
-- Name: apps apps_pkey; Type: CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."apps"
    ADD CONSTRAINT "apps_pkey" PRIMARY KEY ("app_id");


--
-- Name: channel_devices channel_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."channel_devices"
    ADD CONSTRAINT "channel_devices_pkey" PRIMARY KEY ("device_id");


--
-- Name: channels channel_pkey; Type: CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "channel_pkey" PRIMARY KEY ("id");


--
-- Name: channel_users channel_users_pkey; Type: CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."channel_users"
    ADD CONSTRAINT "channel_users_pkey" PRIMARY KEY ("id");


--
-- Name: deleted_account deleted_account_pkey; Type: CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."deleted_account"
    ADD CONSTRAINT "deleted_account_pkey" PRIMARY KEY ("id");


--
-- Name: devices_onprem devices_onprem_pkey; Type: CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."devices_onprem"
    ADD CONSTRAINT "devices_onprem_pkey" PRIMARY KEY ("id");


--
-- Name: devices_override devices_override_pkey; Type: CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."devices_override"
    ADD CONSTRAINT "devices_override_pkey" PRIMARY KEY ("device_id");


--
-- Name: devices devices_pkey; Type: CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."devices"
    ADD CONSTRAINT "devices_pkey" PRIMARY KEY ("device_id");


--
-- Name: global_stats global_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."global_stats"
    ADD CONSTRAINT "global_stats_pkey" PRIMARY KEY ("date_id");


--
-- Name: pay_as_you_go pay_as_you_go_pkey; Type: CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."pay_as_you_go"
    ADD CONSTRAINT "pay_as_you_go_pkey" PRIMARY KEY ("id");


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("name", "stripe_id", "id");


--
-- Name: plans plans_stripe_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_stripe_id_key" UNIQUE ("stripe_id");


--
-- Name: stats_onprem stats_onprem_pkey; Type: CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."stats_onprem"
    ADD CONSTRAINT "stats_onprem_pkey" PRIMARY KEY ("id");


--
-- Name: stats stats_pkey; Type: CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."stats"
    ADD CONSTRAINT "stats_pkey" PRIMARY KEY ("id");


--
-- Name: stripe_info stripe_info_pkey; Type: CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."stripe_info"
    ADD CONSTRAINT "stripe_info_pkey" PRIMARY KEY ("customer_id");


--
-- Name: users users_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_customer_id_key" UNIQUE ("customer_id");


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");


--
-- Name: app_versions_meta_app_id_idx; Type: INDEX; Schema: public; Owner: supabase_admin
--

CREATE INDEX "app_versions_meta_app_id_idx" ON "public"."app_versions_meta" USING "btree" ("app_id");


--
-- Name: idx_app_id_app_versions; Type: INDEX; Schema: public; Owner: supabase_admin
--

CREATE INDEX "idx_app_id_app_versions" ON "public"."app_versions" USING "btree" ("app_id");


--
-- Name: idx_app_id_devices; Type: INDEX; Schema: public; Owner: supabase_admin
--

CREATE INDEX "idx_app_id_devices" ON "public"."devices" USING "btree" ("app_id");


--
-- Name: idx_app_id_stats; Type: INDEX; Schema: public; Owner: supabase_admin
--

CREATE INDEX "idx_app_id_stats" ON "public"."stats" USING "btree" ("app_id");


--
-- Name: idx_device_id_stats; Type: INDEX; Schema: public; Owner: supabase_admin
--

CREATE INDEX "idx_device_id_stats" ON "public"."stats" USING "btree" ("device_id");


--
-- Name: idx_version_stats; Type: INDEX; Schema: public; Owner: supabase_admin
--

CREATE INDEX "idx_version_stats" ON "public"."stats" USING "btree" ("version");


--
-- Name: app_versions Update_app_last_version; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER "Update_app_last_version" AFTER INSERT ON "public"."app_versions" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://xvwzpoazmxkqosrdewyv.functions.supabase.co/version_trigger', 'POST', '{"Content-type":"application/json","apisecret":"3Te6MchBMMDGNTHTP5Y3p6z7tPmB","authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlhdCI6MTYzNzgwNTAwOSwiZXhwIjoxOTUzMzgxMDA5fQ.8tgID1d4jodPwuo_fz4KHN4o1XKB9fnqyt0_GaJSj-w"}', '{}', '1000');


--
-- Name: apikeys handle_updated_at; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."apikeys" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');


--
-- Name: app_versions handle_updated_at; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."app_versions" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');


--
-- Name: app_versions_meta handle_updated_at; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."app_versions_meta" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');


--
-- Name: apps handle_updated_at; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."apps" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');


--
-- Name: channel_devices handle_updated_at; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."channel_devices" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');


--
-- Name: channel_users handle_updated_at; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."channel_users" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');


--
-- Name: channels handle_updated_at; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."channels" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');


--
-- Name: devices handle_updated_at; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."devices" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');


--
-- Name: devices_onprem handle_updated_at; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."devices_onprem" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');


--
-- Name: devices_override handle_updated_at; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."devices_override" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');


--
-- Name: plans handle_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."plans" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');


--
-- Name: stats handle_updated_at; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."stats" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');


--
-- Name: stats_onprem handle_updated_at; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."stats_onprem" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');


--
-- Name: stripe_info handle_updated_at; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."stripe_info" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');


--
-- Name: users handle_updated_at; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');


--
-- Name: channels on_channel_created; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER "on_channel_created" AFTER INSERT ON "public"."channels" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://xvwzpoazmxkqosrdewyv.functions.supabase.co/on_channel_created', 'POST', '{"Content-type":"application/json","apisecret":"3Te6MchBMMDGNTHTP5Y3p6z7tPmB","authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlhdCI6MTYzNzgwNTAwOSwiZXhwIjoxOTUzMzgxMDA5fQ.8tgID1d4jodPwuo_fz4KHN4o1XKB9fnqyt0_GaJSj-w"}', '{}', '1000');


--
-- Name: channels on_channel_updated; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER "on_channel_updated" AFTER UPDATE ON "public"."channels" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://xvwzpoazmxkqosrdewyv.functions.supabase.co/on_channel_updated', 'POST', '{"Content-type":"application/json","apisecret":"3Te6MchBMMDGNTHTP5Y3p6z7tPmB","authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlhdCI6MTYzNzgwNTAwOSwiZXhwIjoxOTUzMzgxMDA5fQ.8tgID1d4jodPwuo_fz4KHN4o1XKB9fnqyt0_GaJSj-w"}', '{}', '1000');


--
-- Name: stats on_log_created; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER "on_log_created" AFTER INSERT ON "public"."stats" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://xvwzpoazmxkqosrdewyv.functions.supabase.co/on_log_created', 'POST', '{"Content-type":"application/json","apisecret":"3Te6MchBMMDGNTHTP5Y3p6z7tPmB","authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlhdCI6MTYzNzgwNTAwOSwiZXhwIjoxOTUzMzgxMDA5fQ.8tgID1d4jodPwuo_fz4KHN4o1XKB9fnqyt0_GaJSj-w"}', '{}', '1000');


--
-- Name: channel_users on_shared_created; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER "on_shared_created" AFTER INSERT ON "public"."channel_users" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://xvwzpoazmxkqosrdewyv.functions.supabase.co/on_shared_created', 'POST', '{"Content-type":"application/json","apisecret":"3Te6MchBMMDGNTHTP5Y3p6z7tPmB","authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlhdCI6MTYzNzgwNTAwOSwiZXhwIjoxOTUzMzgxMDA5fQ.8tgID1d4jodPwuo_fz4KHN4o1XKB9fnqyt0_GaJSj-w"}', '{}', '1000');


--
-- Name: users on_user_created; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER "on_user_created" AFTER INSERT ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://xvwzpoazmxkqosrdewyv.functions.supabase.co/on_user_created', 'POST', '{"Content-type":"application/json","apisecret":"3Te6MchBMMDGNTHTP5Y3p6z7tPmB","authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlhdCI6MTYzNzgwNTAwOSwiZXhwIjoxOTUzMzgxMDA5fQ.8tgID1d4jodPwuo_fz4KHN4o1XKB9fnqyt0_GaJSj-w"}', '{}', '1000');


--
-- Name: users on_user_updated; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER "on_user_updated" AFTER UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://xvwzpoazmxkqosrdewyv.functions.supabase.co/on_user_updated', 'POST', '{"Content-type":"application/json","apisecret":"3Te6MchBMMDGNTHTP5Y3p6z7tPmB","authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlhdCI6MTYzNzgwNTAwOSwiZXhwIjoxOTUzMzgxMDA5fQ.8tgID1d4jodPwuo_fz4KHN4o1XKB9fnqyt0_GaJSj-w"}', '{}', '1000');


--
-- Name: app_versions on_version_created; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER "on_version_created" AFTER INSERT ON "public"."app_versions" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://xvwzpoazmxkqosrdewyv.functions.supabase.co/on_version_create', 'POST', '{"Content-type":"application/json","apisecret":"3Te6MchBMMDGNTHTP5Y3p6z7tPmB","authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlhdCI6MTYzNzgwNTAwOSwiZXhwIjoxOTUzMzgxMDA5fQ.8tgID1d4jodPwuo_fz4KHN4o1XKB9fnqyt0_GaJSj-w"}', '{}', '1000');


--
-- Name: app_versions on_version_updated; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER "on_version_updated" AFTER DELETE OR UPDATE ON "public"."app_versions" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://xvwzpoazmxkqosrdewyv.functions.supabase.co/on_version_updated', 'POST', '{"Content-type":"application/json","apisecret":"3Te6MchBMMDGNTHTP5Y3p6z7tPmB","authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlhdCI6MTYzNzgwNTAwOSwiZXhwIjoxOTUzMzgxMDA5fQ.8tgID1d4jodPwuo_fz4KHN4o1XKB9fnqyt0_GaJSj-w"}', '{}', '1000');


--
-- Name: apikeys apikeys_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."apikeys"
    ADD CONSTRAINT "apikeys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: app_stats app_stats_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."app_stats"
    ADD CONSTRAINT "app_stats_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;


--
-- Name: app_stats app_stats_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."app_stats"
    ADD CONSTRAINT "app_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: app_versions app_versions_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."app_versions"
    ADD CONSTRAINT "app_versions_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;


--
-- Name: app_versions_meta app_versions_meta_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."app_versions_meta"
    ADD CONSTRAINT "app_versions_meta_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;


--
-- Name: app_versions_meta app_versions_meta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."app_versions_meta"
    ADD CONSTRAINT "app_versions_meta_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."app_versions"("id") ON DELETE CASCADE;


--
-- Name: app_versions_meta app_versions_meta_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."app_versions_meta"
    ADD CONSTRAINT "app_versions_meta_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: app_versions app_versions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."app_versions"
    ADD CONSTRAINT "app_versions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: apps apps_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."apps"
    ADD CONSTRAINT "apps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: channel_devices channel_devices_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."channel_devices"
    ADD CONSTRAINT "channel_devices_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;


--
-- Name: channel_devices channel_devices_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."channel_devices"
    ADD CONSTRAINT "channel_devices_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE;


--
-- Name: channel_devices channel_devices_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."channel_devices"
    ADD CONSTRAINT "channel_devices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");


--
-- Name: channel_devices channel_devices_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."channel_devices"
    ADD CONSTRAINT "channel_devices_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("device_id") ON DELETE CASCADE;


--
-- Name: channel_users channel_users_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."channel_users"
    ADD CONSTRAINT "channel_users_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;


--
-- Name: channel_users channel_users_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."channel_users"
    ADD CONSTRAINT "channel_users_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE;


--
-- Name: channel_users channel_users_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."channel_users"
    ADD CONSTRAINT "channel_users_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: channel_users channel_users_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."channel_users"
    ADD CONSTRAINT "channel_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: channels channels_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "channels_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;


--
-- Name: channels channels_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "channels_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: channels channels_version_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "channels_version_fkey" FOREIGN KEY ("version") REFERENCES "public"."app_versions"("id") ON DELETE CASCADE;


--
-- Name: devices devices_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."devices"
    ADD CONSTRAINT "devices_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;


--
-- Name: devices_override devices_override_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."devices_override"
    ADD CONSTRAINT "devices_override_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;


--
-- Name: devices_override devices_override_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."devices_override"
    ADD CONSTRAINT "devices_override_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");


--
-- Name: devices_override devices_override_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."devices_override"
    ADD CONSTRAINT "devices_override_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("device_id") ON DELETE CASCADE;


--
-- Name: devices_override devices_override_version_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."devices_override"
    ADD CONSTRAINT "devices_override_version_fkey" FOREIGN KEY ("version") REFERENCES "public"."app_versions"("id") ON DELETE CASCADE;


--
-- Name: devices devices_version_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."devices"
    ADD CONSTRAINT "devices_version_fkey" FOREIGN KEY ("version") REFERENCES "public"."app_versions"("id") ON DELETE CASCADE;


--
-- Name: stats stats_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."stats"
    ADD CONSTRAINT "stats_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;


--
-- Name: stats stats_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."stats"
    ADD CONSTRAINT "stats_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("device_id") ON DELETE CASCADE;


--
-- Name: stats stats_version_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."stats"
    ADD CONSTRAINT "stats_version_fkey" FOREIGN KEY ("version") REFERENCES "public"."app_versions"("id") ON DELETE CASCADE;


--
-- Name: stripe_info stripe_info_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."stripe_info"
    ADD CONSTRAINT "stripe_info_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."plans"("stripe_id");


--
-- Name: users users_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."stripe_info"("customer_id");


--
-- Name: users users_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: job cron_job_policy; Type: POLICY; Schema: cron; Owner: supabase_admin
--

CREATE POLICY "cron_job_policy" ON "cron"."job" USING (("username" = CURRENT_USER));


--
-- Name: job_run_details cron_job_run_details_policy; Type: POLICY; Schema: cron; Owner: supabase_admin
--

CREATE POLICY "cron_job_run_details_policy" ON "cron"."job_run_details" USING (("username" = CURRENT_USER));


--
-- Name: job; Type: ROW SECURITY; Schema: cron; Owner: supabase_admin
--

ALTER TABLE "cron"."job" ENABLE ROW LEVEL SECURITY;

--
-- Name: job_run_details; Type: ROW SECURITY; Schema: cron; Owner: supabase_admin
--

ALTER TABLE "cron"."job_run_details" ENABLE ROW LEVEL SECURITY;

--
-- Name: global_stats  allow anon to select; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY " allow anon to select" ON "public"."global_stats" FOR SELECT TO "anon", "service_role", "supabase_functions_admin" USING (true);


--
-- Name: channels All all to app owner or api; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "All all to app owner or api" ON "public"."channels" USING (("public"."is_app_owner"("auth"."uid"(), "app_id") OR "public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{all}'::"public"."key_mode"[], "app_id"))) WITH CHECK (("public"."is_app_owner"("auth"."uid"(), "app_id") OR "public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{all}'::"public"."key_mode"[], "app_id")));


--
-- Name: app_stats All self to select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "All self to select" ON "public"."app_stats" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: channel_users Allow all for app owner; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow all for app owner" ON "public"."channel_users" USING ("public"."is_app_owner"("auth"."uid"(), "app_id")) WITH CHECK ("public"."is_app_owner"("auth"."uid"(), "app_id"));


--
-- Name: channel_devices Allow all to app owner; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow all to app owner" ON "public"."channel_devices" USING ("public"."is_app_owner"("auth"."uid"(), "app_id")) WITH CHECK ("public"."is_app_owner"("auth"."uid"(), "app_id"));


--
-- Name: devices_override Allow all to app owner; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow all to app owner" ON "public"."devices_override" USING ("public"."is_app_owner"("auth"."uid"(), "app_id")) WITH CHECK ("public"."is_app_owner"("auth"."uid"(), "app_id"));


--
-- Name: stats Allow all to app owner; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow all to app owner" ON "public"."stats" TO "authenticated" USING ("public"."is_app_owner"("auth"."uid"(), "app_id")) WITH CHECK ("public"."is_app_owner"("auth"."uid"(), "app_id"));


--
-- Name: users Allow all users to select; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow all users to select" ON "public"."users" FOR SELECT TO "authenticated" USING ("public"."is_in_channel"("id", "auth"."uid"()));


--
-- Name: pay_as_you_go Allow any to select; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow any to select" ON "public"."pay_as_you_go" FOR SELECT TO "authenticated" USING (true);


--
-- Name: channels Allow api to insert; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow api to insert" ON "public"."channels" FOR INSERT WITH CHECK (("public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{write}'::"public"."key_mode"[], "app_id") AND "public"."is_allowed_action"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"))));


--
-- Name: channels Allow api to update; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow api to update" ON "public"."channels" FOR UPDATE USING ("public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{write}'::"public"."key_mode"[], "app_id")) WITH CHECK ("public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{write}'::"public"."key_mode"[], "app_id"));


--
-- Name: app_versions Allow apikey to insert; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow apikey to insert" ON "public"."app_versions" FOR INSERT TO "anon" WITH CHECK (("public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{upload,write,all}'::"public"."key_mode"[], "app_id") AND "public"."is_allowed_action"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"))));


--
-- Name: apps Allow apikey to insert; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow apikey to insert" ON "public"."apps" FOR INSERT TO "anon" WITH CHECK (("public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{all,write}'::"public"."key_mode"[]) AND "public"."is_allowed_action"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"))));


--
-- Name: app_versions Allow apikey to select; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow apikey to select" ON "public"."app_versions" FOR SELECT TO "anon" USING ("public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{read,all}'::"public"."key_mode"[], "app_id"));


--
-- Name: apps Allow app owner to all; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow app owner to all" ON "public"."apps" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: app_versions Allow owner to all; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow owner to all" ON "public"."app_versions" TO "authenticated" USING ("public"."is_app_owner"("auth"."uid"(), "app_id")) WITH CHECK ("public"."is_app_owner"("auth"."uid"(), "app_id"));


--
-- Name: app_versions Allow owner to listen insert; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow owner to listen insert" ON "public"."app_versions" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_app_owner"("auth"."uid"(), "app_id"));


--
-- Name: devices Allow select app owner; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow select app owner" ON "public"."devices" FOR SELECT USING ("public"."is_app_owner"("auth"."uid"(), "app_id"));


--
-- Name: users Allow self to modify self; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow self to modify self" ON "public"."users" TO "authenticated" USING ((("auth"."uid"() = "id") AND "public"."is_not_deleted"(("auth"."email"())::character varying))) WITH CHECK ((("auth"."uid"() = "id") AND "public"."is_not_deleted"(("auth"."email"())::character varying)));


--
-- Name: app_versions Allow shared to see; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow shared to see" ON "public"."app_versions" FOR SELECT TO "authenticated" USING ("public"."is_app_shared"("auth"."uid"(), "app_id"));


--
-- Name: app_versions_meta Allow user to get they meta; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow user to get they meta" ON "public"."app_versions_meta" FOR SELECT TO "authenticated" USING ("public"."is_app_owner"("auth"."uid"(), "app_id"));


--
-- Name: channel_users Allow user to self get; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow user to self get" ON "public"."channel_users" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: stripe_info Allow user to self get; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow user to self get" ON "public"."stripe_info" FOR SELECT TO "authenticated" USING (("auth"."uid"() IN ( SELECT "users"."id"
   FROM "public"."users"
  WHERE (("users"."customer_id")::"text" = ("users"."customer_id")::"text"))));


--
-- Name: app_stats_onprem Disable for all; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Disable for all" ON "public"."app_stats_onprem" USING (false) WITH CHECK (false);


--
-- Name: apikeys Enable all for user based on user_id; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Enable all for user based on user_id" ON "public"."apikeys" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: plans Enable select for authenticated users only; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable select for authenticated users only" ON "public"."plans" FOR SELECT TO "authenticated" USING (true);


--
-- Name: deleted_account Enable update for users based on email; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Enable update for users based on email" ON "public"."deleted_account" FOR INSERT TO "authenticated" WITH CHECK (("auth"."email"() = ("email")::"text"));


--
-- Name: channels Select if app is shared with you or api; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Select if app is shared with you or api" ON "public"."channels" FOR SELECT USING (("public"."is_app_shared"("auth"."uid"(), "app_id") OR "public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{read}'::"public"."key_mode"[], "app_id")));


--
-- Name: app_versions allow apikey to delete; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "allow apikey to delete" ON "public"."app_versions" FOR DELETE TO "anon" USING (("public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{write,all}'::"public"."key_mode"[], "app_id") AND "public"."is_allowed_action"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"))));


--
-- Name: apps allow apikey to delete; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "allow apikey to delete" ON "public"."apps" FOR DELETE TO "anon" USING ("public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{all}'::"public"."key_mode"[], "app_id"));


--
-- Name: apps allow apikey to select; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "allow apikey to select" ON "public"."apps" FOR SELECT TO "anon" USING ("public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{all,write}'::"public"."key_mode"[]));


--
-- Name: app_versions allow for delete by the CLI; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "allow for delete by the CLI" ON "public"."app_versions" FOR UPDATE TO "anon" USING (("public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{write,all}'::"public"."key_mode"[], "app_id") AND "public"."is_allowed_action"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text")))) WITH CHECK (("public"."is_allowed_capgkey"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"), '{write,all}'::"public"."key_mode"[], "app_id") AND "public"."is_allowed_action"((("current_setting"('request.headers'::"text", true))::"json" ->> 'capgkey'::"text"))));


--
-- Name: apps allowed shared to select; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "allowed shared to select" ON "public"."apps" FOR SELECT TO "authenticated" USING ("public"."is_app_shared"("auth"."uid"(), "app_id"));


--
-- Name: apikeys; Type: ROW SECURITY; Schema: public; Owner: supabase_admin
--

ALTER TABLE "public"."apikeys" ENABLE ROW LEVEL SECURITY;

--
-- Name: app_stats; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."app_stats" ENABLE ROW LEVEL SECURITY;

--
-- Name: app_stats_onprem; Type: ROW SECURITY; Schema: public; Owner: supabase_admin
--

ALTER TABLE "public"."app_stats_onprem" ENABLE ROW LEVEL SECURITY;

--
-- Name: app_versions; Type: ROW SECURITY; Schema: public; Owner: supabase_admin
--

ALTER TABLE "public"."app_versions" ENABLE ROW LEVEL SECURITY;

--
-- Name: app_versions_meta; Type: ROW SECURITY; Schema: public; Owner: supabase_admin
--

ALTER TABLE "public"."app_versions_meta" ENABLE ROW LEVEL SECURITY;

--
-- Name: apps; Type: ROW SECURITY; Schema: public; Owner: supabase_admin
--

ALTER TABLE "public"."apps" ENABLE ROW LEVEL SECURITY;

--
-- Name: channel_devices; Type: ROW SECURITY; Schema: public; Owner: supabase_admin
--

ALTER TABLE "public"."channel_devices" ENABLE ROW LEVEL SECURITY;

--
-- Name: channel_users; Type: ROW SECURITY; Schema: public; Owner: supabase_admin
--

ALTER TABLE "public"."channel_users" ENABLE ROW LEVEL SECURITY;

--
-- Name: channels; Type: ROW SECURITY; Schema: public; Owner: supabase_admin
--

ALTER TABLE "public"."channels" ENABLE ROW LEVEL SECURITY;

--
-- Name: deleted_account; Type: ROW SECURITY; Schema: public; Owner: supabase_admin
--

ALTER TABLE "public"."deleted_account" ENABLE ROW LEVEL SECURITY;

--
-- Name: devices; Type: ROW SECURITY; Schema: public; Owner: supabase_admin
--

ALTER TABLE "public"."devices" ENABLE ROW LEVEL SECURITY;

--
-- Name: devices_onprem; Type: ROW SECURITY; Schema: public; Owner: supabase_admin
--

ALTER TABLE "public"."devices_onprem" ENABLE ROW LEVEL SECURITY;

--
-- Name: devices_override; Type: ROW SECURITY; Schema: public; Owner: supabase_admin
--

ALTER TABLE "public"."devices_override" ENABLE ROW LEVEL SECURITY;

--
-- Name: devices_onprem disable all; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "disable all" ON "public"."devices_onprem" USING (false) WITH CHECK (false);


--
-- Name: stats_onprem disable all; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "disable all" ON "public"."stats_onprem" USING (false) WITH CHECK (false);


--
-- Name: global_stats; Type: ROW SECURITY; Schema: public; Owner: supabase_admin
--

ALTER TABLE "public"."global_stats" ENABLE ROW LEVEL SECURITY;

--
-- Name: pay_as_you_go; Type: ROW SECURITY; Schema: public; Owner: supabase_admin
--

ALTER TABLE "public"."pay_as_you_go" ENABLE ROW LEVEL SECURITY;

--
-- Name: plans; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."plans" ENABLE ROW LEVEL SECURITY;

--
-- Name: stats; Type: ROW SECURITY; Schema: public; Owner: supabase_admin
--

ALTER TABLE "public"."stats" ENABLE ROW LEVEL SECURITY;

--
-- Name: stats_onprem; Type: ROW SECURITY; Schema: public; Owner: supabase_admin
--

ALTER TABLE "public"."stats_onprem" ENABLE ROW LEVEL SECURITY;

--
-- Name: stripe_info; Type: ROW SECURITY; Schema: public; Owner: supabase_admin
--

ALTER TABLE "public"."stripe_info" ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: supabase_admin
--

ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA "net"; Type: ACL; Schema: -; Owner: supabase_admin
--

GRANT USAGE ON SCHEMA "net" TO "supabase_functions_admin";
GRANT USAGE ON SCHEMA "net" TO "anon";
GRANT USAGE ON SCHEMA "net" TO "authenticated";
GRANT USAGE ON SCHEMA "net" TO "service_role";


--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: postgres
--

GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


--
-- Name: FUNCTION "job_cache_invalidate"(); Type: ACL; Schema: cron; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "cron"."job_cache_invalidate"() TO "postgres" WITH GRANT OPTION;


--
-- Name: FUNCTION "schedule"("schedule" "text", "command" "text"); Type: ACL; Schema: cron; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "cron"."schedule"("schedule" "text", "command" "text") TO "postgres" WITH GRANT OPTION;


--
-- Name: FUNCTION "schedule"("job_name" "text", "schedule" "text", "command" "text"); Type: ACL; Schema: cron; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "cron"."schedule"("job_name" "text", "schedule" "text", "command" "text") TO "postgres" WITH GRANT OPTION;


--
-- Name: FUNCTION "unschedule"("job_id" bigint); Type: ACL; Schema: cron; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "cron"."unschedule"("job_id" bigint) TO "postgres" WITH GRANT OPTION;


--
-- Name: FUNCTION "unschedule"("job_name" "name"); Type: ACL; Schema: cron; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "cron"."unschedule"("job_name" "name") TO "postgres" WITH GRANT OPTION;


--
-- Name: FUNCTION "algorithm_sign"("signables" "text", "secret" "text", "algorithm" "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."algorithm_sign"("signables" "text", "secret" "text", "algorithm" "text") TO "dashboard_user";


--
-- Name: FUNCTION "armor"("bytea"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."armor"("bytea") TO "dashboard_user";


--
-- Name: FUNCTION "armor"("bytea", "text"[], "text"[]); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."armor"("bytea", "text"[], "text"[]) TO "dashboard_user";


--
-- Name: FUNCTION "crypt"("text", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."crypt"("text", "text") TO "dashboard_user";


--
-- Name: FUNCTION "dearmor"("text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."dearmor"("text") TO "dashboard_user";


--
-- Name: FUNCTION "decrypt"("bytea", "bytea", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."decrypt"("bytea", "bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "decrypt_iv"("bytea", "bytea", "bytea", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."decrypt_iv"("bytea", "bytea", "bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "digest"("bytea", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."digest"("bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "digest"("text", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."digest"("text", "text") TO "dashboard_user";


--
-- Name: FUNCTION "encrypt"("bytea", "bytea", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."encrypt"("bytea", "bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "encrypt_iv"("bytea", "bytea", "bytea", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."encrypt_iv"("bytea", "bytea", "bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "gen_random_bytes"(integer); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."gen_random_bytes"(integer) TO "dashboard_user";


--
-- Name: FUNCTION "gen_random_uuid"(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."gen_random_uuid"() TO "dashboard_user";


--
-- Name: FUNCTION "gen_salt"("text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."gen_salt"("text") TO "dashboard_user";


--
-- Name: FUNCTION "gen_salt"("text", integer); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."gen_salt"("text", integer) TO "dashboard_user";


--
-- Name: FUNCTION "hmac"("bytea", "bytea", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."hmac"("bytea", "bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "hmac"("text", "text", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."hmac"("text", "text", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pg_stat_statements"("showtext" boolean, OUT "userid" "oid", OUT "dbid" "oid", OUT "toplevel" boolean, OUT "queryid" bigint, OUT "query" "text", OUT "plans" bigint, OUT "total_plan_time" double precision, OUT "min_plan_time" double precision, OUT "max_plan_time" double precision, OUT "mean_plan_time" double precision, OUT "stddev_plan_time" double precision, OUT "calls" bigint, OUT "total_exec_time" double precision, OUT "min_exec_time" double precision, OUT "max_exec_time" double precision, OUT "mean_exec_time" double precision, OUT "stddev_exec_time" double precision, OUT "rows" bigint, OUT "shared_blks_hit" bigint, OUT "shared_blks_read" bigint, OUT "shared_blks_dirtied" bigint, OUT "shared_blks_written" bigint, OUT "local_blks_hit" bigint, OUT "local_blks_read" bigint, OUT "local_blks_dirtied" bigint, OUT "local_blks_written" bigint, OUT "temp_blks_read" bigint, OUT "temp_blks_written" bigint, OUT "blk_read_time" double precision, OUT "blk_write_time" double precision, OUT "wal_records" bigint, OUT "wal_fpi" bigint, OUT "wal_bytes" numeric); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."pg_stat_statements"("showtext" boolean, OUT "userid" "oid", OUT "dbid" "oid", OUT "toplevel" boolean, OUT "queryid" bigint, OUT "query" "text", OUT "plans" bigint, OUT "total_plan_time" double precision, OUT "min_plan_time" double precision, OUT "max_plan_time" double precision, OUT "mean_plan_time" double precision, OUT "stddev_plan_time" double precision, OUT "calls" bigint, OUT "total_exec_time" double precision, OUT "min_exec_time" double precision, OUT "max_exec_time" double precision, OUT "mean_exec_time" double precision, OUT "stddev_exec_time" double precision, OUT "rows" bigint, OUT "shared_blks_hit" bigint, OUT "shared_blks_read" bigint, OUT "shared_blks_dirtied" bigint, OUT "shared_blks_written" bigint, OUT "local_blks_hit" bigint, OUT "local_blks_read" bigint, OUT "local_blks_dirtied" bigint, OUT "local_blks_written" bigint, OUT "temp_blks_read" bigint, OUT "temp_blks_written" bigint, OUT "blk_read_time" double precision, OUT "blk_write_time" double precision, OUT "wal_records" bigint, OUT "wal_fpi" bigint, OUT "wal_bytes" numeric) TO "dashboard_user";


--
-- Name: FUNCTION "pg_stat_statements_reset"("userid" "oid", "dbid" "oid", "queryid" bigint); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."pg_stat_statements_reset"("userid" "oid", "dbid" "oid", "queryid" bigint) TO "dashboard_user";


--
-- Name: FUNCTION "pgp_armor_headers"("text", OUT "key" "text", OUT "value" "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."pgp_armor_headers"("text", OUT "key" "text", OUT "value" "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_key_id"("bytea"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."pgp_key_id"("bytea") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_pub_decrypt"("bytea", "bytea"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."pgp_pub_decrypt"("bytea", "bytea") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_pub_decrypt"("bytea", "bytea", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."pgp_pub_decrypt"("bytea", "bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_pub_decrypt"("bytea", "bytea", "text", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."pgp_pub_decrypt"("bytea", "bytea", "text", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_pub_decrypt_bytea"("bytea", "bytea"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."pgp_pub_decrypt_bytea"("bytea", "bytea") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_pub_decrypt_bytea"("bytea", "bytea", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."pgp_pub_decrypt_bytea"("bytea", "bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_pub_decrypt_bytea"("bytea", "bytea", "text", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."pgp_pub_decrypt_bytea"("bytea", "bytea", "text", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_pub_encrypt"("text", "bytea"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."pgp_pub_encrypt"("text", "bytea") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_pub_encrypt"("text", "bytea", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."pgp_pub_encrypt"("text", "bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_pub_encrypt_bytea"("bytea", "bytea"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."pgp_pub_encrypt_bytea"("bytea", "bytea") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_pub_encrypt_bytea"("bytea", "bytea", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."pgp_pub_encrypt_bytea"("bytea", "bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_sym_decrypt"("bytea", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."pgp_sym_decrypt"("bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_sym_decrypt"("bytea", "text", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."pgp_sym_decrypt"("bytea", "text", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_sym_decrypt_bytea"("bytea", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."pgp_sym_decrypt_bytea"("bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_sym_decrypt_bytea"("bytea", "text", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."pgp_sym_decrypt_bytea"("bytea", "text", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_sym_encrypt"("text", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."pgp_sym_encrypt"("text", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_sym_encrypt"("text", "text", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."pgp_sym_encrypt"("text", "text", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_sym_encrypt_bytea"("bytea", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."pgp_sym_encrypt_bytea"("bytea", "text") TO "dashboard_user";


--
-- Name: FUNCTION "pgp_sym_encrypt_bytea"("bytea", "text", "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."pgp_sym_encrypt_bytea"("bytea", "text", "text") TO "dashboard_user";


--
-- Name: FUNCTION "sign"("payload" "json", "secret" "text", "algorithm" "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."sign"("payload" "json", "secret" "text", "algorithm" "text") TO "dashboard_user";


--
-- Name: FUNCTION "try_cast_double"("inp" "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."try_cast_double"("inp" "text") TO "dashboard_user";


--
-- Name: FUNCTION "url_decode"("data" "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."url_decode"("data" "text") TO "dashboard_user";


--
-- Name: FUNCTION "url_encode"("data" "bytea"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."url_encode"("data" "bytea") TO "dashboard_user";


--
-- Name: FUNCTION "uuid_generate_v1"(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."uuid_generate_v1"() TO "dashboard_user";


--
-- Name: FUNCTION "uuid_generate_v1mc"(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."uuid_generate_v1mc"() TO "dashboard_user";


--
-- Name: FUNCTION "uuid_generate_v3"("namespace" "uuid", "name" "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."uuid_generate_v3"("namespace" "uuid", "name" "text") TO "dashboard_user";


--
-- Name: FUNCTION "uuid_generate_v4"(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."uuid_generate_v4"() TO "dashboard_user";


--
-- Name: FUNCTION "uuid_generate_v5"("namespace" "uuid", "name" "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."uuid_generate_v5"("namespace" "uuid", "name" "text") TO "dashboard_user";


--
-- Name: FUNCTION "uuid_nil"(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."uuid_nil"() TO "dashboard_user";


--
-- Name: FUNCTION "uuid_ns_dns"(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."uuid_ns_dns"() TO "dashboard_user";


--
-- Name: FUNCTION "uuid_ns_oid"(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."uuid_ns_oid"() TO "dashboard_user";


--
-- Name: FUNCTION "uuid_ns_url"(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."uuid_ns_url"() TO "dashboard_user";


--
-- Name: FUNCTION "uuid_ns_x500"(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."uuid_ns_x500"() TO "dashboard_user";


--
-- Name: FUNCTION "verify"("token" "text", "secret" "text", "algorithm" "text"); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "extensions"."verify"("token" "text", "secret" "text", "algorithm" "text") TO "dashboard_user";


--
-- Name: FUNCTION "http_collect_response"("request_id" bigint, "async" boolean); Type: ACL; Schema: net; Owner: supabase_admin
--

REVOKE ALL ON FUNCTION "net"."http_collect_response"("request_id" bigint, "async" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "net"."http_collect_response"("request_id" bigint, "async" boolean) TO "supabase_functions_admin";
GRANT ALL ON FUNCTION "net"."http_collect_response"("request_id" bigint, "async" boolean) TO "postgres";
GRANT ALL ON FUNCTION "net"."http_collect_response"("request_id" bigint, "async" boolean) TO "anon";
GRANT ALL ON FUNCTION "net"."http_collect_response"("request_id" bigint, "async" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "net"."http_collect_response"("request_id" bigint, "async" boolean) TO "service_role";


--
-- Name: FUNCTION "http_get"("url" "text", "params" "jsonb", "headers" "jsonb", "timeout_milliseconds" integer); Type: ACL; Schema: net; Owner: supabase_admin
--

REVOKE ALL ON FUNCTION "net"."http_get"("url" "text", "params" "jsonb", "headers" "jsonb", "timeout_milliseconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "net"."http_get"("url" "text", "params" "jsonb", "headers" "jsonb", "timeout_milliseconds" integer) TO "supabase_functions_admin";
GRANT ALL ON FUNCTION "net"."http_get"("url" "text", "params" "jsonb", "headers" "jsonb", "timeout_milliseconds" integer) TO "postgres";
GRANT ALL ON FUNCTION "net"."http_get"("url" "text", "params" "jsonb", "headers" "jsonb", "timeout_milliseconds" integer) TO "anon";
GRANT ALL ON FUNCTION "net"."http_get"("url" "text", "params" "jsonb", "headers" "jsonb", "timeout_milliseconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "net"."http_get"("url" "text", "params" "jsonb", "headers" "jsonb", "timeout_milliseconds" integer) TO "service_role";


--
-- Name: FUNCTION "http_post"("url" "text", "body" "jsonb", "params" "jsonb", "headers" "jsonb", "timeout_milliseconds" integer); Type: ACL; Schema: net; Owner: supabase_admin
--

REVOKE ALL ON FUNCTION "net"."http_post"("url" "text", "body" "jsonb", "params" "jsonb", "headers" "jsonb", "timeout_milliseconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "net"."http_post"("url" "text", "body" "jsonb", "params" "jsonb", "headers" "jsonb", "timeout_milliseconds" integer) TO "supabase_functions_admin";
GRANT ALL ON FUNCTION "net"."http_post"("url" "text", "body" "jsonb", "params" "jsonb", "headers" "jsonb", "timeout_milliseconds" integer) TO "postgres";
GRANT ALL ON FUNCTION "net"."http_post"("url" "text", "body" "jsonb", "params" "jsonb", "headers" "jsonb", "timeout_milliseconds" integer) TO "anon";
GRANT ALL ON FUNCTION "net"."http_post"("url" "text", "body" "jsonb", "params" "jsonb", "headers" "jsonb", "timeout_milliseconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "net"."http_post"("url" "text", "body" "jsonb", "params" "jsonb", "headers" "jsonb", "timeout_milliseconds" integer) TO "service_role";


--
-- Name: FUNCTION "count_all_apps"(); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."count_all_apps"() TO "postgres";
GRANT ALL ON FUNCTION "public"."count_all_apps"() TO "anon";
GRANT ALL ON FUNCTION "public"."count_all_apps"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_all_apps"() TO "service_role";


--
-- Name: FUNCTION "count_all_updates"(); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."count_all_updates"() TO "postgres";
GRANT ALL ON FUNCTION "public"."count_all_updates"() TO "anon";
GRANT ALL ON FUNCTION "public"."count_all_updates"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_all_updates"() TO "service_role";


--
-- Name: FUNCTION "exist_app"("appid" character varying, "apikey" "text"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."exist_app"("appid" character varying, "apikey" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."exist_app"("appid" character varying, "apikey" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."exist_app"("appid" character varying, "apikey" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."exist_app"("appid" character varying, "apikey" "text") TO "service_role";


--
-- Name: FUNCTION "exist_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") TO "service_role";


--
-- Name: FUNCTION "exist_channel"("appid" character varying, "name_channel" character varying, "apikey" "text"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."exist_channel"("appid" character varying, "name_channel" character varying, "apikey" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."exist_channel"("appid" character varying, "name_channel" character varying, "apikey" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."exist_channel"("appid" character varying, "name_channel" character varying, "apikey" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."exist_channel"("appid" character varying, "name_channel" character varying, "apikey" "text") TO "service_role";


--
-- Name: FUNCTION "exist_user"("e_mail" character varying); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."exist_user"("e_mail" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."exist_user"("e_mail" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."exist_user"("e_mail" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."exist_user"("e_mail" character varying) TO "service_role";


--
-- Name: FUNCTION "find_best_plan"("apps_n" bigint, "channels_n" bigint, "updates_n" bigint, "versions_n" bigint, "shared_n" bigint); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."find_best_plan"("apps_n" bigint, "channels_n" bigint, "updates_n" bigint, "versions_n" bigint, "shared_n" bigint) TO "postgres";
GRANT ALL ON FUNCTION "public"."find_best_plan"("apps_n" bigint, "channels_n" bigint, "updates_n" bigint, "versions_n" bigint, "shared_n" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."find_best_plan"("apps_n" bigint, "channels_n" bigint, "updates_n" bigint, "versions_n" bigint, "shared_n" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_best_plan"("apps_n" bigint, "channels_n" bigint, "updates_n" bigint, "versions_n" bigint, "shared_n" bigint) TO "service_role";


--
-- Name: FUNCTION "find_best_plan_v2"("mau" bigint, "storage" bigint, "bandwidth" bigint); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."find_best_plan_v2"("mau" bigint, "storage" bigint, "bandwidth" bigint) TO "postgres";
GRANT ALL ON FUNCTION "public"."find_best_plan_v2"("mau" bigint, "storage" bigint, "bandwidth" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."find_best_plan_v2"("mau" bigint, "storage" bigint, "bandwidth" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_best_plan_v2"("mau" bigint, "storage" bigint, "bandwidth" bigint) TO "service_role";


--
-- Name: FUNCTION "find_fit_plan"("apps_n" bigint, "channels_n" bigint, "updates_n" bigint, "versions_n" bigint, "shared_n" bigint); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."find_fit_plan"("apps_n" bigint, "channels_n" bigint, "updates_n" bigint, "versions_n" bigint, "shared_n" bigint) TO "postgres";
GRANT ALL ON FUNCTION "public"."find_fit_plan"("apps_n" bigint, "channels_n" bigint, "updates_n" bigint, "versions_n" bigint, "shared_n" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."find_fit_plan"("apps_n" bigint, "channels_n" bigint, "updates_n" bigint, "versions_n" bigint, "shared_n" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_fit_plan"("apps_n" bigint, "channels_n" bigint, "updates_n" bigint, "versions_n" bigint, "shared_n" bigint) TO "service_role";


--
-- Name: FUNCTION "find_fit_plan_v2"("mau" bigint, "storage" bigint, "bandwidth" bigint); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."find_fit_plan_v2"("mau" bigint, "storage" bigint, "bandwidth" bigint) TO "postgres";
GRANT ALL ON FUNCTION "public"."find_fit_plan_v2"("mau" bigint, "storage" bigint, "bandwidth" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."find_fit_plan_v2"("mau" bigint, "storage" bigint, "bandwidth" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_fit_plan_v2"("mau" bigint, "storage" bigint, "bandwidth" bigint) TO "service_role";


--
-- Name: FUNCTION "get_current_plan_name"("userid" "uuid"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."get_current_plan_name"("userid" "uuid") TO "postgres";
GRANT ALL ON FUNCTION "public"."get_current_plan_name"("userid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_plan_name"("userid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_plan_name"("userid" "uuid") TO "service_role";


--
-- Name: FUNCTION "get_dl_by_month"("userid" "uuid", "pastmonth" integer); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."get_dl_by_month"("userid" "uuid", "pastmonth" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."get_dl_by_month"("userid" "uuid", "pastmonth" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_dl_by_month"("userid" "uuid", "pastmonth" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dl_by_month"("userid" "uuid", "pastmonth" integer) TO "service_role";


--
-- Name: FUNCTION "get_dl_by_month_by_app"("pastmonth" integer, "appid" character varying); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."get_dl_by_month_by_app"("pastmonth" integer, "appid" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."get_dl_by_month_by_app"("pastmonth" integer, "appid" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."get_dl_by_month_by_app"("pastmonth" integer, "appid" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dl_by_month_by_app"("pastmonth" integer, "appid" character varying) TO "service_role";


--
-- Name: FUNCTION "get_dl_by_month_by_app"("userid" "uuid", "pastmonth" integer, "appid" character varying); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."get_dl_by_month_by_app"("userid" "uuid", "pastmonth" integer, "appid" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."get_dl_by_month_by_app"("userid" "uuid", "pastmonth" integer, "appid" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."get_dl_by_month_by_app"("userid" "uuid", "pastmonth" integer, "appid" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dl_by_month_by_app"("userid" "uuid", "pastmonth" integer, "appid" character varying) TO "service_role";


--
-- Name: FUNCTION "get_max_channel"("userid" "uuid"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."get_max_channel"("userid" "uuid") TO "postgres";
GRANT ALL ON FUNCTION "public"."get_max_channel"("userid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_max_channel"("userid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_max_channel"("userid" "uuid") TO "service_role";


--
-- Name: FUNCTION "get_max_shared"("userid" "uuid"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."get_max_shared"("userid" "uuid") TO "postgres";
GRANT ALL ON FUNCTION "public"."get_max_shared"("userid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_max_shared"("userid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_max_shared"("userid" "uuid") TO "service_role";


--
-- Name: FUNCTION "get_max_stats"("userid" "uuid", "dateid" character varying); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."get_max_stats"("userid" "uuid", "dateid" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."get_max_stats"("userid" "uuid", "dateid" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."get_max_stats"("userid" "uuid", "dateid" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_max_stats"("userid" "uuid", "dateid" character varying) TO "service_role";


--
-- Name: FUNCTION "get_max_version"("userid" "uuid"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."get_max_version"("userid" "uuid") TO "postgres";
GRANT ALL ON FUNCTION "public"."get_max_version"("userid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_max_version"("userid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_max_version"("userid" "uuid") TO "service_role";


--
-- Name: FUNCTION "get_stats"("userid" "uuid", "dateid" character varying); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."get_stats"("userid" "uuid", "dateid" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."get_stats"("userid" "uuid", "dateid" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."get_stats"("userid" "uuid", "dateid" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_stats"("userid" "uuid", "dateid" character varying) TO "service_role";


--
-- Name: FUNCTION "get_total_stats"("userid" "uuid", "dateid" character varying); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."get_total_stats"("userid" "uuid", "dateid" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."get_total_stats"("userid" "uuid", "dateid" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."get_total_stats"("userid" "uuid", "dateid" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_total_stats"("userid" "uuid", "dateid" character varying) TO "service_role";


--
-- Name: FUNCTION "get_user_id"("apikey" "text"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."get_user_id"("apikey" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."get_user_id"("apikey" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_id"("apikey" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_id"("apikey" "text") TO "service_role";


--
-- Name: FUNCTION "increment_stats"("app_id" character varying, "date_id" character varying, "bandwidth" integer, "version_size" integer, "channels" integer, "shared" integer, "mlu" integer, "mlu_real" integer, "versions" integer, "devices" integer); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."increment_stats"("app_id" character varying, "date_id" character varying, "bandwidth" integer, "version_size" integer, "channels" integer, "shared" integer, "mlu" integer, "mlu_real" integer, "versions" integer, "devices" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."increment_stats"("app_id" character varying, "date_id" character varying, "bandwidth" integer, "version_size" integer, "channels" integer, "shared" integer, "mlu" integer, "mlu_real" integer, "versions" integer, "devices" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_stats"("app_id" character varying, "date_id" character varying, "bandwidth" integer, "version_size" integer, "channels" integer, "shared" integer, "mlu" integer, "mlu_real" integer, "versions" integer, "devices" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_stats"("app_id" character varying, "date_id" character varying, "bandwidth" integer, "version_size" integer, "channels" integer, "shared" integer, "mlu" integer, "mlu_real" integer, "versions" integer, "devices" integer) TO "service_role";


--
-- Name: FUNCTION "increment_version_stats"("app_id" character varying, "version_id" bigint, "devices" integer); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."increment_version_stats"("app_id" character varying, "version_id" bigint, "devices" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."increment_version_stats"("app_id" character varying, "version_id" bigint, "devices" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_version_stats"("app_id" character varying, "version_id" bigint, "devices" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_version_stats"("app_id" character varying, "version_id" bigint, "devices" integer) TO "service_role";


--
-- Name: FUNCTION "is_allowed_action"("apikey" "text"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."is_allowed_action"("apikey" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_allowed_action"("apikey" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_allowed_action"("apikey" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_allowed_action"("apikey" "text") TO "service_role";


--
-- Name: FUNCTION "is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[]); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[]) TO "service_role";


--
-- Name: FUNCTION "is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[], "app_id" character varying); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[], "app_id" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[], "app_id" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[], "app_id" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_allowed_capgkey"("apikey" "text", "keymode" "public"."key_mode"[], "app_id" character varying) TO "service_role";


--
-- Name: FUNCTION "is_app_owner"("userid" "uuid", "appid" character varying); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."is_app_owner"("userid" "uuid", "appid" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."is_app_owner"("userid" "uuid", "appid" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."is_app_owner"("userid" "uuid", "appid" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_app_owner"("userid" "uuid", "appid" character varying) TO "service_role";


--
-- Name: FUNCTION "is_app_shared"("userid" "uuid", "appid" character varying); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."is_app_shared"("userid" "uuid", "appid" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."is_app_shared"("userid" "uuid", "appid" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."is_app_shared"("userid" "uuid", "appid" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_app_shared"("userid" "uuid", "appid" character varying) TO "service_role";


--
-- Name: FUNCTION "is_canceled"("userid" "uuid"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."is_canceled"("userid" "uuid") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_canceled"("userid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_canceled"("userid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_canceled"("userid" "uuid") TO "service_role";


--
-- Name: FUNCTION "is_good_plan"("userid" "uuid"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."is_good_plan"("userid" "uuid") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_good_plan"("userid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_good_plan"("userid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_good_plan"("userid" "uuid") TO "service_role";


--
-- Name: FUNCTION "is_good_plan_v2"("userid" "uuid"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."is_good_plan_v2"("userid" "uuid") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_good_plan_v2"("userid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_good_plan_v2"("userid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_good_plan_v2"("userid" "uuid") TO "service_role";


--
-- Name: FUNCTION "is_in_channel"("userid" "uuid", "ownerid" "uuid"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."is_in_channel"("userid" "uuid", "ownerid" "uuid") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_in_channel"("userid" "uuid", "ownerid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_in_channel"("userid" "uuid", "ownerid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_in_channel"("userid" "uuid", "ownerid" "uuid") TO "service_role";


--
-- Name: FUNCTION "is_not_deleted"("email_check" character varying); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."is_not_deleted"("email_check" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."is_not_deleted"("email_check" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."is_not_deleted"("email_check" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_not_deleted"("email_check" character varying) TO "service_role";


--
-- Name: FUNCTION "is_paying"("userid" "uuid"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."is_paying"("userid" "uuid") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_paying"("userid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_paying"("userid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_paying"("userid" "uuid") TO "service_role";


--
-- Name: FUNCTION "is_trial"("userid" "uuid"); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."is_trial"("userid" "uuid") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_trial"("userid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_trial"("userid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_trial"("userid" "uuid") TO "service_role";


--
-- Name: FUNCTION "is_version_shared"("userid" "uuid", "versionid" bigint); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION "public"."is_version_shared"("userid" "uuid", "versionid" bigint) TO "postgres";
GRANT ALL ON FUNCTION "public"."is_version_shared"("userid" "uuid", "versionid" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."is_version_shared"("userid" "uuid", "versionid" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_version_shared"("userid" "uuid", "versionid" bigint) TO "service_role";


--
-- Name: SEQUENCE "jobid_seq"; Type: ACL; Schema: cron; Owner: supabase_admin
--

GRANT ALL ON SEQUENCE "cron"."jobid_seq" TO "postgres" WITH GRANT OPTION;


--
-- Name: SEQUENCE "runid_seq"; Type: ACL; Schema: cron; Owner: supabase_admin
--

GRANT ALL ON SEQUENCE "cron"."runid_seq" TO "postgres" WITH GRANT OPTION;


--
-- Name: TABLE "pg_stat_statements"; Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON TABLE "extensions"."pg_stat_statements" TO "dashboard_user";


--
-- Name: TABLE "apikeys"; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON TABLE "public"."apikeys" TO "postgres";
GRANT ALL ON TABLE "public"."apikeys" TO "anon";
GRANT ALL ON TABLE "public"."apikeys" TO "authenticated";
GRANT ALL ON TABLE "public"."apikeys" TO "service_role";


--
-- Name: SEQUENCE "apikeys_id_seq"; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON SEQUENCE "public"."apikeys_id_seq" TO "postgres";
GRANT ALL ON SEQUENCE "public"."apikeys_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."apikeys_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."apikeys_id_seq" TO "service_role";


--
-- Name: TABLE "app_stats"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."app_stats" TO "anon";
GRANT ALL ON TABLE "public"."app_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."app_stats" TO "service_role";


--
-- Name: TABLE "app_stats_onprem"; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON TABLE "public"."app_stats_onprem" TO "postgres";
GRANT ALL ON TABLE "public"."app_stats_onprem" TO "anon";
GRANT ALL ON TABLE "public"."app_stats_onprem" TO "authenticated";
GRANT ALL ON TABLE "public"."app_stats_onprem" TO "service_role";


--
-- Name: TABLE "app_versions"; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON TABLE "public"."app_versions" TO "postgres";
GRANT ALL ON TABLE "public"."app_versions" TO "anon";
GRANT ALL ON TABLE "public"."app_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."app_versions" TO "service_role";


--
-- Name: SEQUENCE "app_versions_id_seq"; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON SEQUENCE "public"."app_versions_id_seq" TO "postgres";
GRANT ALL ON SEQUENCE "public"."app_versions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."app_versions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."app_versions_id_seq" TO "service_role";


--
-- Name: TABLE "app_versions_meta"; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON TABLE "public"."app_versions_meta" TO "postgres";
GRANT ALL ON TABLE "public"."app_versions_meta" TO "anon";
GRANT ALL ON TABLE "public"."app_versions_meta" TO "authenticated";
GRANT ALL ON TABLE "public"."app_versions_meta" TO "service_role";


--
-- Name: SEQUENCE "app_versions_meta_id_seq"; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON SEQUENCE "public"."app_versions_meta_id_seq" TO "postgres";
GRANT ALL ON SEQUENCE "public"."app_versions_meta_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."app_versions_meta_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."app_versions_meta_id_seq" TO "service_role";


--
-- Name: TABLE "apps"; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON TABLE "public"."apps" TO "postgres";
GRANT ALL ON TABLE "public"."apps" TO "anon";
GRANT ALL ON TABLE "public"."apps" TO "authenticated";
GRANT ALL ON TABLE "public"."apps" TO "service_role";


--
-- Name: TABLE "channel_devices"; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON TABLE "public"."channel_devices" TO "postgres";
GRANT ALL ON TABLE "public"."channel_devices" TO "anon";
GRANT ALL ON TABLE "public"."channel_devices" TO "authenticated";
GRANT ALL ON TABLE "public"."channel_devices" TO "service_role";


--
-- Name: TABLE "channels"; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON TABLE "public"."channels" TO "postgres";
GRANT ALL ON TABLE "public"."channels" TO "anon";
GRANT ALL ON TABLE "public"."channels" TO "authenticated";
GRANT ALL ON TABLE "public"."channels" TO "service_role";


--
-- Name: SEQUENCE "channel_id_seq"; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON SEQUENCE "public"."channel_id_seq" TO "postgres";
GRANT ALL ON SEQUENCE "public"."channel_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."channel_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."channel_id_seq" TO "service_role";


--
-- Name: TABLE "channel_users"; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON TABLE "public"."channel_users" TO "postgres";
GRANT ALL ON TABLE "public"."channel_users" TO "anon";
GRANT ALL ON TABLE "public"."channel_users" TO "authenticated";
GRANT ALL ON TABLE "public"."channel_users" TO "service_role";


--
-- Name: SEQUENCE "channel_users_id_seq"; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON SEQUENCE "public"."channel_users_id_seq" TO "postgres";
GRANT ALL ON SEQUENCE "public"."channel_users_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."channel_users_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."channel_users_id_seq" TO "service_role";


--
-- Name: TABLE "deleted_account"; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON TABLE "public"."deleted_account" TO "postgres";
GRANT ALL ON TABLE "public"."deleted_account" TO "anon";
GRANT ALL ON TABLE "public"."deleted_account" TO "authenticated";
GRANT ALL ON TABLE "public"."deleted_account" TO "service_role";


--
-- Name: TABLE "devices"; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON TABLE "public"."devices" TO "postgres";
GRANT ALL ON TABLE "public"."devices" TO "anon";
GRANT ALL ON TABLE "public"."devices" TO "authenticated";
GRANT ALL ON TABLE "public"."devices" TO "service_role";


--
-- Name: TABLE "devices_onprem"; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON TABLE "public"."devices_onprem" TO "postgres";
GRANT ALL ON TABLE "public"."devices_onprem" TO "anon";
GRANT ALL ON TABLE "public"."devices_onprem" TO "authenticated";
GRANT ALL ON TABLE "public"."devices_onprem" TO "service_role";


--
-- Name: TABLE "devices_override"; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON TABLE "public"."devices_override" TO "postgres";
GRANT ALL ON TABLE "public"."devices_override" TO "anon";
GRANT ALL ON TABLE "public"."devices_override" TO "authenticated";
GRANT ALL ON TABLE "public"."devices_override" TO "service_role";


--
-- Name: TABLE "global_stats"; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON TABLE "public"."global_stats" TO "postgres";
GRANT ALL ON TABLE "public"."global_stats" TO "anon";
GRANT ALL ON TABLE "public"."global_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."global_stats" TO "service_role";


--
-- Name: TABLE "pay_as_you_go"; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON TABLE "public"."pay_as_you_go" TO "postgres";
GRANT ALL ON TABLE "public"."pay_as_you_go" TO "anon";
GRANT ALL ON TABLE "public"."pay_as_you_go" TO "authenticated";
GRANT ALL ON TABLE "public"."pay_as_you_go" TO "service_role";


--
-- Name: SEQUENCE "pay_as_you_go_id_seq"; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON SEQUENCE "public"."pay_as_you_go_id_seq" TO "postgres";
GRANT ALL ON SEQUENCE "public"."pay_as_you_go_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."pay_as_you_go_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."pay_as_you_go_id_seq" TO "service_role";


--
-- Name: TABLE "plans"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."plans" TO "anon";
GRANT ALL ON TABLE "public"."plans" TO "authenticated";
GRANT ALL ON TABLE "public"."plans" TO "service_role";


--
-- Name: TABLE "stats"; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON TABLE "public"."stats" TO "postgres";
GRANT ALL ON TABLE "public"."stats" TO "anon";
GRANT ALL ON TABLE "public"."stats" TO "authenticated";
GRANT ALL ON TABLE "public"."stats" TO "service_role";


--
-- Name: SEQUENCE "stats_id_seq"; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON SEQUENCE "public"."stats_id_seq" TO "postgres";
GRANT ALL ON SEQUENCE "public"."stats_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."stats_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."stats_id_seq" TO "service_role";


--
-- Name: TABLE "stats_onprem"; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON TABLE "public"."stats_onprem" TO "postgres";
GRANT ALL ON TABLE "public"."stats_onprem" TO "anon";
GRANT ALL ON TABLE "public"."stats_onprem" TO "authenticated";
GRANT ALL ON TABLE "public"."stats_onprem" TO "service_role";


--
-- Name: SEQUENCE "stats_onprem_id_seq"; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON SEQUENCE "public"."stats_onprem_id_seq" TO "postgres";
GRANT ALL ON SEQUENCE "public"."stats_onprem_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."stats_onprem_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."stats_onprem_id_seq" TO "service_role";


--
-- Name: TABLE "stripe_info"; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON TABLE "public"."stripe_info" TO "postgres";
GRANT ALL ON TABLE "public"."stripe_info" TO "anon";
GRANT ALL ON TABLE "public"."stripe_info" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_info" TO "service_role";


--
-- Name: TABLE "users"; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON TABLE "public"."users" TO "postgres";
GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: cron; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "cron" GRANT ALL ON SEQUENCES  TO "postgres" WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: cron; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "cron" GRANT ALL ON FUNCTIONS  TO "postgres" WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: cron; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "cron" GRANT ALL ON TABLES  TO "postgres" WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";


--
-- PostgreSQL database dump complete
--

