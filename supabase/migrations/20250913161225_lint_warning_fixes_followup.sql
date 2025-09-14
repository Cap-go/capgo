-- Consolidated lint fixes for public schema

-- A) check_min_rights (4-arg) call overload explicitly
CREATE OR REPLACE FUNCTION "public"."check_min_rights" (
  "min_right" "public"."user_min_right",
  "org_id" "uuid",
  "app_id" character varying,
  "channel_id" bigint
) RETURNS boolean LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
DECLARE
  allowed boolean;
BEGIN
  allowed := public.check_min_rights(min_right, (select auth.uid()), org_id, app_id, channel_id);
  RETURN allowed;
END;
$$;

-- B) check_revert_to_builtin_version: qualify INSERT target
CREATE OR REPLACE FUNCTION "public"."check_revert_to_builtin_version" ("appid" character varying) RETURNS integer LANGUAGE "plpgsql"
SET
  search_path = '' AS $$
BEGIN
    DECLARE
        version_id INTEGER;
    BEGIN
        SELECT id INTO version_id FROM public.app_versions WHERE name = 'builtin' AND app_id = appid;
        IF NOT FOUND THEN
            INSERT INTO public.app_versions(name, app_id, storage_provider)
            VALUES ('builtin', appid, 'r2')
            RETURNING id INTO version_id;
        END IF;
        RETURN version_id;
    END;
END;
$$;

-- C) get_plan_usage_percent_detailed(orgid, cycle_start, cycle_end): composite via SELECT INTO
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
  SELECT * INTO current_plan_max FROM public.get_current_plan_max_org(orgid);
  SELECT mau, bandwidth, storage INTO total_stats FROM public.get_total_metrics(orgid, cycle_start, cycle_end);
  percent_mau := public.convert_number_to_percent(total_stats.mau, current_plan_max.mau);
  percent_bandwidth := public.convert_number_to_percent(total_stats.bandwidth, current_plan_max.bandwidth);
  percent_storage := public.convert_number_to_percent(total_stats.storage, current_plan_max.storage);
  RETURN QUERY SELECT GREATEST(percent_mau, percent_bandwidth, percent_storage), percent_mau, percent_bandwidth, percent_storage;
END;
$$;

-- D) exist_app_versions: mark unused param
CREATE OR REPLACE FUNCTION "public"."exist_app_versions" (
  "appid" character varying,
  "name_version" character varying,
  "apikey" "text"
) RETURNS boolean LANGUAGE "plpgsql"
SET search_path = '' AS $$
BEGIN
  PERFORM apikey;
  RETURN (SELECT EXISTS (SELECT 1 FROM public.app_versions WHERE app_id=appid AND name=name_version));
END;
$$;

-- E) get_metered_usage(orgid): select only stats_table attributes
CREATE OR REPLACE FUNCTION "public"."get_metered_usage" ("orgid" "uuid") RETURNS "public"."stats_table" LANGUAGE "plpgsql"
SET search_path = '' SECURITY DEFINER AS $$
DECLARE
  current_usage public.stats_table;
  max_plan public.stats_table;
  result public.stats_table;
BEGIN
  SELECT mau, bandwidth, storage INTO current_usage FROM public.get_total_metrics(orgid);
  SELECT mau, bandwidth, storage INTO max_plan FROM public.get_current_plan_max_org(orgid);
  result.mau := GREATEST(current_usage.mau - max_plan.mau, 0);
  result.bandwidth := GREATEST(current_usage.bandwidth - max_plan.bandwidth, 0);
  result.storage := GREATEST(current_usage.storage - max_plan.storage, 0);
  RETURN result;
END;
$$;

-- F) get_next_cron_time: remove unused day/month/dow patterns
CREATE OR REPLACE FUNCTION "public"."get_next_cron_time" ("p_schedule" "text", "p_timestamp" timestamptz)
RETURNS timestamptz LANGUAGE plpgsql
SET search_path = '' AS $$
DECLARE
  parts text[];
  minute_pattern text;
  hour_pattern text;
  next_minute int;
  next_hour int;
  next_time timestamptz;
