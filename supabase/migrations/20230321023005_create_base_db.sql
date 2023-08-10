--
-- PostgreSQL database dump
--

-- Dumped from database version 15.1
-- Dumped by pg_dump version 15.2

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

DROP POLICY IF EXISTS "Disable act bucket for users" ON storage.buckets;
DROP POLICY IF EXISTS "Alow user to insert in they folder 1sbjm_0" ON storage.objects;
DROP POLICY IF EXISTS "Allow user to update version 1sbjm_0" ON storage.objects;
DROP POLICY IF EXISTS "Allow user to delete they folder 1sbjm_0" ON storage.objects;
DROP POLICY IF EXISTS "Allow user or shared to manage they folder 1sbjm_0" ON storage.objects;
DROP POLICY IF EXISTS "Allow apikey to select 1sbjm_0" ON storage.objects;
DROP POLICY IF EXISTS "Allow apikey to manage they folder 1sbjm_1" ON storage.objects;
DROP POLICY IF EXISTS "Allow apikey to manage they folder  1sbjm_3" ON storage.objects;
DROP POLICY IF EXISTS "Allow apikey manage they folder 1sbjm_0" ON storage.objects;
DROP POLICY IF EXISTS "All user to manage they own folder 1ffg0oo_3" ON storage.objects;
DROP POLICY IF EXISTS "All user to manage they own folder 1ffg0oo_2" ON storage.objects;
DROP POLICY IF EXISTS "All user to manage they own folder 1ffg0oo_1" ON storage.objects;
DROP POLICY IF EXISTS "All user to manage they own folder 1ffg0oo_0" ON storage.objects;
DROP POLICY IF EXISTS "All all users to act" ON storage.objects;
DROP POLICY IF EXISTS "allowed shared to select" ON public.apps;
DROP POLICY IF EXISTS "allow for delete by the CLI" ON public.app_versions;
DROP POLICY IF EXISTS "allow apikey to select" ON public.apps;
DROP POLICY IF EXISTS "allow apikey to delete" ON public.apps;
DROP POLICY IF EXISTS "allow apikey to delete" ON public.app_versions;
DROP POLICY IF EXISTS "Select if app is shared with you or api" ON public.channels;
DROP POLICY IF EXISTS "Enable update for users based on email" ON public.deleted_account;
DROP POLICY IF EXISTS "Enable select for authenticated users only" ON public.plans;
DROP POLICY IF EXISTS "Enable all for user based on user_id" ON public.apikeys;
DROP POLICY IF EXISTS "Disable for all" ON public.store_apps;
DROP POLICY IF EXISTS "Disable for all" ON public.notifications;
DROP POLICY IF EXISTS "Allow user to self get" ON public.stripe_info;
DROP POLICY IF EXISTS "Allow user to self get" ON public.channel_users;
DROP POLICY IF EXISTS "Allow user to get they meta" ON public.app_versions_meta;
DROP POLICY IF EXISTS "Allow shared to see" ON public.app_versions;
DROP POLICY IF EXISTS "Allow self to modify self" ON public.users;
DROP POLICY IF EXISTS "Allow select app owner" ON public.devices;
DROP POLICY IF EXISTS "Allow owner to update" ON public.devices;
DROP POLICY IF EXISTS "Allow owner to listen insert" ON public.app_versions;
DROP POLICY IF EXISTS "Allow owner to all" ON public.app_versions;
DROP POLICY IF EXISTS "Allow app owner to all" ON public.apps;
DROP POLICY IF EXISTS "Allow app owner or admin" ON public.channels;
DROP POLICY IF EXISTS "Allow apikey to select" ON public.app_versions;
DROP POLICY IF EXISTS "Allow apikey to insert" ON public.apps;
DROP POLICY IF EXISTS "Allow apikey to insert" ON public.app_versions;
DROP POLICY IF EXISTS "Allow api to update" ON public.channels;
DROP POLICY IF EXISTS "Allow api to insert" ON public.channels;
DROP POLICY IF EXISTS "Allow api key" ON public.stats;
DROP POLICY IF EXISTS "Allow all users to select" ON public.users;
DROP POLICY IF EXISTS "Allow all to app owner" ON public.stats;
DROP POLICY IF EXISTS "Allow all to app owner" ON public.devices_override;
DROP POLICY IF EXISTS "Allow all to app owner" ON public.channel_devices;
DROP POLICY IF EXISTS "Allow all for app owner" ON public.channel_users;
DROP POLICY IF EXISTS "All self to select" ON public.app_stats;
DROP POLICY IF EXISTS "All all to app owner or api" ON public.channels;
DROP POLICY IF EXISTS "Allow anon to select" ON public.global_stats;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_id_fkey;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_customer_id_fkey;
ALTER TABLE IF EXISTS ONLY public.stripe_info DROP CONSTRAINT IF EXISTS stripe_info_product_id_fkey;
ALTER TABLE IF EXISTS ONLY public.stats DROP CONSTRAINT IF EXISTS stats_version_fkey;
ALTER TABLE IF EXISTS ONLY public.stats DROP CONSTRAINT IF EXISTS stats_device_id_fkey;
ALTER TABLE IF EXISTS ONLY public.stats DROP CONSTRAINT IF EXISTS stats_app_id_fkey;
ALTER TABLE IF EXISTS ONLY public.notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.devices DROP CONSTRAINT IF EXISTS devices_version_fkey;
ALTER TABLE IF EXISTS ONLY public.devices_override DROP CONSTRAINT IF EXISTS devices_override_version_fkey;
ALTER TABLE IF EXISTS ONLY public.devices_override DROP CONSTRAINT IF EXISTS devices_override_device_id_fkey;
ALTER TABLE IF EXISTS ONLY public.devices_override DROP CONSTRAINT IF EXISTS devices_override_created_by_fkey;
ALTER TABLE IF EXISTS ONLY public.devices_override DROP CONSTRAINT IF EXISTS devices_override_app_id_fkey;
ALTER TABLE IF EXISTS ONLY public.devices DROP CONSTRAINT IF EXISTS devices_app_id_fkey;
ALTER TABLE IF EXISTS ONLY public.channels DROP CONSTRAINT IF EXISTS channels_version_fkey;
ALTER TABLE IF EXISTS ONLY public.channels DROP CONSTRAINT IF EXISTS channels_created_by_fkey;
ALTER TABLE IF EXISTS ONLY public.channels DROP CONSTRAINT IF EXISTS channels_app_id_fkey;
ALTER TABLE IF EXISTS ONLY public.channel_users DROP CONSTRAINT IF EXISTS channel_users_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.channel_users DROP CONSTRAINT IF EXISTS channel_users_created_by_fkey;
ALTER TABLE IF EXISTS ONLY public.channel_users DROP CONSTRAINT IF EXISTS channel_users_channel_id_fkey;
ALTER TABLE IF EXISTS ONLY public.channel_users DROP CONSTRAINT IF EXISTS channel_users_app_id_fkey;
ALTER TABLE IF EXISTS ONLY public.channel_devices DROP CONSTRAINT IF EXISTS channel_devices_device_id_fkey;
ALTER TABLE IF EXISTS ONLY public.channel_devices DROP CONSTRAINT IF EXISTS channel_devices_created_by_fkey;
ALTER TABLE IF EXISTS ONLY public.channel_devices DROP CONSTRAINT IF EXISTS channel_devices_channel_id_fkey;
ALTER TABLE IF EXISTS ONLY public.channel_devices DROP CONSTRAINT IF EXISTS channel_devices_app_id_fkey;
ALTER TABLE IF EXISTS ONLY public.apps DROP CONSTRAINT IF EXISTS apps_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.app_versions DROP CONSTRAINT IF EXISTS app_versions_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.app_versions_meta DROP CONSTRAINT IF EXISTS app_versions_meta_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.app_versions_meta DROP CONSTRAINT IF EXISTS app_versions_meta_id_fkey;
ALTER TABLE IF EXISTS ONLY public.app_versions_meta DROP CONSTRAINT IF EXISTS app_versions_meta_app_id_fkey;
ALTER TABLE IF EXISTS ONLY public.app_versions DROP CONSTRAINT IF EXISTS app_versions_app_id_fkey;
ALTER TABLE IF EXISTS ONLY public.app_stats DROP CONSTRAINT IF EXISTS app_stats_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.app_stats DROP CONSTRAINT IF EXISTS app_stats_app_id_fkey;
ALTER TABLE IF EXISTS ONLY public.apikeys DROP CONSTRAINT IF EXISTS apikeys_user_id_fkey;
DROP TRIGGER IF EXISTS tr_check_filters ON realtime.subscription;
DROP TRIGGER IF EXISTS on_version_update ON public.app_versions;
DROP TRIGGER IF EXISTS on_version_delete ON public.app_versions;
DROP TRIGGER IF EXISTS on_version_create ON public.app_versions;
DROP TRIGGER IF EXISTS on_user_update ON public.users;
DROP TRIGGER IF EXISTS on_user_create ON public.users;
DROP TRIGGER IF EXISTS on_shared_create ON public.channel_users;
DROP TRIGGER IF EXISTS on_log_create ON public.stats;
DROP TRIGGER IF EXISTS on_channel_update ON public.channels;
DROP TRIGGER IF EXISTS on_channel_create ON public.channels;
DROP TRIGGER IF EXISTS on_app_stats_update ON public.app_stats;
DROP TRIGGER IF EXISTS on_app_stats_create ON public.app_stats;
DROP TRIGGER IF EXISTS handle_updated_at ON public.users;
DROP TRIGGER IF EXISTS handle_updated_at ON public.stripe_info;
DROP TRIGGER IF EXISTS handle_updated_at ON public.stats;
DROP TRIGGER IF EXISTS handle_updated_at ON public.plans;
DROP TRIGGER IF EXISTS handle_updated_at ON public.devices_override;
DROP TRIGGER IF EXISTS handle_updated_at ON public.devices;
DROP TRIGGER IF EXISTS handle_updated_at ON public.channels;
DROP TRIGGER IF EXISTS handle_updated_at ON public.channel_users;
DROP TRIGGER IF EXISTS handle_updated_at ON public.channel_devices;
DROP TRIGGER IF EXISTS handle_updated_at ON public.apps;
DROP TRIGGER IF EXISTS handle_updated_at ON public.app_versions_meta;
DROP TRIGGER IF EXISTS handle_updated_at ON public.app_versions;
DROP TRIGGER IF EXISTS handle_updated_at ON public.apikeys;
DROP INDEX IF EXISTS public.store_app_pkey;
DROP INDEX IF EXISTS public.idx_version_stats;
DROP INDEX IF EXISTS public.idx_store_apps_react_native;
DROP INDEX IF EXISTS public.idx_store_apps_native_script;
DROP INDEX IF EXISTS public.idx_store_apps_kotlin;
DROP INDEX IF EXISTS public.idx_store_apps_install;
DROP INDEX IF EXISTS public.idx_store_apps_flutter;
DROP INDEX IF EXISTS public.idx_store_apps_cordova;
DROP INDEX IF EXISTS public.idx_store_apps_capacitor;
DROP INDEX IF EXISTS public.idx_store_apps;
DROP INDEX IF EXISTS public.idx_stats_version_build;
DROP INDEX IF EXISTS public.idx_stats_updated_at;
DROP INDEX IF EXISTS public.idx_stats_platform;
DROP INDEX IF EXISTS public.idx_stats_device_id;
DROP INDEX IF EXISTS public.idx_stats_created_at;
DROP INDEX IF EXISTS public.idx_stats_app_id;
DROP INDEX IF EXISTS public.idx_stats_action;
DROP INDEX IF EXISTS public.idx_devices_created_at;
DROP INDEX IF EXISTS public.idx_device_id_stats;
DROP INDEX IF EXISTS public.idx_app_versions_name;
DROP INDEX IF EXISTS public.idx_app_versions_id;
DROP INDEX IF EXISTS public.idx_app_id_stats;
DROP INDEX IF EXISTS public.idx_app_id_devices;
DROP INDEX IF EXISTS public.idx_app_id_app_versions;
DROP INDEX IF EXISTS public.idx_app_action_stats_created;
DROP INDEX IF EXISTS public.idx_app_action_stats;
DROP INDEX IF EXISTS public.app_versions_meta_app_id_idx;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_pkey;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_customer_id_key;
ALTER TABLE IF EXISTS ONLY public.stripe_info DROP CONSTRAINT IF EXISTS stripe_info_pkey;
ALTER TABLE IF EXISTS ONLY public.store_apps DROP CONSTRAINT IF EXISTS store_apps_pkey;
ALTER TABLE IF EXISTS ONLY public.stats DROP CONSTRAINT IF EXISTS stats_pkey;
ALTER TABLE IF EXISTS ONLY public.plans DROP CONSTRAINT IF EXISTS plans_stripe_id_key;
ALTER TABLE IF EXISTS ONLY public.plans DROP CONSTRAINT IF EXISTS plans_pkey;
ALTER TABLE IF EXISTS ONLY public.notifications DROP CONSTRAINT IF EXISTS notifications_pkey;
ALTER TABLE IF EXISTS ONLY public.global_stats DROP CONSTRAINT IF EXISTS global_stats_pkey;
ALTER TABLE IF EXISTS ONLY public.devices DROP CONSTRAINT IF EXISTS devices_pkey;
ALTER TABLE IF EXISTS ONLY public.devices_override DROP CONSTRAINT IF EXISTS devices_override_pkey;
ALTER TABLE IF EXISTS ONLY public.deleted_account DROP CONSTRAINT IF EXISTS deleted_account_pkey;
ALTER TABLE IF EXISTS ONLY public.channel_users DROP CONSTRAINT IF EXISTS channel_users_pkey;
ALTER TABLE IF EXISTS ONLY public.channels DROP CONSTRAINT IF EXISTS channel_pkey;
ALTER TABLE IF EXISTS ONLY public.channel_devices DROP CONSTRAINT IF EXISTS channel_devices_pkey;
ALTER TABLE IF EXISTS ONLY public.apps DROP CONSTRAINT IF EXISTS apps_pkey;
ALTER TABLE IF EXISTS ONLY public.app_versions DROP CONSTRAINT IF EXISTS app_versions_pkey;
ALTER TABLE IF EXISTS ONLY public.app_versions DROP CONSTRAINT IF EXISTS app_versions_name_app_id_key;
ALTER TABLE IF EXISTS ONLY public.app_versions_meta DROP CONSTRAINT IF EXISTS app_versions_meta_pkey;
ALTER TABLE IF EXISTS ONLY public.app_stats DROP CONSTRAINT IF EXISTS app_stats_pkey;
ALTER TABLE IF EXISTS ONLY public.apikeys DROP CONSTRAINT IF EXISTS apikeys_pkey;
DROP TABLE IF EXISTS public.users;
DROP TABLE IF EXISTS public.stripe_info;
DROP TABLE IF EXISTS public.store_apps;
DROP TABLE IF EXISTS public.stats;
DROP TABLE IF EXISTS public.plans;
DROP TABLE IF EXISTS public.notifications;
DROP TABLE IF EXISTS public.global_stats;
DROP TABLE IF EXISTS public.devices_override;
DROP TABLE IF EXISTS public.devices;
DROP TABLE IF EXISTS public.deleted_account;
DROP TABLE IF EXISTS public.channel_users;
DROP TABLE IF EXISTS public.channels;
DROP TABLE IF EXISTS public.channel_devices;
DROP TABLE IF EXISTS public.apps;
DROP TABLE IF EXISTS public.app_versions_meta;
DROP TABLE IF EXISTS public.app_versions;
DROP TABLE IF EXISTS public.app_stats;
DROP TABLE IF EXISTS public.apikeys;
DROP FUNCTION IF EXISTS public.is_version_shared(userid uuid, versionid bigint);
DROP FUNCTION IF EXISTS public.is_trial(userid uuid);
DROP FUNCTION IF EXISTS public.is_paying(userid uuid);
DROP FUNCTION IF EXISTS public.is_onboarding_needed(userid uuid);
DROP FUNCTION IF EXISTS public.is_onboarded(userid uuid);
DROP FUNCTION IF EXISTS public.is_not_deleted(email_check character varying);
DROP FUNCTION IF EXISTS public.is_in_channel(userid uuid, ownerid uuid);
DROP FUNCTION IF EXISTS public.is_good_plan_v3(userid uuid);
DROP FUNCTION IF EXISTS public.is_free_usage(userid uuid);
DROP FUNCTION IF EXISTS public.is_canceled(userid uuid);
DROP FUNCTION IF EXISTS public.is_app_shared(userid uuid, appid character varying);
DROP FUNCTION IF EXISTS public.is_app_owner(userid uuid, appid character varying);
DROP FUNCTION IF EXISTS public.is_allowed_capgkey(apikey text, keymode public.key_mode[], app_id character varying);
DROP FUNCTION IF EXISTS public.is_allowed_capgkey(apikey text, keymode public.key_mode[]);
DROP FUNCTION IF EXISTS public.is_allowed_action_user(userid uuid);
DROP FUNCTION IF EXISTS public.is_allowed_action(apikey text);
DROP FUNCTION IF EXISTS public.is_admin(userid uuid);
DROP FUNCTION IF EXISTS public.increment_version_stats(app_id character varying, version_id bigint, devices integer);
DROP FUNCTION IF EXISTS public.increment_store(app_id character varying, updates integer);
DROP FUNCTION IF EXISTS public.increment_stats_v2(app_id character varying, date_id character varying, bandwidth integer, version_size integer, channels integer, shared integer, mlu integer, mlu_real integer, versions integer, devices integer, devices_real integer);
DROP FUNCTION IF EXISTS public.increment_stats(app_id character varying, date_id character varying, bandwidth integer, version_size integer, channels integer, shared integer, mlu integer, mlu_real integer, versions integer, devices integer);
DROP FUNCTION IF EXISTS public.get_user_id(apikey text);
DROP FUNCTION IF EXISTS public.get_total_stats_v2(userid uuid, dateid character varying);
DROP FUNCTION IF EXISTS public.get_stats(userid uuid, dateid character varying);
DROP FUNCTION IF EXISTS public.get_plan_usage_percent(userid uuid, dateid character varying);
DROP FUNCTION IF EXISTS public.get_metered_usage(userid uuid);
DROP FUNCTION IF EXISTS public.get_max_version(userid uuid);
DROP FUNCTION IF EXISTS public.get_max_shared(userid uuid);
DROP FUNCTION IF EXISTS public.get_max_plan(userid uuid);
DROP FUNCTION IF EXISTS public.get_max_channel(userid uuid);
DROP FUNCTION IF EXISTS public.get_dl_by_month_by_app(userid uuid, pastmonth integer, appid character varying);
DROP FUNCTION IF EXISTS public.get_dl_by_month_by_app(pastmonth integer, appid character varying);
DROP FUNCTION IF EXISTS public.get_dl_by_month(userid uuid, pastmonth integer);
DROP FUNCTION IF EXISTS public.get_devices_version(app_id character varying, version_id bigint);
DROP FUNCTION IF EXISTS public.get_current_plan_name(userid uuid);
DROP FUNCTION IF EXISTS public.get_current_plan_max(userid uuid);
DROP FUNCTION IF EXISTS public.get_app_versions(appid character varying, name_version character varying, apikey text);
DROP FUNCTION IF EXISTS public.find_fit_plan_v3(mau bigint, bandwidth double precision, storage double precision);
DROP FUNCTION IF EXISTS public.find_best_plan_v3(mau bigint, bandwidth double precision, storage double precision);
DROP FUNCTION IF EXISTS public.exist_user(e_mail character varying);
DROP FUNCTION IF EXISTS public.exist_channel(appid character varying, name_channel character varying, apikey text);
DROP FUNCTION IF EXISTS public.exist_app_versions(appid character varying, name_version character varying, apikey text);
DROP FUNCTION IF EXISTS public.exist_app_v2(appid character varying);
DROP FUNCTION IF EXISTS public.exist_app(appid character varying, apikey text);
DROP FUNCTION IF EXISTS public.count_all_updates();
DROP FUNCTION IF EXISTS public.count_all_apps();
DROP FUNCTION IF EXISTS public.convert_number_to_percent(val double precision, max_val double precision);
DROP FUNCTION IF EXISTS public.convert_mb_to_bytes(gb double precision);
DROP FUNCTION IF EXISTS public.convert_gb_to_bytes(gb double precision);
DROP FUNCTION IF EXISTS public.convert_bytes_to_mb(byt double precision);
DROP FUNCTION IF EXISTS public.convert_bytes_to_gb(byt double precision);
DROP TYPE IF EXISTS public.stripe_status;
DROP TYPE IF EXISTS public.stats_table;
DROP TYPE IF EXISTS public.platform_os;
DROP TYPE IF EXISTS public.pay_as_you_go_type;
DROP TYPE IF EXISTS public.match_plan;
DROP TYPE IF EXISTS public.key_mode;
DROP TYPE IF EXISTS public.app_mode;