BEGIN
  parts := regexp_split_to_array(p_schedule, '\s+');
  minute_pattern := parts[1];
  hour_pattern := parts[2];
  next_minute := public.get_next_cron_value(minute_pattern, EXTRACT(MINUTE FROM p_timestamp)::int, 60);
  next_hour := public.get_next_cron_value(hour_pattern, EXTRACT(HOUR FROM p_timestamp)::int, 24);
  next_time := date_trunc('hour', p_timestamp) + make_interval(hours => next_hour - EXTRACT(HOUR FROM p_timestamp)::int, mins => next_minute);
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

-- G) get_next_cron_value: remove unused variable
CREATE OR REPLACE FUNCTION "public"."get_next_cron_value" ("pattern" text, "current_val" int, "max_val" int)
RETURNS int LANGUAGE plpgsql
SET search_path = '' AS $$
BEGIN
  IF pattern = '*' THEN
    RETURN current_val;
  ELSIF pattern LIKE '*/%' THEN
    DECLARE step int := public.parse_step_pattern(pattern);
            temp_next int := current_val + (step - (current_val % step));
    BEGIN
      IF temp_next >= max_val THEN RETURN step; ELSE RETURN temp_next; END IF;
    END;
  ELSE
    RETURN pattern::int;
  END IF;
END;
$$;

-- H) get_user_id(apikey, app_id): mark app_id used
CREATE OR REPLACE FUNCTION "public"."get_user_id" ("apikey" text, "app_id" text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
DECLARE real_user_id uuid;
BEGIN
  PERFORM app_id;
  SELECT public.get_user_id(apikey) INTO real_user_id;
  RETURN real_user_id;
END;
$$;

-- I) is_admin(userid): cast secret to jsonb
CREATE OR REPLACE FUNCTION "public"."is_admin" ("userid" uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
DECLARE admin_ids_jsonb jsonb; is_admin_flag boolean; mfa_verified boolean;
BEGIN
  SELECT decrypted_secret::jsonb INTO admin_ids_jsonb FROM vault.decrypted_secrets WHERE name = 'admin_users';
  is_admin_flag := (admin_ids_jsonb ? userid::text);
  SELECT public.verify_mfa() INTO mfa_verified;
  RETURN is_admin_flag AND mfa_verified;
END;
$$;

-- J) is_allowed_action: mark apikey used
CREATE OR REPLACE FUNCTION "public"."is_allowed_action" ("apikey" text, "appid" text)
RETURNS boolean LANGUAGE plpgsql
SET search_path = '' AS $$
BEGIN
  PERFORM apikey;
  RETURN public.is_allowed_action_org((select owner_org FROM public.apps where app_id=appid));
END;
$$;

-- J.1) get_weekly_stats: avoid shadowing OUT params
CREATE OR REPLACE FUNCTION "public"."get_weekly_stats" ("app_id" character varying) RETURNS TABLE (
  "all_updates" bigint,
  "failed_updates" bigint,
  "open_app" bigint
) LANGUAGE "plpgsql"
SET search_path = '' AS $$
DECLARE seven_days_ago DATE;
BEGIN
  seven_days_ago := CURRENT_DATE - INTERVAL '7 days';
  SELECT COALESCE(SUM(install), 0) INTO all_updates FROM public.daily_version WHERE date BETWEEN seven_days_ago AND CURRENT_DATE AND public.daily_version.app_id = get_weekly_stats.app_id;
  SELECT COALESCE(SUM(fail), 0) INTO failed_updates FROM public.daily_version WHERE date BETWEEN seven_days_ago AND CURRENT_DATE AND public.daily_version.app_id = get_weekly_stats.app_id;
  SELECT COALESCE(SUM(get), 0) INTO open_app FROM public.daily_version WHERE date BETWEEN seven_days_ago AND CURRENT_DATE AND public.daily_version.app_id = get_weekly_stats.app_id;
  RETURN QUERY SELECT all_updates, failed_updates, open_app;
END;
$$;

-- K) process_admin_stats: remove unused var
CREATE OR REPLACE FUNCTION "public"."process_admin_stats" () RETURNS void LANGUAGE plpgsql
SET search_path = '' AS $$
BEGIN
  PERFORM pgmq.send('admin_stats', jsonb_build_object('function_name','logsnag_insights','function_type','cloudflare','payload',jsonb_build_object()));