--
-- Name: supabase_migrations; Type: SCHEMA; Schema: -; Owner: postgres
--

-- CREATE SCHEMA supabase_migrations; 


ALTER SCHEMA supabase_migrations OWNER TO postgres;

--
-- Name: pg_cron; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;


--
-- Name: EXTENSION pg_cron; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_cron IS 'Job scheduler for PostgreSQL';

--
-- Name: pg_net; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;


--
-- Name: EXTENSION pg_net; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_net IS 'Async HTTP';

--
-- Name: http; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;


--
-- Name: EXTENSION http; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION http IS 'HTTP client for PostgreSQL, allows web page retrieval inside the database.';


--
-- Name: moddatetime; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS moddatetime WITH SCHEMA extensions;


--
-- Name: EXTENSION moddatetime; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION moddatetime IS 'functions for tracking last modification time';


--
-- Name: pg_graphql; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_graphql WITH SCHEMA graphql;


--
-- Name: EXTENSION pg_graphql; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_graphql IS 'pg_graphql: GraphQL support';


--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;


--
-- Name: EXTENSION pg_stat_statements; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_stat_statements IS 'track planning and execution statistics of all SQL statements executed';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: pgjwt; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgjwt WITH SCHEMA extensions;


--
-- Name: EXTENSION pgjwt; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgjwt IS 'JSON Web Token API for Postgresql';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: app_mode; Type: TYPE; Schema: public; Owner: supabase_admin
--

CREATE TYPE public.app_mode AS ENUM (
    'prod',
    'dev',
    'livereload'
);


ALTER TYPE public.app_mode OWNER TO supabase_admin;

--
-- Name: key_mode; Type: TYPE; Schema: public; Owner: supabase_admin
--

CREATE TYPE public.key_mode AS ENUM (
    'read',
    'write',
    'all',
    'upload'
);


ALTER TYPE public.key_mode OWNER TO supabase_admin;

--
-- Name: match_plan; Type: TYPE; Schema: public; Owner: supabase_admin
--

CREATE TYPE public.match_plan AS (
	name character varying
);


ALTER TYPE public.match_plan OWNER TO supabase_admin;

--
-- Name: pay_as_you_go_type; Type: TYPE; Schema: public; Owner: supabase_admin
--

CREATE TYPE public.pay_as_you_go_type AS ENUM (
    'base',
    'units'
);


ALTER TYPE public.pay_as_you_go_type OWNER TO supabase_admin;

--
-- Name: platform_os; Type: TYPE; Schema: public; Owner: supabase_admin
--

CREATE TYPE public.platform_os AS ENUM (
    'ios',
    'android'
);


ALTER TYPE public.platform_os OWNER TO supabase_admin;

--
-- Name: stats_table; Type: TYPE; Schema: public; Owner: supabase_admin
--

CREATE TYPE public.stats_table AS (
	mau bigint,
	bandwidth double precision,
	storage double precision
);


ALTER TYPE public.stats_table OWNER TO supabase_admin;

--
-- Name: stripe_status; Type: TYPE; Schema: public; Owner: supabase_admin
--

CREATE TYPE public.stripe_status AS ENUM (
    'created',
    'succeeded',
    'updated',
    'failed',
    'deleted',
    'canceled'
);


ALTER TYPE public.stripe_status OWNER TO supabase_admin;

--
-- Name: action; Type: TYPE; Schema: realtime; Owner: supabase_admin
--

CREATE TYPE realtime.action AS ENUM (
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'ERROR'
);


ALTER TYPE realtime.action OWNER TO supabase_admin;

--
-- Name: equality_op; Type: TYPE; Schema: realtime; Owner: supabase_admin
--

CREATE TYPE realtime.equality_op AS ENUM (
    'eq',
    'neq',
    'lt',
    'lte',
    'gt',
    'gte',
    'in'
);


ALTER TYPE realtime.equality_op OWNER TO supabase_admin;

--
-- Name: user_defined_filter; Type: TYPE; Schema: realtime; Owner: supabase_admin
--

CREATE TYPE realtime.user_defined_filter AS (
	column_name text,
	op realtime.equality_op,
	value text
);


ALTER TYPE realtime.user_defined_filter OWNER TO supabase_admin;

--
-- Name: wal_column; Type: TYPE; Schema: realtime; Owner: supabase_admin
--

CREATE TYPE realtime.wal_column AS (
	name text,
	type_name text,
	type_oid oid,
	value jsonb,
	is_pkey boolean,
	is_selectable boolean
);


ALTER TYPE realtime.wal_column OWNER TO supabase_admin;

--
-- Name: wal_rls; Type: TYPE; Schema: realtime; Owner: supabase_admin
--

CREATE TYPE realtime.wal_rls AS (
	wal jsonb,
	is_rls_enabled boolean,
	subscription_ids uuid[],
	errors text[]
);


ALTER TYPE realtime.wal_rls OWNER TO supabase_admin;

--
-- Name: convert_bytes_to_gb(double precision); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.convert_bytes_to_gb(byt double precision) RETURNS double precision
    LANGUAGE plpgsql
    AS $$
Begin
  RETURN byt / 1024.0 / 1024.0 / 1024.0;
End;
$$;


ALTER FUNCTION public.convert_bytes_to_gb(byt double precision) OWNER TO supabase_admin;

--
-- Name: convert_bytes_to_mb(double precision); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.convert_bytes_to_mb(byt double precision) RETURNS double precision
    LANGUAGE plpgsql
    AS $$
Begin
  RETURN byt / 1024.0 / 1024.0;
End;
$$;


ALTER FUNCTION public.convert_bytes_to_mb(byt double precision) OWNER TO supabase_admin;

--
-- Name: convert_gb_to_bytes(double precision); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.convert_gb_to_bytes(gb double precision) RETURNS double precision
    LANGUAGE plpgsql
    AS $$
Begin
  RETURN gb * 1024 * 1024 * 1024;
End;
$$;


ALTER FUNCTION public.convert_gb_to_bytes(gb double precision) OWNER TO supabase_admin;

--
-- Name: convert_mb_to_bytes(double precision); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.convert_mb_to_bytes(gb double precision) RETURNS double precision
    LANGUAGE plpgsql
    AS $$
Begin
  RETURN gb * 1024 * 1024;
End;
$$;


ALTER FUNCTION public.convert_mb_to_bytes(gb double precision) OWNER TO supabase_admin;

--
-- Name: convert_number_to_percent(double precision, double precision); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.convert_number_to_percent(val double precision, max_val double precision) RETURNS double precision
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN round(((val * 100) / max_val)::numeric, 2);
END;
$$;


ALTER FUNCTION public.convert_number_to_percent(val double precision, max_val double precision) OWNER TO supabase_admin;

--
-- Name: count_all_apps(); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.count_all_apps() RETURNS integer
    LANGUAGE plpgsql
    AS $$
Begin
  RETURN (SELECT
(SELECT COUNT(*) FROM apps)+
(SELECT COUNT(*) FROM (SELECT DISTINCT app_id FROM store_apps where onprem = true or capgo = true) AS temp)
AS SumCount);
End;  
$$;


ALTER FUNCTION public.count_all_apps() OWNER TO supabase_admin;

--
-- Name: count_all_updates(); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.count_all_updates() RETURNS integer
    LANGUAGE plpgsql
    AS $$
Begin
  RETURN (SELECT
(SELECT SUM(updates) + SUM(installs) FROM store_apps
WHERE (onprem = true) OR (capgo = true))+
(SELECT COUNT(*) FROM stats WHERE action='set')
AS SumCount);
End;  
$$;


ALTER FUNCTION public.count_all_updates() OWNER TO supabase_admin;

--
-- Name: exist_app(character varying, text); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.exist_app(appid character varying, apikey text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM apps
  WHERE app_id=appid
  AND user_id=get_user_id(apikey)));
End;  
$$;


ALTER FUNCTION public.exist_app(appid character varying, apikey text) OWNER TO supabase_admin;

--
-- Name: exist_app_v2(character varying); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.exist_app_v2(appid character varying) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM apps
  WHERE app_id=appid));
End;  
$$;


ALTER FUNCTION public.exist_app_v2(appid character varying) OWNER TO supabase_admin;

--
-- Name: exist_app_versions(character varying, character varying, text); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.exist_app_versions(appid character varying, name_version character varying, apikey text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM app_versions
  WHERE app_id=appid
  AND name=name_version
  AND user_id=get_user_id(apikey)));
End;  
$$;


ALTER FUNCTION public.exist_app_versions(appid character varying, name_version character varying, apikey text) OWNER TO supabase_admin;

--
-- Name: exist_channel(character varying, character varying, text); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.exist_channel(appid character varying, name_channel character varying, apikey text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM channels
  WHERE app_id=appid
  AND name=name_channel
  AND created_by=get_user_id(apikey)));
End;  
$$;


ALTER FUNCTION public.exist_channel(appid character varying, name_channel character varying, apikey text) OWNER TO supabase_admin;

--
-- Name: exist_user(character varying); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.exist_user(e_mail character varying) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT id
  FROM auth.users
  WHERE email=e_mail);
End;  
$$;


ALTER FUNCTION public.exist_user(e_mail character varying) OWNER TO supabase_admin;

--
-- Name: find_best_plan_v3(bigint, double precision, double precision); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.find_best_plan_v3(mau bigint, bandwidth double precision, storage double precision) RETURNS character varying
    LANGUAGE plpgsql SECURITY DEFINER
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


ALTER FUNCTION public.find_best_plan_v3(mau bigint, bandwidth double precision, storage double precision) OWNER TO supabase_admin;