END;
$$;

-- L) process_d1_replication_batch: avoid shadowed loop var
CREATE OR REPLACE FUNCTION "public"."process_d1_replication_batch" () RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
DECLARE queue_size bigint; calls_needed int;
BEGIN
  IF public.get_d1_webhook_signature() IS NOT NULL THEN
    SELECT count(*) INTO queue_size FROM pgmq.q_replicate_data;
    IF queue_size > 0 THEN
      calls_needed := least(ceil(queue_size / 1000.0)::int, 10);
      FOR i IN 1..calls_needed LOOP
        PERFORM net.http_post(url := 'https://sync.capgo.app/sync', headers := jsonb_build_object('x-webhook-signature', public.get_d1_webhook_signature()));
      END LOOP;
    END IF;
  END IF;
END;
$$;

-- M) process_function_queue: return bigint that matches signature
CREATE OR REPLACE FUNCTION "public"."process_function_queue" ("queue_name" text)
RETURNS bigint LANGUAGE plpgsql
SET search_path = '' AS $$
DECLARE headers jsonb; url text; queue_size bigint; calls_needed int;
BEGIN
  EXECUTE format('SELECT count(*) FROM pgmq.q_%I', queue_name) INTO queue_size;
  IF queue_size > 0 THEN
    headers := jsonb_build_object('Content-Type','application/json','apisecret', public.get_apikey());
    url := public.get_db_url() || '/functions/v1/triggers/queue_consumer/sync';
    calls_needed := least(ceil(queue_size / 1000.0)::int, 10);
    FOR i IN 1..calls_needed LOOP
      PERFORM net.http_post(url := url, headers := headers, body := jsonb_build_object('queue_name', queue_name), timeout_milliseconds := 15000);
    END LOOP;
    RETURN queue_size;
  END IF;
  RETURN 0;
END;
$$;

-- N) get_organization_cli_warnings: array init, mark cli_version used
CREATE OR REPLACE FUNCTION "public"."get_organization_cli_warnings" ("orgid" uuid, "cli_version" text)
RETURNS jsonb[] LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
DECLARE messages jsonb[] := ARRAY[]::jsonb[]; has_read_access boolean;
BEGIN
  PERFORM cli_version;
  SELECT public.check_min_rights('read'::public.user_min_right, public.get_identity_apikey_only('{write,all,upload,read}'::public.key_mode[]), orgid, NULL::varchar, NULL::bigint) INTO has_read_access;
  IF NOT has_read_access THEN
    messages := array_append(messages, jsonb_build_object('message','API key does not have read access to this organization','fatal',true));
    RETURN messages;
  END IF;
  IF (public.is_paying_and_good_plan_org_action(orgid, ARRAY['mau']::public.action_type[]) = true AND public.is_paying_and_good_plan_org_action(orgid, ARRAY['bandwidth']::public.action_type[]) = true AND public.is_paying_and_good_plan_org_action(orgid, ARRAY['storage']::public.action_type[]) = false) THEN
    messages := array_append(messages, jsonb_build_object('message','You have exceeded your storage limit.\nUpload will fail, but you can still download your data.\nMAU and bandwidth limits are not exceeded.\nIn order to upload your plan, please upgrade your plan here: https://web.capgo.app/settings/plans.','fatal',true));
  END IF;
  RETURN messages;
END;
$$;

-- O) delete_accounts_marked_for_deletion: correct array init
CREATE OR REPLACE FUNCTION "public"."delete_accounts_marked_for_deletion" ()
RETURNS TABLE(deleted_count integer, deleted_user_ids uuid[]) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
DECLARE account_record RECORD; deleted_users uuid[] := ARRAY[]::uuid[]; total_deleted integer := 0;
BEGIN
  FOR account_record IN SELECT account_id, removal_date, removed_data FROM public.to_delete_accounts WHERE removal_date < NOW() LOOP
    BEGIN
      DELETE FROM public.users WHERE id = account_record.account_id;
      DELETE FROM auth.users WHERE id = account_record.account_id;
      DELETE FROM public.to_delete_accounts WHERE account_id = account_record.account_id;
      deleted_users := array_append(deleted_users, account_record.account_id);
      total_deleted := total_deleted + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to delete account %: %', account_record.account_id, SQLERRM;
    END;
  END LOOP;
  deleted_count := total_deleted; deleted_user_ids := deleted_users; RETURN NEXT;
END;
$$;

-- P) reset_and_seed_app_stats_data: cast uuid, drop unused vars
CREATE OR REPLACE FUNCTION "public"."reset_and_seed_app_stats_data" ("p_app_id" varchar) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  start_date TIMESTAMP := CURRENT_DATE - INTERVAL '15 days';
  end_date TIMESTAMP := CURRENT_DATE;
  curr_date DATE;
  random_mau INTEGER;
  random_bandwidth BIGINT;
  random_storage BIGINT;
  random_uuid UUID;
  random_fixed_uuid UUID := '00000000-0000-0000-0000-000000000000'::uuid;
  random_version_id BIGINT := 3;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_app_id || '_stats'));
  PERFORM public.reset_app_stats_data(p_app_id);
  random_uuid := gen_random_uuid();
  INSERT INTO public.devices (updated_at, device_id, version, app_id, platform, plugin_version, os_version, version_build, custom_id, is_prod, is_emulator)
  VALUES (now(), random_uuid, random_version_id, p_app_id, 'android', '4.15.3', '9', '1.223.0', '', 't', 't'), (now(), random_fixed_uuid, random_version_id, p_app_id, 'android', '4.15.3', '9', '1.223.0', '', 't', 't');
  INSERT INTO public.stats (created_at, action, device_id, version, app_id)
  VALUES (now(), 'get'::public.stats_action, random_uuid, random_version_id, p_app_id), (now(), 'set'::public.stats_action, random_uuid, random_version_id, p_app_id);
  curr_date := start_date::DATE;
  WHILE curr_date <= end_date::DATE LOOP
    random_mau := FLOOR(RANDOM() * 1000) + 1; random_bandwidth := FLOOR(RANDOM() * 1000000000) + 1; random_storage := FLOOR(RANDOM() * 1000000000) + 1;
    INSERT INTO public.daily_mau (app_id, date, mau) VALUES (p_app_id, curr_date, random_mau);
    INSERT INTO public.daily_bandwidth (app_id, date, bandwidth) VALUES (p_app_id, curr_date, random_bandwidth);
    INSERT INTO public.daily_storage (app_id, date, storage) VALUES (p_app_id, curr_date, random_storage);
    INSERT INTO public.daily_version (date, app_id, version_id, get, fail, install, uninstall)
    VALUES (curr_date, p_app_id, random_version_id, FLOOR(RANDOM() * 100) + 1, FLOOR(RANDOM() * 10) + 1, FLOOR(RANDOM() * 50) + 1, FLOOR(RANDOM() * 20) + 1);
    curr_date := curr_date + INTERVAL '1 day';
  END LOOP;
  INSERT INTO public.storage_usage (device_id, app_id, file_size) SELECT random_uuid, p_app_id, FLOOR(RANDOM() * 10485760) - 5242880 FROM generate_series(1, 20);
  INSERT INTO public.version_usage (timestamp, app_id, version_id, action)
  SELECT start_date + (RANDOM() * (end_date - start_date)), p_app_id, random_version_id, (ARRAY['get','fail','install','uninstall'])[FLOOR(RANDOM() * 4) + 1]::public.version_action FROM generate_series(1, 30);
  INSERT INTO public.device_usage (device_id, app_id) SELECT random_uuid, p_app_id FROM generate_series(1, 50);
  INSERT INTO public.bandwidth_usage (device_id, app_id, file_size) SELECT random_uuid, p_app_id, FLOOR(RANDOM() * 10485760) + 1 FROM generate_series(1, 40);
END;
$$;