--
-- Name: find_fit_plan_v3(bigint, double precision, double precision); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.find_fit_plan_v3(mau bigint, bandwidth double precision, storage double precision) RETURNS TABLE(name character varying)
    LANGUAGE plpgsql SECURITY DEFINER
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


ALTER FUNCTION public.find_fit_plan_v3(mau bigint, bandwidth double precision, storage double precision) OWNER TO supabase_admin;

--
-- Name: get_app_versions(character varying, character varying, text); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.get_app_versions(appid character varying, name_version character varying, apikey text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT id
  FROM app_versions
  WHERE app_id=appid
  AND name=name_version
  AND user_id=get_user_id(apikey));
End;  
$$;


ALTER FUNCTION public.get_app_versions(appid character varying, name_version character varying, apikey text) OWNER TO supabase_admin;

--
-- Name: get_current_plan_max(uuid); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.get_current_plan_max(userid uuid) RETURNS TABLE(mau bigint, bandwidth double precision, storage double precision)
    LANGUAGE plpgsql SECURITY DEFINER
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


ALTER FUNCTION public.get_current_plan_max(userid uuid) OWNER TO supabase_admin;

--
-- Name: get_current_plan_name(uuid); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.get_current_plan_name(userid uuid) RETURNS character varying
    LANGUAGE plpgsql SECURITY DEFINER
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


ALTER FUNCTION public.get_current_plan_name(userid uuid) OWNER TO supabase_admin;

--
-- Name: get_devices_version(character varying, bigint); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.get_devices_version(app_id character varying, version_id bigint) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
Begin
  RETURN 
  (SELECT COUNT(*) FROM devices WHERE devices.app_id = get_devices_version.app_id and version = get_devices_version.version_id);
End;  
$$;


ALTER FUNCTION public.get_devices_version(app_id character varying, version_id bigint) OWNER TO supabase_admin;

--
-- Name: get_dl_by_month(uuid, integer); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.get_dl_by_month(userid uuid, pastmonth integer) RETURNS TABLE(app_id character varying, maxdownload bigint)
    LANGUAGE plpgsql
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


ALTER FUNCTION public.get_dl_by_month(userid uuid, pastmonth integer) OWNER TO supabase_admin;

--
-- Name: get_dl_by_month_by_app(integer, character varying); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.get_dl_by_month_by_app(pastmonth integer, appid character varying) RETURNS integer
    LANGUAGE plpgsql
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


ALTER FUNCTION public.get_dl_by_month_by_app(pastmonth integer, appid character varying) OWNER TO supabase_admin;

--
-- Name: get_dl_by_month_by_app(uuid, integer, character varying); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.get_dl_by_month_by_app(userid uuid, pastmonth integer, appid character varying) RETURNS TABLE(app_id character varying, maxdownload bigint)
    LANGUAGE plpgsql
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


ALTER FUNCTION public.get_dl_by_month_by_app(userid uuid, pastmonth integer, appid character varying) OWNER TO supabase_admin;

--
-- Name: get_max_channel(uuid); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.get_max_channel(userid uuid) RETURNS integer
    LANGUAGE plpgsql
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


ALTER FUNCTION public.get_max_channel(userid uuid) OWNER TO supabase_admin;

--
-- Name: get_max_plan(uuid); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.get_max_plan(userid uuid) RETURNS TABLE(mau bigint, storage bigint, bandwidth bigint)
    LANGUAGE plpgsql SECURITY DEFINER
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


ALTER FUNCTION public.get_max_plan(userid uuid) OWNER TO supabase_admin;

--
-- Name: get_max_shared(uuid); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.get_max_shared(userid uuid) RETURNS integer
    LANGUAGE plpgsql
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


ALTER FUNCTION public.get_max_shared(userid uuid) OWNER TO supabase_admin;

--
-- Name: get_max_version(uuid); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.get_max_version(userid uuid) RETURNS integer
    LANGUAGE plpgsql
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


ALTER FUNCTION public.get_max_version(userid uuid) OWNER TO supabase_admin;

--
-- Name: get_metered_usage(uuid); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.get_metered_usage(userid uuid) RETURNS public.stats_table
    LANGUAGE plpgsql SECURITY DEFINER
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


ALTER FUNCTION public.get_metered_usage(userid uuid) OWNER TO supabase_admin;

--
-- Name: get_plan_usage_percent(uuid, character varying); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.get_plan_usage_percent(userid uuid, dateid character varying) RETURNS double precision
    LANGUAGE plpgsql SECURITY DEFINER
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


ALTER FUNCTION public.get_plan_usage_percent(userid uuid, dateid character varying) OWNER TO supabase_admin;

--
-- Name: get_stats(uuid, character varying); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.get_stats(userid uuid, dateid character varying) RETURNS TABLE(max_channel bigint, max_shared bigint, max_update bigint, max_version bigint, max_app bigint, max_device bigint, mau bigint)
    LANGUAGE plpgsql SECURITY DEFINER
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


ALTER FUNCTION public.get_stats(userid uuid, dateid character varying) OWNER TO supabase_admin;

--
-- Name: get_total_stats_v2(uuid, character varying); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.get_total_stats_v2(userid uuid, dateid character varying) RETURNS TABLE(mau bigint, bandwidth double precision, storage double precision)
    LANGUAGE plpgsql SECURITY DEFINER
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


ALTER FUNCTION public.get_total_stats_v2(userid uuid, dateid character varying) OWNER TO supabase_admin;

--
-- Name: get_user_id(text); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.get_user_id(apikey text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
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


ALTER FUNCTION public.get_user_id(apikey text) OWNER TO supabase_admin;

--
-- Name: increment_stats(character varying, character varying, integer, integer, integer, integer, integer, integer, integer, integer); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.increment_stats(app_id character varying, date_id character varying, bandwidth integer, version_size integer, channels integer, shared integer, mlu integer, mlu_real integer, versions integer, devices integer) RETURNS void
    LANGUAGE sql
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


ALTER FUNCTION public.increment_stats(app_id character varying, date_id character varying, bandwidth integer, version_size integer, channels integer, shared integer, mlu integer, mlu_real integer, versions integer, devices integer) OWNER TO supabase_admin;

--
-- Name: increment_stats_v2(character varying, character varying, integer, integer, integer, integer, integer, integer, integer, integer, integer); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.increment_stats_v2(app_id character varying, date_id character varying, bandwidth integer, version_size integer, channels integer, shared integer, mlu integer, mlu_real integer, versions integer, devices integer, devices_real integer) RETURNS void
    LANGUAGE sql
    AS $$
  update app_stats 
  set bandwidth = app_stats.bandwidth + increment_stats_v2.bandwidth,
    version_size = app_stats.version_size + increment_stats_v2.version_size,
    channels = app_stats.channels + increment_stats_v2.channels,
    shared = app_stats.shared + increment_stats_v2.shared,
    mlu = app_stats.mlu + increment_stats_v2.mlu,
    devices = app_stats.devices + increment_stats_v2.devices,
    devices_real = app_stats.devices_real + increment_stats_v2.devices_real,
    mlu_real = app_stats.mlu_real + increment_stats_v2.mlu_real,
    versions = app_stats.versions + increment_stats_v2.versions
  where app_stats.date_id = increment_stats_v2.date_id and
  app_stats.app_id = increment_stats_v2.app_id
$$;


ALTER FUNCTION public.increment_stats_v2(app_id character varying, date_id character varying, bandwidth integer, version_size integer, channels integer, shared integer, mlu integer, mlu_real integer, versions integer, devices integer, devices_real integer) OWNER TO supabase_admin;

--
-- Name: increment_store(character varying, integer); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.increment_store(app_id character varying, updates integer) RETURNS void
    LANGUAGE sql
    AS $$
  update store_apps 
  set updates = store_apps.updates + increment_store.updates
  where store_apps.app_id = increment_store.app_id
$$;


ALTER FUNCTION public.increment_store(app_id character varying, updates integer) OWNER TO supabase_admin;

--
-- Name: increment_version_stats(character varying, bigint, integer); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.increment_version_stats(app_id character varying, version_id bigint, devices integer) RETURNS void
    LANGUAGE sql
    AS $$
  UPDATE app_versions_meta
  SET devices = (CASE WHEN (get_devices_version(app_id, version_id) + increment_version_stats.devices > 0)
    THEN (SELECT COUNT(*) FROM devices WHERE app_id = increment_version_stats.app_id and version = increment_version_stats.version_id)
    ELSE 0 END)
  where app_versions_meta.id = increment_version_stats.version_id and
  app_versions_meta.app_id = increment_version_stats.app_id
$$;


ALTER FUNCTION public.increment_version_stats(app_id character varying, version_id bigint, devices integer) OWNER TO supabase_admin;

--
-- Name: is_admin(uuid); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.is_admin(userid uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
Begin
  RETURN userid = 'c591b04e-cf29-4945-b9a0-776d0672061a';
End;  
$$;


ALTER FUNCTION public.is_admin(userid uuid) OWNER TO supabase_admin;

--
-- Name: is_allowed_action(text); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.is_allowed_action(apikey text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
Begin
  RETURN is_allowed_action_user(get_user_id(apikey));
End;
$$;


ALTER FUNCTION public.is_allowed_action(apikey text) OWNER TO supabase_admin;

--
-- Name: is_allowed_action_user(uuid); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.is_allowed_action_user(userid uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
Begin
    RETURN is_trial(userid) > 0
      or is_free_usage(userid)
      or (is_good_plan_v3(userid) and is_paying(userid));
End;
$$;


ALTER FUNCTION public.is_allowed_action_user(userid uuid) OWNER TO supabase_admin;

--
-- Name: is_allowed_capgkey(text, public.key_mode[]); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.is_allowed_capgkey(apikey text, keymode public.key_mode[]) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM apikeys
  WHERE key=apikey
  AND mode=ANY(keymode)));
End;  
$$;


ALTER FUNCTION public.is_allowed_capgkey(apikey text, keymode public.key_mode[]) OWNER TO supabase_admin;

--
-- Name: is_allowed_capgkey(text, public.key_mode[], character varying); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.is_allowed_capgkey(apikey text, keymode public.key_mode[], app_id character varying) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM apikeys
  WHERE key=apikey
  AND mode=ANY(keymode))) AND is_app_owner(get_user_id(apikey), app_id);
End;  
$$;


ALTER FUNCTION public.is_allowed_capgkey(apikey text, keymode public.key_mode[], app_id character varying) OWNER TO supabase_admin;

--
-- Name: is_app_owner(uuid, character varying); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.is_app_owner(userid uuid, appid character varying) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM apps
  WHERE app_id=appid
  AND user_id=userid));
End;  
$$;


ALTER FUNCTION public.is_app_owner(userid uuid, appid character varying) OWNER TO supabase_admin;

--
-- Name: is_app_shared(uuid, character varying); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.is_app_shared(userid uuid, appid character varying) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM channel_users
  WHERE app_id=appid
  AND user_id=userid));
End;  
$$;


ALTER FUNCTION public.is_app_shared(userid uuid, appid character varying) OWNER TO supabase_admin;

--
-- Name: is_canceled(uuid); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.is_canceled(userid uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  from stripe_info
  where customer_id=(SELECT customer_id from users where id=userid)
  AND status = 'canceled'));
End;  
$$;


ALTER FUNCTION public.is_canceled(userid uuid) OWNER TO supabase_admin;