-- Q) reset_and_seed_app_data: cast uuids; mark unused ids used
CREATE OR REPLACE FUNCTION "public"."reset_and_seed_app_data" ("p_app_id" varchar) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  org_id uuid := '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid;
  user_id uuid := '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid;
  builtin_version_id bigint; unknown_version_id bigint; v1_0_1_version_id bigint; v1_0_0_version_id bigint; v1_361_0_version_id bigint; v1_360_0_version_id bigint; v1_359_0_version_id bigint;
  production_channel_id bigint; beta_channel_id bigint; development_channel_id bigint; no_access_channel_id bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_app_id));
  PERFORM public.reset_app_data(p_app_id);
  INSERT INTO public.apps (created_at, app_id, icon_url, name, last_version, updated_at, owner_org, user_id)
  VALUES (now(), p_app_id, '', 'Seeded App', '1.0.0', now(), org_id, user_id);
  WITH version_inserts AS (
    INSERT INTO public.app_versions (created_at, app_id, name, r2_path, updated_at, deleted, external_url, checksum, storage_provider, owner_org, comment, link, user_id)
    VALUES
      (now(), p_app_id, 'builtin', NULL, now(), 't', NULL, NULL, 'supabase', org_id, NULL, NULL, NULL),
      (now(), p_app_id, 'unknown', NULL, now(), 't', NULL, NULL, 'supabase', org_id, NULL, NULL, NULL),
      (now(), p_app_id, '1.0.1', 'orgs/'||org_id||'/apps/'||p_app_id||'/1.0.1.zip', now(), 'f', NULL, '', 'r2-direct', org_id, 'Bug fixes and minor improvements', 'https://github.com/Cap-go/capgo/releases/tag/v1.0.1', user_id),
      (now(), p_app_id, '1.0.0', 'orgs/'||org_id||'/apps/'||p_app_id||'/1.0.0.zip', now(), 'f', NULL, '3885ee49', 'r2', org_id, 'Initial release', 'https://github.com/Cap-go/capgo/releases/tag/v1.0.0', user_id),
      (now(), p_app_id, '1.361.0', 'orgs/'||org_id||'/apps/'||p_app_id||'/1.361.0.zip', now(), 'f', NULL, '9d4f798a', 'r2', org_id, 'Major version update with new features', 'https://github.com/Cap-go/capgo/releases/tag/v1.361.0', user_id),
      (now(), p_app_id, '1.360.0', 'orgs/'||org_id||'/apps/'||p_app_id||'/1.360.0.zip', now(), 'f', NULL, '44913a9f', 'r2', org_id, 'Pre-release version with experimental features', 'https://github.com/Cap-go/capgo/releases/tag/v1.360.0', user_id),
      (now(), p_app_id, '1.359.0', 'orgs/'||org_id||'/apps/'||p_app_id||'/1.359.0.zip', now(), 'f', NULL, '9f74e70a', 'r2', org_id, 'Stability improvements', 'https://github.com/Cap-go/capgo/releases/tag/v1.359.0', user_id)
    RETURNING id, name
  )
  SELECT MAX(CASE WHEN name='builtin' THEN id END), MAX(CASE WHEN name='unknown' THEN id END), MAX(CASE WHEN name='1.0.1' THEN id END), MAX(CASE WHEN name='1.0.0' THEN id END), MAX(CASE WHEN name='1.361.0' THEN id END), MAX(CASE WHEN name='1.360.0' THEN id END), MAX(CASE WHEN name='1.359.0' THEN id END)
  INTO builtin_version_id, unknown_version_id, v1_0_1_version_id, v1_0_0_version_id, v1_361_0_version_id, v1_360_0_version_id, v1_359_0_version_id FROM version_inserts;
  WITH channel_inserts AS (
    INSERT INTO public.channels (created_at, name, app_id, version, updated_at, public, disable_auto_update_under_native, disable_auto_update, ios, android, allow_device_self_set, allow_emulator, allow_dev, created_by, owner_org)
    VALUES
      (now(), 'production', p_app_id, v1_0_0_version_id, now(), 't', 't', 'major'::public.disable_update, 'f', 't', 't', 't', 't', user_id, org_id),
      (now(), 'beta', p_app_id, v1_361_0_version_id, now(), 'f', 't', 'major'::public.disable_update, 't', 't', 't', 't', 't', user_id, org_id),
      (now(), 'development', p_app_id, v1_359_0_version_id, now(), 't', 't', 'major'::public.disable_update, 't', 'f', 't', 't', 't', user_id, org_id),
      (now(), 'no_access', p_app_id, v1_361_0_version_id, now(), 'f', 't', 'major'::public.disable_update, 'f', 'f', 't', 't', 't', user_id, org_id)
    RETURNING id, name
  )
  SELECT MAX(CASE WHEN name='production' THEN id END), MAX(CASE WHEN name='beta' THEN id END), MAX(CASE WHEN name='development' THEN id END), MAX(CASE WHEN name='no_access' THEN id END)
  INTO production_channel_id, beta_channel_id, development_channel_id, no_access_channel_id FROM channel_inserts;
  INSERT INTO public.deploy_history (created_at, updated_at, channel_id, app_id, version_id, deployed_at, owner_org, created_by)
  VALUES
    (now() - interval '15 days', now() - interval '15 days', production_channel_id, p_app_id, v1_0_0_version_id, now() - interval '15 days', org_id, user_id),
    (now() - interval '10 days', now() - interval '10 days', beta_channel_id, p_app_id, v1_361_0_version_id, now() - interval '10 days', org_id, user_id),
    (now() - interval '5 days', now() - interval '5 days', development_channel_id, p_app_id, v1_359_0_version_id, now() - interval '5 days', org_id, user_id),
    (now() - interval '3 days', now() - interval '3 days', no_access_channel_id, p_app_id, v1_361_0_version_id, now() - interval '3 days', org_id, user_id);
  PERFORM builtin_version_id, unknown_version_id, v1_0_1_version_id, v1_360_0_version_id;
END;
$$;

-- R) invite_user_to_org: read current_record instead of FOUND; remove unreachable
CREATE OR REPLACE FUNCTION "public"."invite_user_to_org" ("email" varchar, "org_id" uuid, "invite_type" public.user_min_right)
RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
DECLARE org record; invited_user record; current_record record; current_tmp_user record;
BEGIN
  SELECT * INTO org FROM public.orgs WHERE public.orgs.id=invite_user_to_org.org_id;
  IF org IS NULL THEN RETURN 'NO_ORG'; END IF;
  IF NOT (public.check_min_rights('admin'::public.user_min_right, (select public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], invite_user_to_org.org_id)), invite_user_to_org.org_id, NULL::varchar, NULL::bigint)) THEN RETURN 'NO_RIGHTS'; END IF;
  IF NOT (public.check_min_rights('super_admin'::public.user_min_right, (select public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], invite_user_to_org.org_id)), invite_user_to_org.org_id, NULL::varchar, NULL::bigint) AND (invite_type is distinct from 'super_admin'::public.user_min_right or invite_type is distinct from 'invite_super_admin'::public.user_min_right)) THEN RETURN 'NO_RIGHTS'; END IF;
  SELECT public.users.id INTO invited_user FROM public.users WHERE public.users.email=invite_user_to_org.email;
  IF invited_user IS NOT NULL THEN
    SELECT public.org_users.id INTO current_record FROM public.org_users WHERE public.org_users.user_id=invited_user.id AND public.org_users.org_id=invite_user_to_org.org_id;
    IF current_record IS NOT NULL THEN RETURN 'ALREADY_INVITED';
    ELSE INSERT INTO public.org_users (user_id, org_id, user_right) VALUES (invited_user.id, invite_user_to_org.org_id, invite_type); RETURN 'OK'; END IF;
  ELSE
    SELECT * INTO current_tmp_user FROM public.tmp_users WHERE public.tmp_users.email=invite_user_to_org.email AND public.tmp_users.org_id=invite_user_to_org.org_id;
    IF current_tmp_user IS NOT NULL THEN
      IF current_tmp_user.cancelled_at IS NOT NULL THEN
        IF current_tmp_user.cancelled_at > (CURRENT_TIMESTAMP - INTERVAL '3 hours') THEN RETURN 'TOO_RECENT_INVITATION_CANCELATION'; ELSE RETURN 'NO_EMAIL'; END IF;
      ELSE RETURN 'ALREADY_INVITED'; END IF;
    ELSE RETURN 'NO_EMAIL'; END IF;
  END IF;