--
-- Name: is_free_usage(uuid); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.is_free_usage(userid uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
Begin
    RETURN COALESCE(get_current_plan_name(userid), 'Free') = 'Free';
End;
$$;


ALTER FUNCTION public.is_free_usage(userid uuid) OWNER TO supabase_admin;

--
-- Name: is_good_plan_v3(uuid); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.is_good_plan_v3(userid uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
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


ALTER FUNCTION public.is_good_plan_v3(userid uuid) OWNER TO supabase_admin;

--
-- Name: is_in_channel(uuid, uuid); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.is_in_channel(userid uuid, ownerid uuid) RETURNS boolean
    LANGUAGE plpgsql
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


ALTER FUNCTION public.is_in_channel(userid uuid, ownerid uuid) OWNER TO supabase_admin;

--
-- Name: is_not_deleted(character varying); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.is_not_deleted(email_check character varying) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
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


ALTER FUNCTION public.is_not_deleted(email_check character varying) OWNER TO supabase_admin;

--
-- Name: is_onboarded(uuid); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.is_onboarded(userid uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  FROM apps
  WHERE user_id=userid)) AND (SELECT EXISTS (SELECT 1
  FROM app_versions
  WHERE user_id=userid));
End;
$$;


ALTER FUNCTION public.is_onboarded(userid uuid) OWNER TO supabase_admin;

--
-- Name: is_onboarding_needed(uuid); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.is_onboarding_needed(userid uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
Begin
  RETURN (NOT is_onboarded(userid)) AND is_trial(userid) = 0;
End;
$$;


ALTER FUNCTION public.is_onboarding_needed(userid uuid) OWNER TO supabase_admin;

--
-- Name: is_paying(uuid); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.is_paying(userid uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT EXISTS (SELECT 1
  from stripe_info
  where customer_id=(SELECT customer_id from users where id=userid)
  AND status = 'succeeded'));
End;  
$$;


ALTER FUNCTION public.is_paying(userid uuid) OWNER TO supabase_admin;

--
-- Name: is_trial(uuid); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.is_trial(userid uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
Begin
  RETURN (SELECT GREATEST((trial_at::date - (now())::date), 0) AS days
  from stripe_info
  where customer_id=(SELECT customer_id from users where id=userid));
End;  
$$;


ALTER FUNCTION public.is_trial(userid uuid) OWNER TO supabase_admin;

--
-- Name: is_version_shared(uuid, bigint); Type: FUNCTION; Schema: public; Owner: supabase_admin
--

CREATE FUNCTION public.is_version_shared(userid uuid, versionid bigint) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
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


ALTER FUNCTION public.is_version_shared(userid uuid, versionid bigint) OWNER TO supabase_admin;


CREATE TABLE public.apikeys (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    user_id uuid NOT NULL,
    key character varying NOT NULL,
    mode public.key_mode NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.apikeys OWNER TO supabase_admin;

--
-- Name: apikeys_id_seq; Type: SEQUENCE; Schema: public; Owner: supabase_admin
--

ALTER TABLE public.apikeys ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.apikeys_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: stats_id_seq; Type: SEQUENCE; Schema: public; Owner: supabase_admin 
--

-- ALTER TABLE public.app_stats ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
--     SEQUENCE NAME public.stats_id_seq
--     START WITH 1
--     INCREMENT BY 1
--     NO MINVALUE
--     NO MAXVALUE
--     CACHE 1
-- );


--
-- Name: app_stats; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.app_stats (
    app_id character varying NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    channels smallint DEFAULT '0'::smallint NOT NULL,
    mlu bigint DEFAULT '0'::bigint NOT NULL,
    versions bigint DEFAULT '0'::bigint NOT NULL,
    shared bigint DEFAULT '0'::bigint NOT NULL,
    mlu_real bigint DEFAULT '0'::bigint NOT NULL,
    devices bigint DEFAULT '0'::bigint NOT NULL,
    date_id character varying DEFAULT '2022-05'::character varying NOT NULL,
    version_size bigint DEFAULT '0'::bigint NOT NULL,
    bandwidth bigint DEFAULT '0'::bigint NOT NULL,
    devices_real bigint DEFAULT '0'::bigint NOT NULL
);


ALTER TABLE public.app_stats OWNER TO postgres;

--
-- Name: app_versions; Type: TABLE; Schema: public; Owner: supabase_admin
--

CREATE TABLE public.app_versions (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    app_id character varying NOT NULL,
    name character varying NOT NULL,
    bucket_id character varying,
    user_id uuid NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    deleted boolean DEFAULT false NOT NULL,
    external_url character varying,
    checksum character varying,
    session_key character varying,
    storage_provider text DEFAULT 'supabase'::text NOT NULL
);


ALTER TABLE public.app_versions OWNER TO supabase_admin;

--
-- Name: app_versions_id_seq; Type: SEQUENCE; Schema: public; Owner: supabase_admin
--

ALTER TABLE public.app_versions ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.app_versions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: app_versions_meta; Type: TABLE; Schema: public; Owner: supabase_admin
--

CREATE TABLE public.app_versions_meta (
    created_at timestamp with time zone DEFAULT now(),
    app_id character varying NOT NULL,
    user_id uuid NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    checksum character varying NOT NULL,
    size bigint NOT NULL,
    id bigint NOT NULL,
    devices bigint DEFAULT '0'::bigint,
    installs bigint DEFAULT '0'::bigint,
    uninstalls bigint DEFAULT '0'::bigint,
    fails bigint DEFAULT '0'::bigint
);


ALTER TABLE public.app_versions_meta OWNER TO supabase_admin;

--
-- Name: app_versions_meta_id_seq; Type: SEQUENCE; Schema: public; Owner: supabase_admin
--

ALTER TABLE public.app_versions_meta ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.app_versions_meta_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: apps; Type: TABLE; Schema: public; Owner: supabase_admin
--

CREATE TABLE public.apps (
    created_at timestamp with time zone DEFAULT now(),
    app_id character varying NOT NULL,
    icon_url character varying NOT NULL,
    user_id uuid NOT NULL,
    name character varying,
    last_version character varying,
    updated_at timestamp with time zone,
    id uuid DEFAULT extensions.uuid_generate_v4()
);


ALTER TABLE public.apps OWNER TO supabase_admin;

--
-- Name: channel_devices; Type: TABLE; Schema: public; Owner: supabase_admin
--

CREATE TABLE public.channel_devices (
    created_at timestamp with time zone DEFAULT now(),
    channel_id bigint NOT NULL,
    app_id character varying NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid NOT NULL,
    device_id text NOT NULL
);


ALTER TABLE public.channel_devices OWNER TO supabase_admin;

--
-- Name: channels; Type: TABLE; Schema: public; Owner: supabase_admin
--

CREATE TABLE public.channels (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name character varying NOT NULL,
    app_id character varying NOT NULL,
    version bigint NOT NULL,
    created_by uuid NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    public boolean DEFAULT false NOT NULL,
    "disableAutoUpdateUnderNative" boolean DEFAULT true NOT NULL,
    "disableAutoUpdateToMajor" boolean DEFAULT true NOT NULL,
    beta boolean DEFAULT false NOT NULL,
    ios boolean DEFAULT true NOT NULL,
    android boolean DEFAULT true NOT NULL,
    allow_device_self_set boolean DEFAULT false NOT NULL,
    allow_emulator boolean DEFAULT true NOT NULL,
    allow_dev boolean DEFAULT true NOT NULL
);


ALTER TABLE public.channels OWNER TO supabase_admin;

--
-- Name: channel_id_seq; Type: SEQUENCE; Schema: public; Owner: supabase_admin
--

ALTER TABLE public.channels ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.channel_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: channel_users; Type: TABLE; Schema: public; Owner: supabase_admin
--

CREATE TABLE public.channel_users (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    user_id uuid NOT NULL,
    channel_id bigint NOT NULL,
    app_id character varying NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);


ALTER TABLE public.channel_users OWNER TO supabase_admin;

--
-- Name: channel_users_id_seq; Type: SEQUENCE; Schema: public; Owner: supabase_admin
--

ALTER TABLE public.channel_users ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.channel_users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: deleted_account; Type: TABLE; Schema: public; Owner: supabase_admin
--

CREATE TABLE public.deleted_account (
    created_at timestamp with time zone DEFAULT now(),
    email character varying NOT NULL,
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL
);


ALTER TABLE public.deleted_account OWNER TO supabase_admin;

--
-- Name: devices; Type: TABLE; Schema: public; Owner: supabase_admin
--

CREATE TABLE public.devices (
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    device_id text NOT NULL,
    version bigint NOT NULL,
    app_id character varying NOT NULL,
    platform public.platform_os,
    plugin_version text DEFAULT '2.3.3'::text NOT NULL,
    os_version character varying,
    date_id character varying DEFAULT ''::character varying,
    version_build text DEFAULT 'builtin'::text,
    custom_id text DEFAULT ''::text NOT NULL,
    is_prod boolean DEFAULT true,
    is_emulator boolean DEFAULT false
);


ALTER TABLE public.devices OWNER TO supabase_admin;

--
-- Name: devices_override; Type: TABLE; Schema: public; Owner: supabase_admin
--

CREATE TABLE public.devices_override (
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    device_id text NOT NULL,
    version bigint NOT NULL,
    app_id character varying NOT NULL,
    created_by uuid
);


ALTER TABLE public.devices_override OWNER TO supabase_admin;

--
-- Name: global_stats; Type: TABLE; Schema: public; Owner: supabase_admin
--

CREATE TABLE public.global_stats (
    created_at timestamp with time zone DEFAULT now(),
    date_id character varying NOT NULL,
    apps bigint NOT NULL,
    updates bigint NOT NULL,
    stars bigint NOT NULL,
    users bigint DEFAULT '0'::bigint,
    paying bigint DEFAULT '0'::bigint,
    trial bigint DEFAULT '0'::bigint,
    need_upgrade bigint DEFAULT '0'::bigint,
    not_paying bigint DEFAULT '0'::bigint,
    onboarded bigint DEFAULT '0'::bigint
);


ALTER TABLE public.global_stats OWNER TO supabase_admin;

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: supabase_admin
--

CREATE TABLE public.notifications (
    id character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    user_id uuid NOT NULL,
    last_send_at timestamp with time zone DEFAULT now() NOT NULL,
    total_send bigint DEFAULT '1'::bigint NOT NULL
);


ALTER TABLE public.notifications OWNER TO supabase_admin;

--
-- Name: plans; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.plans (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    name character varying DEFAULT ''::character varying NOT NULL,
    description character varying DEFAULT ''::character varying NOT NULL,
    price_m bigint DEFAULT '0'::bigint NOT NULL,
    price_y bigint DEFAULT '0'::bigint NOT NULL,
    stripe_id character varying DEFAULT ''::character varying NOT NULL,
    app bigint DEFAULT '0'::bigint NOT NULL,
    channel bigint DEFAULT '0'::bigint NOT NULL,
    update bigint DEFAULT '0'::bigint NOT NULL,
    version bigint DEFAULT '0'::bigint NOT NULL,
    shared bigint DEFAULT '0'::bigint NOT NULL,
    abtest boolean DEFAULT false NOT NULL,
    progressive_deploy boolean DEFAULT false NOT NULL,
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    price_m_id character varying NOT NULL,
    price_y_id character varying NOT NULL,
    storage double precision NOT NULL,
    bandwidth double precision NOT NULL,
    mau bigint DEFAULT '0'::bigint NOT NULL,
    market_desc character varying DEFAULT ''::character varying,
    storage_unit double precision DEFAULT '0'::double precision,
    bandwidth_unit double precision DEFAULT '0'::double precision,
    mau_unit double precision DEFAULT '0'::double precision,
    price_m_storage_id text,
    price_m_bandwidth_id text,
    price_m_mau_id text
);


ALTER TABLE public.plans OWNER TO postgres;

--
-- Name: stats; Type: TABLE; Schema: public; Owner: supabase_admin
--

CREATE TABLE public.stats (
    created_at timestamp with time zone DEFAULT now(),
    platform public.platform_os NOT NULL,
    action text NOT NULL,
    device_id text NOT NULL,
    version_build text NOT NULL,
    version bigint NOT NULL,
    app_id character varying NOT NULL
);


ALTER TABLE public.stats OWNER TO supabase_admin;

--
-- Name: store_apps; Type: TABLE; Schema: public; Owner: supabase_admin
--

CREATE TABLE public.store_apps (
    created_at timestamp with time zone DEFAULT now(),
    url text DEFAULT ''::text NOT NULL,
    app_id text NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    summary text DEFAULT ''::text NOT NULL,
    icon text DEFAULT ''::text NOT NULL,
    free boolean DEFAULT true NOT NULL,
    category text DEFAULT ''::text NOT NULL,
    capacitor boolean DEFAULT false NOT NULL,
    developer_email text DEFAULT ''::text NOT NULL,
    installs bigint DEFAULT '0'::bigint NOT NULL,
    developer text DEFAULT ''::text NOT NULL,
    score double precision DEFAULT '0'::double precision NOT NULL,
    to_get_framework boolean DEFAULT true NOT NULL,
    onprem boolean DEFAULT false NOT NULL,
    updates bigint DEFAULT '0'::bigint NOT NULL,
    to_get_info boolean DEFAULT true NOT NULL,
    error_get_framework text DEFAULT ''::text NOT NULL,
    to_get_similar boolean DEFAULT true NOT NULL,
    error_get_similar text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    error_get_info text DEFAULT ''::text NOT NULL,
    cordova boolean DEFAULT false NOT NULL,
    react_native boolean DEFAULT false NOT NULL,
    capgo boolean DEFAULT false NOT NULL,
    kotlin boolean DEFAULT false NOT NULL,
    flutter boolean DEFAULT false NOT NULL,
    native_script boolean DEFAULT false NOT NULL,
    lang text,
    developer_id text
);


ALTER TABLE public.store_apps OWNER TO supabase_admin;

--
-- Name: stripe_info; Type: TABLE; Schema: public; Owner: supabase_admin
--

CREATE TABLE public.stripe_info (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    subscription_id character varying,
    customer_id character varying NOT NULL,
    status public.stripe_status,
    product_id character varying DEFAULT 'free'::character varying NOT NULL,
    trial_at timestamp with time zone DEFAULT now() NOT NULL,
    price_id character varying,
    is_good_plan boolean DEFAULT true,
    plan_usage bigint DEFAULT '0'::bigint,
    subscription_metered json DEFAULT '{}'::json NOT NULL,
    subscription_anchor timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.stripe_info OWNER TO supabase_admin;


--
-- Name: users; Type: TABLE; Schema: public; Owner: supabase_admin
--

CREATE TABLE public.users (
    created_at timestamp with time zone DEFAULT now(),
    image_url character varying,
    first_name character varying,
    last_name character varying,
    country character varying,
    email character varying NOT NULL,
    id uuid NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    "enableNotifications" boolean DEFAULT false NOT NULL,
    "optForNewsletters" boolean DEFAULT false NOT NULL,
    "legalAccepted" boolean DEFAULT false NOT NULL,
    customer_id character varying,
    billing_email text
);


ALTER TABLE public.users OWNER TO supabase_admin;


--
-- Name: apikeys apikeys_pkey; Type: CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.apikeys
    ADD CONSTRAINT apikeys_pkey PRIMARY KEY (id);


--
-- Name: app_stats app_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.app_stats
    ADD CONSTRAINT app_stats_pkey PRIMARY KEY (app_id, date_id);


--
-- Name: app_versions_meta app_versions_meta_pkey; Type: CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.app_versions_meta
    ADD CONSTRAINT app_versions_meta_pkey PRIMARY KEY (id);


--
-- Name: app_versions app_versions_name_app_id_key; Type: CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.app_versions
    ADD CONSTRAINT app_versions_name_app_id_key UNIQUE (name, app_id);


--
-- Name: app_versions app_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.app_versions
    ADD CONSTRAINT app_versions_pkey PRIMARY KEY (id);


--
-- Name: apps apps_pkey; Type: CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.apps
    ADD CONSTRAINT apps_pkey PRIMARY KEY (app_id);


--
-- Name: channel_devices channel_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.channel_devices
    ADD CONSTRAINT channel_devices_pkey PRIMARY KEY (device_id);


--
-- Name: channels channel_pkey; Type: CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.channels
    ADD CONSTRAINT channel_pkey PRIMARY KEY (id);


--
-- Name: channel_users channel_users_pkey; Type: CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.channel_users
    ADD CONSTRAINT channel_users_pkey PRIMARY KEY (id);


--
-- Name: deleted_account deleted_account_pkey; Type: CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.deleted_account
    ADD CONSTRAINT deleted_account_pkey PRIMARY KEY (id);


--
-- Name: devices_override devices_override_pkey; Type: CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.devices_override
    ADD CONSTRAINT devices_override_pkey PRIMARY KEY (device_id);


--
-- Name: devices devices_pkey; Type: CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_pkey PRIMARY KEY (device_id);


--
-- Name: global_stats global_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.global_stats
    ADD CONSTRAINT global_stats_pkey PRIMARY KEY (date_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (name, stripe_id, id);


--
-- Name: plans plans_stripe_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_stripe_id_key UNIQUE (stripe_id);


--
-- Name: store_apps store_apps_pkey; Type: CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.store_apps
    ADD CONSTRAINT store_apps_pkey PRIMARY KEY (app_id);


--
-- Name: stripe_info stripe_info_pkey; Type: CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.stripe_info
    ADD CONSTRAINT stripe_info_pkey PRIMARY KEY (customer_id);


--
-- Name: users users_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_customer_id_key UNIQUE (customer_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: app_versions_meta_app_id_idx; Type: INDEX; Schema: public; Owner: supabase_admin
--

CREATE INDEX app_versions_meta_app_id_idx ON public.app_versions_meta USING btree (app_id);


--
-- Name: idx_app_action_stats; Type: INDEX; Schema: public; Owner: supabase_admin
--

CREATE INDEX idx_app_action_stats ON public.stats USING btree (action);


--
-- Name: idx_app_action_stats_created; Type: INDEX; Schema: public; Owner: supabase_admin
--

CREATE INDEX idx_app_action_stats_created ON public.stats USING btree (app_id, created_at DESC);


--
-- Name: idx_app_id_app_versions; Type: INDEX; Schema: public; Owner: supabase_admin
--

CREATE INDEX idx_app_id_app_versions ON public.app_versions USING btree (app_id);


--
-- Name: idx_app_id_devices; Type: INDEX; Schema: public; Owner: supabase_admin
--

CREATE INDEX idx_app_id_devices ON public.devices USING btree (app_id);


--
-- Name: idx_app_id_stats; Type: INDEX; Schema: public; Owner: supabase_admin
--

CREATE INDEX idx_app_id_stats ON public.stats USING btree (app_id);


--
-- Name: idx_app_versions_id; Type: INDEX; Schema: public; Owner: supabase_admin
--

CREATE INDEX idx_app_versions_id ON public.app_versions USING btree (id);


--
-- Name: idx_app_versions_name; Type: INDEX; Schema: public; Owner: supabase_admin
--

CREATE INDEX idx_app_versions_name ON public.app_versions USING btree (name);


--
-- Name: idx_device_id_stats; Type: INDEX; Schema: public; Owner: supabase_admin
--

CREATE INDEX idx_device_id_stats ON public.stats USING btree (device_id);


--
-- Name: idx_devices_created_at; Type: INDEX; Schema: public; Owner: supabase_admin
--

CREATE INDEX idx_devices_created_at ON public.devices USING btree (device_id, created_at DESC);


--
-- Name: idx_stats_action; Type: INDEX; Schema: public; Owner: supabase_admin
--

CREATE INDEX idx_stats_action ON public.stats USING btree (action);


--
-- Name: idx_stats_app_id; Type: INDEX; Schema: public; Owner: supabase_admin
--

CREATE INDEX idx_stats_app_id ON public.stats USING btree (app_id);


--
-- Name: idx_stats_created_at; Type: INDEX; Schema: public; Owner: supabase_admin
--

CREATE INDEX idx_stats_created_at ON public.stats USING btree (created_at);


--
-- Name: idx_stats_device_id; Type: INDEX; Schema: public; Owner: supabase_admin
--

CREATE INDEX idx_stats_device_id ON public.stats USING btree (device_id);


--
-- Name: idx_stats_platform; Type: INDEX; Schema: public; Owner: supabase_admin
--

CREATE INDEX idx_stats_platform ON public.stats USING btree (platform);


--
-- Name: idx_stats_version_build; Type: INDEX; Schema: public; Owner: supabase_admin
--

CREATE INDEX idx_stats_version_build ON public.stats USING btree (version_build);


--
-- Name: idx_store_apps; Type: INDEX; Schema: public; Owner: supabase_admin
--

CREATE INDEX idx_store_apps ON public.store_apps USING btree (capacitor);


--
-- Name: idx_store_apps_capacitor; Type: INDEX; Schema: public; Owner: supabase_admin
--

CREATE INDEX idx_store_apps_capacitor ON public.store_apps USING btree (capacitor, installs DESC);


--
-- Name: idx_store_apps_cordova; Type: INDEX; Schema: public; Owner: supabase_admin
--

CREATE INDEX idx_store_apps_cordova ON public.store_apps USING btree (cordova, capacitor, installs DESC);


--
-- Name: idx_store_apps_flutter; Type: INDEX; Schema: public; Owner: supabase_admin
--

CREATE INDEX idx_store_apps_flutter ON public.store_apps USING btree (flutter, installs DESC);


--
-- Name: idx_store_apps_install; Type: INDEX; Schema: public; Owner: supabase_admin
--

CREATE INDEX idx_store_apps_install ON public.store_apps USING btree (capacitor, installs);


--
-- Name: idx_store_apps_kotlin; Type: INDEX; Schema: public; Owner: supabase_admin
--

CREATE INDEX idx_store_apps_kotlin ON public.store_apps USING btree (kotlin, installs DESC);


--
-- Name: idx_store_apps_native_script; Type: INDEX; Schema: public; Owner: supabase_admin
--

CREATE INDEX idx_store_apps_native_script ON public.store_apps USING btree (native_script, installs DESC);


--
-- Name: idx_store_apps_react_native; Type: INDEX; Schema: public; Owner: supabase_admin
--

CREATE INDEX idx_store_apps_react_native ON public.store_apps USING btree (react_native, installs DESC);


--
-- Name: idx_version_stats; Type: INDEX; Schema: public; Owner: supabase_admin
--

CREATE INDEX idx_version_stats ON public.stats USING btree (version);


--
-- Name: store_app_pkey; Type: INDEX; Schema: public; Owner: supabase_admin
--

CREATE UNIQUE INDEX store_app_pkey ON public.store_apps USING btree (app_id);

--
-- Name: apikeys handle_updated_at; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.apikeys FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');


--
-- Name: app_versions handle_updated_at; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.app_versions FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');


--
-- Name: app_versions_meta handle_updated_at; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.app_versions_meta FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');


--
-- Name: apps handle_updated_at; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.apps FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');


--
-- Name: channel_devices handle_updated_at; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.channel_devices FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');


--
-- Name: channel_users handle_updated_at; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.channel_users FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');


--
-- Name: channels handle_updated_at; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.channels FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');


--
-- Name: devices handle_updated_at; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.devices FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');


--
-- Name: devices_override handle_updated_at; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.devices_override FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');


--
-- Name: plans handle_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');


--
-- Name: stripe_info handle_updated_at; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.stripe_info FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');


--
-- Name: users handle_updated_at; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');


--
-- Name: app_stats on_app_stats_create; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER on_app_stats_create AFTER INSERT ON public.app_stats FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request('http://localhost:54321/functions/v1/on_app_stats_create', 'POST', '{"Content-type":"application/json","apisecret":"Y3p63TMDGNTHTze6MchBM7tPmB5"}', '{}', '1000');


--
-- Name: app_stats on_app_stats_update; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER on_app_stats_update AFTER UPDATE ON public.app_stats FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request('http://localhost:54321/functions/v1/on_app_stats_update', 'POST', '{"Content-type":"application/json","apisecret":"Y3p63TMDGNTHTze6MchBM7tPmB5"}', '{}', '1000');


--
-- Name: channels on_channel_create; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER on_channel_create AFTER INSERT ON public.channels FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request('http://localhost:54321/functions/v1/on_channel_create', 'POST', '{"Content-type":"application/json","apisecret":"Y3p63TMDGNTHTze6MchBM7tPmB5"}', '{}', '1000');


--
-- Name: channels on_channel_update; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER on_channel_update AFTER UPDATE ON public.channels FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request('http://localhost:54321/functions/v1/on_channel_update', 'POST', '{"Content-type":"application/json","apisecret":"Y3p63TMDGNTHTze6MchBM7tPmB5"}', '{}', '1000');


--
-- Name: stats on_log_create; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER on_log_create AFTER INSERT ON public.stats FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request('http://localhost:54321/functions/v1/on_log_create', 'POST', '{"Content-type":"application/json","apisecret":"Y3p63TMDGNTHTze6MchBM7tPmB5"}', '{}', '1000');


--
-- Name: channel_users on_shared_create; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER on_shared_create AFTER INSERT ON public.channel_users FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request('http://localhost:54321/functions/v1/on_shared_create', 'POST', '{"Content-type":"application/json","apisecret":"Y3p63TMDGNTHTze6MchBM7tPmB5"}', '{}', '1000');


--
-- Name: users on_user_create; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER on_user_create AFTER INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request('http://localhost:54321/functions/v1/on_user_create', 'POST', '{"Content-type":"application/json","apisecret":"Y3p63TMDGNTHTze6MchBM7tPmB5"}', '{}', '1000');


--
-- Name: users on_user_update; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER on_user_update AFTER UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request('http://localhost:54321/functions/v1/on_user_update', 'POST', '{"Content-type":"application/json","apisecret":"Y3p63TMDGNTHTze6MchBM7tPmB5"}', '{}', '1000');


--
-- Name: app_versions on_version_create; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER on_version_create AFTER INSERT ON public.app_versions FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request('http://localhost:54321/functions/v1/on_version_create', 'POST', '{"Content-type":"application/json","apisecret":"Y3p63TMDGNTHTze6MchBM7tPmB5"}', '{}', '1000');


--
-- Name: app_versions on_version_delete; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER on_version_delete AFTER DELETE ON public.app_versions FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request('http://localhost:54321/functions/v1/on_version_delete', 'POST', '{"Content-type":"application/json","apisecret":"Y3p63TMDGNTHTze6MchBM7tPmB5"}', '{}', '1000');


--
-- Name: app_versions on_version_update; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER on_version_update AFTER UPDATE ON public.app_versions FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request('http://localhost:54321/functions/v1/on_version_update', 'POST', '{"Content-type":"application/json","apisecret":"Y3p63TMDGNTHTze6MchBM7tPmB5"}', '{}', '1000');

--
-- Name: apikeys apikeys_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.apikeys
    ADD CONSTRAINT apikeys_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: app_stats app_stats_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.app_stats
    ADD CONSTRAINT app_stats_app_id_fkey FOREIGN KEY (app_id) REFERENCES public.apps(app_id) ON DELETE CASCADE;


--
-- Name: app_stats app_stats_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.app_stats
    ADD CONSTRAINT app_stats_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: app_versions app_versions_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.app_versions
    ADD CONSTRAINT app_versions_app_id_fkey FOREIGN KEY (app_id) REFERENCES public.apps(app_id) ON DELETE CASCADE;


--
-- Name: app_versions_meta app_versions_meta_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.app_versions_meta
    ADD CONSTRAINT app_versions_meta_app_id_fkey FOREIGN KEY (app_id) REFERENCES public.apps(app_id) ON DELETE CASCADE;


--
-- Name: app_versions_meta app_versions_meta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.app_versions_meta
    ADD CONSTRAINT app_versions_meta_id_fkey FOREIGN KEY (id) REFERENCES public.app_versions(id) ON DELETE CASCADE;


--
-- Name: app_versions_meta app_versions_meta_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.app_versions_meta
    ADD CONSTRAINT app_versions_meta_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: app_versions app_versions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.app_versions
    ADD CONSTRAINT app_versions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: apps apps_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.apps
    ADD CONSTRAINT apps_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: channel_devices channel_devices_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.channel_devices
    ADD CONSTRAINT channel_devices_app_id_fkey FOREIGN KEY (app_id) REFERENCES public.apps(app_id) ON DELETE CASCADE;


--
-- Name: channel_devices channel_devices_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.channel_devices
    ADD CONSTRAINT channel_devices_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE CASCADE;


--
-- Name: channel_devices channel_devices_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.channel_devices
    ADD CONSTRAINT channel_devices_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: channel_devices channel_devices_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.channel_devices
    ADD CONSTRAINT channel_devices_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.devices(device_id) ON DELETE CASCADE;


--
-- Name: channel_users channel_users_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.channel_users
    ADD CONSTRAINT channel_users_app_id_fkey FOREIGN KEY (app_id) REFERENCES public.apps(app_id) ON DELETE CASCADE;


--
-- Name: channel_users channel_users_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.channel_users
    ADD CONSTRAINT channel_users_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE CASCADE;


--
-- Name: channel_users channel_users_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.channel_users
    ADD CONSTRAINT channel_users_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: channel_users channel_users_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.channel_users
    ADD CONSTRAINT channel_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: channels channels_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.channels
    ADD CONSTRAINT channels_app_id_fkey FOREIGN KEY (app_id) REFERENCES public.apps(app_id) ON DELETE CASCADE;


--
-- Name: channels channels_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.channels
    ADD CONSTRAINT channels_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: channels channels_version_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.channels
    ADD CONSTRAINT channels_version_fkey FOREIGN KEY (version) REFERENCES public.app_versions(id) ON DELETE CASCADE;


--
-- Name: devices devices_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_app_id_fkey FOREIGN KEY (app_id) REFERENCES public.apps(app_id) ON DELETE CASCADE;


--
-- Name: devices_override devices_override_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.devices_override
    ADD CONSTRAINT devices_override_app_id_fkey FOREIGN KEY (app_id) REFERENCES public.apps(app_id) ON DELETE CASCADE;


--
-- Name: devices_override devices_override_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.devices_override
    ADD CONSTRAINT devices_override_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: devices_override devices_override_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.devices_override
    ADD CONSTRAINT devices_override_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.devices(device_id) ON DELETE CASCADE;


--
-- Name: devices_override devices_override_version_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.devices_override
    ADD CONSTRAINT devices_override_version_fkey FOREIGN KEY (version) REFERENCES public.app_versions(id) ON DELETE CASCADE;


--
-- Name: devices devices_version_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_version_fkey FOREIGN KEY (version) REFERENCES public.app_versions(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: stats stats_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.stats
    ADD CONSTRAINT stats_app_id_fkey FOREIGN KEY (app_id) REFERENCES public.apps(app_id) ON DELETE CASCADE;


--
-- Name: stats stats_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.stats
    ADD CONSTRAINT stats_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.devices(device_id) ON DELETE CASCADE;


--
-- Name: stats stats_version_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.stats
    ADD CONSTRAINT stats_version_fkey FOREIGN KEY (version) REFERENCES public.app_versions(id) ON DELETE CASCADE;


--
-- Name: stripe_info stripe_info_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.stripe_info
    ADD CONSTRAINT stripe_info_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.plans(stripe_id);


--
-- Name: users users_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.stripe_info(customer_id);


--
-- Name: users users_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: supabase_admin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

--
-- Name: global_stats  allow anon to select; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY " allow anon to select" ON public.global_stats FOR SELECT TO anon, service_role, supabase_functions_admin USING (true);


--
-- Name: channels All all to app owner or api; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "All all to app owner or api" ON public.channels TO anon USING (public.is_allowed_capgkey(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{all}'::public.key_mode[], app_id)) WITH CHECK (public.is_allowed_capgkey(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{all}'::public.key_mode[], app_id));


--
-- Name: app_stats All self to select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "All self to select" ON public.app_stats FOR SELECT USING (((auth.uid() = user_id) OR public.is_admin(auth.uid())));


--
-- Name: channel_users Allow all for app owner; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow all for app owner" ON public.channel_users TO authenticated USING ((public.is_app_owner(auth.uid(), app_id) OR public.is_admin(auth.uid()))) WITH CHECK ((public.is_app_owner(auth.uid(), app_id) OR public.is_admin(auth.uid())));


--
-- Name: channel_devices Allow all to app owner; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow all to app owner" ON public.channel_devices TO authenticated USING ((public.is_app_owner(auth.uid(), app_id) OR public.is_admin(auth.uid()))) WITH CHECK ((public.is_app_owner(auth.uid(), app_id) OR public.is_admin(auth.uid())));


--
-- Name: devices_override Allow all to app owner; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow all to app owner" ON public.devices_override USING (public.is_app_owner(auth.uid(), app_id)) WITH CHECK (public.is_app_owner(auth.uid(), app_id));


--
-- Name: stats Allow all to app owner; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow all to app owner" ON public.stats TO authenticated USING ((public.is_app_owner(auth.uid(), app_id) OR public.is_admin(auth.uid()))) WITH CHECK ((public.is_app_owner(auth.uid(), app_id) OR public.is_admin(auth.uid())));


--
-- Name: users Allow all users to select; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow all users to select" ON public.users FOR SELECT TO authenticated USING (public.is_in_channel(id, auth.uid()));


--
-- Name: stats Allow api key; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow api key" ON public.stats TO anon USING (public.is_allowed_capgkey(((current_setting('request.headers'::text, true))::json ->> 'capgokey'::text), '{all,write,read}'::public.key_mode[], app_id)) WITH CHECK (public.is_allowed_capgkey(((current_setting('request.headers'::text, true))::json ->> 'capgokey'::text), '{all,write,read}'::public.key_mode[], app_id));


--
-- Name: channels Allow api to insert; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow api to insert" ON public.channels FOR INSERT TO authenticated WITH CHECK ((public.is_allowed_capgkey(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{write}'::public.key_mode[], app_id) AND public.is_allowed_action(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text))));


--
-- Name: channels Allow api to update; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow api to update" ON public.channels FOR UPDATE TO authenticated USING (public.is_allowed_capgkey(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{write}'::public.key_mode[], app_id)) WITH CHECK (public.is_allowed_capgkey(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{write}'::public.key_mode[], app_id));


--
-- Name: app_versions Allow apikey to insert; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow apikey to insert" ON public.app_versions FOR INSERT TO anon WITH CHECK ((public.is_allowed_capgkey(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{upload,write,all}'::public.key_mode[], app_id) AND public.is_allowed_action(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text))));


--
-- Name: apps Allow apikey to insert; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow apikey to insert" ON public.apps FOR INSERT TO anon WITH CHECK ((public.is_allowed_capgkey(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{all,write}'::public.key_mode[]) AND public.is_allowed_action(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text))));


--
-- Name: app_versions Allow apikey to select; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow apikey to select" ON public.app_versions FOR SELECT TO anon USING (public.is_allowed_capgkey(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{read,all}'::public.key_mode[], app_id));


--
-- Name: channels Allow app owner or admin; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow app owner or admin" ON public.channels TO authenticated USING ((public.is_app_owner(auth.uid(), app_id) OR public.is_admin(auth.uid()))) WITH CHECK ((public.is_app_owner(auth.uid(), app_id) OR public.is_admin(auth.uid())));


--
-- Name: apps Allow app owner to all; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow app owner to all" ON public.apps TO authenticated USING (((auth.uid() = user_id) OR public.is_admin(auth.uid()))) WITH CHECK (((auth.uid() = user_id) OR public.is_admin(auth.uid())));


--
-- Name: app_versions Allow owner to all; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow owner to all" ON public.app_versions TO authenticated USING ((public.is_app_owner(auth.uid(), app_id) OR public.is_admin(auth.uid()))) WITH CHECK ((public.is_app_owner(auth.uid(), app_id) OR public.is_admin(auth.uid())));


--
-- Name: app_versions Allow owner to listen insert; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow owner to listen insert" ON public.app_versions FOR INSERT TO authenticated WITH CHECK ((public.is_app_owner(auth.uid(), app_id) OR public.is_admin(auth.uid())));


--
-- Name: devices Allow owner to update; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow owner to update" ON public.devices FOR UPDATE TO authenticated USING (public.is_app_owner(auth.uid(), app_id)) WITH CHECK (public.is_app_owner(auth.uid(), app_id));


--
-- Name: devices Allow select app owner; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow select app owner" ON public.devices FOR SELECT TO authenticated USING ((public.is_app_owner(auth.uid(), app_id) OR public.is_admin(auth.uid())));


--
-- Name: users Allow self to modify self; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow self to modify self" ON public.users TO authenticated USING ((((auth.uid() = id) AND public.is_not_deleted((auth.email())::character varying)) OR public.is_admin(auth.uid()))) WITH CHECK ((((auth.uid() = id) AND public.is_not_deleted((auth.email())::character varying)) OR public.is_admin(auth.uid())));


--
-- Name: app_versions Allow shared to see; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow shared to see" ON public.app_versions FOR SELECT TO authenticated USING ((public.is_app_shared(auth.uid(), app_id) OR public.is_admin(auth.uid())));


--
-- Name: app_versions_meta Allow user to get they meta; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow user to get they meta" ON public.app_versions_meta FOR SELECT TO authenticated USING ((public.is_app_owner(auth.uid(), app_id) OR public.is_admin(auth.uid())));


--
-- Name: channel_users Allow user to self get; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow user to self get" ON public.channel_users FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR public.is_admin(auth.uid())));


--
-- Name: stripe_info Allow user to self get; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Allow user to self get" ON public.stripe_info FOR SELECT TO authenticated USING (((auth.uid() IN ( SELECT users.id
   FROM public.users
  WHERE ((users.customer_id)::text = (users.customer_id)::text))) OR public.is_admin(auth.uid())));


--
-- Name: notifications Disable for all; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Disable for all" ON public.notifications USING (false) WITH CHECK (false);


--
-- Name: store_apps Disable for all; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Disable for all" ON public.store_apps USING (false) WITH CHECK (false);


--
-- Name: apikeys Enable all for user based on user_id; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Enable all for user based on user_id" ON public.apikeys USING (((auth.uid() = user_id) OR public.is_admin(auth.uid()))) WITH CHECK (((auth.uid() = user_id) OR public.is_admin(auth.uid())));


--
-- Name: plans Enable select for authenticated users only; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable select for authenticated users only" ON public.plans FOR SELECT TO authenticated USING (true);


--
-- Name: deleted_account Enable update for users based on email; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Enable update for users based on email" ON public.deleted_account FOR INSERT TO authenticated WITH CHECK ((auth.email() = (email)::text));


--
-- Name: channels Select if app is shared with you or api; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "Select if app is shared with you or api" ON public.channels FOR SELECT TO authenticated USING ((public.is_app_shared(auth.uid(), app_id) OR public.is_allowed_capgkey(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{read}'::public.key_mode[], app_id)));


--
-- Name: app_versions allow apikey to delete; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "allow apikey to delete" ON public.app_versions FOR DELETE TO anon USING ((public.is_allowed_capgkey(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{write,all}'::public.key_mode[], app_id) AND public.is_allowed_action(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text))));


--
-- Name: apps allow apikey to delete; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "allow apikey to delete" ON public.apps FOR DELETE TO anon USING (public.is_allowed_capgkey(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{all}'::public.key_mode[], app_id));


--
-- Name: apps allow apikey to select; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "allow apikey to select" ON public.apps FOR SELECT TO anon USING (public.is_allowed_capgkey(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{all,write}'::public.key_mode[]));


--
-- Name: app_versions allow for delete by the CLI; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "allow for delete by the CLI" ON public.app_versions FOR UPDATE TO anon USING (public.is_allowed_capgkey(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{write,all}'::public.key_mode[], app_id)) WITH CHECK (public.is_allowed_capgkey(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{write,all}'::public.key_mode[], app_id));


--
-- Name: apps allowed shared to select; Type: POLICY; Schema: public; Owner: supabase_admin
--

CREATE POLICY "allowed shared to select" ON public.apps FOR SELECT TO authenticated USING ((public.is_app_shared(auth.uid(), app_id) OR public.is_admin(auth.uid())));


--
-- Name: apikeys; Type: ROW SECURITY; Schema: public; Owner: supabase_admin
--

ALTER TABLE public.apikeys ENABLE ROW LEVEL SECURITY;

--
-- Name: app_stats; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.app_stats ENABLE ROW LEVEL SECURITY;

--
-- Name: app_versions; Type: ROW SECURITY; Schema: public; Owner: supabase_admin
--

ALTER TABLE public.app_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: app_versions_meta; Type: ROW SECURITY; Schema: public; Owner: supabase_admin
--

ALTER TABLE public.app_versions_meta ENABLE ROW LEVEL SECURITY;

--
-- Name: apps; Type: ROW SECURITY; Schema: public; Owner: supabase_admin
--

ALTER TABLE public.apps ENABLE ROW LEVEL SECURITY;

--
-- Name: channel_devices; Type: ROW SECURITY; Schema: public; Owner: supabase_admin
--

ALTER TABLE public.channel_devices ENABLE ROW LEVEL SECURITY;

--
-- Name: channel_users; Type: ROW SECURITY; Schema: public; Owner: supabase_admin
--

ALTER TABLE public.channel_users ENABLE ROW LEVEL SECURITY;

--
-- Name: channels; Type: ROW SECURITY; Schema: public; Owner: supabase_admin
--

ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

--
-- Name: deleted_account; Type: ROW SECURITY; Schema: public; Owner: supabase_admin
--

ALTER TABLE public.deleted_account ENABLE ROW LEVEL SECURITY;

--
-- Name: devices; Type: ROW SECURITY; Schema: public; Owner: supabase_admin
--

ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

--
-- Name: devices_override; Type: ROW SECURITY; Schema: public; Owner: supabase_admin
--

ALTER TABLE public.devices_override ENABLE ROW LEVEL SECURITY;

--
-- Name: global_stats; Type: ROW SECURITY; Schema: public; Owner: supabase_admin
--

ALTER TABLE public.global_stats ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: supabase_admin
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: plans; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

--
-- Name: stats; Type: ROW SECURITY; Schema: public; Owner: supabase_admin
--

ALTER TABLE public.stats ENABLE ROW LEVEL SECURITY;

--
-- Name: store_apps; Type: ROW SECURITY; Schema: public; Owner: supabase_admin
--

ALTER TABLE public.store_apps ENABLE ROW LEVEL SECURITY;

--
-- Name: stripe_info; Type: ROW SECURITY; Schema: public; Owner: supabase_admin
--

ALTER TABLE public.stripe_info ENABLE ROW LEVEL SECURITY;


--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: supabase_admin
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: objects All all users to act; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "All all users to act" ON storage.objects USING (true) WITH CHECK (true);


--
-- Name: objects All user to manage they own folder 1ffg0oo_0; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "All user to manage they own folder 1ffg0oo_0" ON storage.objects FOR DELETE USING (((bucket_id = 'images'::text) AND (((auth.uid())::text = (storage.foldername(name))[0]) OR (((public.get_user_id(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text)))::text = (storage.foldername(name))[0]) AND public.is_allowed_capgkey(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{all}'::public.key_mode[], ((storage.foldername(name))[1])::character varying)))));


--
-- Name: objects All user to manage they own folder 1ffg0oo_1; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "All user to manage they own folder 1ffg0oo_1" ON storage.objects FOR UPDATE USING (((bucket_id = 'images'::text) AND (((auth.uid())::text = (storage.foldername(name))[0]) OR (((public.get_user_id(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text)))::text = (storage.foldername(name))[0]) AND public.is_allowed_capgkey(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{write,all}'::public.key_mode[], ((storage.foldername(name))[1])::character varying)))));


--
-- Name: objects All user to manage they own folder 1ffg0oo_2; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "All user to manage they own folder 1ffg0oo_2" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'images'::text) AND (((auth.uid())::text = (storage.foldername(name))[0]) OR (((public.get_user_id(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text)))::text = (storage.foldername(name))[0]) AND public.is_allowed_capgkey(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{write,all}'::public.key_mode[], ((storage.foldername(name))[1])::character varying)))));


--
-- Name: objects All user to manage they own folder 1ffg0oo_3; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "All user to manage they own folder 1ffg0oo_3" ON storage.objects FOR SELECT USING (((bucket_id = 'images'::text) AND (((auth.uid())::text = (storage.foldername(name))[0]) OR (((public.get_user_id(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text)))::text = (storage.foldername(name))[0]) AND public.is_allowed_capgkey(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{read,all}'::public.key_mode[], ((storage.foldername(name))[1])::character varying)))));


--
-- Name: objects Allow apikey manage they folder 1sbjm_0; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Allow apikey manage they folder 1sbjm_0" ON storage.objects FOR UPDATE TO anon USING (((bucket_id = 'apps'::text) AND (((public.get_user_id(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text)))::text = (storage.foldername(name))[0]) AND public.is_allowed_capgkey(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{upload,write,all}'::public.key_mode[], ((storage.foldername(name))[1])::character varying))));


--
-- Name: objects Allow apikey to manage they folder  1sbjm_3; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Allow apikey to manage they folder  1sbjm_3" ON storage.objects FOR DELETE TO anon USING (((bucket_id = 'apps'::text) AND (((public.get_user_id(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text)))::text = (storage.foldername(name))[0]) AND public.is_allowed_capgkey(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{all}'::public.key_mode[], ((storage.foldername(name))[1])::character varying))));


--
-- Name: objects Allow apikey to manage they folder 1sbjm_1; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Allow apikey to manage they folder 1sbjm_1" ON storage.objects FOR INSERT TO anon WITH CHECK (((bucket_id = 'apps'::text) AND (((public.get_user_id(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text)))::text = (storage.foldername(name))[0]) AND public.is_allowed_capgkey(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{upload,write,all}'::public.key_mode[], ((storage.foldername(name))[1])::character varying))));


--
-- Name: objects Allow apikey to select 1sbjm_0; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Allow apikey to select 1sbjm_0" ON storage.objects FOR SELECT TO anon USING (((bucket_id = 'apps'::text) AND (((public.get_user_id(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text)))::text = (storage.foldername(name))[0]) AND public.is_allowed_capgkey(((current_setting('request.headers'::text, true))::json ->> 'capgkey'::text), '{read,all}'::public.key_mode[], ((storage.foldername(name))[1])::character varying))));


--
-- Name: objects Allow user or shared to manage they folder 1sbjm_0; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Allow user or shared to manage they folder 1sbjm_0" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'apps'::text) AND (((auth.uid())::text = (storage.foldername(name))[0]) OR public.is_app_shared(auth.uid(), ((storage.foldername(name))[1])::character varying))));


--
-- Name: objects Allow user to delete they folder 1sbjm_0; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Allow user to delete they folder 1sbjm_0" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'apps'::text) AND ((auth.uid())::text = (storage.foldername(name))[0])));


--
-- Name: objects Allow user to update version 1sbjm_0; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Allow user to update version 1sbjm_0" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'apps'::text) AND ((auth.uid())::text = (storage.foldername(name))[0])));


--
-- Name: objects Alow user to insert in they folder 1sbjm_0; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Alow user to insert in they folder 1sbjm_0" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'apps'::text) AND ((auth.uid())::text = (storage.foldername(name))[0])));


--
-- Name: buckets Disable act bucket for users; Type: POLICY; Schema: storage; Owner: supabase_storage_admin
--

CREATE POLICY "Disable act bucket for users" ON storage.buckets USING (false) WITH CHECK (false);


--
-- Name: buckets; Type: ROW SECURITY; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

--
-- Name: migrations; Type: ROW SECURITY; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE storage.migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: objects; Type: ROW SECURITY; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

--
-- Name: supabase_realtime app_versions; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.app_versions;


--
-- Name: supabase_realtime apps; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.apps;


--
-- Name: supabase_realtime stats; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.stats;


--
-- Name: supabase_realtime store_apps; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.store_apps;


--
-- Name: SCHEMA net; Type: ACL; Schema: -; Owner: supabase_admin
--

GRANT USAGE ON SCHEMA net TO supabase_functions_admin;
GRANT USAGE ON SCHEMA net TO anon;
GRANT USAGE ON SCHEMA net TO authenticated;
GRANT USAGE ON SCHEMA net TO service_role;
--
-- Name: SCHEMA supabase_functions; Type: ACL; Schema: -; Owner: supabase_admin
--

GRANT ALL ON SCHEMA supabase_functions TO supabase_functions_admin;
GRANT USAGE ON SCHEMA supabase_functions TO postgres;
GRANT USAGE ON SCHEMA supabase_functions TO anon;
GRANT USAGE ON SCHEMA supabase_functions TO authenticated;
GRANT USAGE ON SCHEMA supabase_functions TO service_role;

--
-- Name: FUNCTION http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer); Type: ACL; Schema: net; Owner: supabase_admin
--

REVOKE ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
GRANT ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin;
GRANT ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO postgres;
GRANT ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO anon;
GRANT ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO authenticated;
GRANT ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO service_role;


--
-- Name: FUNCTION http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer); Type: ACL; Schema: net; Owner: supabase_admin
--

REVOKE ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
GRANT ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin;
GRANT ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO postgres;
GRANT ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO anon;
GRANT ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO authenticated;
GRANT ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO service_role;

--
-- Name: FUNCTION convert_bytes_to_gb(byt double precision); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.convert_bytes_to_gb(byt double precision) TO postgres;
GRANT ALL ON FUNCTION public.convert_bytes_to_gb(byt double precision) TO anon;
GRANT ALL ON FUNCTION public.convert_bytes_to_gb(byt double precision) TO authenticated;
GRANT ALL ON FUNCTION public.convert_bytes_to_gb(byt double precision) TO service_role;


--
-- Name: FUNCTION convert_bytes_to_mb(byt double precision); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.convert_bytes_to_mb(byt double precision) TO postgres;
GRANT ALL ON FUNCTION public.convert_bytes_to_mb(byt double precision) TO anon;
GRANT ALL ON FUNCTION public.convert_bytes_to_mb(byt double precision) TO authenticated;
GRANT ALL ON FUNCTION public.convert_bytes_to_mb(byt double precision) TO service_role;


--
-- Name: FUNCTION convert_gb_to_bytes(gb double precision); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.convert_gb_to_bytes(gb double precision) TO postgres;
GRANT ALL ON FUNCTION public.convert_gb_to_bytes(gb double precision) TO anon;
GRANT ALL ON FUNCTION public.convert_gb_to_bytes(gb double precision) TO authenticated;
GRANT ALL ON FUNCTION public.convert_gb_to_bytes(gb double precision) TO service_role;


--
-- Name: FUNCTION convert_mb_to_bytes(gb double precision); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.convert_mb_to_bytes(gb double precision) TO postgres;
GRANT ALL ON FUNCTION public.convert_mb_to_bytes(gb double precision) TO anon;
GRANT ALL ON FUNCTION public.convert_mb_to_bytes(gb double precision) TO authenticated;
GRANT ALL ON FUNCTION public.convert_mb_to_bytes(gb double precision) TO service_role;


--
-- Name: FUNCTION convert_number_to_percent(val double precision, max_val double precision); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.convert_number_to_percent(val double precision, max_val double precision) TO postgres;
GRANT ALL ON FUNCTION public.convert_number_to_percent(val double precision, max_val double precision) TO anon;
GRANT ALL ON FUNCTION public.convert_number_to_percent(val double precision, max_val double precision) TO authenticated;
GRANT ALL ON FUNCTION public.convert_number_to_percent(val double precision, max_val double precision) TO service_role;


--
-- Name: FUNCTION count_all_apps(); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.count_all_apps() TO postgres;
GRANT ALL ON FUNCTION public.count_all_apps() TO anon;
GRANT ALL ON FUNCTION public.count_all_apps() TO authenticated;
GRANT ALL ON FUNCTION public.count_all_apps() TO service_role;


--
-- Name: FUNCTION count_all_updates(); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.count_all_updates() TO postgres;
GRANT ALL ON FUNCTION public.count_all_updates() TO anon;
GRANT ALL ON FUNCTION public.count_all_updates() TO authenticated;
GRANT ALL ON FUNCTION public.count_all_updates() TO service_role;


--
-- Name: FUNCTION exist_app(appid character varying, apikey text); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.exist_app(appid character varying, apikey text) TO postgres;
GRANT ALL ON FUNCTION public.exist_app(appid character varying, apikey text) TO anon;
GRANT ALL ON FUNCTION public.exist_app(appid character varying, apikey text) TO authenticated;
GRANT ALL ON FUNCTION public.exist_app(appid character varying, apikey text) TO service_role;


--
-- Name: FUNCTION exist_app_v2(appid character varying); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.exist_app_v2(appid character varying) TO postgres;
GRANT ALL ON FUNCTION public.exist_app_v2(appid character varying) TO anon;
GRANT ALL ON FUNCTION public.exist_app_v2(appid character varying) TO authenticated;
GRANT ALL ON FUNCTION public.exist_app_v2(appid character varying) TO service_role;


--
-- Name: FUNCTION exist_app_versions(appid character varying, name_version character varying, apikey text); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.exist_app_versions(appid character varying, name_version character varying, apikey text) TO postgres;
GRANT ALL ON FUNCTION public.exist_app_versions(appid character varying, name_version character varying, apikey text) TO anon;
GRANT ALL ON FUNCTION public.exist_app_versions(appid character varying, name_version character varying, apikey text) TO authenticated;
GRANT ALL ON FUNCTION public.exist_app_versions(appid character varying, name_version character varying, apikey text) TO service_role;


--
-- Name: FUNCTION exist_channel(appid character varying, name_channel character varying, apikey text); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.exist_channel(appid character varying, name_channel character varying, apikey text) TO postgres;
GRANT ALL ON FUNCTION public.exist_channel(appid character varying, name_channel character varying, apikey text) TO anon;
GRANT ALL ON FUNCTION public.exist_channel(appid character varying, name_channel character varying, apikey text) TO authenticated;
GRANT ALL ON FUNCTION public.exist_channel(appid character varying, name_channel character varying, apikey text) TO service_role;


--
-- Name: FUNCTION exist_user(e_mail character varying); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.exist_user(e_mail character varying) TO postgres;
GRANT ALL ON FUNCTION public.exist_user(e_mail character varying) TO anon;
GRANT ALL ON FUNCTION public.exist_user(e_mail character varying) TO authenticated;
GRANT ALL ON FUNCTION public.exist_user(e_mail character varying) TO service_role;


--
-- Name: FUNCTION find_best_plan_v3(mau bigint, bandwidth double precision, storage double precision); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.find_best_plan_v3(mau bigint, bandwidth double precision, storage double precision) TO postgres;
GRANT ALL ON FUNCTION public.find_best_plan_v3(mau bigint, bandwidth double precision, storage double precision) TO anon;
GRANT ALL ON FUNCTION public.find_best_plan_v3(mau bigint, bandwidth double precision, storage double precision) TO authenticated;
GRANT ALL ON FUNCTION public.find_best_plan_v3(mau bigint, bandwidth double precision, storage double precision) TO service_role;


--
-- Name: FUNCTION find_fit_plan_v3(mau bigint, bandwidth double precision, storage double precision); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.find_fit_plan_v3(mau bigint, bandwidth double precision, storage double precision) TO postgres;
GRANT ALL ON FUNCTION public.find_fit_plan_v3(mau bigint, bandwidth double precision, storage double precision) TO anon;
GRANT ALL ON FUNCTION public.find_fit_plan_v3(mau bigint, bandwidth double precision, storage double precision) TO authenticated;
GRANT ALL ON FUNCTION public.find_fit_plan_v3(mau bigint, bandwidth double precision, storage double precision) TO service_role;


--
-- Name: FUNCTION get_app_versions(appid character varying, name_version character varying, apikey text); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.get_app_versions(appid character varying, name_version character varying, apikey text) TO postgres;
GRANT ALL ON FUNCTION public.get_app_versions(appid character varying, name_version character varying, apikey text) TO anon;
GRANT ALL ON FUNCTION public.get_app_versions(appid character varying, name_version character varying, apikey text) TO authenticated;
GRANT ALL ON FUNCTION public.get_app_versions(appid character varying, name_version character varying, apikey text) TO service_role;


--
-- Name: FUNCTION get_current_plan_max(userid uuid); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.get_current_plan_max(userid uuid) TO postgres;
GRANT ALL ON FUNCTION public.get_current_plan_max(userid uuid) TO anon;
GRANT ALL ON FUNCTION public.get_current_plan_max(userid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_current_plan_max(userid uuid) TO service_role;


--
-- Name: FUNCTION get_current_plan_name(userid uuid); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.get_current_plan_name(userid uuid) TO postgres;
GRANT ALL ON FUNCTION public.get_current_plan_name(userid uuid) TO anon;
GRANT ALL ON FUNCTION public.get_current_plan_name(userid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_current_plan_name(userid uuid) TO service_role;


--
-- Name: FUNCTION get_devices_version(app_id character varying, version_id bigint); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.get_devices_version(app_id character varying, version_id bigint) TO postgres;
GRANT ALL ON FUNCTION public.get_devices_version(app_id character varying, version_id bigint) TO anon;
GRANT ALL ON FUNCTION public.get_devices_version(app_id character varying, version_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.get_devices_version(app_id character varying, version_id bigint) TO service_role;


--
-- Name: FUNCTION get_dl_by_month(userid uuid, pastmonth integer); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.get_dl_by_month(userid uuid, pastmonth integer) TO postgres;
GRANT ALL ON FUNCTION public.get_dl_by_month(userid uuid, pastmonth integer) TO anon;
GRANT ALL ON FUNCTION public.get_dl_by_month(userid uuid, pastmonth integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_dl_by_month(userid uuid, pastmonth integer) TO service_role;


--
-- Name: FUNCTION get_dl_by_month_by_app(pastmonth integer, appid character varying); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.get_dl_by_month_by_app(pastmonth integer, appid character varying) TO postgres;
GRANT ALL ON FUNCTION public.get_dl_by_month_by_app(pastmonth integer, appid character varying) TO anon;
GRANT ALL ON FUNCTION public.get_dl_by_month_by_app(pastmonth integer, appid character varying) TO authenticated;
GRANT ALL ON FUNCTION public.get_dl_by_month_by_app(pastmonth integer, appid character varying) TO service_role;


--
-- Name: FUNCTION get_dl_by_month_by_app(userid uuid, pastmonth integer, appid character varying); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.get_dl_by_month_by_app(userid uuid, pastmonth integer, appid character varying) TO postgres;
GRANT ALL ON FUNCTION public.get_dl_by_month_by_app(userid uuid, pastmonth integer, appid character varying) TO anon;
GRANT ALL ON FUNCTION public.get_dl_by_month_by_app(userid uuid, pastmonth integer, appid character varying) TO authenticated;
GRANT ALL ON FUNCTION public.get_dl_by_month_by_app(userid uuid, pastmonth integer, appid character varying) TO service_role;


--
-- Name: FUNCTION get_max_channel(userid uuid); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.get_max_channel(userid uuid) TO postgres;
GRANT ALL ON FUNCTION public.get_max_channel(userid uuid) TO anon;
GRANT ALL ON FUNCTION public.get_max_channel(userid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_max_channel(userid uuid) TO service_role;


--
-- Name: FUNCTION get_max_plan(userid uuid); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.get_max_plan(userid uuid) TO postgres;
GRANT ALL ON FUNCTION public.get_max_plan(userid uuid) TO anon;
GRANT ALL ON FUNCTION public.get_max_plan(userid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_max_plan(userid uuid) TO service_role;


--
-- Name: FUNCTION get_max_shared(userid uuid); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.get_max_shared(userid uuid) TO postgres;
GRANT ALL ON FUNCTION public.get_max_shared(userid uuid) TO anon;
GRANT ALL ON FUNCTION public.get_max_shared(userid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_max_shared(userid uuid) TO service_role;


--
-- Name: FUNCTION get_max_version(userid uuid); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.get_max_version(userid uuid) TO postgres;
GRANT ALL ON FUNCTION public.get_max_version(userid uuid) TO anon;
GRANT ALL ON FUNCTION public.get_max_version(userid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_max_version(userid uuid) TO service_role;


--
-- Name: FUNCTION get_metered_usage(userid uuid); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.get_metered_usage(userid uuid) TO postgres;
GRANT ALL ON FUNCTION public.get_metered_usage(userid uuid) TO anon;
GRANT ALL ON FUNCTION public.get_metered_usage(userid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_metered_usage(userid uuid) TO service_role;


--
-- Name: FUNCTION get_plan_usage_percent(userid uuid, dateid character varying); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.get_plan_usage_percent(userid uuid, dateid character varying) TO postgres;
GRANT ALL ON FUNCTION public.get_plan_usage_percent(userid uuid, dateid character varying) TO anon;
GRANT ALL ON FUNCTION public.get_plan_usage_percent(userid uuid, dateid character varying) TO authenticated;
GRANT ALL ON FUNCTION public.get_plan_usage_percent(userid uuid, dateid character varying) TO service_role;


--
-- Name: FUNCTION get_stats(userid uuid, dateid character varying); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.get_stats(userid uuid, dateid character varying) TO postgres;
GRANT ALL ON FUNCTION public.get_stats(userid uuid, dateid character varying) TO anon;
GRANT ALL ON FUNCTION public.get_stats(userid uuid, dateid character varying) TO authenticated;
GRANT ALL ON FUNCTION public.get_stats(userid uuid, dateid character varying) TO service_role;


--
-- Name: FUNCTION get_total_stats_v2(userid uuid, dateid character varying); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.get_total_stats_v2(userid uuid, dateid character varying) TO postgres;
GRANT ALL ON FUNCTION public.get_total_stats_v2(userid uuid, dateid character varying) TO anon;
GRANT ALL ON FUNCTION public.get_total_stats_v2(userid uuid, dateid character varying) TO authenticated;
GRANT ALL ON FUNCTION public.get_total_stats_v2(userid uuid, dateid character varying) TO service_role;


--
-- Name: FUNCTION get_user_id(apikey text); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.get_user_id(apikey text) TO postgres;
GRANT ALL ON FUNCTION public.get_user_id(apikey text) TO anon;
GRANT ALL ON FUNCTION public.get_user_id(apikey text) TO authenticated;
GRANT ALL ON FUNCTION public.get_user_id(apikey text) TO service_role;


--
-- Name: FUNCTION increment_stats(app_id character varying, date_id character varying, bandwidth integer, version_size integer, channels integer, shared integer, mlu integer, mlu_real integer, versions integer, devices integer); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.increment_stats(app_id character varying, date_id character varying, bandwidth integer, version_size integer, channels integer, shared integer, mlu integer, mlu_real integer, versions integer, devices integer) TO postgres;
GRANT ALL ON FUNCTION public.increment_stats(app_id character varying, date_id character varying, bandwidth integer, version_size integer, channels integer, shared integer, mlu integer, mlu_real integer, versions integer, devices integer) TO anon;
GRANT ALL ON FUNCTION public.increment_stats(app_id character varying, date_id character varying, bandwidth integer, version_size integer, channels integer, shared integer, mlu integer, mlu_real integer, versions integer, devices integer) TO authenticated;
GRANT ALL ON FUNCTION public.increment_stats(app_id character varying, date_id character varying, bandwidth integer, version_size integer, channels integer, shared integer, mlu integer, mlu_real integer, versions integer, devices integer) TO service_role;


--
-- Name: FUNCTION increment_stats_v2(app_id character varying, date_id character varying, bandwidth integer, version_size integer, channels integer, shared integer, mlu integer, mlu_real integer, versions integer, devices integer, devices_real integer); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.increment_stats_v2(app_id character varying, date_id character varying, bandwidth integer, version_size integer, channels integer, shared integer, mlu integer, mlu_real integer, versions integer, devices integer, devices_real integer) TO postgres;
GRANT ALL ON FUNCTION public.increment_stats_v2(app_id character varying, date_id character varying, bandwidth integer, version_size integer, channels integer, shared integer, mlu integer, mlu_real integer, versions integer, devices integer, devices_real integer) TO anon;
GRANT ALL ON FUNCTION public.increment_stats_v2(app_id character varying, date_id character varying, bandwidth integer, version_size integer, channels integer, shared integer, mlu integer, mlu_real integer, versions integer, devices integer, devices_real integer) TO authenticated;
GRANT ALL ON FUNCTION public.increment_stats_v2(app_id character varying, date_id character varying, bandwidth integer, version_size integer, channels integer, shared integer, mlu integer, mlu_real integer, versions integer, devices integer, devices_real integer) TO service_role;


--
-- Name: FUNCTION increment_store(app_id character varying, updates integer); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.increment_store(app_id character varying, updates integer) TO postgres;
GRANT ALL ON FUNCTION public.increment_store(app_id character varying, updates integer) TO anon;
GRANT ALL ON FUNCTION public.increment_store(app_id character varying, updates integer) TO authenticated;
GRANT ALL ON FUNCTION public.increment_store(app_id character varying, updates integer) TO service_role;


--
-- Name: FUNCTION increment_version_stats(app_id character varying, version_id bigint, devices integer); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.increment_version_stats(app_id character varying, version_id bigint, devices integer) TO postgres;
GRANT ALL ON FUNCTION public.increment_version_stats(app_id character varying, version_id bigint, devices integer) TO anon;
GRANT ALL ON FUNCTION public.increment_version_stats(app_id character varying, version_id bigint, devices integer) TO authenticated;
GRANT ALL ON FUNCTION public.increment_version_stats(app_id character varying, version_id bigint, devices integer) TO service_role;


--
-- Name: FUNCTION is_admin(userid uuid); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.is_admin(userid uuid) TO postgres;
GRANT ALL ON FUNCTION public.is_admin(userid uuid) TO anon;
GRANT ALL ON FUNCTION public.is_admin(userid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_admin(userid uuid) TO service_role;


--
-- Name: FUNCTION is_allowed_action(apikey text); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.is_allowed_action(apikey text) TO postgres;
GRANT ALL ON FUNCTION public.is_allowed_action(apikey text) TO anon;
GRANT ALL ON FUNCTION public.is_allowed_action(apikey text) TO authenticated;
GRANT ALL ON FUNCTION public.is_allowed_action(apikey text) TO service_role;


--
-- Name: FUNCTION is_allowed_action_user(userid uuid); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.is_allowed_action_user(userid uuid) TO postgres;
GRANT ALL ON FUNCTION public.is_allowed_action_user(userid uuid) TO anon;
GRANT ALL ON FUNCTION public.is_allowed_action_user(userid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_allowed_action_user(userid uuid) TO service_role;


--
-- Name: FUNCTION is_allowed_capgkey(apikey text, keymode public.key_mode[]); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.is_allowed_capgkey(apikey text, keymode public.key_mode[]) TO postgres;
GRANT ALL ON FUNCTION public.is_allowed_capgkey(apikey text, keymode public.key_mode[]) TO anon;
GRANT ALL ON FUNCTION public.is_allowed_capgkey(apikey text, keymode public.key_mode[]) TO authenticated;
GRANT ALL ON FUNCTION public.is_allowed_capgkey(apikey text, keymode public.key_mode[]) TO service_role;


--
-- Name: FUNCTION is_allowed_capgkey(apikey text, keymode public.key_mode[], app_id character varying); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.is_allowed_capgkey(apikey text, keymode public.key_mode[], app_id character varying) TO postgres;
GRANT ALL ON FUNCTION public.is_allowed_capgkey(apikey text, keymode public.key_mode[], app_id character varying) TO anon;
GRANT ALL ON FUNCTION public.is_allowed_capgkey(apikey text, keymode public.key_mode[], app_id character varying) TO authenticated;
GRANT ALL ON FUNCTION public.is_allowed_capgkey(apikey text, keymode public.key_mode[], app_id character varying) TO service_role;


--
-- Name: FUNCTION is_app_owner(userid uuid, appid character varying); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.is_app_owner(userid uuid, appid character varying) TO postgres;
GRANT ALL ON FUNCTION public.is_app_owner(userid uuid, appid character varying) TO anon;
GRANT ALL ON FUNCTION public.is_app_owner(userid uuid, appid character varying) TO authenticated;
GRANT ALL ON FUNCTION public.is_app_owner(userid uuid, appid character varying) TO service_role;


--
-- Name: FUNCTION is_app_shared(userid uuid, appid character varying); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.is_app_shared(userid uuid, appid character varying) TO postgres;
GRANT ALL ON FUNCTION public.is_app_shared(userid uuid, appid character varying) TO anon;
GRANT ALL ON FUNCTION public.is_app_shared(userid uuid, appid character varying) TO authenticated;
GRANT ALL ON FUNCTION public.is_app_shared(userid uuid, appid character varying) TO service_role;


--
-- Name: FUNCTION is_canceled(userid uuid); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.is_canceled(userid uuid) TO postgres;
GRANT ALL ON FUNCTION public.is_canceled(userid uuid) TO anon;
GRANT ALL ON FUNCTION public.is_canceled(userid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_canceled(userid uuid) TO service_role;


--
-- Name: FUNCTION is_free_usage(userid uuid); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.is_free_usage(userid uuid) TO postgres;
GRANT ALL ON FUNCTION public.is_free_usage(userid uuid) TO anon;
GRANT ALL ON FUNCTION public.is_free_usage(userid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_free_usage(userid uuid) TO service_role;


--
-- Name: FUNCTION is_good_plan_v3(userid uuid); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.is_good_plan_v3(userid uuid) TO postgres;
GRANT ALL ON FUNCTION public.is_good_plan_v3(userid uuid) TO anon;
GRANT ALL ON FUNCTION public.is_good_plan_v3(userid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_good_plan_v3(userid uuid) TO service_role;


--
-- Name: FUNCTION is_in_channel(userid uuid, ownerid uuid); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.is_in_channel(userid uuid, ownerid uuid) TO postgres;
GRANT ALL ON FUNCTION public.is_in_channel(userid uuid, ownerid uuid) TO anon;
GRANT ALL ON FUNCTION public.is_in_channel(userid uuid, ownerid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_in_channel(userid uuid, ownerid uuid) TO service_role;


--
-- Name: FUNCTION is_not_deleted(email_check character varying); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.is_not_deleted(email_check character varying) TO postgres;
GRANT ALL ON FUNCTION public.is_not_deleted(email_check character varying) TO anon;
GRANT ALL ON FUNCTION public.is_not_deleted(email_check character varying) TO authenticated;
GRANT ALL ON FUNCTION public.is_not_deleted(email_check character varying) TO service_role;


--
-- Name: FUNCTION is_onboarded(userid uuid); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.is_onboarded(userid uuid) TO postgres;
GRANT ALL ON FUNCTION public.is_onboarded(userid uuid) TO anon;
GRANT ALL ON FUNCTION public.is_onboarded(userid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_onboarded(userid uuid) TO service_role;


--
-- Name: FUNCTION is_onboarding_needed(userid uuid); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.is_onboarding_needed(userid uuid) TO postgres;
GRANT ALL ON FUNCTION public.is_onboarding_needed(userid uuid) TO anon;
GRANT ALL ON FUNCTION public.is_onboarding_needed(userid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_onboarding_needed(userid uuid) TO service_role;


--
-- Name: FUNCTION is_paying(userid uuid); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.is_paying(userid uuid) TO postgres;
GRANT ALL ON FUNCTION public.is_paying(userid uuid) TO anon;
GRANT ALL ON FUNCTION public.is_paying(userid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_paying(userid uuid) TO service_role;


--
-- Name: FUNCTION is_trial(userid uuid); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.is_trial(userid uuid) TO postgres;
GRANT ALL ON FUNCTION public.is_trial(userid uuid) TO anon;
GRANT ALL ON FUNCTION public.is_trial(userid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_trial(userid uuid) TO service_role;


--
-- Name: FUNCTION is_version_shared(userid uuid, versionid bigint); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.is_version_shared(userid uuid, versionid bigint) TO postgres;
GRANT ALL ON FUNCTION public.is_version_shared(userid uuid, versionid bigint) TO anon;
GRANT ALL ON FUNCTION public.is_version_shared(userid uuid, versionid bigint) TO authenticated;
GRANT ALL ON FUNCTION public.is_version_shared(userid uuid, versionid bigint) TO service_role;

--
-- Name: FUNCTION http_request(); Type: ACL; Schema: supabase_functions; Owner: supabase_functions_admin
--

REVOKE ALL ON FUNCTION supabase_functions.http_request() FROM PUBLIC;
GRANT ALL ON FUNCTION supabase_functions.http_request() TO postgres;
GRANT ALL ON FUNCTION supabase_functions.http_request() TO anon;
GRANT ALL ON FUNCTION supabase_functions.http_request() TO authenticated;
GRANT ALL ON FUNCTION supabase_functions.http_request() TO service_role;


--
-- Name: TABLE apikeys; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON TABLE public.apikeys TO postgres;
GRANT ALL ON TABLE public.apikeys TO anon;
GRANT ALL ON TABLE public.apikeys TO authenticated;
GRANT ALL ON TABLE public.apikeys TO service_role;


--
-- Name: SEQUENCE apikeys_id_seq; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON SEQUENCE public.apikeys_id_seq TO postgres;
GRANT ALL ON SEQUENCE public.apikeys_id_seq TO anon;
GRANT ALL ON SEQUENCE public.apikeys_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.apikeys_id_seq TO service_role;


--
-- Name: TABLE app_stats; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.app_stats TO anon;
GRANT ALL ON TABLE public.app_stats TO authenticated;
GRANT ALL ON TABLE public.app_stats TO service_role;


--
-- Name: TABLE app_versions; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON TABLE public.app_versions TO postgres;
GRANT ALL ON TABLE public.app_versions TO anon;
GRANT ALL ON TABLE public.app_versions TO authenticated;
GRANT ALL ON TABLE public.app_versions TO service_role;


--
-- Name: SEQUENCE app_versions_id_seq; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON SEQUENCE public.app_versions_id_seq TO postgres;
GRANT ALL ON SEQUENCE public.app_versions_id_seq TO anon;
GRANT ALL ON SEQUENCE public.app_versions_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.app_versions_id_seq TO service_role;


--
-- Name: TABLE app_versions_meta; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON TABLE public.app_versions_meta TO postgres;
GRANT ALL ON TABLE public.app_versions_meta TO anon;
GRANT ALL ON TABLE public.app_versions_meta TO authenticated;
GRANT ALL ON TABLE public.app_versions_meta TO service_role;


--
-- Name: SEQUENCE app_versions_meta_id_seq; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON SEQUENCE public.app_versions_meta_id_seq TO postgres;
GRANT ALL ON SEQUENCE public.app_versions_meta_id_seq TO anon;
GRANT ALL ON SEQUENCE public.app_versions_meta_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.app_versions_meta_id_seq TO service_role;


--
-- Name: TABLE apps; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON TABLE public.apps TO postgres;
GRANT ALL ON TABLE public.apps TO anon;
GRANT ALL ON TABLE public.apps TO authenticated;
GRANT ALL ON TABLE public.apps TO service_role;


--
-- Name: TABLE channel_devices; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON TABLE public.channel_devices TO postgres;
GRANT ALL ON TABLE public.channel_devices TO anon;
GRANT ALL ON TABLE public.channel_devices TO authenticated;
GRANT ALL ON TABLE public.channel_devices TO service_role;


--
-- Name: TABLE channels; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON TABLE public.channels TO postgres;
GRANT ALL ON TABLE public.channels TO anon;
GRANT ALL ON TABLE public.channels TO authenticated;
GRANT ALL ON TABLE public.channels TO service_role;


--
-- Name: SEQUENCE channel_id_seq; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON SEQUENCE public.channel_id_seq TO postgres;
GRANT ALL ON SEQUENCE public.channel_id_seq TO anon;
GRANT ALL ON SEQUENCE public.channel_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.channel_id_seq TO service_role;


--
-- Name: TABLE channel_users; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON TABLE public.channel_users TO postgres;
GRANT ALL ON TABLE public.channel_users TO anon;
GRANT ALL ON TABLE public.channel_users TO authenticated;
GRANT ALL ON TABLE public.channel_users TO service_role;


--
-- Name: SEQUENCE channel_users_id_seq; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON SEQUENCE public.channel_users_id_seq TO postgres;
GRANT ALL ON SEQUENCE public.channel_users_id_seq TO anon;
GRANT ALL ON SEQUENCE public.channel_users_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.channel_users_id_seq TO service_role;


--
-- Name: TABLE deleted_account; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON TABLE public.deleted_account TO postgres;
GRANT ALL ON TABLE public.deleted_account TO anon;
GRANT ALL ON TABLE public.deleted_account TO authenticated;
GRANT ALL ON TABLE public.deleted_account TO service_role;


--
-- Name: TABLE devices; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON TABLE public.devices TO postgres;
GRANT ALL ON TABLE public.devices TO anon;
GRANT ALL ON TABLE public.devices TO authenticated;
GRANT ALL ON TABLE public.devices TO service_role;


--
-- Name: TABLE devices_override; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON TABLE public.devices_override TO postgres;
GRANT ALL ON TABLE public.devices_override TO anon;
GRANT ALL ON TABLE public.devices_override TO authenticated;
GRANT ALL ON TABLE public.devices_override TO service_role;


--
-- Name: TABLE global_stats; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON TABLE public.global_stats TO postgres;
GRANT ALL ON TABLE public.global_stats TO anon;
GRANT ALL ON TABLE public.global_stats TO authenticated;
GRANT ALL ON TABLE public.global_stats TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON TABLE public.notifications TO postgres;
GRANT ALL ON TABLE public.notifications TO anon;
GRANT ALL ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: TABLE plans; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.plans TO anon;
GRANT ALL ON TABLE public.plans TO authenticated;
GRANT ALL ON TABLE public.plans TO service_role;


--
-- Name: TABLE stats; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON TABLE public.stats TO postgres;
GRANT ALL ON TABLE public.stats TO anon;
GRANT ALL ON TABLE public.stats TO authenticated;
GRANT ALL ON TABLE public.stats TO service_role;


--
-- Name: SEQUENCE stats_id_seq; Type: ACL; Schema: public; Owner: supabase_admin 
--

-- GRANT ALL ON SEQUENCE public.stats_id_seq TO postgres;
-- GRANT ALL ON SEQUENCE public.stats_id_seq TO anon;
-- GRANT ALL ON SEQUENCE public.stats_id_seq TO authenticated;
-- GRANT ALL ON SEQUENCE public.stats_id_seq TO service_role;


--
-- Name: TABLE store_apps; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON TABLE public.store_apps TO postgres;
GRANT ALL ON TABLE public.store_apps TO anon;
GRANT ALL ON TABLE public.store_apps TO authenticated;
GRANT ALL ON TABLE public.store_apps TO service_role;


--
-- Name: TABLE stripe_info; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON TABLE public.stripe_info TO postgres;
GRANT ALL ON TABLE public.stripe_info TO anon;
GRANT ALL ON TABLE public.stripe_info TO authenticated;
GRANT ALL ON TABLE public.stripe_info TO service_role;


--
-- Name: TABLE users; Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON TABLE public.users TO postgres;
GRANT ALL ON TABLE public.users TO anon;
GRANT ALL ON TABLE public.users TO authenticated;
GRANT ALL ON TABLE public.users TO service_role;