END;
$$;

-- S) rescind_invitation: remove unused org var via PERFORM
CREATE OR REPLACE FUNCTION "public"."rescind_invitation" ("email" TEXT, "org_id" UUID)
RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
DECLARE tmp_user record;
BEGIN
  PERFORM 1 FROM public.orgs WHERE public.orgs.id = rescind_invitation.org_id; IF NOT FOUND THEN RETURN 'NO_ORG'; END IF;
  IF NOT (public.check_min_rights('admin'::public.user_min_right, (select public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], rescind_invitation.org_id)), rescind_invitation.org_id, NULL::varchar, NULL::bigint)) THEN RETURN 'NO_RIGHTS'; END IF;
  SELECT * INTO tmp_user FROM public.tmp_users WHERE public.tmp_users.email = rescind_invitation.email AND public.tmp_users.org_id = rescind_invitation.org_id;
  IF NOT FOUND THEN RETURN 'NO_INVITATION'; END IF;
  IF tmp_user.cancelled_at IS NOT NULL THEN RETURN 'ALREADY_CANCELLED'; END IF;
  UPDATE public.tmp_users SET cancelled_at = CURRENT_TIMESTAMP WHERE public.tmp_users.id = tmp_user.id;
  RETURN 'OK';
END;
$$;

-- T) modify_permissions_tmp: remove unused org var via PERFORM
CREATE OR REPLACE FUNCTION "public"."modify_permissions_tmp" ("email" TEXT, "org_id" UUID, "new_role" public.user_min_right)
RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
DECLARE tmp_user record; non_invite_role public.user_min_right;
BEGIN
  non_invite_role := public.transform_role_to_non_invite(new_role);
  PERFORM 1 FROM public.orgs WHERE public.orgs.id = modify_permissions_tmp.org_id; IF NOT FOUND THEN RETURN 'NO_ORG'; END IF;
  IF NOT (public.check_min_rights('admin'::public.user_min_right, (select public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], modify_permissions_tmp.org_id)), modify_permissions_tmp.org_id, NULL::varchar, NULL::bigint)) THEN RETURN 'NO_RIGHTS'; END IF;
  IF (non_invite_role = 'super_admin'::public.user_min_right) THEN
    IF NOT (public.check_min_rights('super_admin'::public.user_min_right, (select public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], modify_permissions_tmp.org_id)), modify_permissions_tmp.org_id, NULL::varchar, NULL::bigint)) THEN RETURN 'NO_RIGHTS_FOR_SUPER_ADMIN'; END IF;
  END IF;
  SELECT * INTO tmp_user FROM public.tmp_users WHERE public.tmp_users.email = modify_permissions_tmp.email AND public.tmp_users.org_id = modify_permissions_tmp.org_id;
  IF NOT FOUND THEN RETURN 'NO_INVITATION'; END IF;
  IF tmp_user.cancelled_at IS NOT NULL THEN RETURN 'INVITATION_CANCELLED'; END IF;
  UPDATE public.tmp_users SET role = non_invite_role, updated_at = CURRENT_TIMESTAMP WHERE public.tmp_users.id = tmp_user.id;
  RETURN 'OK';
END;
$$;

-- U) get_org_members(user_id, guild_id): align to 6 columns; mark user_id used
DROP FUNCTION IF EXISTS public.get_org_members(uuid, uuid);
CREATE FUNCTION "public"."get_org_members" ("user_id" uuid, "guild_id" uuid)
RETURNS TABLE ("aid" bigint, "uid" uuid, "email" varchar, "image_url" varchar, "role" public.user_min_right, "is_tmp" boolean)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
BEGIN
  PERFORM user_id;
  RETURN QUERY SELECT o.id, users.id, users.email, users.image_url, o.user_right, false
  FROM public.org_users o JOIN public.users ON users.id = o.user_id
  WHERE o.org_id=get_org_members.guild_id AND public.is_member_of_org(users.id, o.org_id);
END;
$$;
