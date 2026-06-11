


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


CREATE SCHEMA IF NOT EXISTS "capgo_private";


ALTER SCHEMA "capgo_private" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "postgres";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."action_type" AS ENUM (
    'mau',
    'storage',
    'bandwidth',
    'build_time'
);


ALTER TYPE "public"."action_type" OWNER TO "postgres";


CREATE TYPE "public"."credit_metric_type" AS ENUM (
    'mau',
    'bandwidth',
    'storage',
    'build_time'
);


ALTER TYPE "public"."credit_metric_type" OWNER TO "postgres";


CREATE TYPE "public"."credit_transaction_type" AS ENUM (
    'grant',
    'purchase',
    'manual_grant',
    'deduction',
    'expiry',
    'refund'
);


ALTER TYPE "public"."credit_transaction_type" OWNER TO "postgres";


CREATE TYPE "public"."cron_task_type" AS ENUM (
    'function',
    'queue',
    'function_queue'
);


ALTER TYPE "public"."cron_task_type" OWNER TO "postgres";


CREATE TYPE "public"."disable_update" AS ENUM (
    'major',
    'minor',
    'patch',
    'version_number',
    'none'
);


ALTER TYPE "public"."disable_update" OWNER TO "postgres";


CREATE TYPE "public"."manifest_entry" AS (
	"file_name" character varying,
	"s3_path" character varying,
	"file_hash" character varying
);


ALTER TYPE "public"."manifest_entry" OWNER TO "postgres";


CREATE TYPE "public"."message_update" AS (
	"msg_id" bigint,
	"cf_id" character varying,
	"queue" character varying
);


ALTER TYPE "public"."message_update" OWNER TO "postgres";


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
    'android',
    'electron'
);


ALTER TYPE "public"."platform_os" OWNER TO "postgres";


CREATE TYPE "public"."stats_action" AS ENUM (
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
    'disableProdBuild',
    'disableEmulator',
    'disableDevice',
    'cannotGetBundle',
    'checksum_fail',
    'NoChannelOrOverride',
    'setChannel',
    'getChannel',
    'rateLimited',
    'disableAutoUpdate',
    'keyMismatch',
    'ping',
    'InvalidIp',
    'blocked_by_server_url',
    'download_manifest_start',
    'download_manifest_complete',
    'download_zip_start',
    'download_zip_complete',
    'download_manifest_file_fail',
    'download_manifest_checksum_fail',
    'download_manifest_brotli_fail',
    'backend_refusal',
    'download_0',
    'disablePlatformElectron',
    'customIdBlocked',
    'app_crash',
    'app_crash_native',
    'app_anr',
    'app_killed_low_memory',
    'app_killed_excessive_resource_usage',
    'app_initialization_failure',
    'app_memory_warning',
    'webview_javascript_error',
    'webview_unhandled_rejection',
    'webview_resource_error',
    'webview_security_policy_violation',
    'webview_unclean_restart',
    'webview_render_process_gone',
    'webview_content_process_terminated',
    'os_version_changed',
    'native_app_version_changed'
);


ALTER TYPE "public"."stats_action" OWNER TO "postgres";


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


CREATE TYPE "public"."user_role" AS ENUM (
    'read',
    'upload',
    'write',
    'admin'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE TYPE "public"."version_action" AS ENUM (
    'get',
    'fail',
    'install',
    'uninstall'
);


ALTER TYPE "public"."version_action" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "capgo_private"."matches_app_storage_rbac_owner"("folder_user_id" "text", "target_app_id" character varying, "permission_key" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_apikey text;
  v_api_key public.apikeys%ROWTYPE;
  v_owner_org uuid;
BEGIN
  SELECT public.get_apikey_header() INTO v_apikey;

  IF v_apikey IS NULL OR v_apikey = '' THEN
    RETURN false;
  END IF;

  SELECT * INTO v_api_key
  FROM public.find_apikey_by_value(v_apikey)
  LIMIT 1;

  IF v_api_key.id IS NULL
    OR public.is_apikey_expired(v_api_key.expires_at)
    OR v_api_key.user_id::text IS DISTINCT FROM folder_user_id
  THEN
    RETURN false;
  END IF;

  SELECT owner_org INTO v_owner_org
  FROM public.apps
  WHERE app_id = target_app_id
  LIMIT 1;

  IF v_owner_org IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.rbac_check_permission_direct(
    permission_key,
    v_api_key.user_id,
    v_owner_org,
    target_app_id,
    NULL::bigint,
    v_apikey
  );
END;
$$;


ALTER FUNCTION "capgo_private"."matches_app_storage_rbac_owner"("folder_user_id" "text", "target_app_id" character varying, "permission_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_invitation_to_org"("org_id" "uuid") RETURNS character varying
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    SET "row_security" TO 'off'
    AS $$
DECLARE
  invite public.org_users%ROWTYPE;
  invite_user_id uuid;
  invite_org_id uuid;
  role_name text;
  role_id uuid;
BEGIN
  SELECT public.org_users.*
  INTO invite
  FROM public.org_users
  WHERE public.org_users.org_id = accept_invitation_to_org.org_id
    AND public.org_users.user_id = auth.uid()
    AND public.org_users.is_invite IS TRUE
  ORDER BY public.org_users.created_at DESC NULLS LAST,
    public.org_users.id DESC
  LIMIT 1;

  IF invite.id IS NOT NULL THEN
    IF invite.rbac_role_name IS NULL THEN
      RETURN 'ROLE_NOT_FOUND';
    END IF;
    invite_user_id := invite.user_id;
    invite_org_id := invite.org_id;
    role_name := invite.rbac_role_name;
  ELSE
    SELECT rb.principal_id, rb.org_id, r.name
    INTO invite_user_id, invite_org_id, role_name
    FROM public.role_bindings rb
    JOIN public.roles r
      ON r.id = rb.role_id
      AND r.scope_type = rb.scope_type
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = auth.uid()
      AND rb.org_id = accept_invitation_to_org.org_id
      AND rb.scope_type = public.rbac_scope_org()
      AND rb.reason IN ('Pending invitation', 'Invited via invite_user_to_org_rbac')
    ORDER BY rb.granted_at DESC NULLS LAST
    LIMIT 1;

    IF invite_user_id IS NULL THEN
      RETURN 'NO_INVITE';
    END IF;
  END IF;

  IF role_name IS NULL THEN
    RETURN 'ROLE_NOT_FOUND';
  END IF;

  SELECT public.roles.id INTO role_id
  FROM public.roles
  WHERE public.roles.name = role_name
    AND public.roles.scope_type = public.rbac_scope_org()
    AND public.roles.is_assignable = true
  LIMIT 1;

  IF role_id IS NULL THEN
    RETURN 'ROLE_NOT_FOUND';
  END IF;

  IF invite.id IS NULL THEN
    INSERT INTO public.org_users (user_id, org_id, rbac_role_name, is_invite)
    VALUES (invite_user_id, invite_org_id, role_name, false);
  ELSE
    UPDATE public.org_users
    SET is_invite = false,
        rbac_role_name = role_name,
        updated_at = CURRENT_TIMESTAMP
    WHERE public.org_users.id = invite.id;
  END IF;

  DELETE FROM public.role_bindings
  WHERE public.role_bindings.principal_type = public.rbac_principal_user()
    AND public.role_bindings.principal_id = invite_user_id
    AND public.role_bindings.scope_type = public.rbac_scope_org()
    AND public.role_bindings.org_id = invite_org_id;

  INSERT INTO public.role_bindings (
    principal_type,
    principal_id,
    role_id,
    scope_type,
    org_id,
    app_id,
    channel_id,
    granted_by,
    granted_at,
    reason,
    is_direct
  ) VALUES (
    public.rbac_principal_user(),
    invite_user_id,
    role_id,
    public.rbac_scope_org(),
    invite_org_id,
    NULL,
    NULL,
    auth.uid(),
    now(),
    'Accepted invitation',
    true
  ) ON CONFLICT DO NOTHING;

  RETURN 'OK';
END;
$$;


ALTER FUNCTION "public"."accept_invitation_to_org"("org_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."accept_invitation_to_org"("org_id" "uuid") IS 'Accepts a pending org invite and creates the active RBAC binding. Kept for old clients.';



CREATE OR REPLACE FUNCTION "public"."acknowledge_compatibility_event"("event_id" bigint, "note" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE v_org uuid; v_app text;
BEGIN
  IF note IS NULL OR length(btrim(note)) = 0 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;
  SELECT org_id, app_id INTO v_org, v_app
    FROM public.compatibility_events WHERE id = event_id;
  IF v_org IS NULL THEN RETURN; END IF;            -- unknown id: no-op
  -- RBAC: app upload-bundle permission (release managers); NOT legacy min_rights.
  -- Adjust the perm key in review if a different role should be allowed to accept.
  IF NOT public.rbac_check_permission_direct(
        public.rbac_perm_app_upload_bundle(), auth.uid(), v_org, v_app, NULL::bigint) THEN
    RETURN;                                         -- unauthorized: no-op (no oracle)
  END IF;
  UPDATE public.compatibility_events
    SET resolved_at = now(), resolved_by = auth.uid(),
        resolution_kind = 'accepted', resolution_note = note
    WHERE id = event_id AND resolved_at IS NULL;
END; $$;


ALTER FUNCTION "public"."acknowledge_compatibility_event"("event_id" bigint, "note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."aggregate_build_log_to_daily"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_old_date date;
BEGIN
  -- Handle DELETE: subtract old values and return
  IF TG_OP = 'DELETE' THEN
    IF OLD.app_id IS NOT NULL THEN
      v_old_date := (OLD.created_at AT TIME ZONE 'UTC')::date;
      UPDATE public.daily_build_time
      SET build_time_unit = GREATEST(build_time_unit - OLD.billable_seconds, 0),
          build_count = GREATEST(build_count - 1, 0)
      WHERE app_id = OLD.app_id AND date = v_old_date;
    END IF;
    RETURN OLD;
  END IF;

  -- Handle UPDATE: subtract old values from the old bucket (if old had app_id)
  IF TG_OP = 'UPDATE' AND OLD.app_id IS NOT NULL THEN
    v_old_date := (OLD.created_at AT TIME ZONE 'UTC')::date;
    UPDATE public.daily_build_time
    SET build_time_unit = GREATEST(build_time_unit - OLD.billable_seconds, 0),
        build_count = GREATEST(build_count - 1, 0)
    WHERE app_id = OLD.app_id AND date = v_old_date;
  END IF;

  -- Handle INSERT/UPDATE: add new values (only if new app_id is set)
  IF NEW.app_id IS NOT NULL THEN
    INSERT INTO public.daily_build_time (app_id, date, build_time_unit, build_count)
    VALUES (NEW.app_id, (NEW.created_at AT TIME ZONE 'UTC')::date, NEW.billable_seconds, 1)
    ON CONFLICT (app_id, date) DO UPDATE SET
      build_time_unit = public.daily_build_time.build_time_unit + EXCLUDED.build_time_unit,
      build_count = public.daily_build_time.build_count + EXCLUDED.build_count;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."aggregate_build_log_to_daily"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apikey_has_current_org_create_capability"("p_apikey_rbac_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.role_bindings AS rb
    JOIN public.roles AS r ON r.id = rb.role_id
    WHERE rb.principal_type = public.rbac_principal_apikey()
      AND rb.principal_id = p_apikey_rbac_id
      AND rb.scope_type = public.rbac_scope_org()
      AND r.scope_type = public.rbac_scope_org()
      AND (
        rb.expires_at IS NULL
        OR rb.expires_at > pg_catalog.now()
      )
      AND r.name IN (
        public.rbac_role_org_super_admin(),
        public.rbac_role_org_admin()
      )
  )
$$;


ALTER FUNCTION "public"."apikey_has_current_org_create_capability"("p_apikey_rbac_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."apikey_has_current_org_create_capability"("p_apikey_rbac_id" "uuid") IS 'Private helper ensuring org.create grants only remain effective while the API key still has a current org-scoped write-capable RBAC binding.';



CREATE OR REPLACE FUNCTION "public"."apikey_has_global_permission"("p_apikey" "text", "p_permission_key" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_api_key public.apikeys%ROWTYPE;
BEGIN
  IF p_apikey IS NULL OR p_apikey = '' OR p_permission_key IS NULL OR p_permission_key = '' THEN
    RETURN false;
  END IF;

  SELECT *
  INTO v_api_key
  FROM public.find_apikey_by_value(p_apikey)
  LIMIT 1;

  IF v_api_key.id IS NULL OR public.is_apikey_expired(v_api_key.expires_at) THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.apikey_global_permissions AS agp
    WHERE agp.apikey_rbac_id = v_api_key.rbac_id
      AND agp.permission_key = p_permission_key
  ) THEN
    RETURN false;
  END IF;

  IF p_permission_key = public.rbac_perm_org_create() THEN
    RETURN public.apikey_has_current_org_create_capability(v_api_key.rbac_id);
  END IF;

  RETURN true;
END;
$$;


ALTER FUNCTION "public"."apikey_has_global_permission"("p_apikey" "text", "p_permission_key" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."apikey_has_global_permission"("p_apikey" "text", "p_permission_key" "text") IS 'Service-role helper that checks global API-key permissions such as org.create using the supplied key value, including hashed-key lookup.';



CREATE OR REPLACE FUNCTION "public"."apikeys_force_server_key"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_plain_key text;
  v_is_hashed boolean;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF current_setting('capgo.skip_apikey_trigger', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- SECURITY DEFINER makes current_user the function owner, so use session_user to detect the caller.
  IF session_user IN ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin', 'supabase_storage_admin', 'supabase_realtime_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Allow callers to force regeneration even if they mistakenly re-submit the same value.
    -- This is primarily useful for controlled internal operations; normal API flows always
    -- write a different placeholder value.
    IF current_setting('capgo.force_regenerate_apikey', true) IS DISTINCT FROM 'true'
      AND NEW.key IS NOT DISTINCT FROM OLD.key
      AND NEW.key_hash IS NOT DISTINCT FROM OLD.key_hash THEN
      RETURN NEW;
    END IF;
    v_is_hashed := (OLD.key_hash IS NOT NULL AND OLD.key IS NULL) OR NEW.key_hash IS NOT NULL;
  ELSE
    v_is_hashed := NEW.key_hash IS NOT NULL;
  END IF;

  v_plain_key := gen_random_uuid()::text;

  IF v_is_hashed THEN
    NEW.key_hash := encode(extensions.digest(v_plain_key, 'sha256'), 'hex');
    NEW.key := v_plain_key;
  ELSE
    NEW.key := v_plain_key;
    NEW.key_hash := NULL;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."apikeys_force_server_key"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apikeys_strip_plain_key_for_hashed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  IF current_setting('capgo.skip_apikey_trigger', true) = 'true' THEN
    RETURN NULL;
  END IF;

  IF NEW.key_hash IS NOT NULL AND NEW.key IS NOT NULL THEN
    UPDATE public.apikeys
      SET key = NULL
      WHERE id = NEW.id;
  END IF;

  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."apikeys_strip_plain_key_for_hashed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."app_versions_readable_app_ids"() RETURNS character varying[]
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_user_id uuid;
  v_api_key_text text;
  v_api_key public.apikeys%ROWTYPE;
  v_principal_type text;
  v_principal_id uuid;
  v_allowed character varying[] := '{}'::character varying[];
BEGIN
  SELECT auth.uid() INTO v_user_id;
  SELECT public.get_apikey_header() INTO v_api_key_text;

  IF v_api_key_text IS NOT NULL THEN
    SELECT * INTO v_api_key
    FROM public.find_apikey_by_value(v_api_key_text)
    LIMIT 1;

    IF v_api_key.id IS NULL OR public.is_apikey_expired(v_api_key.expires_at) THEN
      RETURN v_allowed;
    END IF;

    v_user_id := v_api_key.user_id;
    v_principal_type := public.rbac_principal_apikey();
    v_principal_id := v_api_key.rbac_id;
  ELSIF v_user_id IS NOT NULL THEN
    v_principal_type := public.rbac_principal_user();
    v_principal_id := v_user_id;
  ELSE
    RETURN v_allowed;
  END IF;

  IF v_principal_id IS NULL THEN
    RETURN v_allowed;
  END IF;

  WITH RECURSIVE direct_bindings AS (
    SELECT rb.role_id, rb.scope_type, rb.org_id, rb.app_id
    FROM public.role_bindings rb
    WHERE rb.principal_type = v_principal_type
      AND rb.principal_id = v_principal_id
      AND rb.scope_type IN (public.rbac_scope_org(), public.rbac_scope_app())
      AND rb.org_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())

    UNION

    SELECT rb.role_id, rb.scope_type, rb.org_id, rb.app_id
    FROM public.group_members gm
    INNER JOIN public.groups g ON g.id = gm.group_id
    INNER JOIN public.role_bindings rb
      ON rb.principal_type = public.rbac_principal_group()
      AND rb.principal_id = gm.group_id
      AND rb.org_id = g.org_id
    WHERE v_principal_type = public.rbac_principal_user()
      AND gm.user_id = v_principal_id
      AND rb.scope_type IN (public.rbac_scope_org(), public.rbac_scope_app())
      AND rb.org_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
  ),
  role_closure AS (
    SELECT
      direct_bindings.role_id,
      direct_bindings.role_id AS effective_role_id,
      direct_bindings.scope_type,
      direct_bindings.org_id,
      direct_bindings.app_id
    FROM direct_bindings

    UNION

    SELECT
      role_closure.role_id,
      role_hierarchy.child_role_id,
      role_closure.scope_type,
      role_closure.org_id,
      role_closure.app_id
    FROM role_closure
    INNER JOIN public.role_hierarchy
      ON role_hierarchy.parent_role_id = role_closure.effective_role_id
    INNER JOIN public.roles child_role
      ON child_role.id = role_hierarchy.child_role_id
      AND child_role.scope_type = role_closure.scope_type
  ),
  readable_scopes AS (
    SELECT DISTINCT role_closure.scope_type, role_closure.org_id, role_closure.app_id
    FROM role_closure
    INNER JOIN public.role_permissions
      ON role_permissions.role_id = role_closure.effective_role_id
    INNER JOIN public.permissions
      ON permissions.id = role_permissions.permission_id
    WHERE permissions.key = public.rbac_perm_app_read()
  ),
  scoped_apps AS (
    SELECT apps.app_id, apps.owner_org
    FROM readable_scopes
    INNER JOIN public.apps
      ON apps.owner_org = readable_scopes.org_id
    WHERE readable_scopes.scope_type = public.rbac_scope_org()

    UNION

    SELECT apps.app_id, apps.owner_org
    FROM readable_scopes
    INNER JOIN public.apps
      ON apps.id = readable_scopes.app_id
      AND apps.owner_org = readable_scopes.org_id
    WHERE readable_scopes.scope_type = public.rbac_scope_app()
      AND readable_scopes.app_id IS NOT NULL
  ),
  candidate_orgs AS (
    SELECT DISTINCT scoped_apps.owner_org
    FROM scoped_apps
  ),
  readable_orgs AS (
    SELECT orgs.id
    FROM candidate_orgs
    INNER JOIN public.orgs ON orgs.id = candidate_orgs.owner_org
    WHERE (
        orgs.enforcing_2fa IS NOT TRUE
        OR (v_user_id IS NOT NULL AND public.has_2fa_enabled(v_user_id))
      )
      AND public.user_meets_password_policy(v_user_id, orgs.id) IS DISTINCT FROM false
  )
  SELECT COALESCE(array_agg(DISTINCT scoped_apps.app_id), '{}'::character varying[])
  INTO v_allowed
  FROM scoped_apps
  INNER JOIN readable_orgs ON readable_orgs.id = scoped_apps.owner_org;

  RETURN v_allowed;
END;
$$;


ALTER FUNCTION "public"."app_versions_readable_app_ids"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."app_versions_readable_app_ids"() IS 'Returns app IDs whose bundle rows are readable by the current authenticated user or Capgo API key. The lookup starts from caller-scoped role bindings and expands role permissions set-wise for compatibility; targeted app_versions RLS checks use app_versions_has_app_permission instead.';



CREATE OR REPLACE FUNCTION "public"."apply_usage_overage"("p_org_id" "uuid", "p_metric" "public"."credit_metric_type", "p_overage_amount" numeric, "p_billing_cycle_start" timestamp with time zone, "p_billing_cycle_end" timestamp with time zone, "p_details" "jsonb" DEFAULT NULL::"jsonb") RETURNS TABLE("overage_amount" numeric, "credits_required" numeric, "credits_applied" numeric, "credits_remaining" numeric, "credit_step_id" bigint, "overage_covered" numeric, "overage_unpaid" numeric, "overage_event_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_calc RECORD;
  v_event_id uuid;
  v_remaining numeric := 0;
  v_applied numeric := 0;
  v_per_unit numeric := 0;
  v_available numeric;
  v_use numeric;
  v_balance numeric;
  v_overage_paid numeric := 0;
  v_existing_credits_debited numeric := 0;
  v_required numeric := 0;
  v_credits_to_apply numeric := 0;
  v_credits_available numeric := 0;
  v_latest_event_id uuid;
  v_latest_overage_amount numeric;
  v_needs_new_record boolean := false;
  grant_rec public.usage_credit_grants%ROWTYPE;
BEGIN
  -- Early exit for invalid input
  IF p_overage_amount IS NULL OR p_overage_amount <= 0 THEN
    RETURN QUERY SELECT 0::numeric, 0::numeric, 0::numeric, 0::numeric, NULL::bigint, 0::numeric, 0::numeric, NULL::uuid;
    RETURN;
  END IF;

  -- Calculate credit cost for this overage
  SELECT *
  INTO v_calc
  FROM public.calculate_credit_cost(p_metric, p_overage_amount)
  LIMIT 1;

  -- If no pricing step found, create a single record and exit
  IF v_calc.credit_step_id IS NULL THEN
    -- Check if we already have a record for this cycle with NULL step
    SELECT uoe.id, uoe.overage_amount INTO v_latest_event_id, v_latest_overage_amount
    FROM public.usage_overage_events uoe
    WHERE uoe.org_id = p_org_id
      AND uoe.metric = p_metric
      AND uoe.credit_step_id IS NULL
      AND (uoe.billing_cycle_start IS NOT DISTINCT FROM p_billing_cycle_start::date)
      AND (uoe.billing_cycle_end IS NOT DISTINCT FROM p_billing_cycle_end::date)
    ORDER BY uoe.created_at DESC
    LIMIT 1;

    -- Only create new record if overage amount changed significantly (more than 1% or first record)
    IF v_latest_event_id IS NULL OR ABS(v_latest_overage_amount - p_overage_amount) / NULLIF(v_latest_overage_amount, 0) > 0.01 THEN
      INSERT INTO public.usage_overage_events (
        org_id,
        metric,
        overage_amount,
        credits_estimated,
        credits_debited,
        credit_step_id,
        billing_cycle_start,
        billing_cycle_end,
        details
      )
      VALUES (
        p_org_id,
        p_metric,
        p_overage_amount,
        0,
        0,
        NULL,
        p_billing_cycle_start,
        p_billing_cycle_end,
        p_details
      )
      RETURNING id INTO v_event_id;
    ELSE
      -- Reuse existing event
      v_event_id := v_latest_event_id;
    END IF;

    RETURN QUERY SELECT p_overage_amount, 0::numeric, 0::numeric, 0::numeric, NULL::bigint, 0::numeric, p_overage_amount, v_event_id;
    RETURN;
  END IF;

  v_per_unit := v_calc.credit_cost_per_unit;
  v_required := v_calc.credits_required;

  -- Get the most recent event for this cycle
  SELECT uoe.id, uoe.overage_amount
  INTO v_latest_event_id, v_latest_overage_amount
  FROM public.usage_overage_events uoe
  WHERE uoe.org_id = p_org_id
    AND uoe.metric = p_metric
    AND (uoe.billing_cycle_start IS NOT DISTINCT FROM p_billing_cycle_start::date)
    AND (uoe.billing_cycle_end IS NOT DISTINCT FROM p_billing_cycle_end::date)
  ORDER BY uoe.created_at DESC
  LIMIT 1;

  -- Calculate how many credits we can still try to apply
  -- Use credits_debited for this since it reflects actual consumption
  SELECT COALESCE(SUM(credits_debited), 0)
  INTO v_existing_credits_debited
  FROM public.usage_overage_events
  WHERE org_id = p_org_id
    AND metric = p_metric
    AND (billing_cycle_start IS NOT DISTINCT FROM p_billing_cycle_start::date)
    AND (billing_cycle_end IS NOT DISTINCT FROM p_billing_cycle_end::date);

  v_credits_to_apply := GREATEST(v_required - v_existing_credits_debited, 0);
  v_remaining := v_credits_to_apply;

  -- Check if there are any credits available in grants
  SELECT COALESCE(SUM(GREATEST(credits_total - credits_consumed, 0)), 0)
  INTO v_credits_available
  FROM public.usage_credit_grants
  WHERE org_id = p_org_id
    AND expires_at >= NOW();

  -- Determine if we need a new record:
  -- 1. No existing record for this cycle (first overage)
  -- 2. Overage amount changed significantly (more than 1%)
  -- 3. We have NEW credits available AND we need to apply them
  v_needs_new_record := v_latest_event_id IS NULL
    OR (v_latest_overage_amount IS NOT NULL
        AND ABS(v_latest_overage_amount - p_overage_amount) / NULLIF(v_latest_overage_amount, 0) > 0.01)
    OR (v_credits_to_apply > 0 AND v_credits_available > 0 AND v_existing_credits_debited = 0);

  -- Only create new record if needed
  IF v_needs_new_record THEN
    INSERT INTO public.usage_overage_events (
      org_id,
      metric,
      overage_amount,
      credits_estimated,
      credits_debited,
      credit_step_id,
      billing_cycle_start,
      billing_cycle_end,
      details
    )
    VALUES (
      p_org_id,
      p_metric,
      p_overage_amount,
      v_required,
      0,
      v_calc.credit_step_id,
      p_billing_cycle_start,
      p_billing_cycle_end,
      COALESCE(p_details, '{}'::jsonb) || jsonb_build_object(
        'credits_available', v_credits_available,
        'credits_to_apply', v_credits_to_apply,
        'debit_status', CASE
          WHEN v_credits_available = 0 THEN 'no_grants_available'
          WHEN v_credits_to_apply = 0 THEN 'already_debited'
          ELSE 'pending_debit'
        END
      )
    )
    RETURNING id INTO v_event_id;

    -- Apply credits from available grants if any
    IF v_credits_to_apply > 0 THEN
      FOR grant_rec IN
        SELECT *
        FROM public.usage_credit_grants
        WHERE org_id = p_org_id
          AND expires_at >= NOW()
          AND credits_consumed < credits_total
        ORDER BY expires_at ASC, granted_at ASC
        FOR UPDATE
      LOOP
        EXIT WHEN v_remaining <= 0;

        v_available := grant_rec.credits_total - grant_rec.credits_consumed;
        IF v_available <= 0 THEN
          CONTINUE;
        END IF;

        v_use := LEAST(v_available, v_remaining);
        v_remaining := v_remaining - v_use;
        v_applied := v_applied + v_use;

        UPDATE public.usage_credit_grants
        SET credits_consumed = credits_consumed + v_use
        WHERE id = grant_rec.id;

        INSERT INTO public.usage_credit_consumptions (
          grant_id,
          org_id,
          overage_event_id,
          metric,
          credits_used
        )
        VALUES (
          grant_rec.id,
          p_org_id,
          v_event_id,
          p_metric,
          v_use
        );

        SELECT COALESCE(SUM(GREATEST(credits_total - credits_consumed, 0)), 0)
        INTO v_balance
        FROM public.usage_credit_grants
        WHERE org_id = p_org_id
          AND expires_at >= NOW();

        INSERT INTO public.usage_credit_transactions (
          org_id,
          grant_id,
          transaction_type,
          amount,
          balance_after,
          occurred_at,
          description,
          source_ref
        )
        VALUES (
          p_org_id,
          grant_rec.id,
          'deduction',
          -v_use,
          v_balance,
          NOW(),
          format('Overage deduction for %s usage', p_metric::text),
          jsonb_build_object('overage_event_id', v_event_id, 'metric', p_metric::text)
        );
      END LOOP;

      -- Update the event with actual credits applied
      UPDATE public.usage_overage_events
      SET
        credits_debited = v_applied,
        details = COALESCE(details, '{}'::jsonb) || jsonb_build_object(
          'credits_actually_applied', v_applied,
          'debit_status', CASE
            WHEN v_applied >= v_credits_to_apply THEN 'fully_debited'
            WHEN v_applied > 0 THEN 'partially_debited'
            ELSE 'no_debit'
          END
        )
      WHERE id = v_event_id;
    END IF;
  ELSE
    -- Reuse latest event ID, no new record needed
    v_event_id := v_latest_event_id;
  END IF;

  -- Calculate how much overage is covered by credits
  IF v_per_unit > 0 THEN
    v_overage_paid := LEAST(p_overage_amount, (v_applied + v_existing_credits_debited) / v_per_unit);
  ELSE
    v_overage_paid := p_overage_amount;
  END IF;

  RETURN QUERY SELECT
    p_overage_amount,
    v_required,
    v_applied,
    GREATEST(v_required - v_existing_credits_debited - v_applied, 0),
    v_calc.credit_step_id,
    v_overage_paid,
    GREATEST(p_overage_amount - v_overage_paid, 0),
    v_event_id;
END;
$$;


ALTER FUNCTION "public"."apply_usage_overage"("p_org_id" "uuid", "p_metric" "public"."credit_metric_type", "p_overage_amount" numeric, "p_billing_cycle_start" timestamp with time zone, "p_billing_cycle_end" timestamp with time zone, "p_details" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_log_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_old_record jsonb;
  v_new_record jsonb;
  v_changed_fields text[];
  v_org_id uuid;
  v_record_id text;
  v_user_id uuid;
  v_key text;
  v_org_exists boolean;
  v_stats_refresh_fields constant text[] := ARRAY['stats_refresh_requested_at', 'stats_updated_at', 'updated_at'];
BEGIN
  IF TG_TABLE_NAME = 'orgs' AND TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  v_user_id := public.request_actor_user_id();
  IF v_user_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_old_record := to_jsonb(OLD);
    v_new_record := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_old_record := NULL;
    v_new_record := to_jsonb(NEW);
  ELSE
    v_old_record := to_jsonb(OLD);
    v_new_record := to_jsonb(NEW);

    FOR v_key IN SELECT jsonb_object_keys(v_new_record)
    LOOP
      IF v_old_record->v_key IS DISTINCT FROM v_new_record->v_key THEN
        v_changed_fields := array_append(v_changed_fields, v_key);
      END IF;
    END LOOP;

    IF TG_TABLE_NAME = ANY(ARRAY['apps', 'orgs'])
      AND v_changed_fields && ARRAY['stats_refresh_requested_at', 'stats_updated_at']
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(v_changed_fields) AS changed_field(field_name)
        WHERE changed_field.field_name <> ALL(v_stats_refresh_fields)
      )
    THEN
      RETURN NEW;
    END IF;
  END IF;

  CASE TG_TABLE_NAME
    WHEN 'orgs' THEN
      v_org_id := COALESCE(NEW.id, OLD.id);
      v_record_id := COALESCE(NEW.id, OLD.id)::text;
    WHEN 'apps' THEN
      v_org_id := COALESCE(NEW.owner_org, OLD.owner_org);
      v_record_id := COALESCE(NEW.app_id, OLD.app_id)::text;
    WHEN 'channels' THEN
      v_org_id := COALESCE(NEW.owner_org, OLD.owner_org);
      v_record_id := COALESCE(NEW.id, OLD.id)::text;
    WHEN 'app_versions' THEN
      v_org_id := COALESCE(NEW.owner_org, OLD.owner_org);
      v_record_id := COALESCE(NEW.id, OLD.id)::text;
    WHEN 'org_users' THEN
      v_org_id := COALESCE(NEW.org_id, OLD.org_id);
      v_record_id := COALESCE(NEW.id, OLD.id)::text;
    ELSE
      v_org_id := NULL;
      v_record_id := NULL;
  END CASE;

  IF v_org_id IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM public.orgs WHERE id = v_org_id) INTO v_org_exists;

    IF v_org_exists THEN
      INSERT INTO public.audit_logs (
        table_name, record_id, operation, user_id, org_id,
        old_record, new_record, changed_fields
      ) VALUES (
        TG_TABLE_NAME, v_record_id, TG_OP, v_user_id, v_org_id,
        v_old_record, v_new_record, v_changed_fields
      );
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."audit_log_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_logs_allowed_orgs"() RETURNS "uuid"[]
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT COALESCE(pg_catalog.array_agg(DISTINCT orgs.id), '{}'::uuid[])
  FROM public.orgs
  WHERE public.rbac_check_permission_request(
    public.rbac_perm_org_read_audit(),
    orgs.id,
    NULL::character varying,
    NULL::bigint
  );
$$;


ALTER FUNCTION "public"."audit_logs_allowed_orgs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_apikey_name_by_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$BEGIN

  IF (NEW.name IS NOT DISTINCT FROM NULL) OR LENGTH(NEW.name) = 0 THEN
    NEW.name = format('Apikey %s', NEW.id);
  END IF;

  RETURN NEW;
END;$$;


ALTER FUNCTION "public"."auto_apikey_name_by_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_owner_org_by_app_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NEW."app_id" IS DISTINCT FROM OLD."app_id" AND OLD."app_id" IS DISTINCT FROM NULL THEN
    RAISE EXCEPTION 'changing the app_id is not allowed';
  END IF;

  NEW.owner_org = public.get_owner_org_by_app_id_internal(NEW."app_id");

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_owner_org_by_app_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bind_creating_apikey_to_org_on_create"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  api_key_text text;
  api_key public.apikeys%ROWTYPE;
  org_super_admin_role_id uuid;
BEGIN
  SELECT public.get_apikey_header() INTO api_key_text;
  IF api_key_text IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO api_key
  FROM public.find_apikey_by_value(api_key_text)
  LIMIT 1;

  IF api_key.id IS NULL
    OR public.is_apikey_expired(api_key.expires_at)
    OR api_key.user_id IS DISTINCT FROM NEW.created_by
  THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.apikey_global_permissions AS agp
    WHERE agp.apikey_rbac_id = api_key.rbac_id
      AND agp.permission_key = public.rbac_perm_org_create()
  )
  OR NOT public.apikey_has_current_org_create_capability(api_key.rbac_id) THEN
    RETURN NEW;
  END IF;

  SELECT roles.id
  INTO org_super_admin_role_id
  FROM public.roles
  WHERE roles.name = public.rbac_role_org_super_admin()
    AND roles.scope_type = public.rbac_scope_org()
  LIMIT 1;

  IF org_super_admin_role_id IS NULL THEN
    RAISE EXCEPTION 'org_super_admin role not found';
  END IF;

  INSERT INTO public.role_bindings (
    principal_type,
    principal_id,
    role_id,
    scope_type,
    org_id,
    granted_by,
    granted_at,
    reason,
    is_direct
  )
  VALUES (
    public.rbac_principal_apikey(),
    api_key.rbac_id,
    org_super_admin_role_id,
    public.rbac_scope_org(),
    NEW.id,
    NEW.created_by,
    pg_catalog.now(),
    'Auto-granted to API key on org creation',
    true
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."bind_creating_apikey_to_org_on_create"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_credit_cost"("p_metric" "public"."credit_metric_type", "p_overage_amount" numeric) RETURNS TABLE("credit_step_id" bigint, "credit_cost_per_unit" numeric, "credits_required" numeric)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  v_step public.capgo_credits_steps%ROWTYPE;
  v_highest public.capgo_credits_steps%ROWTYPE;
  v_remaining numeric;
  v_applied_range numeric;
  v_units numeric;
  v_total_credits numeric := 0;
  v_last_step_id bigint := NULL;
  v_unit_factor numeric;
BEGIN
  IF p_overage_amount IS NULL OR p_overage_amount <= 0 THEN
    RETURN QUERY SELECT NULL::bigint, 0::numeric, 0::numeric;
    RETURN;
  END IF;

  v_remaining := p_overage_amount;

  SELECT *
  INTO v_highest
  FROM public.capgo_credits_steps
  WHERE type = p_metric::text
  ORDER BY step_max DESC, step_min DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE WARNING 'No pricing steps found for metric: %', p_metric::text;
    RETURN QUERY SELECT NULL::bigint, 0::numeric, 0::numeric;
    RETURN;
  END IF;

  FOR v_step IN
    SELECT *
    FROM public.capgo_credits_steps
    WHERE type = p_metric::text
    ORDER BY step_min ASC
  LOOP
    EXIT WHEN v_remaining <= 0;

    IF p_overage_amount < v_step.step_min THEN
      EXIT;
    END IF;

    v_applied_range := LEAST(
      v_remaining,
      (v_step.step_max - v_step.step_min)::numeric
    );

    IF v_applied_range <= 0 THEN
      CONTINUE;
    END IF;

    v_unit_factor := GREATEST(NULLIF(v_step.unit_factor, 0), 1)::numeric;
    v_units := CEILING(v_applied_range / v_unit_factor);

    IF v_units <= 0 THEN
      CONTINUE;
    END IF;

    v_total_credits := v_total_credits + (v_units * v_step.price_per_unit::numeric);
    v_remaining := v_remaining - v_applied_range;
    v_last_step_id := v_step.id;
  END LOOP;

  IF v_remaining > 0 THEN
    v_unit_factor := GREATEST(NULLIF(v_highest.unit_factor, 0), 1)::numeric;
    v_units := CEILING(v_remaining / v_unit_factor);

    IF v_units > 0 THEN
      v_total_credits := v_total_credits + (v_units * v_highest.price_per_unit::numeric);
      v_last_step_id := v_highest.id;
    END IF;
  END IF;

  RETURN QUERY SELECT
    v_last_step_id::bigint,
    CASE WHEN p_overage_amount > 0 THEN v_total_credits / p_overage_amount ELSE 0 END,
    v_total_credits;
END;
$$;


ALTER FUNCTION "public"."calculate_credit_cost"("p_metric" "public"."credit_metric_type", "p_overage_amount" numeric) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."org_metrics_cache" (
    "org_id" "uuid" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "mau" bigint NOT NULL,
    "storage" bigint NOT NULL,
    "bandwidth" bigint NOT NULL,
    "build_time_unit" bigint NOT NULL,
    "get" bigint NOT NULL,
    "fail" bigint NOT NULL,
    "install" bigint NOT NULL,
    "uninstall" bigint NOT NULL,
    "cached_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."org_metrics_cache" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_org_metrics_cache_entry"("p_org_id" "uuid", "p_start_date" "date", "p_end_date" "date") RETURNS "public"."org_metrics_cache"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_mau bigint;
    v_storage bigint;
    v_bandwidth bigint;
    v_build_time bigint;
    v_get bigint;
    v_fail bigint;
    v_install bigint;
    v_uninstall bigint;
    cache_record public.org_metrics_cache%ROWTYPE;
BEGIN
    WITH app_ids AS (
        SELECT apps.app_id
        FROM public.apps
        WHERE apps.owner_org = p_org_id
        UNION
        SELECT deleted_apps.app_id
        FROM public.deleted_apps
        WHERE deleted_apps.owner_org = p_org_id
    ),
    mau AS (
        SELECT COALESCE(SUM(dm.mau), 0)::bigint AS value
        FROM public.daily_mau dm
        JOIN app_ids a ON a.app_id = dm.app_id
        WHERE dm.date BETWEEN p_start_date AND p_end_date
    ),
    bandwidth AS (
        SELECT COALESCE(SUM(db.bandwidth), 0)::bigint AS value
        FROM public.daily_bandwidth db
        JOIN app_ids a ON a.app_id = db.app_id
        WHERE db.date BETWEEN p_start_date AND p_end_date
    ),
    build_time AS (
        SELECT COALESCE(SUM(dbt.build_time_unit), 0)::bigint AS value
        FROM public.daily_build_time dbt
        JOIN app_ids a ON a.app_id = dbt.app_id
        WHERE dbt.date BETWEEN p_start_date AND p_end_date
    ),
    version_stats AS (
        SELECT
            COALESCE(SUM(dv.get), 0)::bigint AS get,
            COALESCE(SUM(dv.fail), 0)::bigint AS fail,
            COALESCE(SUM(dv.install), 0)::bigint AS install,
            COALESCE(SUM(dv.uninstall), 0)::bigint AS uninstall
        FROM public.daily_version dv
        JOIN app_ids a ON a.app_id = dv.app_id
        WHERE dv.date BETWEEN p_start_date AND p_end_date
    ),
    storage AS (
        SELECT COALESCE(SUM(avm.size), 0)::bigint AS value
        FROM public.app_versions av
        INNER JOIN public.app_versions_meta avm ON av.id = avm.id
        WHERE av.owner_org = p_org_id AND av.deleted = false
    )
    SELECT
        mau.value,
        storage.value,
        bandwidth.value,
        build_time.value,
        version_stats.get,
        version_stats.fail,
        version_stats.install,
        version_stats.uninstall
    INTO v_mau, v_storage, v_bandwidth, v_build_time, v_get, v_fail, v_install, v_uninstall
    FROM mau, storage, bandwidth, build_time, version_stats;

    cache_record.org_id := p_org_id;
    cache_record.start_date := p_start_date;
    cache_record.end_date := p_end_date;
    cache_record.mau := v_mau;
    cache_record.storage := v_storage;
    cache_record.bandwidth := v_bandwidth;
    cache_record.build_time_unit := v_build_time;
    cache_record.get := v_get;
    cache_record.fail := v_fail;
    cache_record.install := v_install;
    cache_record.uninstall := v_uninstall;
    cache_record.cached_at := clock_timestamp();

    RETURN cache_record;
END;
$$;


ALTER FUNCTION "public"."calculate_org_metrics_cache_entry"("p_org_id" "uuid", "p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."calculate_org_metrics_cache_entry"("p_org_id" "uuid", "p_start_date" "date", "p_end_date" "date") IS 'Compute the aggregated org metrics (MAU, storage, bandwidth, build time unit, get/fail/install/uninstall) for the supplied date range without persisting changes. Read-only paths use this helper so they can return cached metrics without touching org_metrics_cache directly.';



CREATE TABLE IF NOT EXISTS "public"."apikeys" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" NOT NULL,
    "key" character varying,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "name" character varying NOT NULL,
    "rbac_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key_hash" "text",
    "expires_at" timestamp with time zone,
    CONSTRAINT "apikeys_key_or_hash" CHECK ((("key" IS NOT NULL) OR ("key_hash" IS NOT NULL)))
);


ALTER TABLE "public"."apikeys" OWNER TO "postgres";


COMMENT ON COLUMN "public"."apikeys"."rbac_id" IS 'Stable UUID to bind RBAC roles to api keys.';



COMMENT ON COLUMN "public"."apikeys"."key_hash" IS 'SHA-256 hash of the API key. When set, the key column is cleared to null for security.';



COMMENT ON COLUMN "public"."apikeys"."expires_at" IS 'When this API key expires. NULL means never expires.';



CREATE OR REPLACE FUNCTION "public"."check_apikey_hashed_key_enforcement"("apikey_row" "public"."apikeys") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  scoped_enforced_org_exists boolean;
BEGIN
  IF apikey_row.key IS NULL AND apikey_row.key_hash IS NOT NULL THEN
    RETURN true;
  END IF;

  IF apikey_row.rbac_id IS NULL THEN
    RETURN true;
  END IF;

  WITH enforced_orgs AS (
    SELECT public.orgs.id
    FROM public.orgs
    WHERE public.orgs.enforce_hashed_api_keys = true
  )
  SELECT EXISTS (
    SELECT 1
    FROM enforced_orgs
    WHERE EXISTS (
        SELECT 1
        FROM public.role_bindings rb
        WHERE rb.principal_type = public.rbac_principal_apikey()
          AND rb.principal_id = apikey_row.rbac_id
          AND rb.scope_type = public.rbac_scope_org()
          AND rb.org_id = enforced_orgs.id
          AND (rb.expires_at IS NULL OR rb.expires_at > now())
      )
      OR EXISTS (
        SELECT 1
        FROM public.role_bindings rb
        JOIN public.apps apps
          ON apps.id = rb.app_id
          AND apps.owner_org = enforced_orgs.id
        WHERE rb.principal_type = public.rbac_principal_apikey()
          AND rb.principal_id = apikey_row.rbac_id
          AND rb.scope_type = public.rbac_scope_app()
          AND rb.app_id IS NOT NULL
          AND (rb.expires_at IS NULL OR rb.expires_at > now())
      )
      OR EXISTS (
        SELECT 1
        FROM public.role_bindings rb
        JOIN public.channels channels
          ON channels.rbac_id = rb.channel_id
          AND channels.owner_org = enforced_orgs.id
        WHERE rb.principal_type = public.rbac_principal_apikey()
          AND rb.principal_id = apikey_row.rbac_id
          AND rb.scope_type = public.rbac_scope_channel()
          AND rb.channel_id IS NOT NULL
          AND (rb.expires_at IS NULL OR rb.expires_at > now())
      )
  )
  INTO scoped_enforced_org_exists;

  IF scoped_enforced_org_exists THEN
    PERFORM public.pg_log(
      'deny: ORG_REQUIRES_HASHED_API_KEY',
      jsonb_build_object('apikey_id', apikey_row.id, 'user_id', apikey_row.user_id)
    );
    RETURN false;
  END IF;

  RETURN true;
END;
$$;


ALTER FUNCTION "public"."check_apikey_hashed_key_enforcement"("apikey_row" "public"."apikeys") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."check_apikey_hashed_key_enforcement"("apikey_row" "public"."apikeys") IS 'Rejects plaintext API keys when any scoped org requires hashed API keys. The lookup starts from enforcing orgs and indexed RBAC bindings so broad API keys do not scan every app binding on each permission check.';



CREATE OR REPLACE FUNCTION "public"."check_domain_sso"("p_domain" "text") RETURNS TABLE("has_sso" boolean, "provider_id" "text", "org_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    SELECT
        true AS has_sso,
        sp.provider_id,
        sp.org_id
    FROM public.sso_providers AS sp
    JOIN public.orgs AS o ON o.id = sp.org_id
    WHERE sp."domain" = lower(btrim(p_domain))
      AND sp.status = 'active'
    LIMIT 1;
$$;


ALTER FUNCTION "public"."check_domain_sso"("p_domain" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_encrypted_bundle_on_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  org_id uuid;
  org_enforcing boolean;
  org_required_key varchar(21);
  bundle_is_encrypted boolean;
  bundle_key_id varchar(20);
  bundle_was_ready boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    bundle_was_ready := OLD.storage_provider IS DISTINCT FROM 'r2-direct';

    IF bundle_was_ready
      AND (
        NEW.name IS DISTINCT FROM OLD.name
        OR NEW.app_id IS DISTINCT FROM OLD.app_id
        OR NEW.session_key IS DISTINCT FROM OLD.session_key
        OR NEW.key_id IS DISTINCT FROM OLD.key_id
        OR NEW.storage_provider IS DISTINCT FROM OLD.storage_provider
        OR NEW.r2_path IS DISTINCT FROM OLD.r2_path
        OR NEW.external_url IS DISTINCT FROM OLD.external_url
        OR NEW.checksum IS DISTINCT FROM OLD.checksum
        OR NEW.manifest IS DISTINCT FROM OLD.manifest
        OR NEW.native_packages IS DISTINCT FROM OLD.native_packages
      )
    THEN
      PERFORM public.pg_log('deny: BUNDLE_CONTENT_LOCKED_TRIGGER',
        jsonb_build_object(
          'org_id', OLD.owner_org,
          'app_id', OLD.app_id,
          'version_name', OLD.name,
          'user_id', OLD.user_id,
          'old_storage_provider', OLD.storage_provider,
          'new_storage_provider', NEW.storage_provider,
          'reason', 'bundle_ready'
        ));
      RAISE EXCEPTION '%',
        'bundle_already_ready: Bundle content cannot be changed '
        || 'after upload is complete. Upload a new bundle instead.';
    END IF;
  END IF;

  -- Derive org_id from NEW.app_id first because
  -- force_valid_owner_org_app_versions runs after this trigger.
  SELECT apps.owner_org INTO org_id
  FROM public.apps
  WHERE apps.app_id = NEW.app_id;

  IF org_id IS NULL THEN
    org_id := NEW.owner_org;
  END IF;

  -- If org not found, allow the existing foreign-key/owner checks to fail.
  IF org_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT enforce_encrypted_bundles, required_encryption_key
  INTO org_enforcing, org_required_key
  FROM public.orgs
  WHERE id = org_id;

  IF org_enforcing IS NULL OR org_enforcing = false THEN
    RETURN NEW;
  END IF;

  bundle_is_encrypted := public.is_bundle_encrypted(NEW.session_key);
  bundle_key_id := NULLIF(btrim(NEW.key_id), '')::varchar(20);

  IF NOT bundle_is_encrypted THEN
    PERFORM public.pg_log('deny: ORG_REQUIRES_ENCRYPTED_BUNDLES_TRIGGER',
      jsonb_build_object(
        'org_id', org_id,
        'app_id', NEW.app_id,
        'version_name', NEW.name,
        'user_id', NEW.user_id,
        'reason', 'not_encrypted'
      ));
    RAISE EXCEPTION '%',
      'encryption_required: This organization requires all bundles to be '
      || 'encrypted. Please upload an encrypted bundle with a session_key.';
  END IF;

  IF org_required_key IS NOT NULL AND org_required_key <> '' THEN
    IF bundle_key_id IS NULL THEN
      PERFORM public.pg_log('deny: ORG_REQUIRES_SPECIFIC_ENCRYPTION_KEY_TRIGGER',
        jsonb_build_object(
          'org_id', org_id,
          'app_id', NEW.app_id,
          'version_name', NEW.name,
          'user_id', NEW.user_id,
          'required_key', org_required_key,
          'bundle_key_id', bundle_key_id,
          'reason', 'missing_key_id'
        ));
      RAISE EXCEPTION '%',
        'encryption_key_required: This organization requires bundles to be '
        || 'encrypted with a specific key. The uploaded bundle does not have '
        || 'a key_id.';
    END IF;

    -- key_id is 20 chars and required_encryption_key may be 20 or 21 chars.
    IF NOT (
      bundle_key_id = LEFT(org_required_key, 20)
      OR LEFT(bundle_key_id, LENGTH(org_required_key)) = org_required_key
    ) THEN
      PERFORM public.pg_log('deny: ORG_REQUIRES_SPECIFIC_ENCRYPTION_KEY_TRIGGER',
        jsonb_build_object(
          'org_id', org_id,
          'app_id', NEW.app_id,
          'version_name', NEW.name,
          'user_id', NEW.user_id,
          'required_key', org_required_key,
          'bundle_key_id', bundle_key_id,
          'reason', 'key_mismatch'
        ));
      RAISE EXCEPTION '%',
        'encryption_key_mismatch: This organization requires bundles to be '
        || 'encrypted with a specific key. The uploaded bundle was encrypted '
        || 'with a different key.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_encrypted_bundle_on_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_if_org_can_exist"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  DELETE FROM public.orgs
  WHERE orgs.id = OLD.org_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.role_bindings rb
      JOIN public.roles r ON r.id = rb.role_id
        AND r.scope_type = rb.scope_type
      WHERE rb.principal_type = public.rbac_principal_user()
        AND rb.principal_id <> OLD.user_id
        AND rb.scope_type = public.rbac_scope_org()
        AND rb.org_id = OLD.org_id
        AND (rb.expires_at IS NULL OR rb.expires_at > now())
        AND r.name = public.rbac_role_org_super_admin()
    );

  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."check_if_org_can_exist"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_org_encrypted_bundle_enforcement"("org_id" "uuid", "session_key" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  org_enforcing boolean;
  is_encrypted boolean;
BEGIN
  -- Check if org exists and get enforcement setting
  SELECT enforce_encrypted_bundles INTO org_enforcing
  FROM public.orgs
  WHERE id = check_org_encrypted_bundle_enforcement.org_id;

  IF NOT FOUND THEN
    RETURN true; -- Org not found, allow (will fail on other checks)
  END IF;

  -- If org doesn't enforce encrypted bundles, allow
  IF org_enforcing = false THEN
    RETURN true;
  END IF;

  -- Check if this bundle is encrypted
  is_encrypted := public.is_bundle_encrypted(session_key);

  IF NOT is_encrypted THEN
    PERFORM public.pg_log('deny: ORG_REQUIRES_ENCRYPTED_BUNDLES',
      jsonb_build_object('org_id', org_id));
    RETURN false;
  END IF;

  RETURN true;
END;
$$;


ALTER FUNCTION "public"."check_org_encrypted_bundle_enforcement"("org_id" "uuid", "session_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_org_hashed_key_enforcement"("org_id" "uuid", "apikey_row" "public"."apikeys") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  org_enforcing boolean;
  is_hashed_key boolean;
BEGIN
  -- Check if org exists and get enforcement setting
  SELECT enforce_hashed_api_keys INTO org_enforcing
  FROM public.orgs
  WHERE id = check_org_hashed_key_enforcement.org_id;

  IF NOT FOUND THEN
    RETURN true; -- Org not found, allow (will fail on other checks)
  END IF;

  -- If org doesn't enforce hashed keys, allow
  IF org_enforcing = false THEN
    RETURN true;
  END IF;

  -- Check if this is a hashed key (key is null, key_hash is not null)
  is_hashed_key := (apikey_row.key IS NULL AND apikey_row.key_hash IS NOT NULL);

  IF NOT is_hashed_key THEN
    PERFORM public.pg_log('deny: ORG_REQUIRES_HASHED_API_KEY',
      jsonb_build_object('org_id', org_id, 'apikey_id', apikey_row.id));
    RETURN false;
  END IF;

  RETURN true;
END;
$$;


ALTER FUNCTION "public"."check_org_hashed_key_enforcement"("org_id" "uuid", "apikey_row" "public"."apikeys") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_org_members_2fa_enabled"("org_id" "uuid") RETURNS TABLE("user_id" "uuid", "2fa_enabled" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE public.orgs.id = check_org_members_2fa_enabled.org_id) THEN
    RAISE EXCEPTION 'Organization does not exist';
  END IF;

  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(
      public.rbac_perm_org_update_settings(),
      check_org_members_2fa_enabled.org_id,
      NULL::character varying,
      NULL::bigint
    )
  THEN
    RAISE EXCEPTION 'NO_RIGHTS';
  END IF;

  RETURN QUERY
  SELECT DISTINCT
    rb.principal_id AS user_id,
    COALESCE(public.has_2fa_enabled(rb.principal_id), false) AS "2fa_enabled"
  FROM public.role_bindings rb
  JOIN public.roles r ON r.id = rb.role_id
    AND r.scope_type = rb.scope_type
  WHERE rb.principal_type = public.rbac_principal_user()
    AND rb.scope_type = public.rbac_scope_org()
    AND rb.org_id = check_org_members_2fa_enabled.org_id
    AND (rb.expires_at IS NULL OR rb.expires_at > now())
    AND r.name LIKE 'org_%';
END;
$$;


ALTER FUNCTION "public"."check_org_members_2fa_enabled"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_org_members_password_policy"("org_id" "uuid") RETURNS TABLE("user_id" "uuid", "email" "text", "first_name" "text", "last_name" "text", "password_policy_compliant" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(
      public.rbac_perm_org_update_settings(),
      check_org_members_password_policy.org_id,
      NULL::character varying,
      NULL::bigint
    )
  THEN
    RAISE EXCEPTION 'NO_RIGHTS';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.orgs
    WHERE public.orgs.id = check_org_members_password_policy.org_id
  ) THEN
    RAISE EXCEPTION 'Organization does not exist';
  END IF;

  RETURN QUERY
  SELECT DISTINCT
    rb.principal_id AS user_id,
    au.email::text,
    u.first_name::text,
    u.last_name::text,
    public.user_meets_password_policy(rb.principal_id, check_org_members_password_policy.org_id) AS password_policy_compliant
  FROM public.role_bindings rb
  JOIN public.roles r ON r.id = rb.role_id
    AND r.scope_type = rb.scope_type
  JOIN auth.users au ON au.id = rb.principal_id
  LEFT JOIN public.users u ON u.id = rb.principal_id
  WHERE rb.principal_type = public.rbac_principal_user()
    AND rb.scope_type = public.rbac_scope_org()
    AND rb.org_id = check_org_members_password_policy.org_id
    AND (rb.expires_at IS NULL OR rb.expires_at > now())
    AND r.name LIKE 'org_%';
END;
$$;


ALTER FUNCTION "public"."check_org_members_password_policy"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_org_user_privileges"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_actor_id uuid;
  v_api_key_text text;
  v_api_key public.apikeys%ROWTYPE;
  v_principal_type text;
  v_principal_id uuid;
  v_target_role_priority integer;
  v_caller_max_priority integer := 0;
BEGIN
  IF public.is_internal_request_role(public.current_request_role()) THEN
    RETURN NEW;
  END IF;

  IF pg_trigger_depth() > 1
    AND current_setting('capgo.org_creation_bootstrap_org_id', true) = NEW.org_id::text
    AND EXISTS (
      SELECT 1
      FROM public.orgs
      WHERE orgs.id = NEW.org_id
        AND orgs.created_by = NEW.user_id
    )
  THEN
    RETURN NEW;
  END IF;

  v_actor_id := public.request_actor_user_id();

  IF TG_OP = 'UPDATE'
    AND (
      NEW.org_id IS DISTINCT FROM OLD.org_id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
    )
  THEN
    PERFORM public.pg_log(
      'deny: ORG_USER_MEMBERSHIP_MOVE',
      pg_catalog.jsonb_build_object('org_id', NEW.org_id, 'uid', v_actor_id)
    );
    RAISE EXCEPTION 'Admins cannot move org memberships!';
  END IF;

  SELECT roles.priority_rank
  INTO v_target_role_priority
  FROM public.roles
  WHERE roles.name = NEW.rbac_role_name
    AND roles.scope_type = public.rbac_scope_org()
    AND roles.is_assignable IS TRUE
  LIMIT 1;

  IF v_target_role_priority IS NULL THEN
    PERFORM public.pg_log(
      'deny: ORG_USER_ROLE_UNKNOWN',
      pg_catalog.jsonb_build_object('org_id', NEW.org_id, 'uid', v_actor_id, 'role', NEW.rbac_role_name)
    );
    RAISE EXCEPTION 'Admins cannot assign this role!';
  END IF;

  IF v_actor_id IS NULL
    OR NOT public.rbac_check_permission_request(
      public.rbac_perm_org_update_user_roles(),
      NEW.org_id,
      NULL::character varying,
      NULL::bigint
    )
  THEN
    PERFORM public.pg_log(
      'deny: ORG_USER_ROLE_UPDATE',
      pg_catalog.jsonb_build_object('org_id', NEW.org_id, 'uid', v_actor_id)
    );
    RAISE EXCEPTION 'Admins cannot elevate privileges!';
  END IF;

  v_api_key_text := public.get_apikey_header();
  IF v_api_key_text IS NOT NULL THEN
    SELECT *
    INTO v_api_key
    FROM public.find_apikey_by_value(v_api_key_text)
    LIMIT 1;

    IF v_api_key.id IS NULL OR public.is_apikey_expired(v_api_key.expires_at) THEN
      PERFORM public.pg_log(
        'deny: ORG_USER_ROLE_INVALID_API_KEY',
        pg_catalog.jsonb_build_object('org_id', NEW.org_id, 'uid', v_actor_id)
      );
      RAISE EXCEPTION 'Admins cannot elevate privileges!';
    END IF;

    v_principal_type := public.rbac_principal_apikey();
    v_principal_id := v_api_key.rbac_id;
  ELSE
    v_principal_type := public.rbac_principal_user();
    v_principal_id := v_actor_id;
  END IF;

  IF v_principal_id IS NULL THEN
    PERFORM public.pg_log(
      'deny: ORG_USER_ROLE_MISSING_PRINCIPAL',
      pg_catalog.jsonb_build_object('org_id', NEW.org_id, 'uid', v_actor_id)
    );
    RAISE EXCEPTION 'Admins cannot elevate privileges!';
  END IF;

  IF v_principal_type = public.rbac_principal_apikey() THEN
    SELECT COALESCE(pg_catalog.MAX(roles.priority_rank), 0)
    INTO v_caller_max_priority
    FROM public.role_bindings
    JOIN public.roles
      ON roles.id = role_bindings.role_id
      AND roles.scope_type = role_bindings.scope_type
    WHERE role_bindings.principal_type = public.rbac_principal_apikey()
      AND role_bindings.principal_id = v_principal_id
      AND role_bindings.org_id = NEW.org_id
      AND (
        role_bindings.expires_at IS NULL
        OR role_bindings.expires_at > pg_catalog.now()
      );
  ELSE
    SELECT COALESCE(pg_catalog.MAX(roles.priority_rank), 0)
    INTO v_caller_max_priority
    FROM (
      SELECT role_bindings.role_id, role_bindings.scope_type
      FROM public.role_bindings
      WHERE role_bindings.principal_type = public.rbac_principal_user()
        AND role_bindings.principal_id = v_principal_id
        AND role_bindings.org_id = NEW.org_id
        AND (
          role_bindings.expires_at IS NULL
          OR role_bindings.expires_at > pg_catalog.now()
        )

      UNION ALL

      SELECT role_bindings.role_id, role_bindings.scope_type
      FROM public.group_members
      JOIN public.groups
        ON groups.id = group_members.group_id
        AND groups.org_id = NEW.org_id
      JOIN public.role_bindings
        ON role_bindings.principal_type = public.rbac_principal_group()
        AND role_bindings.principal_id = group_members.group_id
        AND role_bindings.org_id = groups.org_id
      WHERE group_members.user_id = v_principal_id
        AND (
          role_bindings.expires_at IS NULL
          OR role_bindings.expires_at > pg_catalog.now()
        )
    ) active_caller_bindings
    JOIN public.roles
      ON roles.id = active_caller_bindings.role_id
      AND roles.scope_type = active_caller_bindings.scope_type;
  END IF;

  IF v_caller_max_priority < v_target_role_priority THEN
    PERFORM public.pg_log(
      'deny: ORG_USER_ROLE_PRIORITY_ESCALATION',
      pg_catalog.jsonb_build_object(
        'org_id',
        NEW.org_id,
        'uid',
        v_actor_id,
        'role',
        NEW.rbac_role_name,
        'caller_max_priority',
        v_caller_max_priority,
        'target_role_priority',
        v_target_role_priority
      )
    );
    RAISE EXCEPTION 'Admins cannot elevate privileges!';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_org_user_privileges"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_revert_to_builtin_version"("appid" character varying) RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  PERFORM appid;
  RETURN NULL::integer;
END;
$$;


ALTER FUNCTION "public"."check_revert_to_builtin_version"("appid" character varying) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."check_revert_to_builtin_version"("appid" character varying) IS 'Legacy RPC kept for older clients. Native/builtin channel targets are represented by channels.version = NULL and this function must not recreate app_versions rows.';



CREATE OR REPLACE FUNCTION "public"."claim_legacy_onboarding_demo_data"("p_app_uuid" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_app_id text;
  v_owner_org uuid;
  v_can_claim_full_seed boolean := false;
BEGIN
  SELECT "app_id", "owner_org"
  INTO v_app_id, v_owner_org
  FROM "public"."apps"
  WHERE "id" = p_app_uuid
    AND "need_onboarding" IS TRUE;

  IF v_app_id IS NULL THEN
    RETURN;
  END IF;

  -- Legacy demo rows created before this provenance table had no durable owner
  -- marker. Only claim rows with hard demo storage/build markers. Names alone
  -- are not enough because customers can create normal 1.0.0/production rows.
  INSERT INTO "public"."onboarding_demo_data" (
    "app_id",
    "owner_org",
    "relation_name",
    "row_key",
    "seed_id"
  )
  SELECT
    v_app_id,
    v_owner_org,
    'manifest',
    m."id"::text,
    p_app_uuid
  FROM "public"."manifest" m
  INNER JOIN "public"."app_versions" av
    ON av."id" = m."app_version_id"
  WHERE av."app_id" = v_app_id
    AND m."s3_path" LIKE ('demo/' || v_app_id || '/%')
  ON CONFLICT ("app_id", "relation_name", "row_key") DO UPDATE
  SET
    "owner_org" = EXCLUDED."owner_org",
    "seed_id" = EXCLUDED."seed_id",
    "created_at" = "now"();

  INSERT INTO "public"."onboarding_demo_data" (
    "app_id",
    "owner_org",
    "relation_name",
    "row_key",
    "seed_id"
  )
  SELECT
    v_app_id,
    v_owner_org,
    'build_requests',
    br."id"::text,
    p_app_uuid
  FROM "public"."build_requests" br
  WHERE br."app_id" = v_app_id
    AND br."upload_session_key" LIKE 'demo-session-%'
    AND br."upload_path" LIKE ('builds/' || v_app_id || '/%')
    AND br."upload_url" LIKE ('https://demo-builds.example.com/' || v_app_id || '/%')
    AND COALESCE(br."build_config"->>'bundleId', '') = v_app_id
    AND (
      br."builder_job_id" LIKE 'demo-job-%'
      OR br."builder_job_id" IS NULL
    )
  ON CONFLICT ("app_id", "relation_name", "row_key") DO UPDATE
  SET
    "owner_org" = EXCLUDED."owner_org",
    "seed_id" = EXCLUDED."seed_id",
    "created_at" = "now"();

  SELECT
    EXISTS (
      SELECT 1
      FROM "public"."manifest" m
      INNER JOIN "public"."app_versions" av
        ON av."id" = m."app_version_id"
      WHERE av."app_id" = v_app_id
        AND m."s3_path" LIKE ('demo/' || v_app_id || '/%')
    )
    AND EXISTS (
      SELECT 1
      FROM "public"."build_requests" br
      WHERE br."app_id" = v_app_id
        AND br."upload_session_key" LIKE 'demo-session-%'
        AND br."upload_url" LIKE ('https://demo-builds.example.com/' || v_app_id || '/%')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "public"."app_versions" av
      WHERE av."app_id" = v_app_id
        AND av."name" NOT IN ('unknown', 'builtin', '1.0.0', '1.0.1', '1.1.0', '1.1.1', '1.2.0')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "public"."manifest" m
      INNER JOIN "public"."app_versions" av
        ON av."id" = m."app_version_id"
      WHERE av."app_id" = v_app_id
        AND m."s3_path" NOT LIKE ('demo/' || v_app_id || '/%')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "public"."channels" c
      INNER JOIN "public"."app_versions" av
        ON av."id" = c."version"
      WHERE c."app_id" = v_app_id
        AND NOT (
          c."disable_auto_update_under_native" IS TRUE
          AND c."disable_auto_update" = 'major'::"public"."disable_update"
          AND c."ios" IS TRUE
          AND c."android" IS TRUE
          AND c."electron" IS TRUE
          AND c."allow_emulator" IS TRUE
          AND c."allow_device" IS TRUE
          AND c."allow_prod" IS TRUE
          AND (
            (
              c."name" = 'production'
              AND c."public" IS TRUE
              AND c."allow_device_self_set" IS FALSE
              AND c."allow_dev" IS FALSE
              AND av."name" = '1.1.1'
            )
            OR (
              c."name" = 'development'
              AND c."public" IS FALSE
              AND c."allow_device_self_set" IS FALSE
              AND c."allow_dev" IS TRUE
              AND av."name" = '1.2.0'
            )
            OR (
              c."name" = 'pr-123'
              AND c."public" IS FALSE
              AND c."allow_device_self_set" IS TRUE
              AND c."allow_dev" IS TRUE
              AND av."name" = '1.2.0'
            )
          )
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "public"."channel_devices" cd
      WHERE cd."app_id" = v_app_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "public"."devices" d
      WHERE d."app_id" = v_app_id
        AND NOT (
          d."plugin_version" = '6.0.0'
          AND d."version_name" = '1.1.1'
          AND COALESCE(d."version_build", '') = '1'
          AND d."platform" IN ('ios'::"public"."platform_os", 'android'::"public"."platform_os")
          AND COALESCE(d."os_version", '') IN ('17.0', '14')
          AND COALESCE(d."is_prod", false) IS TRUE
          AND COALESCE(d."is_emulator", true) IS FALSE
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "public"."build_requests" br
      WHERE br."app_id" = v_app_id
        AND NOT (
          br."upload_session_key" LIKE 'demo-session-%'
          AND br."upload_path" LIKE ('builds/' || v_app_id || '/%')
          AND br."upload_url" LIKE ('https://demo-builds.example.com/' || v_app_id || '/%')
          AND COALESCE(br."build_config"->>'bundleId', '') = v_app_id
          AND (
            br."builder_job_id" LIKE 'demo-job-%'
            OR br."builder_job_id" IS NULL
          )
        )
    )
    AND NOT EXISTS (
      WITH expected_deploys AS (
        SELECT *
        FROM (VALUES
          ('production'::text, '1.0.0'::text),
          ('development'::text, '1.0.1'::text),
          ('production'::text, '1.0.1'::text),
          ('development'::text, '1.1.0'::text),
          ('production'::text, '1.1.0'::text),
          ('development'::text, '1.1.1'::text),
          ('production'::text, '1.1.1'::text),
          ('pr-123'::text, '1.2.0'::text),
          ('development'::text, '1.2.0'::text)
        ) AS expected("channel_name", "version_name")
      )
      SELECT 1
      FROM "public"."deploy_history" dh
      INNER JOIN "public"."channels" c
        ON c."id" = dh."channel_id"
      INNER JOIN "public"."app_versions" av
        ON av."id" = dh."version_id"
      WHERE dh."app_id" = v_app_id
        AND NOT EXISTS (
          SELECT 1
          FROM expected_deploys expected
          WHERE expected."channel_name" = c."name"
            AND expected."version_name" = av."name"
        )
    )
  INTO v_can_claim_full_seed;

  IF NOT v_can_claim_full_seed THEN
    RETURN;
  END IF;

  INSERT INTO "public"."onboarding_demo_data" (
    "app_id",
    "owner_org",
    "relation_name",
    "row_key",
    "seed_id"
  )
  SELECT
    v_app_id,
    v_owner_org,
    'app_versions',
    av."id"::text,
    p_app_uuid
  FROM "public"."app_versions" av
  WHERE av."app_id" = v_app_id
    AND av."name" IN ('1.0.0', '1.0.1', '1.1.0', '1.1.1', '1.2.0')
  ON CONFLICT ("app_id", "relation_name", "row_key") DO UPDATE
  SET
    "owner_org" = EXCLUDED."owner_org",
    "seed_id" = EXCLUDED."seed_id",
    "created_at" = "now"();

  INSERT INTO "public"."onboarding_demo_data" (
    "app_id",
    "owner_org",
    "relation_name",
    "row_key",
    "seed_id"
  )
  SELECT
    v_app_id,
    v_owner_org,
    'app_versions_meta',
    avm."id"::text,
    p_app_uuid
  FROM "public"."app_versions_meta" avm
  INNER JOIN "public"."app_versions" av
    ON av."id" = avm."id"
  WHERE av."app_id" = v_app_id
    AND av."name" IN ('1.0.0', '1.0.1', '1.1.0', '1.1.1', '1.2.0')
  ON CONFLICT ("app_id", "relation_name", "row_key") DO UPDATE
  SET
    "owner_org" = EXCLUDED."owner_org",
    "seed_id" = EXCLUDED."seed_id",
    "created_at" = "now"();

  INSERT INTO "public"."onboarding_demo_data" (
    "app_id",
    "owner_org",
    "relation_name",
    "row_key",
    "seed_id"
  )
  SELECT
    v_app_id,
    v_owner_org,
    'channels',
    c."id"::text,
    p_app_uuid
  FROM "public"."channels" c
  WHERE c."app_id" = v_app_id
    AND c."name" IN ('production', 'development', 'pr-123')
  ON CONFLICT ("app_id", "relation_name", "row_key") DO UPDATE
  SET
    "owner_org" = EXCLUDED."owner_org",
    "seed_id" = EXCLUDED."seed_id",
    "created_at" = "now"();

  INSERT INTO "public"."onboarding_demo_data" (
    "app_id",
    "owner_org",
    "relation_name",
    "row_key",
    "seed_id"
  )
  SELECT
    v_app_id,
    v_owner_org,
    'deploy_history',
    dh."id"::text,
    p_app_uuid
  FROM "public"."deploy_history" dh
  WHERE dh."app_id" = v_app_id
  ON CONFLICT ("app_id", "relation_name", "row_key") DO UPDATE
  SET
    "owner_org" = EXCLUDED."owner_org",
    "seed_id" = EXCLUDED."seed_id",
    "created_at" = "now"();

  INSERT INTO "public"."onboarding_demo_data" (
    "app_id",
    "owner_org",
    "relation_name",
    "row_key",
    "seed_id"
  )
  SELECT
    v_app_id,
    v_owner_org,
    'devices',
    d."id"::text,
    p_app_uuid
  FROM "public"."devices" d
  WHERE d."app_id" = v_app_id
  ON CONFLICT ("app_id", "relation_name", "row_key") DO UPDATE
  SET
    "owner_org" = EXCLUDED."owner_org",
    "seed_id" = EXCLUDED."seed_id",
    "created_at" = "now"();
END;
$$;


ALTER FUNCTION "public"."claim_legacy_onboarding_demo_data"("p_app_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_apikey_role_bindings"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  DELETE FROM public.role_bindings
  WHERE principal_type = public.rbac_principal_apikey()
    AND principal_id = OLD.rbac_id;

  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."cleanup_apikey_role_bindings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_expired_apikeys"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  DELETE FROM "public"."apikeys"
  WHERE expires_at IS NOT NULL
    AND expires_at < NOW() - INTERVAL '30 days';
END;
$$;


ALTER FUNCTION "public"."cleanup_expired_apikeys"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_expired_demo_apps"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  deleted_count integer;
BEGIN
  WITH deleted_apps AS (
    DELETE FROM public.apps
    WHERE need_onboarding IS TRUE
      AND created_at < now() - interval '14 days'
      AND public.has_seeded_demo_data(app_id)
    RETURNING owner_org
  ),
  evicted_cache AS (
    DELETE FROM public.app_metrics_cache
    WHERE org_id IN (
      SELECT DISTINCT owner_org
      FROM deleted_apps
      WHERE owner_org IS NOT NULL
    )
  )
  SELECT COUNT(*)::integer
  INTO deleted_count
  FROM deleted_apps;

  RAISE NOTICE 'cleanup_expired_demo_apps: Deleted % expired demo apps', deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_expired_demo_apps"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_frequent_job_details"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    DELETE FROM cron.job_run_details
    WHERE job_pid IN (
        SELECT jobid
        FROM cron.job
        WHERE schedule = '5 seconds' OR schedule = '1 seconds' OR schedule = '10 seconds'
    )
    AND end_time < NOW() - interval '1 hour';
END;
$$;


ALTER FUNCTION "public"."cleanup_frequent_job_details"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_job_run_details_7days"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  DELETE FROM cron.job_run_details WHERE end_time < NOW() - interval '7 days';
END;
$$;


ALTER FUNCTION "public"."cleanup_job_run_details_7days"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_old_audit_logs"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  DELETE FROM "public"."audit_logs"
  WHERE created_at < pg_catalog.now() - INTERVAL '90 days';
END;
$$;


ALTER FUNCTION "public"."cleanup_old_audit_logs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_old_channel_devices"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
    deleted_count bigint;
    purged_count bigint;
BEGIN
    -- Disable triggers on channel_devices to avoid unnecessary queue operations during bulk cleanup
    -- This prevents the enqueue_channel_device_counts trigger from firing for each deleted row
    ALTER TABLE public.channel_devices DISABLE TRIGGER channel_device_count_enqueue;

    -- Use nested block with exception handler to ensure trigger is re-enabled on any failure
    BEGIN
        -- Delete channel_devices where the last activity (updated_at or created_at) is older than 1 month
        DELETE FROM public.channel_devices
        WHERE COALESCE(updated_at, created_at) < NOW() - INTERVAL '1 month';

        GET DIAGNOSTICS deleted_count = ROW_COUNT;

        -- Re-enable triggers before any further operations
        ALTER TABLE public.channel_devices ENABLE TRIGGER channel_device_count_enqueue;

        IF deleted_count > 0 THEN
            RAISE NOTICE 'cleanup_old_channel_devices: Deleted % stale channel device entries', deleted_count;

            -- Purge any pending messages in the channel_device_counts queue before recomputing
            -- This prevents stale deltas from being applied after the full recount
            SELECT pgmq.purge_queue('channel_device_counts') INTO purged_count;
            IF purged_count > 0 THEN
                RAISE NOTICE 'cleanup_old_channel_devices: Purged % pending queue messages', purged_count;
            END IF;

            -- Recalculate channel_device_count for all apps since we bypassed the trigger
            -- This is more efficient than firing triggers for potentially thousands of rows
            UPDATE public.apps
            SET channel_device_count = COALESCE((
                SELECT COUNT(*)
                FROM public.channel_devices cd
                WHERE cd.app_id = apps.app_id
            ), 0);

            RAISE NOTICE 'cleanup_old_channel_devices: Recalculated channel_device_count for all apps';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Ensure trigger is re-enabled even on failure
        ALTER TABLE public.channel_devices ENABLE TRIGGER channel_device_count_enqueue;
        RAISE;
    END;
END;
$$;


ALTER FUNCTION "public"."cleanup_old_channel_devices"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_onboarding_app_data_on_complete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_preserve_setting text;
  v_preserve_app_version_id bigint;
BEGIN
  IF OLD.need_onboarding IS TRUE AND NEW.need_onboarding IS FALSE THEN
    v_preserve_setting := current_setting('capgo.onboarding_preserve_app_version_id', true);
    v_preserve_app_version_id := NULLIF(v_preserve_setting, '')::bigint;

    PERFORM public.clear_onboarding_app_data(NEW.id, v_preserve_app_version_id);
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."cleanup_onboarding_app_data_on_complete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_queue_messages"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
DECLARE
    queue_name text;
BEGIN
    -- Clean up messages older than 7 days FROM all queues
    FOR queue_name IN (
        SELECT q.queue_name FROM pgmq.list_queues() q
    ) LOOP
        -- Delete archived messages older than 7 days
        EXECUTE format('DELETE FROM pgmq.a_%I WHERE archived_at < $1', queue_name)
        USING (NOW() - INTERVAL '7 days')::timestamptz;

        -- Delete failed messages that have been retried more than 5 times
        EXECUTE format('DELETE FROM pgmq.q_%I WHERE read_ct > 5', queue_name);
    END LOOP;
END;
$_$;


ALTER FUNCTION "public"."cleanup_queue_messages"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_tmp_users"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  DELETE FROM "public"."tmp_users"
  WHERE GREATEST(updated_at, created_at) < NOW() - INTERVAL '7 days';
END;
$$;


ALTER FUNCTION "public"."cleanup_tmp_users"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_webhook_deliveries"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  DELETE FROM "public"."webhook_deliveries"
  WHERE "created_at" < NOW() - INTERVAL '7 days';
END;
$$;


ALTER FUNCTION "public"."cleanup_webhook_deliveries"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clear_onboarding_app_data"("p_app_uuid" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  PERFORM "public"."reset_onboarding_demo_app_data"(p_app_uuid);
END;
$$;


ALTER FUNCTION "public"."clear_onboarding_app_data"("p_app_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clear_onboarding_app_data"("p_app_uuid" "uuid", "p_preserve_app_version_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- This legacy helper used to delete broad app data. Keep the name for older
  -- callers, but make it provenance-based so completing/resetting onboarding
  -- can never wipe untracked production rows.
  PERFORM p_preserve_app_version_id;
  PERFORM "public"."reset_onboarding_demo_app_data"(p_app_uuid);
END;
$$;


ALTER FUNCTION "public"."clear_onboarding_app_data"("p_app_uuid" "uuid", "p_preserve_app_version_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cli_check_permission"("apikey" "text" DEFAULT NULL::"text", "permission_key" "text" DEFAULT NULL::"text", "org_id" "uuid" DEFAULT NULL::"uuid", "app_id" "text" DEFAULT NULL::"text", "channel_id" bigint DEFAULT NULL::bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_request_apikey text;
  v_api_key public.apikeys%ROWTYPE;
BEGIN
  IF permission_key IS NULL OR permission_key = '' THEN
    RETURN false;
  END IF;

  SELECT public.get_apikey_header() INTO v_request_apikey;

  IF v_request_apikey IS NULL OR v_request_apikey = '' THEN
    RETURN false;
  END IF;

  IF apikey IS NOT NULL AND apikey <> '' AND apikey IS DISTINCT FROM v_request_apikey THEN
    RETURN false;
  END IF;

  SELECT * INTO v_api_key
  FROM public.find_apikey_by_value(v_request_apikey)
  LIMIT 1;

  IF v_api_key.id IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.rbac_check_permission_direct(
    permission_key,
    v_api_key.user_id,
    org_id,
    app_id,
    channel_id,
    v_request_apikey
  );
END;
$$;


ALTER FUNCTION "public"."cli_check_permission"("apikey" "text", "permission_key" "text", "org_id" "uuid", "app_id" "text", "channel_id" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cli_check_permission"("apikey" "text", "permission_key" "text", "org_id" "uuid", "app_id" "text", "channel_id" bigint) IS 'CLI permission wrapper bound to the request capgkey header. The apikey argument is retained for CLI compatibility and must match the header when provided.';



CREATE OR REPLACE FUNCTION "public"."convert_bytes_to_gb"("bytes_value" double precision) RETURNS double precision
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN bytes_value / 1024.0 / 1024.0 / 1024.0;
END;
$$;


ALTER FUNCTION "public"."convert_bytes_to_gb"("bytes_value" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."convert_bytes_to_mb"("bytes_value" double precision) RETURNS double precision
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN bytes_value / 1024.0 / 1024.0;
END;
$$;


ALTER FUNCTION "public"."convert_bytes_to_mb"("bytes_value" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."convert_gb_to_bytes"("gb" double precision) RETURNS double precision
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN gb * 1024 * 1024 * 1024;
END;
$$;


ALTER FUNCTION "public"."convert_gb_to_bytes"("gb" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."convert_mb_to_bytes"("gb" double precision) RETURNS double precision
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN gb * 1024 * 1024;
END;
$$;


ALTER FUNCTION "public"."convert_mb_to_bytes"("gb" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."convert_number_to_percent"("val" double precision, "max_val" double precision) RETURNS double precision
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  percentage numeric;
BEGIN
  IF max_val = 0 THEN
    RETURN 0;
  ELSE
    percentage := ((val * 100) / max_val)::numeric;
    -- Add small epsilon for positive values to handle floating-point errors
    -- Subtract epsilon for negative values
    IF percentage >= 0 THEN
      RETURN trunc(percentage + 0.0001, 0);
    ELSE
      RETURN trunc(percentage - 0.0001, 0);
    END IF;
  END IF;
END;
$$;


ALTER FUNCTION "public"."convert_number_to_percent"("val" double precision, "max_val" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."count_active_users"("app_ids" character varying[]) RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN (
        SELECT COUNT(DISTINCT user_id)
        FROM public.apps
        WHERE app_id = ANY(app_ids)
    );
END;
$$;


ALTER FUNCTION "public"."count_active_users"("app_ids" character varying[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."count_all_need_upgrade"() RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN (SELECT COUNT(*) FROM public.stripe_info WHERE is_good_plan = false AND status = 'succeeded');
END;
$$;


ALTER FUNCTION "public"."count_all_need_upgrade"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."count_all_onboarded"() RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN (SELECT COUNT(DISTINCT owner_org) FROM public.apps);
END;
$$;


ALTER FUNCTION "public"."count_all_onboarded"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."count_all_plans_v2"() RETURNS TABLE("plan_name" character varying, "count" bigint)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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
      'Trial'::character varying AS product_name,
      si.customer_id
    FROM public.stripe_info si
    WHERE si.trial_at > NOW()
      AND si.status IS DISTINCT FROM 'succeeded'
      AND NOT EXISTS (
        SELECT 1
        FROM ActiveSubscriptions a
        WHERE a.customer_id = si.customer_id
      )
    ORDER BY si.customer_id, si.created_at DESC
  )
  SELECT
    product_name AS plan_name,
    COUNT(*) AS count
  FROM (
    SELECT product_name, customer_id FROM ActiveSubscriptions
    UNION ALL
    SELECT product_name, customer_id FROM TrialUsers
  ) all_subs
  GROUP BY product_name;
END;
$$;


ALTER FUNCTION "public"."count_all_plans_v2"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."count_non_compliant_bundles"("org_id" "uuid", "required_key" "text" DEFAULT NULL::"text") RETURNS TABLE("non_encrypted_count" bigint, "wrong_key_count" bigint, "total_non_compliant" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  non_encrypted bigint := 0;
  wrong_key bigint := 0;
  caller_user_id uuid;
BEGIN
  caller_user_id := public.request_actor_user_id();

  IF caller_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required';
  END IF;

  IF NOT public.rbac_check_permission_request(
    public.rbac_perm_org_delete(),
    count_non_compliant_bundles.org_id,
    NULL::character varying,
    NULL::bigint
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only super_admin can access this function';
  END IF;

  SELECT COUNT(*) INTO non_encrypted
  FROM public.app_versions av
  INNER JOIN public.apps a ON a.app_id = av.app_id
  WHERE a.owner_org = count_non_compliant_bundles.org_id
    AND av.deleted = false
    AND (av.session_key IS NULL OR av.session_key = '');

  IF required_key IS NOT NULL AND required_key <> '' THEN
    SELECT COUNT(*) INTO wrong_key
    FROM public.app_versions av
    INNER JOIN public.apps a ON a.app_id = av.app_id
    WHERE a.owner_org = count_non_compliant_bundles.org_id
      AND av.deleted = false
      AND av.session_key IS NOT NULL
      AND av.session_key <> ''
      AND (
        av.key_id IS NULL
        OR av.key_id = ''
        OR NOT (av.key_id = LEFT(required_key, 20) OR LEFT(av.key_id, LENGTH(required_key)) = required_key)
      );
  END IF;

  RETURN QUERY SELECT non_encrypted, wrong_key, (non_encrypted + wrong_key);
END;
$$;


ALTER FUNCTION "public"."count_non_compliant_bundles"("org_id" "uuid", "required_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_request_role"() RETURNS "text"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    NULLIF((SELECT auth.jwt() ->> 'role'), ''),
    NULLIF(current_setting('role', true), ''),
    ''
  )
$$;


ALTER FUNCTION "public"."current_request_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_accounts_marked_for_deletion"() RETURNS TABLE("deleted_count" integer, "deleted_user_ids" "uuid"[])
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  account_record record;
  org_record record;
  deleted_users uuid[] := ARRAY[]::uuid[];
  total_deleted integer := 0;
  other_super_admins_count integer;
  replacement_owner_id uuid;
BEGIN
  FOR account_record IN
    SELECT account_id, removal_date, removed_data
    FROM public.to_delete_accounts
    WHERE removal_date < now()
  LOOP
    BEGIN
      FOR org_record IN
        SELECT
          rb.org_id,
          bool_or(r.name = public.rbac_role_org_super_admin()) AS is_super_admin
        FROM public.role_bindings rb
        JOIN public.roles r ON r.id = rb.role_id
          AND r.scope_type = rb.scope_type
        WHERE rb.principal_type = public.rbac_principal_user()
          AND rb.principal_id = account_record.account_id
          AND rb.scope_type = public.rbac_scope_org()
          AND rb.org_id IS NOT NULL
          AND (rb.expires_at IS NULL OR rb.expires_at > now())
        GROUP BY rb.org_id
      LOOP
        replacement_owner_id := NULL;

        IF org_record.is_super_admin THEN
          SELECT COUNT(*) INTO other_super_admins_count
          FROM public.role_bindings rb
          JOIN public.roles r ON r.id = rb.role_id
            AND r.scope_type = rb.scope_type
          WHERE rb.org_id = org_record.org_id
            AND rb.principal_type = public.rbac_principal_user()
            AND rb.principal_id <> account_record.account_id
            AND rb.scope_type = public.rbac_scope_org()
            AND (rb.expires_at IS NULL OR rb.expires_at > now())
            AND r.name = public.rbac_role_org_super_admin();

          IF other_super_admins_count = 0 THEN
            DELETE FROM public.deploy_history WHERE owner_org = org_record.org_id;
            DELETE FROM public.channel_devices WHERE owner_org = org_record.org_id;
            DELETE FROM public.channels WHERE owner_org = org_record.org_id;
            DELETE FROM public.app_versions WHERE owner_org = org_record.org_id;
            DELETE FROM public.apps WHERE owner_org = org_record.org_id;
            DELETE FROM public.orgs WHERE id = org_record.org_id;
            CONTINUE;
          END IF;
        END IF;

        SELECT rb.principal_id INTO replacement_owner_id
        FROM public.role_bindings rb
        JOIN public.roles r ON r.id = rb.role_id
          AND r.scope_type = rb.scope_type
        WHERE rb.org_id = org_record.org_id
          AND rb.principal_type = public.rbac_principal_user()
          AND rb.principal_id <> account_record.account_id
          AND rb.scope_type = public.rbac_scope_org()
          AND (rb.expires_at IS NULL OR rb.expires_at > now())
          AND r.name = public.rbac_role_org_super_admin()
        ORDER BY rb.granted_at ASC
        LIMIT 1;

        IF replacement_owner_id IS NOT NULL THEN
          UPDATE public.apps
          SET user_id = replacement_owner_id, updated_at = now()
          WHERE user_id = account_record.account_id AND owner_org = org_record.org_id;

          UPDATE public.app_versions
          SET user_id = replacement_owner_id, updated_at = now()
          WHERE user_id = account_record.account_id AND owner_org = org_record.org_id;

          UPDATE public.channels
          SET created_by = replacement_owner_id, updated_at = now()
          WHERE created_by = account_record.account_id AND owner_org = org_record.org_id;

          UPDATE public.deploy_history
          SET created_by = replacement_owner_id, updated_at = now()
          WHERE created_by = account_record.account_id AND owner_org = org_record.org_id;

          UPDATE public.orgs
          SET created_by = replacement_owner_id, updated_at = now()
          WHERE id = org_record.org_id AND created_by = account_record.account_id;

          UPDATE public.audit_logs
          SET user_id = replacement_owner_id
          WHERE user_id = account_record.account_id AND org_id = org_record.org_id;
        ELSE
          RAISE WARNING 'No org_super_admin found to transfer ownership in org % for user %',
            org_record.org_id, account_record.account_id;
        END IF;
      END LOOP;

      DELETE FROM public.role_bindings
      WHERE principal_type = public.rbac_principal_user()
        AND principal_id = account_record.account_id;

      DELETE FROM public.group_members WHERE user_id = account_record.account_id;
      DELETE FROM public.org_users WHERE user_id = account_record.account_id;
      DELETE FROM public.users WHERE id = account_record.account_id;
      DELETE FROM auth.users WHERE id = account_record.account_id;
      DELETE FROM public.to_delete_accounts WHERE account_id = account_record.account_id;

      deleted_users := array_append(deleted_users, account_record.account_id);
      total_deleted := total_deleted + 1;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Failed to delete account %: %', account_record.account_id, SQLERRM;
    END;
  END LOOP;

  deleted_count := total_deleted;
  deleted_user_ids := deleted_users;
  RETURN NEXT;
END;
$$;


ALTER FUNCTION "public"."delete_accounts_marked_for_deletion"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_group_with_bindings"("group_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_org_id uuid;
BEGIN
  -- Verify group exists and caller has org.update_user_roles permission.
  SELECT org_id INTO v_org_id
  FROM public.groups
  WHERE id = group_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Group not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.rbac_check_permission_direct(
    public.rbac_perm_org_update_user_roles(),
    auth.uid(),
    v_org_id,
    NULL::varchar,
    NULL::bigint
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.role_bindings
  WHERE principal_type = public.rbac_principal_group()
    AND principal_id = group_id;


  -- Clean up channel permission overrides for this group
  DELETE FROM public.channel_permission_overrides
  WHERE principal_type = public.rbac_principal_group()
    AND principal_id = group_id;
  DELETE FROM public.groups
  WHERE id = group_id;
END;
$$;


ALTER FUNCTION "public"."delete_group_with_bindings"("group_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."delete_group_with_bindings"("group_id" "uuid") IS 'Atomically deletes a group and all its role bindings. Requires org.update_user_roles permission.';



CREATE OR REPLACE FUNCTION "public"."delete_http_response"("request_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    DELETE FROM net._http_response
    WHERE id = request_id;
END;
$$;


ALTER FUNCTION "public"."delete_http_response"("request_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_non_compliant_bundles"("org_id" "uuid", "required_key" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  deleted_count bigint := 0;
  bundle_ids bigint[];
  caller_user_id uuid;
BEGIN
  caller_user_id := public.request_actor_user_id();

  IF caller_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required';
  END IF;

  IF NOT public.rbac_check_permission_request(
    public.rbac_perm_org_delete(),
    delete_non_compliant_bundles.org_id,
    NULL::character varying,
    NULL::bigint
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only super_admin can access this function';
  END IF;

  IF required_key IS NULL OR required_key = '' THEN
    SELECT ARRAY_AGG(av.id) INTO bundle_ids
    FROM public.app_versions av
    INNER JOIN public.apps a ON a.app_id = av.app_id
    WHERE a.owner_org = delete_non_compliant_bundles.org_id
      AND av.deleted = false
      AND (av.session_key IS NULL OR av.session_key = '');
  ELSE
    SELECT ARRAY_AGG(av.id) INTO bundle_ids
    FROM public.app_versions av
    INNER JOIN public.apps a ON a.app_id = av.app_id
    WHERE a.owner_org = delete_non_compliant_bundles.org_id
      AND av.deleted = false
      AND (
        (av.session_key IS NULL OR av.session_key = '')
        OR (
          av.session_key IS NOT NULL
          AND av.session_key <> ''
          AND (
            av.key_id IS NULL
            OR av.key_id = ''
            OR NOT (av.key_id = LEFT(required_key, 20) OR LEFT(av.key_id, LENGTH(required_key)) = required_key)
          )
        )
      );
  END IF;

  IF bundle_ids IS NOT NULL AND array_length(bundle_ids, 1) > 0 THEN
    UPDATE public.app_versions
    SET deleted = true
    WHERE id = ANY(bundle_ids);

    deleted_count := array_length(bundle_ids, 1);

    PERFORM public.pg_log('action: DELETED_NON_COMPLIANT_BUNDLES',
      jsonb_build_object(
        'org_id', org_id,
        'required_key', required_key,
        'deleted_count', deleted_count,
        'bundle_ids', bundle_ids,
        'caller_user_id', caller_user_id
      ));
  END IF;

  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."delete_non_compliant_bundles"("org_id" "uuid", "required_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_old_deleted_apps"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    DELETE FROM "public"."deleted_apps"
    WHERE deleted_at < NOW() - INTERVAL '35 days';
END;
$$;


ALTER FUNCTION "public"."delete_old_deleted_apps"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_old_deleted_versions"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  deleted_count bigint;
BEGIN
  DELETE FROM "public"."app_versions"
  WHERE "app_versions"."deleted" = true
    AND "app_versions"."deleted_at" IS NOT NULL
    AND "app_versions"."deleted_at" <= pg_catalog.now() - INTERVAL '90 days'
    AND "app_versions"."name" NOT IN ('builtin', 'unknown')
    AND "app_versions"."manifest_count" = 0
    AND (
      "app_versions"."r2_path" IS NULL
      OR EXISTS (
        SELECT 1
        FROM "public"."app_versions_meta"
        WHERE "app_versions_meta"."id" = "app_versions"."id"
          AND "app_versions_meta"."size" = 0
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "public"."channels"
      WHERE "channels"."version" = "app_versions"."id"
    );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count > 0 THEN
    RAISE NOTICE 'delete_old_deleted_versions: permanently deleted % app versions', deleted_count;
  END IF;
END;
$$;


ALTER FUNCTION "public"."delete_old_deleted_versions"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."delete_old_deleted_versions"() IS 'Permanently deletes app_versions that have been soft-deleted for at least 90 days after storage cleanup is reflected in app_versions_meta and app_versions.manifest_count.';



CREATE OR REPLACE FUNCTION "public"."delete_org_member_role"("p_org_id" "uuid", "p_user_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_org_created_by uuid;
BEGIN
  -- Check if user has permission to update roles
  IF NOT public.rbac_check_permission_direct(public.rbac_perm_org_update_user_roles(), auth.uid(), p_org_id, NULL, NULL) THEN
    RAISE EXCEPTION 'NO_PERMISSION_TO_UPDATE_ROLES';
  END IF;

  -- Get org owner to prevent removing the last super admin
  SELECT created_by INTO v_org_created_by
  FROM public.orgs
  WHERE id = p_org_id;

  -- Prevent removing the org owner
  IF p_user_id = v_org_created_by THEN
    RAISE EXCEPTION 'CANNOT_CHANGE_OWNER_ROLE';
  END IF;

  -- Check if removing a super_admin and if this is the last super_admin
  IF EXISTS (
    SELECT 1
    FROM public.role_bindings rb
    INNER JOIN public.roles r ON rb.role_id = r.id
    WHERE rb.principal_id = p_user_id
      AND rb.principal_type = public.rbac_principal_user()
      AND rb.scope_type = public.rbac_scope_org()
      AND rb.org_id = p_org_id
      AND r.name = public.rbac_role_org_super_admin()
  ) THEN
    IF (
      SELECT COUNT(*)
      FROM public.role_bindings rb
      INNER JOIN public.roles r ON rb.role_id = r.id
      WHERE rb.scope_type = public.rbac_scope_org()
        AND rb.org_id = p_org_id
        AND rb.principal_type = public.rbac_principal_user()
        AND r.name = public.rbac_role_org_super_admin()
    ) <= 1 THEN
      RAISE EXCEPTION 'CANNOT_REMOVE_LAST_SUPER_ADMIN';
    END IF;
  END IF;

  -- Delete ALL role bindings for this user in this org (org, app, and channel scopes)
  -- to prevent orphaned app/channel bindings after org-level removal
  DELETE FROM public.role_bindings
  WHERE principal_id = p_user_id
    AND principal_type = public.rbac_principal_user()
    AND org_id = p_org_id;

  RETURN 'OK';
END;
$$;


ALTER FUNCTION "public"."delete_org_member_role"("p_org_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."delete_org_member_role"("p_org_id" "uuid", "p_user_id" "uuid") IS 'Deletes all of an organization member''s role bindings (org, app, and channel scopes). Requires org.update_user_roles permission. Returns OK on success.';



CREATE OR REPLACE FUNCTION "public"."delete_user"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  user_id_fn uuid;
  user_email text;
  old_record_json jsonb;
  last_sign_in_at_ts timestamptz;
  did_schedule integer;
BEGIN
  SELECT "auth"."uid"() INTO user_id_fn;
  IF user_id_fn IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT "email", "last_sign_in_at"
  INTO user_email, last_sign_in_at_ts
  FROM "auth"."users"
  WHERE "id" = user_id_fn;

  -- Require proof of email ownership from the custom email OTP flow rather than
  -- relying on Supabase auth email_confirmed_at, which may be auto-populated.
  IF NOT "public"."is_recent_email_otp_verified"(user_id_fn) THEN
    RAISE EXCEPTION 'email_not_verified' USING ERRCODE = 'P0003';
  END IF;

  IF last_sign_in_at_ts IS NULL OR last_sign_in_at_ts < NOW() - INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'reauth_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT row_to_json(u)::jsonb INTO old_record_json
  FROM (
    SELECT *
    FROM "public"."users"
    WHERE id = user_id_fn
  ) AS u;

  IF old_record_json IS NULL THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO "public"."to_delete_accounts" (
    "account_id",
    "removal_date",
    "removed_data"
  ) VALUES
  (
    user_id_fn,
    NOW() + INTERVAL '30 days',
    "jsonb_build_object"('email', user_email, 'apikeys', COALESCE((SELECT "jsonb_agg"("to_jsonb"(a.*)) FROM "public"."apikeys" a WHERE a."user_id" = user_id_fn), '[]'::jsonb))
  )
  ON CONFLICT ("account_id") DO NOTHING
  RETURNING 1 INTO did_schedule;

  IF did_schedule IS NULL THEN
    RETURN;
  END IF;

  PERFORM "pgmq"."send"(
    'on_user_delete'::text,
    "jsonb_build_object"(
      'payload', "jsonb_build_object"(
        'old_record', old_record_json,
        'table', 'users',
        'type', 'DELETE'
      ),
      'function_name', 'on_user_delete'
    )
  );

  DELETE FROM "public"."apikeys" WHERE "public"."apikeys"."user_id" = user_id_fn;
END;
$$;


ALTER FUNCTION "public"."delete_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_apikey_expiration_policy"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  scoped_org record;
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.expires_at IS NOT DISTINCT FROM OLD.expires_at THEN
    RETURN NEW;
  END IF;

  FOR scoped_org IN
    SELECT DISTINCT
      public.orgs.id,
      public.orgs.require_apikey_expiration,
      public.orgs.max_apikey_expiration_days
    FROM public.role_bindings
    JOIN public.orgs ON public.orgs.id = public.role_bindings.org_id
    WHERE public.role_bindings.principal_type = public.rbac_principal_apikey()
      AND public.role_bindings.principal_id = NEW.rbac_id
      AND public.role_bindings.org_id IS NOT NULL
  LOOP
    IF scoped_org.require_apikey_expiration AND NEW.expires_at IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'expiration_required',
        DETAIL = 'This organization requires API keys to have an expiration date';
    END IF;

    IF scoped_org.max_apikey_expiration_days IS NOT NULL
      AND NEW.expires_at IS NOT NULL
      AND NEW.expires_at > clock_timestamp() + make_interval(days => scoped_org.max_apikey_expiration_days)
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'expiration_exceeds_max',
        DETAIL = format('API key expiration cannot exceed %s days for this organization', scoped_org.max_apikey_expiration_days);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_apikey_expiration_policy"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_apikey_role_binding_expiration_policy"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  api_key_row public.apikeys%ROWTYPE;
  scoped_org record;
BEGIN
  IF NEW.principal_type <> public.rbac_principal_apikey()
    OR NEW.org_id IS NULL
    OR (NEW.expires_at IS NOT NULL AND NEW.expires_at <= now()) THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO api_key_row
  FROM public.apikeys
  WHERE public.apikeys.rbac_id = NEW.principal_id
  LIMIT 1;

  IF api_key_row.id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    public.orgs.id,
    public.orgs.require_apikey_expiration,
    public.orgs.max_apikey_expiration_days
  INTO scoped_org
  FROM public.orgs
  WHERE public.orgs.id = NEW.org_id
  LIMIT 1;

  IF scoped_org.id IS NULL THEN
    RETURN NEW;
  END IF;

  IF scoped_org.require_apikey_expiration AND api_key_row.expires_at IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'expiration_required',
      DETAIL = 'This organization requires API keys to have an expiration date';
  END IF;

  IF scoped_org.max_apikey_expiration_days IS NOT NULL
    AND api_key_row.expires_at IS NOT NULL
    AND api_key_row.expires_at > clock_timestamp() + make_interval(days => scoped_org.max_apikey_expiration_days)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'expiration_exceeds_max',
      DETAIL = format('API key expiration cannot exceed %s days for this organization', scoped_org.max_apikey_expiration_days);
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_apikey_role_binding_expiration_policy"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_channel_version_promotion_permission"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_request_role text := COALESCE(auth.role(), session_user);
BEGIN
  IF NEW.version IS NOT DISTINCT FROM OLD.version THEN
    RETURN NEW;
  END IF;

  IF v_request_role IN ('service_role', 'postgres') THEN
    RETURN NEW;
  END IF;

  IF v_request_role IS DISTINCT FROM 'anon' AND v_request_role IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'PERMISSION_DENIED_CHANNEL_PROMOTE_BUNDLE'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.rbac_check_permission_request(
    public.rbac_perm_channel_promote_bundle(),
    OLD.owner_org,
    OLD.app_id,
    OLD.id
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED_CHANNEL_PROMOTE_BUNDLE'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_channel_version_promotion_permission"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_email_otp_for_mfa"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  otp_ok boolean;
  enforced_at timestamptz;
  user_created_at timestamptz;
BEGIN
  enforced_at := public.get_mfa_email_otp_enforced_at();

  IF enforced_at IS NOT NULL THEN
    SELECT auth.users.created_at
    INTO user_created_at
    FROM auth.users
    WHERE auth.users.id = NEW.user_id;

    IF user_created_at IS NOT NULL AND user_created_at < enforced_at THEN
      RETURN NEW;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    otp_ok := public.is_recent_email_otp_verified(NEW.user_id);
    IF NOT otp_ok THEN
      RAISE EXCEPTION 'email otp verification required for mfa enrollment';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND (NEW.status IS DISTINCT FROM OLD.status)
    AND NEW.status = 'verified' THEN
    otp_ok := public.is_recent_email_otp_verified(NEW.user_id);
    IF NOT otp_ok THEN
      RAISE EXCEPTION 'email otp verification required for mfa enrollment';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_email_otp_for_mfa"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_role_binding_role_scope"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  v_role_scope_type text;
BEGIN
  SELECT r.scope_type
  INTO v_role_scope_type
  FROM public.roles r
  WHERE r.id = NEW.role_id
  LIMIT 1;

  IF v_role_scope_type IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_role_scope_type <> NEW.scope_type THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ROLE_SCOPE_MISMATCH';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_role_binding_role_scope"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."enforce_role_binding_role_scope"() IS 'Rejects role_bindings writes where the bound role family does not match the binding scope_type.';



CREATE OR REPLACE FUNCTION "public"."enqueue_channel_device_counts"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_delta integer;
  v_app_id text;
  v_owner uuid;
  v_device text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_delta := 1;
    v_app_id := NEW.app_id;
    v_owner := NEW.owner_org;
    v_device := NEW.device_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_delta := -1;
    v_app_id := OLD.app_id;
    v_owner := OLD.owner_org;
    v_device := OLD.device_id;
  ELSE
    RETURN NEW;
  END IF;

  PERFORM pgmq.send(
    'channel_device_counts',
    jsonb_build_object(
      'app_id', v_app_id,
      'owner_org', v_owner,
      'device_id', v_device,
      'delta', v_delta
    )
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."enqueue_channel_device_counts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_credit_usage_alert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_total numeric := 0;
  v_available numeric := 0;
  v_available_before numeric := 0;
  v_percent_after numeric := 0;
  v_percent_before numeric := 0;
  v_threshold integer;
  v_alert_cycle integer;
  v_occurred_at timestamptz := COALESCE(NEW.occurred_at, NOW());
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF NEW.amount IS NULL OR NEW.amount >= 0 THEN
    RETURN NEW;
  END IF;

  SELECT
    COALESCE(total_credits, 0),
    COALESCE(available_credits, 0)
  INTO v_total, v_available
  FROM public.usage_credit_balances
  WHERE org_id = NEW.org_id;

  v_available := GREATEST(COALESCE(NEW.balance_after, v_available, 0), 0);

  IF v_total <= 0 THEN
    RETURN NEW;
  END IF;

  v_available_before := GREATEST(v_available - NEW.amount, 0);
  IF v_available_before > v_total THEN
    v_available_before := v_total;
  END IF;

  v_percent_after := LEAST(GREATEST(((v_total - v_available) / v_total) * 100, 0), 100);
  v_percent_before := LEAST(GREATEST(((v_total - v_available_before) / v_total) * 100, 0), 100);

  v_alert_cycle := (date_part('year', v_occurred_at)::int * 100) + date_part('month', v_occurred_at)::int;

  FOREACH v_threshold IN ARRAY ARRAY [50, 75, 90, 100]
  LOOP
    IF v_percent_after >= v_threshold AND v_percent_before < v_threshold THEN
      PERFORM pgmq.send(
        'credit_usage_alerts',
        jsonb_build_object(
          'function_name', 'credit_usage_alerts',
          'function_type', NULL,
          'payload', jsonb_build_object(
            'org_id', NEW.org_id,
            'threshold', v_threshold,
            'percent_used', ROUND(v_percent_after, 2),
            'total_credits', v_total,
            'available_credits', v_available,
            'alert_cycle', v_alert_cycle,
            'transaction_id', NEW.id
          )
        )
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enqueue_credit_usage_alert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."exist_app_v2"("appid" character varying) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_owner_org uuid;
BEGIN
  SELECT apps.owner_org INTO v_owner_org
  FROM public.apps
  WHERE apps.app_id = exist_app_v2.appid
  LIMIT 1;

  IF v_owner_org IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_internal_request_role(public.current_request_role()) THEN
    RETURN true;
  END IF;

  RETURN public.rbac_check_permission_request(
    public.rbac_perm_app_read(),
    v_owner_org,
    exist_app_v2.appid,
    NULL::bigint
  );
END;
$$;


ALTER FUNCTION "public"."exist_app_v2"("appid" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN public.exist_app_versions(
    exist_app_versions.appid,
    exist_app_versions.name_version,
    public.get_apikey_header()
  );
END;
$$;


ALTER FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_org_id uuid;
  v_request_role text;
  v_user_id uuid;
  v_api_key text;
BEGIN
  SELECT owner_org
  INTO v_org_id
  FROM public.apps
  WHERE app_id = exist_app_versions.appid
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT public.current_request_role()
  INTO v_request_role;

  IF public.is_internal_request_role(v_request_role) THEN
    RETURN (
      SELECT EXISTS (
        SELECT 1
        FROM public.app_versions
        WHERE app_id = exist_app_versions.appid
          AND name = exist_app_versions.name_version
          AND owner_org = v_org_id
      )
    );
  END IF;

  SELECT auth.uid()
  INTO v_user_id;

  v_api_key := exist_app_versions.apikey;

  IF v_api_key = '' THEN
    v_api_key := NULL;
  END IF;

  IF v_api_key IS NULL THEN
    SELECT public.get_apikey_header()
    INTO v_api_key;
  END IF;

  IF v_user_id IS NULL AND v_api_key IS NULL THEN
    RETURN false;
  END IF;

  IF public.rbac_check_permission_direct(
    public.rbac_perm_app_read_bundles(),
    v_user_id,
    v_org_id,
    exist_app_versions.appid,
    NULL::bigint,
    v_api_key
  ) IS NOT TRUE THEN
    RETURN false;
  END IF;

  RETURN (
    SELECT EXISTS (
      SELECT 1
      FROM public.app_versions
      WHERE app_id = exist_app_versions.appid
        AND name = exist_app_versions.name_version
        AND owner_org = v_org_id
    )
  );
END;
$$;


ALTER FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_usage_credits"() RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  grant_rec public.usage_credit_grants%ROWTYPE;
  credits_to_expire numeric;
  balance_after numeric;
  expired_count bigint := 0;
BEGIN
  FOR grant_rec IN
    SELECT *
    FROM public.usage_credit_grants
    WHERE expires_at < NOW()
      AND credits_total > credits_consumed
    ORDER BY expires_at ASC
    FOR UPDATE
  LOOP
    credits_to_expire := grant_rec.credits_total - grant_rec.credits_consumed;

    UPDATE public.usage_credit_grants
    SET credits_consumed = credits_total
    WHERE id = grant_rec.id;

    SELECT COALESCE(SUM(GREATEST(credits_total - credits_consumed, 0)), 0)
    INTO balance_after
    FROM public.usage_credit_grants
    WHERE org_id = grant_rec.org_id
      AND expires_at >= NOW();

    INSERT INTO public.usage_credit_transactions (
      org_id,
      grant_id,
      transaction_type,
      amount,
      balance_after,
      occurred_at,
      description,
      source_ref
    )
    VALUES (
      grant_rec.org_id,
      grant_rec.id,
      'expiry',
      -credits_to_expire,
      balance_after,
      NOW(),
      'Expired usage credits',
      jsonb_build_object('reason', 'expiry', 'expires_at', grant_rec.expires_at)
    );

    expired_count := expired_count + 1;
  END LOOP;

  RETURN expired_count;
END;
$$;


ALTER FUNCTION "public"."expire_usage_credits"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_apikey_by_value"("key_value" "text") RETURNS SETOF "public"."apikeys"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  apikey_row public.apikeys%ROWTYPE;
  key_value_hash text;
BEGIN
  IF key_value IS NULL OR key_value = '' THEN
    RETURN;
  END IF;

  key_value_hash := encode(extensions.digest(key_value, 'sha256'), 'hex');

  SELECT public.apikeys.*
  INTO apikey_row
  FROM public.apikeys
  WHERE public.apikeys.key_hash = key_value_hash
  LIMIT 1;

  IF apikey_row.id IS NULL THEN
    SELECT public.apikeys.*
    INTO apikey_row
    FROM public.apikeys
    WHERE public.apikeys.key = key_value
    LIMIT 1;
  END IF;

  IF apikey_row.id IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.check_apikey_hashed_key_enforcement(apikey_row) THEN
    RETURN;
  END IF;

  RETURN NEXT apikey_row;
END;
$$;


ALTER FUNCTION "public"."find_apikey_by_value"("key_value" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."find_apikey_by_value"("key_value" "text") IS 'Resolves an API key by hashed key first and legacy plain key second. The two-step lookup keeps API-key RLS checks on indexed paths instead of a broad OR predicate.';



CREATE OR REPLACE FUNCTION "public"."find_best_plan_v3"("mau" bigint, "bandwidth" double precision, "storage" double precision, "build_time_unit" bigint DEFAULT 0) RETURNS character varying
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN (
    SELECT name
    FROM public.plans
    WHERE (
      plans.mau >= find_best_plan_v3.mau
      AND plans.storage >= find_best_plan_v3.storage
      AND plans.bandwidth >= find_best_plan_v3.bandwidth
      AND plans.build_time_unit >= find_best_plan_v3.build_time_unit
    ) OR plans.name = 'Enterprise'
    ORDER BY plans.mau
    LIMIT 1
  );
END;
$$;


ALTER FUNCTION "public"."find_best_plan_v3"("mau" bigint, "bandwidth" double precision, "storage" double precision, "build_time_unit" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_fit_plan_v3"("mau" bigint, "bandwidth" bigint, "storage" bigint, "build_time_unit" bigint DEFAULT 0) RETURNS TABLE("name" character varying)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY (SELECT plans.name FROM public.plans
    WHERE plans.mau >= find_fit_plan_v3.mau AND plans.storage >= find_fit_plan_v3.storage
      AND plans.bandwidth >= find_fit_plan_v3.bandwidth AND plans.build_time_unit >= find_fit_plan_v3.build_time_unit
      OR plans.name = 'Enterprise'
    ORDER BY plans.mau);
END;
$$;


ALTER FUNCTION "public"."find_fit_plan_v3"("mau" bigint, "bandwidth" bigint, "storage" bigint, "build_time_unit" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."force_valid_user_id_on_app"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$BEGIN
  NEW.user_id = (SELECT created_by FROM public.orgs WHERE  id = (NEW."owner_org"));

   RETURN NEW;
END;$$;


ALTER FUNCTION "public"."force_valid_user_id_on_app"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_org_on_user_create"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  org_record record;
  has_sso boolean;
  user_provider text;
BEGIN
    SELECT raw_app_meta_data->>'provider'
    INTO user_provider
    FROM auth.users
    WHERE id = NEW.id;

    SELECT EXISTS (
      SELECT 1 FROM public.sso_providers sp
      JOIN public.orgs o ON o.id = sp.org_id
      WHERE sp.domain = lower(btrim(split_part(NEW.email, '@', 2)))
      AND sp.status = 'active'
    ) INTO has_sso;

    -- Skip org creation only for genuine SAML SSO logins on SSO-managed domains.
    IF NOT (user_provider ~ '^sso:' AND has_sso) THEN
      INSERT INTO public.orgs (created_by, name, management_email) values (NEW.id, format('%s organization', NEW.first_name), NEW.email) RETURNING * INTO org_record;
    END IF;

    RETURN NEW;
END $$;


ALTER FUNCTION "public"."generate_org_on_user_create"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_org_user_stripe_info_on_org_create"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  solo_plan_stripe_id varchar;
  pending_customer_id varchar;
  trial_at_date timestamptz;
  org_super_admin_role_id uuid;
BEGIN
  PERFORM set_config('capgo.org_creation_bootstrap_org_id', NEW.id::text, true);

  INSERT INTO public.org_users (user_id, org_id, rbac_role_name, is_invite)
  VALUES (NEW.created_by, NEW.id, public.rbac_role_org_super_admin(), false);

  PERFORM set_config('capgo.org_creation_bootstrap_org_id', '', true);

  SELECT id INTO org_super_admin_role_id
  FROM public.roles
  WHERE name = public.rbac_role_org_super_admin()
    AND scope_type = public.rbac_scope_org()
  LIMIT 1;

  IF org_super_admin_role_id IS NOT NULL THEN
    INSERT INTO public.role_bindings (
      principal_type, principal_id, role_id, scope_type, org_id,
      granted_by, granted_at, reason, is_direct
    ) VALUES (
      public.rbac_principal_user(), NEW.created_by, org_super_admin_role_id, public.rbac_scope_org(), NEW.id,
      NEW.created_by, now(), 'Organization creator', true
    ) ON CONFLICT DO NOTHING;
  END IF;

  IF NEW.customer_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT stripe_id INTO solo_plan_stripe_id
  FROM public.plans
  WHERE name = 'Solo'
  LIMIT 1;

  IF solo_plan_stripe_id IS NULL THEN
    RAISE WARNING 'Solo plan not found, skipping sync stripe_info creation for org %', NEW.id;
    RETURN NEW;
  END IF;

  pending_customer_id := 'pending_' || NEW.id::text;
  trial_at_date := NOW() + INTERVAL '15 days';

  INSERT INTO public.stripe_info (
    customer_id,
    product_id,
    trial_at,
    status,
    is_good_plan
  ) VALUES (
    pending_customer_id,
    solo_plan_stripe_id,
    trial_at_date,
    NULL,
    true
  );

  UPDATE public.orgs
  SET customer_id = pending_customer_id
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."generate_org_user_stripe_info_on_org_create"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."apps" (
    "created_at" timestamp with time zone DEFAULT "now"(),
    "app_id" character varying NOT NULL,
    "icon_url" character varying NOT NULL,
    "user_id" "uuid",
    "name" character varying,
    "last_version" character varying,
    "updated_at" timestamp with time zone,
    "id" "uuid" DEFAULT "gen_random_uuid"(),
    "retention" bigint DEFAULT '2592000'::bigint NOT NULL,
    "owner_org" "uuid" NOT NULL,
    "default_upload_channel" character varying DEFAULT 'production'::character varying NOT NULL,
    "transfer_history" "jsonb"[] DEFAULT '{}'::"jsonb"[],
    "channel_device_count" bigint DEFAULT 0 NOT NULL,
    "manifest_bundle_count" bigint DEFAULT 0 NOT NULL,
    "expose_metadata" boolean DEFAULT false NOT NULL,
    "allow_preview" boolean DEFAULT false NOT NULL,
    "allow_device_custom_id" boolean DEFAULT true NOT NULL,
    "need_onboarding" boolean DEFAULT false NOT NULL,
    "existing_app" boolean DEFAULT false NOT NULL,
    "ios_store_url" "text",
    "android_store_url" "text",
    "stats_updated_at" timestamp without time zone,
    "stats_refresh_requested_at" timestamp without time zone,
    "build_timeout_seconds" bigint DEFAULT 900 NOT NULL,
    "build_timeout_updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "apps_build_timeout_seconds_check" CHECK ((("build_timeout_seconds" >= 300) AND ("build_timeout_seconds" <= 21600)))
);


ALTER TABLE "public"."apps" OWNER TO "postgres";


COMMENT ON COLUMN "public"."apps"."id" IS 'UUID scope id for RBAC (app-level roles reference this id).';



COMMENT ON COLUMN "public"."apps"."expose_metadata" IS 'When true, bundle link and comment metadata are exposed to the plugin in update responses';



COMMENT ON COLUMN "public"."apps"."allow_preview" IS 'When true, bundle preview is enabled for this app';



COMMENT ON COLUMN "public"."apps"."allow_device_custom_id" IS 'When true, devices can persist custom_id via unauthenticated /stats telemetry. When false, custom_id is ignored and a customIdBlocked stat is emitted.';



COMMENT ON COLUMN "public"."apps"."need_onboarding" IS 'True while the app is in the guided onboarding flow and may contain temporary onboarding/demo data.';



COMMENT ON COLUMN "public"."apps"."existing_app" IS 'True when the customer already has an existing mobile app and the CLI should not scaffold a fresh Capacitor app during onboarding.';



COMMENT ON COLUMN "public"."apps"."ios_store_url" IS 'Optional App Store URL collected during onboarding to prefill metadata for existing apps.';



COMMENT ON COLUMN "public"."apps"."android_store_url" IS 'Optional Google Play URL collected during onboarding to prefill metadata for existing apps.';



COMMENT ON COLUMN "public"."apps"."build_timeout_seconds" IS 'Maximum native cloud build runtime in seconds before the job is cancelled and billable time is capped.';



COMMENT ON COLUMN "public"."apps"."build_timeout_updated_at" IS 'Timestamp when the native cloud build timeout setting last changed.';



CREATE OR REPLACE FUNCTION "public"."get_accessible_apps_for_apikey_v2"("apikey" "text" DEFAULT NULL::"text") RETURNS SETOF "public"."apps"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_request_apikey text;
  v_api_key public.apikeys%ROWTYPE;
BEGIN
  SELECT public.get_apikey_header() INTO v_request_apikey;

  IF v_request_apikey IS NULL OR v_request_apikey = '' THEN
    RETURN;
  END IF;

  IF apikey IS NOT NULL AND apikey <> '' AND apikey IS DISTINCT FROM v_request_apikey THEN
    RETURN;
  END IF;

  SELECT * INTO v_api_key
  FROM public.find_apikey_by_value(v_request_apikey)
  LIMIT 1;

  IF v_api_key.id IS NULL OR public.is_apikey_expired(v_api_key.expires_at) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT apps.*
  FROM public.apps
  WHERE public.rbac_check_permission_direct(
    public.rbac_perm_app_read(),
    v_api_key.user_id,
    apps.owner_org,
    apps.app_id,
    NULL,
    v_request_apikey
  )
  ORDER BY apps.created_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_accessible_apps_for_apikey_v2"("apikey" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_accessible_apps_for_apikey_v2"("apikey" "text") IS 'Returns apps visible to the request capgkey using RBAC permission checks. The apikey argument is retained for CLI compatibility and must match the header when provided.';



CREATE OR REPLACE FUNCTION "public"."get_account_removal_date"() RETURNS timestamp with time zone
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    removal_date TIMESTAMPTZ;
    auth_uid uuid;
BEGIN
    SELECT auth.uid() INTO auth_uid;
    IF auth_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT to_delete_accounts.removal_date INTO removal_date
    FROM public.to_delete_accounts
    WHERE account_id = auth_uid;

    IF removal_date IS NULL THEN
        RAISE EXCEPTION
            'Account with ID % is not marked for deletion',
            auth_uid;
    END IF;

    RETURN removal_date;
END;
$$;


ALTER FUNCTION "public"."get_account_removal_date"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_apikey"() RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER PARALLEL SAFE
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='apikey');
END;
$$;


ALTER FUNCTION "public"."get_apikey"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_apikey_header"() RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."get_apikey_header"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_app_access_rbac"("p_app_id" "uuid") RETURNS TABLE("id" "uuid", "principal_type" "text", "principal_id" "uuid", "principal_name" "text", "role_id" "uuid", "role_name" "text", "role_description" "text", "granted_at" timestamp with time zone, "granted_by" "uuid", "expires_at" timestamp with time zone, "reason" "text", "is_direct" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_org_id uuid;
  v_app_id_string text;
BEGIN
  -- Get org_id and app_id string from app
  SELECT a.owner_org, a.app_id INTO v_org_id, v_app_id_string
  FROM public.apps a
  WHERE a.id = p_app_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'APP_NOT_FOUND';
  END IF;

  -- Check if user has permission to view app access
  IF NOT public.rbac_check_permission_direct(public.rbac_perm_app_read(), auth.uid(), v_org_id, v_app_id_string, NULL::bigint) THEN
    RAISE EXCEPTION 'NO_PERMISSION_TO_VIEW_ACCESS';
  END IF;

  -- Return app access with enriched data
  RETURN QUERY
  SELECT
    rb.id,
    rb.principal_type,
    rb.principal_id,
    CASE
      WHEN rb.principal_type = public.rbac_principal_user() THEN u.email
      WHEN rb.principal_type = public.rbac_principal_group() THEN g.name
      ELSE rb.principal_id::text
    END as principal_name,
    rb.role_id,
    r.name as role_name,
    r.description as role_description,
    rb.granted_at,
    rb.granted_by,
    rb.expires_at,
    rb.reason,
    rb.is_direct
  FROM public.role_bindings rb
  INNER JOIN public.roles r ON rb.role_id = r.id
  LEFT JOIN public.users u ON rb.principal_type = public.rbac_principal_user() AND rb.principal_id = u.id
  LEFT JOIN public.groups g ON rb.principal_type = public.rbac_principal_group() AND rb.principal_id = g.id
  WHERE rb.scope_type = public.rbac_scope_app()
    AND rb.app_id = p_app_id
  ORDER BY rb.granted_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_app_access_rbac"("p_app_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_app_access_rbac"("p_app_id" "uuid") IS 'Retrieves all access bindings for an app with permission checks. Requires app.read permission.';



CREATE OR REPLACE FUNCTION "public"."get_app_metrics"("org_id" "uuid") RETURNS TABLE("app_id" character varying, "date" "date", "mau" bigint, "storage" bigint, "bandwidth" bigint, "build_time_unit" bigint, "get" bigint, "fail" bigint, "install" bigint, "uninstall" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  cycle_start timestamptz;
  cycle_end timestamptz;
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(
      public.rbac_perm_org_read(),
      get_app_metrics.org_id,
      NULL::character varying,
      NULL::bigint
    )
  THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE orgs.id = get_app_metrics.org_id) THEN
    RETURN;
  END IF;

  SELECT subscription_anchor_start, subscription_anchor_end
  INTO cycle_start, cycle_end
  FROM public.get_cycle_info_org(org_id);

  RETURN QUERY
  SELECT *
  FROM public.get_app_metrics(org_id, cycle_start::date, cycle_end::date);
END;
$$;


ALTER FUNCTION "public"."get_app_metrics"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_app_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") RETURNS TABLE("app_id" character varying, "date" "date", "mau" bigint, "storage" bigint, "bandwidth" bigint, "build_time_unit" bigint, "get" bigint, "fail" bigint, "install" bigint, "uninstall" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  cache_entry public.app_metrics_cache%ROWTYPE;
  org_stats_updated_at timestamp without time zone;
  v_cache_ttl CONSTANT interval := INTERVAL '5 minutes';
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(
      public.rbac_perm_org_read(),
      get_app_metrics.org_id,
      NULL::character varying,
      NULL::bigint
    )
  THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE orgs.id = get_app_metrics.org_id) THEN
    RETURN;
  END IF;

  SELECT o.stats_updated_at
  INTO org_stats_updated_at
  FROM public.orgs o
  WHERE o.id = get_app_metrics.org_id
  LIMIT 1;

  SELECT *
  INTO cache_entry
  FROM public.app_metrics_cache
  WHERE app_metrics_cache.org_id = get_app_metrics.org_id;

  IF cache_entry.id IS NULL
    OR cache_entry.start_date IS DISTINCT FROM get_app_metrics.start_date
    OR cache_entry.end_date IS DISTINCT FROM get_app_metrics.end_date
    OR cache_entry.cached_at IS NULL
    OR cache_entry.cached_at < (pg_catalog.now() - v_cache_ttl)
    OR (
      org_stats_updated_at IS NOT NULL
      AND pg_catalog.timezone('UTC', cache_entry.cached_at) < org_stats_updated_at
    ) THEN
    cache_entry := public.seed_get_app_metrics_caches(
      get_app_metrics.org_id,
      get_app_metrics.start_date,
      get_app_metrics.end_date
    );
  END IF;

  IF cache_entry.response IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    metrics.app_id,
    metrics.date,
    metrics.mau,
    metrics.storage,
    metrics.bandwidth,
    metrics.build_time_unit,
    metrics.get,
    metrics.fail,
    metrics.install,
    metrics.uninstall
  FROM pg_catalog.jsonb_to_recordset(cache_entry.response) AS metrics(
    app_id character varying,
    date date,
    mau bigint,
    storage bigint,
    bandwidth bigint,
    build_time_unit bigint,
    get bigint,
    fail bigint,
    install bigint,
    uninstall bigint
  )
  ORDER BY metrics.app_id, metrics.date;
END;
$$;


ALTER FUNCTION "public"."get_app_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_app_metrics"("p_org_id" "uuid", "p_app_id" character varying, "p_start_date" "date", "p_end_date" "date") RETURNS TABLE("app_id" character varying, "date" "date", "mau" bigint, "storage" bigint, "bandwidth" bigint, "build_time_unit" bigint, "get" bigint, "fail" bigint, "install" bigint, "uninstall" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  cache_entry public.app_metrics_cache%ROWTYPE;
  org_stats_updated_at timestamp without time zone;
  v_cache_ttl CONSTANT interval := INTERVAL '5 minutes';
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(
      public.rbac_perm_app_read(),
      get_app_metrics.p_org_id,
      get_app_metrics.p_app_id,
      NULL::bigint
    )
  THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.apps
    WHERE apps.app_id = get_app_metrics.p_app_id
      AND apps.owner_org = get_app_metrics.p_org_id
  ) THEN
    RETURN;
  END IF;

  SELECT o.stats_updated_at
  INTO org_stats_updated_at
  FROM public.orgs o
  WHERE o.id = get_app_metrics.p_org_id
  LIMIT 1;

  SELECT *
  INTO cache_entry
  FROM public.app_metrics_cache
  WHERE app_metrics_cache.org_id = get_app_metrics.p_org_id;

  IF cache_entry.id IS NULL
    OR cache_entry.start_date IS DISTINCT FROM get_app_metrics.p_start_date
    OR cache_entry.end_date IS DISTINCT FROM get_app_metrics.p_end_date
    OR cache_entry.cached_at IS NULL
    OR cache_entry.cached_at < (pg_catalog.now() - v_cache_ttl)
    OR (
      org_stats_updated_at IS NOT NULL
      AND pg_catalog.timezone('UTC', cache_entry.cached_at) < org_stats_updated_at
    ) THEN
    cache_entry := public.seed_get_app_metrics_caches(
      get_app_metrics.p_org_id,
      get_app_metrics.p_start_date,
      get_app_metrics.p_end_date
    );
  END IF;

  IF cache_entry.response IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    metrics.app_id,
    metrics.date,
    metrics.mau,
    metrics.storage,
    metrics.bandwidth,
    metrics.build_time_unit,
    metrics.get,
    metrics.fail,
    metrics.install,
    metrics.uninstall
  FROM pg_catalog.jsonb_to_recordset(cache_entry.response) AS metrics(
    app_id character varying,
    date date,
    mau bigint,
    storage bigint,
    bandwidth bigint,
    build_time_unit bigint,
    get bigint,
    fail bigint,
    install bigint,
    uninstall bigint
  )
  WHERE metrics.app_id = get_app_metrics.p_app_id
  ORDER BY metrics.date;
END;
$$;


ALTER FUNCTION "public"."get_app_metrics"("p_org_id" "uuid", "p_app_id" character varying, "p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_org_id uuid;
  v_user_id uuid;
BEGIN
  SELECT owner_org
  INTO v_org_id
  FROM public.apps
  WHERE app_id = get_app_versions.appid
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT public.get_user_id(get_app_versions.apikey)
  INTO v_user_id;

  IF public.rbac_check_permission_direct(
    public.rbac_perm_app_read_bundles(),
    v_user_id,
    v_org_id,
    get_app_versions.appid,
    NULL::bigint,
    get_app_versions.apikey
  ) IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  RETURN (
    SELECT id
    FROM public.app_versions
    WHERE app_id = get_app_versions.appid
      AND name = get_app_versions.name_version
      AND owner_org = v_org_id
    LIMIT 1
  );
END;
$$;


ALTER FUNCTION "public"."get_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_plan_max_org"("orgid" "uuid") RETURNS TABLE("mau" bigint, "bandwidth" bigint, "storage" bigint, "build_time_unit" bigint, "native_build_concurrency" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(
      public.rbac_perm_org_read_billing(),
      get_current_plan_max_org.orgid,
      NULL::character varying,
      NULL::bigint
    )
  THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.mau,
    p.bandwidth,
    p.storage,
    p.build_time_unit,
    p.native_build_concurrency
  FROM public.orgs o
  JOIN public.stripe_info si ON o.customer_id = si.customer_id
  JOIN public.plans p ON si.product_id = p.stripe_id
  WHERE o.id = orgid;
END;
$$;


ALTER FUNCTION "public"."get_current_plan_max_org"("orgid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_plan_name_org"("orgid" "uuid") RETURNS character varying
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(
      public.rbac_perm_org_read_billing(),
      get_current_plan_name_org.orgid,
      NULL::character varying,
      NULL::bigint
    )
  THEN
    RETURN NULL;
  END IF;

  RETURN (
    SELECT p.name
    FROM public.orgs o
    JOIN public.stripe_info si ON o.customer_id = si.customer_id
    JOIN public.plans p ON si.product_id = p.stripe_id
    WHERE o.id = orgid
    LIMIT 1
  );
END;
$$;


ALTER FUNCTION "public"."get_current_plan_name_org"("orgid" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_current_plan_name_org"("orgid" "uuid") IS 'Return the Stripe plan name for the supplied organization after enforcing read-level access; returns NULL when the org is missing or the caller is unauthorized.';



CREATE OR REPLACE FUNCTION "public"."get_customer_counts"() RETURNS TABLE("yearly" bigint, "monthly" bigint, "total" bigint)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."get_customer_counts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_cycle_info_org"("orgid" "uuid") RETURNS TABLE("subscription_anchor_start" timestamp with time zone, "subscription_anchor_end" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  customer_id_var text;
  stripe_info_row public.stripe_info%ROWTYPE;
  anchor_day interval;
  start_date timestamptz;
  end_date timestamptz;
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(
      public.rbac_perm_org_read(),
      get_cycle_info_org.orgid,
      NULL::character varying,
      NULL::bigint
    )
  THEN
    RETURN;
  END IF;

  SELECT customer_id
  INTO customer_id_var
  FROM public.orgs
  WHERE id = orgid;

  SELECT *
  INTO stripe_info_row
  FROM public.stripe_info
  WHERE customer_id = customer_id_var;

  anchor_day := COALESCE(
    stripe_info_row.subscription_anchor_start - date_trunc('MONTH', stripe_info_row.subscription_anchor_start),
    '0 DAYS'::interval
  );

  IF anchor_day > now() - date_trunc('MONTH', now()) THEN
    start_date := date_trunc('MONTH', now() - interval '1 MONTH') + anchor_day;
  ELSE
    start_date := date_trunc('MONTH', now()) + anchor_day;
  END IF;

  end_date := start_date + interval '1 MONTH';

  RETURN QUERY
  SELECT start_date, end_date;
END;
$$;


ALTER FUNCTION "public"."get_cycle_info_org"("orgid" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_cycle_info_org"("orgid" "uuid") IS 'Return the billing cycle start and end for the supplied organization after verifying read access, using Stripe anchor dates to compute the boundaries.';



CREATE OR REPLACE FUNCTION "public"."get_db_url"() RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER PARALLEL SAFE
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='db_url');
END;
$$;


ALTER FUNCTION "public"."get_db_url"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_global_metrics"("org_id" "uuid") RETURNS TABLE("date" "date", "mau" bigint, "storage" bigint, "bandwidth" bigint, "get" bigint, "fail" bigint, "install" bigint, "uninstall" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  cycle_start timestamptz;
  cycle_end timestamptz;
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(
      public.rbac_perm_org_read(),
      get_global_metrics.org_id,
      NULL::character varying,
      NULL::bigint
    )
  THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE orgs.id = get_global_metrics.org_id) THEN
    RETURN;
  END IF;

  SELECT subscription_anchor_start, subscription_anchor_end
  INTO cycle_start, cycle_end
  FROM public.get_cycle_info_org(org_id);

  RETURN QUERY
  SELECT *
  FROM public.get_global_metrics(org_id, cycle_start::date, cycle_end::date);
END;
$$;


ALTER FUNCTION "public"."get_global_metrics"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_global_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") RETURNS TABLE("date" "date", "mau" bigint, "storage" bigint, "bandwidth" bigint, "get" bigint, "fail" bigint, "install" bigint, "uninstall" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(
      public.rbac_perm_org_read(),
      get_global_metrics.org_id,
      NULL::character varying,
      NULL::bigint
    )
  THEN
    RETURN;
  END IF;

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
  FROM public.get_app_metrics(org_id, start_date, end_date) AS metrics
  GROUP BY metrics.date
  ORDER BY metrics.date;
END;
$$;


ALTER FUNCTION "public"."get_global_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_invite_by_magic_lookup"("lookup" "text") RETURNS TABLE("org_name" "text", "org_logo" "text", "role" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.name AS org_name,
    o.logo AS org_logo,
    tmp.rbac_role_name AS role
  FROM public.tmp_users tmp
  JOIN public.orgs o ON tmp.org_id = o.id
  WHERE tmp.invite_magic_string = get_invite_by_magic_lookup.lookup
    AND tmp.cancelled_at IS NULL
    AND GREATEST(tmp.updated_at, tmp.created_at) > (CURRENT_TIMESTAMP - INTERVAL '7 days');
END;
$$;


ALTER FUNCTION "public"."get_invite_by_magic_lookup"("lookup" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_mfa_email_otp_enforced_at"() RETURNS timestamp with time zone
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
DECLARE
  v_setting text;
BEGIN
  SELECT decrypted_secret
  INTO v_setting
  FROM vault.decrypted_secrets
  WHERE name = 'CAPGO_MFA_EMAIL_OTP_ENFORCED_AT'
  LIMIT 1;

  IF v_setting IS NULL OR btrim(v_setting) = '' THEN
    RETURN NULL;
  END IF;

  BEGIN
    RETURN v_setting::timestamptz;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
END;
$$;


ALTER FUNCTION "public"."get_mfa_email_otp_enforced_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_next_cron_time"("p_schedule" "text", "p_timestamp" timestamp with time zone) RETURNS timestamp with time zone
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."get_next_cron_time"("p_schedule" "text", "p_timestamp" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_next_cron_value"("pattern" "text", "current_val" integer, "max_val" integer) RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."get_next_cron_value"("pattern" "text", "current_val" integer, "max_val" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_next_stats_update_date"("org" "uuid") RETURNS timestamp with time zone
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  cron_schedule constant text := '0 3 * * *';
  next_run timestamptz;
  preceding_count integer := 0;
  is_target boolean := false;
BEGIN
  next_run := public.get_next_cron_time(cron_schedule, NOW());
  WITH paying_orgs AS (
    SELECT o.id
    FROM public.orgs o
    JOIN public.stripe_info si ON o.customer_id = si.customer_id
    WHERE (
      -- Paying customers with active subscription
      (si.status = 'succeeded'
        AND (si.canceled_at IS NULL OR si.canceled_at > next_run)
        AND si.subscription_anchor_end > next_run)
      -- Trial customers
      OR si.trial_at > next_run
    )
    ORDER BY o.id ASC
  )
  SELECT
    COUNT(*) FILTER (WHERE id < org)::int,
    COALESCE(BOOL_OR(id = org), false)
  INTO preceding_count, is_target
  FROM paying_orgs;

  IF NOT is_target THEN
    RETURN NULL;
  END IF;

  RETURN next_run + make_interval(mins => preceding_count * 4);
END;
$$;


ALTER FUNCTION "public"."get_next_stats_update_date"("org" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_org_apikeys"("p_org_id" "uuid") RETURNS TABLE("id" bigint, "rbac_id" "uuid", "name" "text", "user_id" "uuid", "owner_email" character varying, "created_at" timestamp with time zone, "expires_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NOT public.rbac_check_permission_direct(
    public.rbac_perm_org_update_user_roles(),
    auth.uid(),
    p_org_id,
    NULL,
    NULL,
    NULL
  ) THEN
    RAISE EXCEPTION 'NO_RIGHTS';
  END IF;

  RETURN QUERY
  SELECT DISTINCT
    ak.id,
    ak.rbac_id,
    ak.name::text,
    ak.user_id,
    users.email,
    ak.created_at,
    ak.expires_at
  FROM public.apikeys ak
  JOIN public.users users ON users.id = ak.user_id
  JOIN public.role_bindings rb
    ON rb.principal_type = public.rbac_principal_apikey()
    AND rb.principal_id = ak.rbac_id
    AND rb.org_id = p_org_id
    AND (rb.expires_at IS NULL OR rb.expires_at > now())
  ORDER BY ak.created_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_org_apikeys"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_org_apps_with_last_upload"("p_org_id" "uuid", "p_search" "text" DEFAULT NULL::"text", "p_sort_by" "text" DEFAULT 'last_upload_at'::"text", "p_sort_desc" boolean DEFAULT true, "p_limit" integer DEFAULT 10, "p_offset" integer DEFAULT 0) RETURNS TABLE("created_at" timestamp with time zone, "app_id" character varying, "icon_url" character varying, "user_id" "uuid", "name" character varying, "last_version" character varying, "updated_at" timestamp with time zone, "id" "uuid", "retention" bigint, "owner_org" "uuid", "default_upload_channel" character varying, "transfer_history" "jsonb"[], "channel_device_count" bigint, "manifest_bundle_count" bigint, "expose_metadata" boolean, "allow_preview" boolean, "allow_device_custom_id" boolean, "need_onboarding" boolean, "existing_app" boolean, "ios_store_url" "text", "android_store_url" "text", "stats_updated_at" timestamp without time zone, "stats_refresh_requested_at" timestamp without time zone, "build_timeout_seconds" bigint, "build_timeout_updated_at" timestamp with time zone, "last_upload_at" timestamp with time zone, "total_count" bigint)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
    v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 100);
    v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
    v_search text := NULLIF(btrim(COALESCE(p_search, '')), '');
    -- Whitelist sort keys to avoid dynamic-SQL injection via p_sort_by.
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
        -- NULLS LAST in both directions so apps without uploads sort to the bottom.
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
        -- Stable tiebreaker so pagination is deterministic across pages.
        s.app_id ASC
    LIMIT v_limit
    OFFSET v_offset;
END;
$$;


ALTER FUNCTION "public"."get_org_apps_with_last_upload"("p_org_id" "uuid", "p_search" "text", "p_sort_by" "text", "p_sort_desc" boolean, "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_org_apps_with_last_upload"("p_org_id" "uuid", "p_search" "text", "p_sort_by" "text", "p_sort_desc" boolean, "p_limit" integer, "p_offset" integer) IS 'Paginated apps for one org with a derived last_upload_at (created_at of the bundle matching apps.last_version). Returns the full apps row plus last_upload_at and total_count. SECURITY INVOKER so RLS on apps/app_versions enforces visibility; p_org_id is an indexed narrowing filter on top of RLS. Search/sort/pagination/total_count are computed in SQL so page order matches the displayed last-upload sort.';



CREATE OR REPLACE FUNCTION "public"."get_org_build_time_unit"("p_org_id" "uuid", "p_start_date" "date", "p_end_date" "date") RETURNS TABLE("total_build_time_unit" bigint, "total_builds" bigint)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT COALESCE(SUM(dbt.build_time_unit), 0)::bigint, COALESCE(SUM(dbt.build_count), 0)::bigint
  FROM public.daily_build_time dbt
  INNER JOIN public.apps a ON a.app_id = dbt.app_id
  WHERE a.owner_org = p_org_id AND dbt.date >= p_start_date AND dbt.date <= p_end_date;
END;
$$;


ALTER FUNCTION "public"."get_org_build_time_unit"("p_org_id" "uuid", "p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_org_members"("guild_id" "uuid") RETURNS TABLE("aid" bigint, "uid" "uuid", "email" character varying, "image_url" character varying, "role" "text", "is_tmp" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role()) THEN
    v_user_id := public.request_actor_user_id();

    IF v_user_id IS NULL
      OR NOT public.rbac_check_permission_request(
        public.rbac_perm_org_read_members(),
        get_org_members.guild_id,
        NULL::character varying,
        NULL::bigint
      )
    THEN
      PERFORM public.pg_log(
        'deny: NO_RIGHTS',
        jsonb_build_object('guild_id', get_org_members.guild_id, 'uid', v_user_id)
      );
      RAISE EXCEPTION 'NO_RIGHTS';
    END IF;
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.get_org_members(v_user_id, get_org_members.guild_id);
END;
$$;


ALTER FUNCTION "public"."get_org_members"("guild_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_org_members"("user_id" "uuid", "guild_id" "uuid") RETURNS TABLE("aid" bigint, "uid" "uuid", "email" character varying, "image_url" character varying, "role" "text", "is_tmp" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role()) THEN
    v_user_id := public.request_actor_user_id();

    IF v_user_id IS NULL
      OR v_user_id IS DISTINCT FROM get_org_members.user_id
      OR NOT public.rbac_check_permission_request(
        public.rbac_perm_org_read_members(),
        get_org_members.guild_id,
        NULL::character varying,
        NULL::bigint
      )
    THEN
      PERFORM public.pg_log(
        'deny: NO_RIGHTS',
        jsonb_build_object(
          'guild_id', get_org_members.guild_id,
          'uid', v_user_id,
          'requested_uid', get_org_members.user_id
        )
      );
      RAISE EXCEPTION 'NO_RIGHTS';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    o.id AS aid,
    users.id AS uid,
    users.email,
    users.image_url,
    COALESCE(o.rbac_role_name, public.rbac_role_org_member()) AS role,
    o.is_invite AS is_tmp
  FROM public.org_users o
  JOIN public.users ON users.id = o.user_id
  WHERE o.org_id = get_org_members.guild_id
  UNION ALL
  SELECT
    (-tmp.id)::bigint AS aid,
    tmp.future_uuid AS uid,
    tmp.email::varchar,
    ''::varchar AS image_url,
    tmp.rbac_role_name AS role,
    true AS is_tmp
  FROM public.tmp_users tmp
  WHERE tmp.org_id = get_org_members.guild_id
    AND tmp.cancelled_at IS NULL
    AND GREATEST(tmp.updated_at, tmp.created_at) > (CURRENT_TIMESTAMP - INTERVAL '7 days');
END;
$$;


ALTER FUNCTION "public"."get_org_members"("user_id" "uuid", "guild_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_org_members_rbac"("p_org_id" "uuid") RETURNS TABLE("user_id" "uuid", "email" character varying, "image_url" character varying, "role_name" "text", "role_id" "uuid", "binding_id" "uuid", "granted_at" timestamp with time zone, "is_invite" boolean, "is_tmp" boolean, "org_user_id" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NOT public.rbac_check_permission_request(
    public.rbac_perm_org_read_members(),
    p_org_id,
    NULL::character varying,
    NULL::bigint
  ) THEN
    RAISE EXCEPTION 'NO_PERMISSION_TO_VIEW_MEMBERS';
  END IF;

  RETURN QUERY
  WITH rbac_members AS (
    SELECT
      u.id AS user_id,
      u.email,
      u.image_url,
      r.name AS role_name,
      rb.role_id,
      rb.id AS binding_id,
      rb.granted_at,
      false AS is_invite,
      false AS is_tmp,
      NULL::bigint AS org_user_id
    FROM public.users u
    INNER JOIN public.role_bindings rb ON rb.principal_id = u.id
      AND rb.principal_type = public.rbac_principal_user()
      AND rb.scope_type = public.rbac_scope_org()
      AND rb.org_id = p_org_id
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    INNER JOIN public.roles r ON rb.role_id = r.id
      AND r.scope_type = rb.scope_type
    WHERE r.scope_type = public.rbac_scope_org()
      AND r.name LIKE 'org_%'
  ),
  pending_user_invites AS (
    SELECT
      u.id AS user_id,
      u.email,
      u.image_url,
      COALESCE(ou.rbac_role_name, public.rbac_role_org_member()) AS role_name,
      NULL::uuid AS role_id,
      NULL::uuid AS binding_id,
      ou.created_at AS granted_at,
      true AS is_invite,
      false AS is_tmp,
      ou.id AS org_user_id
    FROM public.org_users ou
    INNER JOIN public.users u ON u.id = ou.user_id
    WHERE ou.org_id = p_org_id
      AND ou.is_invite IS TRUE
  ),
  tmp_invites AS (
    SELECT
      tmp.future_uuid AS user_id,
      tmp.email,
      ''::character varying AS image_url,
      tmp.rbac_role_name AS role_name,
      NULL::uuid AS role_id,
      NULL::uuid AS binding_id,
      GREATEST(tmp.updated_at, tmp.created_at) AS granted_at,
      true AS is_invite,
      true AS is_tmp,
      NULL::bigint AS org_user_id
    FROM public.tmp_users tmp
    WHERE tmp.org_id = p_org_id
      AND tmp.cancelled_at IS NULL
      AND GREATEST(tmp.updated_at, tmp.created_at) > (CURRENT_TIMESTAMP - INTERVAL '7 days')
  )
  SELECT *
  FROM (
    SELECT * FROM rbac_members
    UNION ALL
    SELECT * FROM pending_user_invites
    UNION ALL
    SELECT * FROM tmp_invites
  ) AS combined
  ORDER BY is_tmp ASC, is_invite ASC, email ASC;
END;
$$;


ALTER FUNCTION "public"."get_org_members_rbac"("p_org_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_org_members_rbac"("p_org_id" "uuid") IS '
Returns organization members and pending invites with their RBAC roles. Requires
org.read permission.
';



CREATE OR REPLACE FUNCTION "public"."get_org_user_access_rbac"("p_user_id" "uuid", "p_org_id" "uuid") RETURNS TABLE("id" "uuid", "principal_type" "text", "principal_id" "uuid", "role_id" "uuid", "role_name" "text", "role_description" "text", "scope_type" "text", "org_id" "uuid", "app_id" "uuid", "channel_id" "uuid", "granted_at" timestamp with time zone, "granted_by" "uuid", "expires_at" timestamp with time zone, "reason" "text", "is_direct" boolean, "principal_name" "text", "user_email" "text", "group_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NO_PERMISSION_TO_VIEW_BINDINGS';
  END IF;

  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT public.rbac_check_permission_direct(public.rbac_perm_org_read(), auth.uid(), p_org_id, NULL::text, NULL::bigint) THEN
    RAISE EXCEPTION 'NO_PERMISSION_TO_VIEW_BINDINGS';
  END IF;

  RETURN QUERY
  SELECT
    rb.id,
    rb.principal_type,
    rb.principal_id,
    rb.role_id,
    r.name as role_name,
    r.description as role_description,
    rb.scope_type,
    rb.org_id,
    rb.app_id,
    rb.channel_id,
    rb.granted_at,
    rb.granted_by,
    rb.expires_at,
    rb.reason,
    rb.is_direct,
    CASE
      WHEN rb.principal_type = public.rbac_principal_user() THEN u.email::text
      WHEN rb.principal_type = public.rbac_principal_group() THEN g.name::text
      ELSE rb.principal_id::text
    END as principal_name,
    u.email::text as user_email,
    g.name::text as group_name
  FROM public.role_bindings rb
  INNER JOIN public.roles r ON rb.role_id = r.id
  LEFT JOIN public.users u ON rb.principal_type = public.rbac_principal_user() AND rb.principal_id = u.id
  LEFT JOIN public.groups g ON rb.principal_type = public.rbac_principal_group() AND rb.principal_id = g.id
  WHERE rb.org_id = p_org_id
    AND rb.principal_type = public.rbac_principal_user()
    AND rb.principal_id = p_user_id
  ORDER BY rb.granted_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_org_user_access_rbac"("p_user_id" "uuid", "p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_organization_cli_warnings"("orgid" "uuid", "cli_version" "text") RETURNS "jsonb"[]
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  messages jsonb[] := ARRAY[]::jsonb[];
  request_apikey text;
  api_key public.apikeys%ROWTYPE;
  fallback_app_id text;
  has_org_read boolean;
BEGIN
  PERFORM cli_version;

  has_org_read := public.cli_check_permission(
    permission_key := public.rbac_perm_org_read(),
    org_id := orgid
  );

  IF NOT has_org_read THEN
    SELECT public.get_apikey_header() INTO request_apikey;

    IF request_apikey IS NOT NULL AND request_apikey <> '' THEN
      SELECT *
      INTO api_key
      FROM public.find_apikey_by_value(request_apikey)
      LIMIT 1;

      IF api_key.id IS NOT NULL
        AND NOT public.is_apikey_expired(api_key.expires_at)
      THEN
        SELECT public.apps.app_id
        INTO fallback_app_id
        FROM public.role_bindings rb
        JOIN public.apps ON public.apps.id = rb.app_id
        WHERE rb.principal_type = public.rbac_principal_apikey()
          AND rb.principal_id = api_key.rbac_id
          AND rb.scope_type = public.rbac_scope_app()
          AND rb.app_id IS NOT NULL
          AND public.apps.owner_org = orgid
          AND (rb.expires_at IS NULL OR rb.expires_at > now())
        ORDER BY public.apps.app_id
        LIMIT 1;

        IF fallback_app_id IS NOT NULL THEN
          has_org_read := public.cli_check_permission(
            permission_key := public.rbac_perm_app_read(),
            org_id := orgid,
            app_id := fallback_app_id
          );
        END IF;
      END IF;
    END IF;
  END IF;

  IF NOT has_org_read THEN
    messages := array_append(messages, jsonb_build_object(
      'message', 'API key does not have read access to this organization',
      'fatal', true
    ));
    RETURN messages;
  END IF;

  IF (
    public.is_paying_and_good_plan_org_action(orgid, ARRAY['mau']::public.action_type[]) = true
    AND public.is_paying_and_good_plan_org_action(orgid, ARRAY['bandwidth']::public.action_type[]) = true
    AND public.is_paying_and_good_plan_org_action(orgid, ARRAY['storage']::public.action_type[]) = false
  ) THEN
    messages := array_append(messages, jsonb_build_object(
      'message', 'You have exceeded your storage limit.\nUpload will fail, but you can still download your data.\nMAU and bandwidth limits are not exceeded.\nIn order to upload your plan, please upgrade your plan here: https://console.capgo.app/settings/plans.',
      'fatal', true
    ));
  END IF;

  RETURN messages;
END;
$$;


ALTER FUNCTION "public"."get_organization_cli_warnings"("orgid" "uuid", "cli_version" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_organization_cli_warnings"("orgid" "uuid", "cli_version" "text") IS 'CLI compatibility warning helper backed by RBAC API key bindings. App-scoped V2 keys are accepted for old CLI warning checks when they can read at least one app in the requested org.';



CREATE OR REPLACE FUNCTION "public"."get_orgs_v6"() RETURNS TABLE("gid" "uuid", "created_by" "uuid", "logo" "text", "name" "text", "role" character varying, "paying" boolean, "trial_left" integer, "can_use_more" boolean, "is_canceled" boolean, "app_count" bigint, "subscription_start" timestamp with time zone, "subscription_end" timestamp with time zone, "management_email" "text", "is_yearly" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_user_id uuid;
  v_apikey text;
BEGIN
  v_apikey := public.get_apikey_header();
  v_user_id := public.request_actor_user_id();

  IF v_apikey IS NOT NULL AND v_user_id IS NULL THEN
    RAISE EXCEPTION 'Invalid API key provided';
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No authentication provided - API key or valid session required';
  END IF;

  RETURN QUERY
  SELECT
    orgs.gid,
    orgs.created_by,
    orgs.logo,
    orgs.name,
    orgs.role,
    orgs.paying,
    orgs.trial_left,
    orgs.can_use_more,
    orgs.is_canceled,
    orgs.app_count,
    orgs.subscription_start,
    orgs.subscription_end,
    orgs.management_email,
    orgs.is_yearly
  FROM public.get_orgs_v7(v_user_id) orgs
  JOIN public.get_user_org_ids() allowed_orgs ON allowed_orgs.org_id = orgs.gid;
END;
$$;


ALTER FUNCTION "public"."get_orgs_v6"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_orgs_v7"() RETURNS TABLE("gid" "uuid", "created_by" "uuid", "created_at" timestamp with time zone, "logo" "text", "website" "text", "name" "text", "role" character varying, "is_invite" boolean, "paying" boolean, "trial_left" integer, "can_use_more" boolean, "is_canceled" boolean, "app_count" bigint, "subscription_start" timestamp with time zone, "subscription_end" timestamp with time zone, "management_email" "text", "is_yearly" boolean, "stats_updated_at" timestamp without time zone, "stats_refresh_requested_at" timestamp without time zone, "next_stats_update_at" timestamp with time zone, "credit_available" numeric, "credit_total" numeric, "credit_next_expiration" timestamp with time zone, "enforcing_2fa" boolean, "2fa_has_access" boolean, "enforce_hashed_api_keys" boolean, "password_policy_config" "jsonb", "password_has_access" boolean, "require_apikey_expiration" boolean, "max_apikey_expiration_days" integer, "enforce_encrypted_bundles" boolean, "required_encryption_key" character varying)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_user_id uuid;
  v_apikey text;
BEGIN
  v_apikey := public.get_apikey_header();
  v_user_id := public.request_actor_user_id();

  IF v_apikey IS NOT NULL AND v_user_id IS NULL THEN
    RAISE EXCEPTION 'Invalid API key provided';
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No authentication provided - API key or valid session required';
  END IF;

  RETURN QUERY
  SELECT orgs.*
  FROM public.get_orgs_v7(v_user_id) orgs
  JOIN public.get_user_org_ids() allowed_orgs ON allowed_orgs.org_id = orgs.gid;
END;
$$;


ALTER FUNCTION "public"."get_orgs_v7"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_orgs_v7"("userid" "uuid") RETURNS TABLE("gid" "uuid", "created_by" "uuid", "created_at" timestamp with time zone, "logo" "text", "website" "text", "name" "text", "role" character varying, "is_invite" boolean, "paying" boolean, "trial_left" integer, "can_use_more" boolean, "is_canceled" boolean, "app_count" bigint, "subscription_start" timestamp with time zone, "subscription_end" timestamp with time zone, "management_email" "text", "is_yearly" boolean, "stats_updated_at" timestamp without time zone, "stats_refresh_requested_at" timestamp without time zone, "next_stats_update_at" timestamp with time zone, "credit_available" numeric, "credit_total" numeric, "credit_next_expiration" timestamp with time zone, "enforcing_2fa" boolean, "2fa_has_access" boolean, "enforce_hashed_api_keys" boolean, "password_policy_config" "jsonb", "password_has_access" boolean, "require_apikey_expiration" boolean, "max_apikey_expiration_days" integer, "enforce_encrypted_bundles" boolean, "required_encryption_key" character varying)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  WITH app_counts AS (
    SELECT owner_org, COUNT(*) AS cnt
    FROM public.apps
    GROUP BY owner_org
  ),
  rbac_role_candidates AS (
    SELECT rb.org_id, r.name, r.priority_rank
    FROM public.role_bindings rb
    JOIN public.roles r ON rb.role_id = r.id
      AND r.scope_type = rb.scope_type
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = userid
      AND rb.scope_type = public.rbac_scope_org()
      AND rb.org_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    UNION ALL
    SELECT rb.org_id, r.name, r.priority_rank
    FROM public.role_bindings rb
    JOIN public.group_members gm ON gm.group_id = rb.principal_id
    JOIN public.roles r ON rb.role_id = r.id
      AND r.scope_type = rb.scope_type
    WHERE rb.principal_type = public.rbac_principal_group()
      AND gm.user_id = userid
      AND rb.scope_type = public.rbac_scope_org()
      AND rb.org_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
  ),
  rbac_org_roles AS (
    SELECT org_id, (ARRAY_AGG(rbac_role_candidates.name ORDER BY rbac_role_candidates.priority_rank DESC))[1] AS role_name
    FROM rbac_role_candidates
    GROUP BY org_id
  ),
  rbac_org_ids AS (
    SELECT org_id
    FROM rbac_org_roles
    UNION
    SELECT apps.owner_org
    FROM public.role_bindings rb
    JOIN public.apps ON apps.id = rb.app_id
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = userid
      AND rb.app_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    UNION
    SELECT apps.owner_org
    FROM public.role_bindings rb
    JOIN public.channels ch ON ch.rbac_id = rb.channel_id
    JOIN public.apps ON apps.app_id = ch.app_id
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = userid
      AND rb.channel_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    UNION
    SELECT rb.org_id
    FROM public.role_bindings rb
    JOIN public.group_members gm ON gm.group_id = rb.principal_id
    WHERE rb.principal_type = public.rbac_principal_group()
      AND gm.user_id = userid
      AND rb.org_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    UNION
    SELECT apps.owner_org
    FROM public.role_bindings rb
    JOIN public.group_members gm ON gm.group_id = rb.principal_id
    JOIN public.apps ON apps.id = rb.app_id
    WHERE rb.principal_type = public.rbac_principal_group()
      AND gm.user_id = userid
      AND rb.app_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    UNION
    SELECT apps.owner_org
    FROM public.role_bindings rb
    JOIN public.group_members gm ON gm.group_id = rb.principal_id
    JOIN public.channels ch ON ch.rbac_id = rb.channel_id
    JOIN public.apps ON apps.app_id = ch.app_id
    WHERE rb.principal_type = public.rbac_principal_group()
      AND gm.user_id = userid
      AND rb.channel_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
  ),
  pending_invites AS (
    SELECT ou.org_id, COALESCE(ou.rbac_role_name, public.rbac_role_org_member()) AS role_name
    FROM public.org_users ou
    WHERE ou.user_id = userid
      AND ou.is_invite IS TRUE
  ),
  user_orgs AS (
    SELECT rbac_org_ids.org_id
    FROM rbac_org_ids
    WHERE rbac_org_ids.org_id IS NOT NULL
    UNION
    SELECT pending_invites.org_id
    FROM pending_invites
  ),
  time_constants AS (
    SELECT
      NOW() AS current_time,
      date_trunc('MONTH', NOW()) AS current_month_start,
      '0 DAYS'::INTERVAL AS zero_day_interval
  ),
  paying_orgs_ordered AS (
    SELECT
      o.id,
      ROW_NUMBER() OVER (ORDER BY o.id ASC) - 1 AS preceding_count
    FROM public.orgs o
    JOIN public.stripe_info si ON o.customer_id = si.customer_id
    CROSS JOIN time_constants tc
    WHERE (
      (si.status = 'succeeded'
        AND (si.canceled_at IS NULL OR si.canceled_at > tc.current_time)
        AND si.subscription_anchor_end > tc.current_time)
      OR si.trial_at > tc.current_time
    )
  ),
  billing_cycles AS (
    SELECT
      o.id AS org_id,
      CASE
        WHEN COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), tc.zero_day_interval)
             > tc.current_time - tc.current_month_start
        THEN date_trunc('MONTH', tc.current_time - INTERVAL '1 MONTH')
             + COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), tc.zero_day_interval)
        ELSE tc.current_month_start
             + COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), tc.zero_day_interval)
      END AS cycle_start
    FROM public.orgs o
    CROSS JOIN time_constants tc
    LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
  ),
  two_fa_access AS (
    SELECT
      o.id AS org_id,
      o.enforcing_2fa,
      CASE
        WHEN o.enforcing_2fa = false THEN true
        ELSE public.has_2fa_enabled(userid)
      END AS "2fa_has_access",
      (o.enforcing_2fa = true AND NOT public.has_2fa_enabled(userid)) AS should_redact_2fa
    FROM public.orgs o
    JOIN user_orgs uo ON uo.org_id = o.id
  ),
  password_policy_access AS (
    SELECT
      o.id AS org_id,
      o.password_policy_config,
      public.user_meets_password_policy(userid, o.id) AS password_has_access,
      NOT public.user_meets_password_policy(userid, o.id) AS should_redact_password
    FROM public.orgs o
    JOIN user_orgs uo ON uo.org_id = o.id
  )
  SELECT
    o.id AS gid,
    o.created_by,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN NULL::timestamptz
      ELSE o.created_at
    END AS created_at,
    o.logo,
    o.website,
    o.name,
    COALESCE(pi.role_name::varchar, ror.role_name::varchar, public.rbac_role_org_member()::varchar) AS role,
    (pi.org_id IS NOT NULL) AS is_invite,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN false
      ELSE COALESCE(si.status = 'succeeded', false)
    END AS paying,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN 0
      ELSE GREATEST(COALESCE((si.trial_at::date - NOW()::date), 0), 0)::integer
    END AS trial_left,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN false
      ELSE COALESCE((si.status = 'succeeded' AND si.is_good_plan = true)
        OR (si.trial_at::date - NOW()::date > 0)
        OR COALESCE(ucb.available_credits, 0) > 0, false)
    END AS can_use_more,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN false
      ELSE COALESCE(si.status = 'canceled', false)
    END AS is_canceled,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN 0::bigint
      ELSE COALESCE(ac.cnt, 0)
    END AS app_count,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN NULL::timestamptz
      ELSE bc.cycle_start
    END AS subscription_start,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN NULL::timestamptz
      ELSE (bc.cycle_start + INTERVAL '1 MONTH')
    END AS subscription_end,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN NULL::text
      ELSE o.management_email
    END AS management_email,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN false
      ELSE COALESCE(si.price_id = p.price_y_id, false)
    END AS is_yearly,
    o.stats_updated_at,
    o.stats_refresh_requested_at,
    CASE
      WHEN poo.id IS NOT NULL THEN
        public.get_next_cron_time('0 3 * * *', NOW()) + make_interval(mins => poo.preceding_count::int * 4)
      ELSE NULL
    END AS next_stats_update_at,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN NULL::numeric
      ELSE COALESCE(ucb.available_credits, 0)
    END AS credit_available,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN NULL::numeric
      ELSE COALESCE(ucb.total_credits, 0)
    END AS credit_total,
    CASE
      WHEN tfa.should_redact_2fa OR ppa.should_redact_password THEN NULL::timestamptz
      ELSE ucb.next_expiration
    END AS credit_next_expiration,
    tfa.enforcing_2fa,
    tfa."2fa_has_access",
    o.enforce_hashed_api_keys,
    ppa.password_policy_config,
    ppa.password_has_access,
    o.require_apikey_expiration,
    o.max_apikey_expiration_days,
    o.enforce_encrypted_bundles,
    o.required_encryption_key
  FROM public.orgs o
  JOIN user_orgs uo ON uo.org_id = o.id
  LEFT JOIN pending_invites pi ON pi.org_id = o.id
  LEFT JOIN rbac_org_roles ror ON ror.org_id = o.id
  LEFT JOIN two_fa_access tfa ON tfa.org_id = o.id
  LEFT JOIN password_policy_access ppa ON ppa.org_id = o.id
  LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
  LEFT JOIN public.plans p ON si.product_id = p.stripe_id
  LEFT JOIN app_counts ac ON ac.owner_org = o.id
  LEFT JOIN public.usage_credit_balances ucb ON ucb.org_id = o.id
  LEFT JOIN paying_orgs_ordered poo ON poo.id = o.id
  LEFT JOIN billing_cycles bc ON bc.org_id = o.id;
END;
$$;


ALTER FUNCTION "public"."get_orgs_v7"("userid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_owner_org_by_app_id_internal"("p_app_id" "text") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT owner_org FROM public.apps WHERE apps.app_id = p_app_id LIMIT 1;
$$;


ALTER FUNCTION "public"."get_owner_org_by_app_id_internal"("p_app_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_owner_org_by_app_id_internal"("p_app_id" "text") IS 'Internal helper for the auto_owner_org_by_app_id trigger only. Resolves the owning org for an app without performing auth checks — the trigger fires after RLS has already validated the caller.';



CREATE OR REPLACE FUNCTION "public"."get_password_policy_hash"("policy_config" "jsonb") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
BEGIN
    IF policy_config IS NULL THEN
        RETURN NULL;
    END IF;
    -- Create a deterministic hash of the policy config
    RETURN md5(policy_config::text);
END;
$$;


ALTER FUNCTION "public"."get_password_policy_hash"("policy_config" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_plan_usage_and_fit"("orgid" "uuid") RETURNS TABLE("is_good_plan" boolean, "total_percent" double precision, "mau_percent" double precision, "bandwidth_percent" double precision, "storage_percent" double precision, "build_time_percent" double precision)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_start_date date;
    v_end_date date;
    v_plan_mau bigint;
    v_plan_bandwidth bigint;
    v_plan_storage bigint;
    v_plan_build_time bigint;
    v_anchor_day integer;
    v_current_month_start date;
    v_current_month_anchor date;
    v_target_month_start date;
    v_target_month_last_day date;
    v_next_target_month_start date;
    v_next_target_month_last_day date;
    v_plan_name text;
    total_stats RECORD;
    percent_mau double precision;
    percent_bandwidth double precision;
    percent_storage double precision;
    percent_build_time double precision;
    v_is_good_plan boolean;
BEGIN
    SELECT
        COALESCE(EXTRACT(DAY FROM si.subscription_anchor_start)::integer, 1),
        p.mau,
        p.bandwidth,
        p.storage,
        p.build_time_unit,
        p.name
    INTO v_anchor_day, v_plan_mau, v_plan_bandwidth, v_plan_storage, v_plan_build_time, v_plan_name
    FROM public.orgs o
    LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
    LEFT JOIN public.plans p ON si.product_id = p.stripe_id
    WHERE o.id = orgid;

    v_current_month_start := date_trunc('MONTH', NOW())::date;
    v_current_month_anchor := v_current_month_start + (
        LEAST(
            v_anchor_day,
            EXTRACT(DAY FROM (v_current_month_start + INTERVAL '1 MONTH - 1 day'))::integer
        ) - 1
    );

    IF NOW()::date < v_current_month_anchor THEN
        v_target_month_start := (v_current_month_start - INTERVAL '1 MONTH')::date;
    ELSE
        v_target_month_start := v_current_month_start;
    END IF;

    v_target_month_last_day := (v_target_month_start + INTERVAL '1 MONTH - 1 day')::date;
    v_start_date := v_target_month_start + (
        LEAST(v_anchor_day, EXTRACT(DAY FROM v_target_month_last_day)::integer) - 1
    );

    v_next_target_month_start := (v_target_month_start + INTERVAL '1 MONTH')::date;
    v_next_target_month_last_day := (v_next_target_month_start + INTERVAL '1 MONTH - 1 day')::date;
    v_end_date := v_next_target_month_start + (
        LEAST(v_anchor_day, EXTRACT(DAY FROM v_next_target_month_last_day)::integer) - 1
    );

    SELECT * INTO total_stats
    FROM public.get_total_metrics(orgid, v_start_date, v_end_date);

    percent_mau := public.convert_number_to_percent(total_stats.mau, v_plan_mau);
    percent_bandwidth := public.convert_number_to_percent(total_stats.bandwidth, v_plan_bandwidth);
    percent_storage := public.convert_number_to_percent(total_stats.storage, v_plan_storage);
    percent_build_time := public.convert_number_to_percent(total_stats.build_time_unit, v_plan_build_time);

    IF v_plan_name = 'Enterprise' THEN
        v_is_good_plan := TRUE;
    ELSIF v_plan_name IS NULL THEN
        v_is_good_plan := FALSE;
    ELSE
        v_is_good_plan := v_plan_mau >= total_stats.mau
            AND v_plan_bandwidth >= total_stats.bandwidth
            AND v_plan_storage >= total_stats.storage
            AND v_plan_build_time >= COALESCE(total_stats.build_time_unit, 0);
    END IF;

    RETURN QUERY SELECT
        v_is_good_plan,
        GREATEST(percent_mau, percent_bandwidth, percent_storage, percent_build_time),
        percent_mau,
        percent_bandwidth,
        percent_storage,
        percent_build_time;
END;
$$;


ALTER FUNCTION "public"."get_plan_usage_and_fit"("orgid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_plan_usage_and_fit_uncached"("orgid" "uuid") RETURNS TABLE("is_good_plan" boolean, "total_percent" double precision, "mau_percent" double precision, "bandwidth_percent" double precision, "storage_percent" double precision, "build_time_percent" double precision)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_start_date date;
    v_end_date date;
    v_plan_mau bigint;
    v_plan_bandwidth bigint;
    v_plan_storage bigint;
    v_plan_build_time bigint;
    v_anchor_day integer;
    v_current_month_start date;
    v_current_month_anchor date;
    v_target_month_start date;
    v_target_month_last_day date;
    v_next_target_month_start date;
    v_next_target_month_last_day date;
    v_plan_name text;
    total_stats RECORD;
    percent_mau double precision;
    percent_bandwidth double precision;
    percent_storage double precision;
    percent_build_time double precision;
    v_is_good_plan boolean;
BEGIN
    SELECT
        COALESCE(EXTRACT(DAY FROM si.subscription_anchor_start)::integer, 1),
        p.mau,
        p.bandwidth,
        p.storage,
        p.build_time_unit,
        p.name
    INTO v_anchor_day, v_plan_mau, v_plan_bandwidth, v_plan_storage, v_plan_build_time, v_plan_name
    FROM public.orgs o
    LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
    LEFT JOIN public.plans p ON si.product_id = p.stripe_id
    WHERE o.id = orgid;

    v_current_month_start := date_trunc('MONTH', NOW())::date;
    v_current_month_anchor := v_current_month_start + (
        LEAST(
            v_anchor_day,
            EXTRACT(DAY FROM (v_current_month_start + INTERVAL '1 MONTH - 1 day'))::integer
        ) - 1
    );

    IF NOW()::date < v_current_month_anchor THEN
        v_target_month_start := (v_current_month_start - INTERVAL '1 MONTH')::date;
    ELSE
        v_target_month_start := v_current_month_start;
    END IF;

    v_target_month_last_day := (v_target_month_start + INTERVAL '1 MONTH - 1 day')::date;
    v_start_date := v_target_month_start + (
        LEAST(v_anchor_day, EXTRACT(DAY FROM v_target_month_last_day)::integer) - 1
    );

    v_next_target_month_start := (v_target_month_start + INTERVAL '1 MONTH')::date;
    v_next_target_month_last_day := (v_next_target_month_start + INTERVAL '1 MONTH - 1 day')::date;
    v_end_date := v_next_target_month_start + (
        LEAST(v_anchor_day, EXTRACT(DAY FROM v_next_target_month_last_day)::integer) - 1
    );

    SELECT * INTO total_stats
    FROM public.seed_org_metrics_cache(orgid, v_start_date, v_end_date);

    percent_mau := public.convert_number_to_percent(total_stats.mau, v_plan_mau);
    percent_bandwidth := public.convert_number_to_percent(total_stats.bandwidth, v_plan_bandwidth);
    percent_storage := public.convert_number_to_percent(total_stats.storage, v_plan_storage);
    percent_build_time := public.convert_number_to_percent(total_stats.build_time_unit, v_plan_build_time);

    IF v_plan_name = 'Enterprise' THEN
        v_is_good_plan := TRUE;
    ELSIF v_plan_name IS NULL THEN
        v_is_good_plan := FALSE;
    ELSE
        v_is_good_plan := v_plan_mau >= total_stats.mau
            AND v_plan_bandwidth >= total_stats.bandwidth
            AND v_plan_storage >= total_stats.storage
            AND v_plan_build_time >= COALESCE(total_stats.build_time_unit, 0);
    END IF;

    RETURN QUERY SELECT
        v_is_good_plan,
        GREATEST(percent_mau, percent_bandwidth, percent_storage, percent_build_time),
        percent_mau,
        percent_bandwidth,
        percent_storage,
        percent_build_time;
END;
$$;


ALTER FUNCTION "public"."get_plan_usage_and_fit_uncached"("orgid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid") RETURNS TABLE("total_percent" double precision, "mau_percent" double precision, "bandwidth_percent" double precision, "storage_percent" double precision, "build_time_percent" double precision)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_start_date date;
  v_end_date date;
  v_plan_mau bigint;
  v_plan_bandwidth bigint;
  v_plan_storage bigint;
  v_plan_build_time bigint;
  v_anchor_day interval;
  total_stats record;
  percent_mau double precision;
  percent_bandwidth double precision;
  percent_storage double precision;
  percent_build_time double precision;
  v_tx_read_only boolean := current_setting('transaction_read_only') = 'on';
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(
      public.rbac_perm_org_read_billing(),
      get_plan_usage_percent_detailed.orgid,
      NULL::character varying,
      NULL::bigint
    )
  THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::interval),
    p.mau,
    p.bandwidth,
    p.storage,
    p.build_time_unit
  INTO v_anchor_day, v_plan_mau, v_plan_bandwidth, v_plan_storage, v_plan_build_time
  FROM public.orgs o
  LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
  LEFT JOIN public.plans p ON si.product_id = p.stripe_id
  WHERE o.id = orgid;

  IF v_anchor_day > now() - date_trunc('MONTH', now()) THEN
    v_start_date := (date_trunc('MONTH', now() - interval '1 MONTH') + v_anchor_day)::date;
  ELSE
    v_start_date := (date_trunc('MONTH', now()) + v_anchor_day)::date;
  END IF;
  v_end_date := (v_start_date + interval '1 MONTH')::date;

  IF v_tx_read_only THEN
    SELECT * INTO total_stats
    FROM public.calculate_org_metrics_cache_entry(orgid, v_start_date, v_end_date);
  ELSE
    SELECT * INTO total_stats
    FROM public.get_total_metrics(orgid, v_start_date, v_end_date);
  END IF;

  percent_mau := public.convert_number_to_percent(total_stats.mau, v_plan_mau);
  percent_bandwidth := public.convert_number_to_percent(total_stats.bandwidth, v_plan_bandwidth);
  percent_storage := public.convert_number_to_percent(total_stats.storage, v_plan_storage);
  percent_build_time := public.convert_number_to_percent(total_stats.build_time_unit, v_plan_build_time);

  RETURN QUERY
  SELECT
    GREATEST(percent_mau, percent_bandwidth, percent_storage, percent_build_time),
    percent_mau,
    percent_bandwidth,
    percent_storage,
    percent_build_time;
END;
$$;


ALTER FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid") IS 'Return current-cycle plan usage percentages (total and per metric) for the supplied organization while respecting read permissions and delegating to cached metrics when running in read-only transactions.';



CREATE OR REPLACE FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid", "cycle_start" "date", "cycle_end" "date") RETURNS TABLE("total_percent" double precision, "mau_percent" double precision, "bandwidth_percent" double precision, "storage_percent" double precision, "build_time_percent" double precision)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_plan_mau bigint;
  v_plan_bandwidth bigint;
  v_plan_storage bigint;
  v_plan_build_time bigint;
  total_stats record;
  percent_mau double precision;
  percent_bandwidth double precision;
  percent_storage double precision;
  percent_build_time double precision;
  v_tx_read_only boolean := current_setting('transaction_read_only') = 'on';
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(
      public.rbac_perm_org_read_billing(),
      get_plan_usage_percent_detailed.orgid,
      NULL::character varying,
      NULL::bigint
    )
  THEN
    RETURN;
  END IF;

  SELECT p.mau, p.bandwidth, p.storage, p.build_time_unit
  INTO v_plan_mau, v_plan_bandwidth, v_plan_storage, v_plan_build_time
  FROM public.orgs o
  JOIN public.stripe_info si ON o.customer_id = si.customer_id
  JOIN public.plans p ON si.product_id = p.stripe_id
  WHERE o.id = orgid;

  IF v_tx_read_only THEN
    SELECT * INTO total_stats
    FROM public.calculate_org_metrics_cache_entry(orgid, cycle_start, cycle_end);
  ELSE
    SELECT * INTO total_stats
    FROM public.get_total_metrics(orgid, cycle_start, cycle_end);
  END IF;

  percent_mau := public.convert_number_to_percent(total_stats.mau, v_plan_mau);
  percent_bandwidth := public.convert_number_to_percent(total_stats.bandwidth, v_plan_bandwidth);
  percent_storage := public.convert_number_to_percent(total_stats.storage, v_plan_storage);
  percent_build_time := public.convert_number_to_percent(total_stats.build_time_unit, v_plan_build_time);

  RETURN QUERY
  SELECT
    GREATEST(percent_mau, percent_bandwidth, percent_storage, percent_build_time),
    percent_mau,
    percent_bandwidth,
    percent_storage,
    percent_build_time;
END;
$$;


ALTER FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid", "cycle_start" "date", "cycle_end" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid", "cycle_start" "date", "cycle_end" "date") IS 'Return plan usage percentages for the supplied date range after verifying read access; read-only callers stay read-only by using the cached metrics helper.';



CREATE OR REPLACE FUNCTION "public"."get_sso_enforcement_by_domain"("p_domain" "text") RETURNS TABLE("org_id" "uuid", "enforce_sso" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT
    sp.org_id,
    sp.enforce_sso
  FROM "public"."sso_providers" sp
  JOIN "public"."orgs" o ON o.id = sp.org_id
  WHERE sp.domain = lower(btrim(p_domain))
    AND sp.status = 'active'
  LIMIT 1;
$$;


ALTER FUNCTION "public"."get_sso_enforcement_by_domain"("p_domain" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_total_app_storage_size_orgs"("org_id" "uuid", "app_id" character varying) RETURNS double precision
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  total_size double precision := 0;
  caller_role text;
BEGIN
  SELECT public.current_request_role() INTO caller_role;

  IF NOT public.is_internal_request_role(caller_role) THEN
    IF NOT public.request_has_app_read_access(
      get_total_app_storage_size_orgs.org_id,
      get_total_app_storage_size_orgs.app_id
    ) THEN
      RETURN 0;
    END IF;
  END IF;

  SELECT COALESCE(SUM(app_versions_meta.size), 0) INTO total_size
  FROM public.app_versions
  INNER JOIN public.app_versions_meta ON app_versions.id = app_versions_meta.id
  WHERE app_versions.owner_org = org_id
    AND app_versions.app_id = get_total_app_storage_size_orgs.app_id
    AND app_versions.deleted = false;

  RETURN total_size;
END;
$$;


ALTER FUNCTION "public"."get_total_app_storage_size_orgs"("org_id" "uuid", "app_id" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_total_metrics"() RETURNS TABLE("mau" bigint, "storage" bigint, "bandwidth" bigint, "build_time_unit" bigint, "get" bigint, "fail" bigint, "install" bigint, "uninstall" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_request_org_id uuid;
  v_org_id_text text;
  v_auth_uid uuid;
  v_request_apikey text;
BEGIN
  SELECT auth.uid() INTO v_auth_uid;
  SELECT public.get_apikey_header() INTO v_request_apikey;

  IF v_auth_uid IS NULL AND (v_request_apikey IS NULL OR v_request_apikey = '') THEN
    RETURN;
  END IF;

  SELECT current_setting('request.jwt.claim.org_id', true) INTO v_org_id_text;

  IF v_org_id_text IS NOT NULL AND v_org_id_text <> '' THEN
    BEGIN
      v_request_org_id := v_org_id_text::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_request_org_id := NULL;
    END;
  END IF;

  IF v_request_org_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.get_user_org_ids() allowed_orgs
    WHERE allowed_orgs.org_id = v_request_org_id
  ) THEN
    RETURN;
  END IF;

  IF v_request_org_id IS NULL THEN
    SELECT allowed_orgs.org_id
    INTO v_request_org_id
    FROM public.get_user_org_ids() allowed_orgs
    ORDER BY allowed_orgs.org_id
    LIMIT 1;
  END IF;

  IF v_request_org_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    metrics.mau,
    metrics.storage,
    metrics.bandwidth,
    metrics.build_time_unit,
    metrics.get,
    metrics.fail,
    metrics.install,
    metrics.uninstall
  FROM public.get_total_metrics(v_request_org_id) AS metrics;
END;
$$;


ALTER FUNCTION "public"."get_total_metrics"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_total_metrics"("org_id" "uuid") RETURNS TABLE("mau" bigint, "storage" bigint, "bandwidth" bigint, "build_time_unit" bigint, "get" bigint, "fail" bigint, "install" bigint, "uninstall" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_start_date date;
  v_end_date date;
  v_anchor_day interval;
BEGIN
  SELECT
    COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)
  INTO v_anchor_day
  FROM public.orgs o
  LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
  WHERE o.id = get_total_metrics.org_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_anchor_day > NOW() - date_trunc('MONTH', NOW()) THEN
    v_start_date := (date_trunc('MONTH', NOW() - INTERVAL '1 MONTH') + v_anchor_day)::date;
  ELSE
    v_start_date := (date_trunc('MONTH', NOW()) + v_anchor_day)::date;
  END IF;
  v_end_date := (v_start_date + INTERVAL '1 MONTH')::date;

  RETURN QUERY
  SELECT
    metrics.mau,
    metrics.storage,
    metrics.bandwidth,
    metrics.build_time_unit,
    metrics.get,
    metrics.fail,
    metrics.install,
    metrics.uninstall
  FROM public.get_total_metrics(org_id, v_start_date, v_end_date) AS metrics;
END;
$$;


ALTER FUNCTION "public"."get_total_metrics"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_total_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") RETURNS TABLE("mau" bigint, "storage" bigint, "bandwidth" bigint, "build_time_unit" bigint, "get" bigint, "fail" bigint, "install" bigint, "uninstall" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    cache_entry public.org_metrics_cache%ROWTYPE;
    cache_ttl interval := '5 minutes'::interval;
    tx_read_only boolean := COALESCE(current_setting('transaction_read_only', true), 'off') = 'on';
BEGIN
    IF start_date IS NULL OR end_date IS NULL THEN
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.orgs
        WHERE orgs.id = get_total_metrics.org_id
    ) THEN
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_stat_xact_user_tables
        WHERE relname IN (
            'apps',
            'deleted_apps',
            'daily_mau',
            'daily_bandwidth',
            'daily_build_time',
            'daily_version',
            'app_versions',
            'app_versions_meta'
        )
        AND (n_tup_ins > 0 OR n_tup_upd > 0 OR n_tup_del > 0)
    ) THEN
        IF tx_read_only THEN
            RETURN QUERY
            SELECT
                metrics.mau,
                metrics.storage,
                metrics.bandwidth,
                metrics.build_time_unit,
                metrics.get,
                metrics.fail,
                metrics.install,
                metrics.uninstall
            FROM public.calculate_org_metrics_cache_entry(org_id, start_date, end_date) AS metrics;
            RETURN;
        END IF;

        cache_entry := public.seed_org_metrics_cache(get_total_metrics.org_id, start_date, end_date);

        RETURN QUERY SELECT
            cache_entry.mau,
            cache_entry.storage,
            cache_entry.bandwidth,
            cache_entry.build_time_unit,
            cache_entry.get,
            cache_entry.fail,
            cache_entry.install,
            cache_entry.uninstall;
        RETURN;
    END IF;

    SELECT * INTO cache_entry
    FROM public.org_metrics_cache
    WHERE org_metrics_cache.org_id = get_total_metrics.org_id;

    IF FOUND
        AND cache_entry.start_date = start_date
        AND cache_entry.end_date = end_date
        AND cache_entry.cached_at > clock_timestamp() - cache_ttl
    THEN
        RETURN QUERY SELECT
            cache_entry.mau,
            cache_entry.storage,
            cache_entry.bandwidth,
            cache_entry.build_time_unit,
            cache_entry.get,
            cache_entry.fail,
            cache_entry.install,
            cache_entry.uninstall;
        RETURN;
    END IF;

    IF tx_read_only THEN
        RETURN QUERY
        SELECT
            metrics.mau,
            metrics.storage,
            metrics.bandwidth,
            metrics.build_time_unit,
            metrics.get,
            metrics.fail,
            metrics.install,
            metrics.uninstall
        FROM public.calculate_org_metrics_cache_entry(org_id, start_date, end_date) AS metrics;
        RETURN;
    END IF;

    cache_entry := public.seed_org_metrics_cache(get_total_metrics.org_id, start_date, end_date);

    RETURN QUERY SELECT
        cache_entry.mau,
        cache_entry.storage,
        cache_entry.bandwidth,
        cache_entry.build_time_unit,
        cache_entry.get,
        cache_entry.fail,
        cache_entry.install,
        cache_entry.uninstall;
END;
$$;


ALTER FUNCTION "public"."get_total_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_total_storage_size_org"("org_id" "uuid") RETURNS double precision
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  total_size double precision := 0;
  caller_role text;
BEGIN
  SELECT public.current_request_role() INTO caller_role;

  IF NOT public.is_internal_request_role(caller_role) THEN
    IF NOT public.request_has_org_read_access(get_total_storage_size_org.org_id) THEN
      RETURN 0;
    END IF;
  END IF;

  SELECT COALESCE(SUM(app_versions_meta.size), 0) INTO total_size
  FROM public.app_versions
  INNER JOIN public.app_versions_meta ON app_versions.id = app_versions_meta.id
  WHERE app_versions.owner_org = org_id
    AND app_versions.deleted = false;

  RETURN total_size;
END;
$$;


ALTER FUNCTION "public"."get_total_storage_size_org"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_update_stats"() RETURNS TABLE("app_id" character varying, "failed" bigint, "install" bigint, "get" bigint, "success_rate" numeric, "healthy" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
            timestamp >= (date_trunc('minute', NOW()) - INTERVAL '10 minutes')
            AND timestamp < (date_trunc('minute', NOW()) - INTERVAL '9 minutes')
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


ALTER FUNCTION "public"."get_update_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_id"("apikey" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  api_key record;
BEGIN
  -- Use find_apikey_by_value to support both plain and hashed keys
  SELECT * FROM public.find_apikey_by_value(apikey) INTO api_key;

  IF api_key.id IS NOT NULL THEN
    -- Check if key is expired
    IF public.is_apikey_expired(api_key.expires_at) THEN
      RETURN NULL;
    END IF;
    RETURN api_key.user_id;
  END IF;

  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."get_user_id"("apikey" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_id"("apikey" "text", "app_id" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE real_user_id uuid;
BEGIN
  PERFORM app_id;
  SELECT public.get_user_id(apikey) INTO real_user_id;
  RETURN real_user_id;
END;
$$;


ALTER FUNCTION "public"."get_user_id"("apikey" "text", "app_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_main_org_id"("user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  org_id uuid;
  caller_role text;
  caller_id uuid;
BEGIN
  SELECT public.current_request_role() INTO caller_role;

  IF NOT public.is_internal_request_role(caller_role) THEN
    SELECT auth.uid() INTO caller_id;
    IF caller_id IS NULL OR caller_id <> get_user_main_org_id.user_id THEN
      RETURN NULL;
    END IF;
  END IF;

  SELECT orgs.id
  INTO org_id
  FROM public.orgs
  WHERE orgs.created_by = get_user_main_org_id.user_id
  LIMIT 1;

  RETURN org_id;
END;
$$;


ALTER FUNCTION "public"."get_user_main_org_id"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_main_org_id_by_app_id"("app_id" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_owner_org uuid;
BEGIN
  SELECT apps.owner_org INTO v_owner_org
  FROM public.apps
  WHERE apps.app_id = get_user_main_org_id_by_app_id.app_id
  LIMIT 1;

  IF v_owner_org IS NULL THEN
    RETURN NULL;
  END IF;

  IF public.rbac_check_permission_request(
    public.rbac_perm_app_read(),
    v_owner_org,
    get_user_main_org_id_by_app_id.app_id,
    NULL::bigint
  ) THEN
    RETURN v_owner_org;
  END IF;

  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."get_user_main_org_id_by_app_id"("app_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_org_ids"() RETURNS TABLE("org_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_apikey text;
  v_api_key public.apikeys%ROWTYPE;
  v_user_id uuid;
BEGIN
  v_apikey := public.get_apikey_header();

  IF v_apikey IS NOT NULL THEN
    SELECT * INTO v_api_key
    FROM public.find_apikey_by_value(v_apikey)
    LIMIT 1;

    IF v_api_key.id IS NULL THEN
      RAISE EXCEPTION 'Invalid API key provided';
    END IF;

    IF public.is_apikey_expired(v_api_key.expires_at) THEN
      RAISE EXCEPTION 'API key has expired';
    END IF;

    RETURN QUERY
    SELECT DISTINCT scoped.org_uuid
    FROM (
      SELECT rb.org_id AS org_uuid
      FROM public.role_bindings rb
      WHERE rb.principal_type = public.rbac_principal_apikey()
        AND rb.principal_id = v_api_key.rbac_id
        AND rb.org_id IS NOT NULL
        AND (rb.expires_at IS NULL OR rb.expires_at > now())
      UNION
      SELECT apps.owner_org AS org_uuid
      FROM public.role_bindings rb
      JOIN public.apps ON apps.id = rb.app_id
      WHERE rb.principal_type = public.rbac_principal_apikey()
        AND rb.principal_id = v_api_key.rbac_id
        AND rb.app_id IS NOT NULL
        AND (rb.expires_at IS NULL OR rb.expires_at > now())
      UNION
      SELECT apps.owner_org AS org_uuid
      FROM public.role_bindings rb
      JOIN public.channels ch ON ch.rbac_id = rb.channel_id
      JOIN public.apps ON apps.app_id = ch.app_id
      WHERE rb.principal_type = public.rbac_principal_apikey()
        AND rb.principal_id = v_api_key.rbac_id
        AND rb.channel_id IS NOT NULL
        AND (rb.expires_at IS NULL OR rb.expires_at > now())
    ) scoped
    WHERE scoped.org_uuid IS NOT NULL;
    RETURN;
  END IF;

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No authentication provided - API key or valid session required';
  END IF;

  RETURN QUERY
  SELECT DISTINCT scoped.org_uuid
  FROM (
    SELECT rb.org_id AS org_uuid
    FROM public.role_bindings rb
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = v_user_id
      AND rb.org_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    UNION
    SELECT apps.owner_org AS org_uuid
    FROM public.role_bindings rb
    JOIN public.apps ON apps.id = rb.app_id
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = v_user_id
      AND rb.app_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    UNION
    SELECT apps.owner_org AS org_uuid
    FROM public.role_bindings rb
    JOIN public.channels ch ON ch.rbac_id = rb.channel_id
    JOIN public.apps ON apps.app_id = ch.app_id
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = v_user_id
      AND rb.channel_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    UNION
    SELECT rb.org_id AS org_uuid
    FROM public.role_bindings rb
    JOIN public.group_members gm ON gm.group_id = rb.principal_id
    WHERE rb.principal_type = public.rbac_principal_group()
      AND gm.user_id = v_user_id
      AND rb.org_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    UNION
    SELECT apps.owner_org AS org_uuid
    FROM public.role_bindings rb
    JOIN public.group_members gm ON gm.group_id = rb.principal_id
    JOIN public.apps ON apps.id = rb.app_id
    WHERE rb.principal_type = public.rbac_principal_group()
      AND gm.user_id = v_user_id
      AND rb.app_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    UNION
    SELECT apps.owner_org AS org_uuid
    FROM public.role_bindings rb
    JOIN public.group_members gm ON gm.group_id = rb.principal_id
    JOIN public.channels ch ON ch.rbac_id = rb.channel_id
    JOIN public.apps ON apps.app_id = ch.app_id
    WHERE rb.principal_type = public.rbac_principal_group()
      AND gm.user_id = v_user_id
      AND rb.channel_id IS NOT NULL
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
    UNION
    SELECT ou.org_id AS org_uuid
    FROM public.org_users ou
    WHERE ou.user_id = v_user_id
      AND ou.is_invite IS TRUE
      AND ou.org_id IS NOT NULL
  ) scoped
  WHERE scoped.org_uuid IS NOT NULL;
END;
$$;


ALTER FUNCTION "public"."get_user_org_ids"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_user_org_ids"() IS 'Org id list for authenticated users or RBAC-scoped API keys.';



CREATE TABLE IF NOT EXISTS "public"."app_versions" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "app_id" character varying NOT NULL,
    "name" character varying NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted" boolean DEFAULT false NOT NULL,
    "external_url" character varying,
    "checksum" character varying,
    "session_key" character varying,
    "storage_provider" "text" DEFAULT 'r2'::"text" NOT NULL,
    "min_update_version" character varying,
    "native_packages" "jsonb"[],
    "owner_org" "uuid" NOT NULL,
    "user_id" "uuid",
    "r2_path" character varying,
    "manifest" "public"."manifest_entry"[],
    "link" "text",
    "comment" "text",
    "manifest_count" integer DEFAULT 0 NOT NULL,
    "key_id" character varying(20),
    "cli_version" character varying,
    "deleted_at" timestamp with time zone
)
WITH ("autovacuum_vacuum_scale_factor"='0.05', "autovacuum_analyze_scale_factor"='0.02');


ALTER TABLE "public"."app_versions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."app_versions"."key_id" IS 'First 20 characters of the base64-encoded public key used to encrypt this bundle (identifies which key was used for encryption)';



COMMENT ON COLUMN "public"."app_versions"."cli_version" IS 'The version of @capgo/cli used to upload this bundle';



CREATE OR REPLACE FUNCTION "public"."get_versions_with_no_metadata"() RETURNS SETOF "public"."app_versions"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT app_versions.* FROM public.app_versions
  LEFT JOIN public.app_versions_meta ON app_versions_meta.id=app_versions.id
  WHERE COALESCE(app_versions_meta.size, 0) = 0
  AND app_versions.deleted=false
  AND app_versions.storage_provider != 'external'
  AND NOW() - app_versions.created_at > interval '120 seconds';
END;
$$;


ALTER FUNCTION "public"."get_versions_with_no_metadata"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_weekly_stats"("app_id" character varying) RETURNS TABLE("all_updates" bigint, "failed_updates" bigint, "open_app" bigint)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE seven_days_ago DATE;
BEGIN
  seven_days_ago := CURRENT_DATE - INTERVAL '7 days';
  SELECT COALESCE(SUM(install), 0) INTO all_updates FROM public.daily_version WHERE date BETWEEN seven_days_ago AND CURRENT_DATE AND public.daily_version.app_id = get_weekly_stats.app_id;
  SELECT COALESCE(SUM(fail), 0) INTO failed_updates FROM public.daily_version WHERE date BETWEEN seven_days_ago AND CURRENT_DATE AND public.daily_version.app_id = get_weekly_stats.app_id;
  SELECT COALESCE(SUM(get), 0) INTO open_app FROM public.daily_version WHERE date BETWEEN seven_days_ago AND CURRENT_DATE AND public.daily_version.app_id = get_weekly_stats.app_id;
  RETURN QUERY SELECT all_updates, failed_updates, open_app;
END;
$$;


ALTER FUNCTION "public"."get_weekly_stats"("app_id" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_owner_org_reassignment"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NEW.owner_org IS DISTINCT FROM OLD.owner_org
    AND current_setting('capgo.allow_owner_org_transfer', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'owner_org must be changed through public.transfer_app()';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."guard_owner_org_reassignment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_2fa_enabled"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Check if the current user has any verified MFA factors
  RETURN EXISTS(
    SELECT 1
    FROM auth.mfa_factors
    WHERE (SELECT auth.uid()) = user_id
      AND status = 'verified'
  );
END;
$$;


ALTER FUNCTION "public"."has_2fa_enabled"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_2fa_enabled"("user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Check if the specified user has any verified MFA factors
  RETURN EXISTS(
    SELECT 1
    FROM auth.mfa_factors mfa
    WHERE mfa.user_id = has_2fa_enabled.user_id
      AND mfa.status = 'verified'
  );
END;
$$;


ALTER FUNCTION "public"."has_2fa_enabled"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_seeded_demo_data"("p_app_id" "text") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.app_versions
    INNER JOIN public.manifest
      ON public.manifest.app_version_id = public.app_versions.id
    WHERE public.app_versions.app_id = p_app_id
      AND public.manifest.s3_path LIKE ('demo/' || p_app_id || '/%')
  );
$$;


ALTER FUNCTION "public"."has_seeded_demo_data"("p_app_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."internal_request_db_user_names"() RETURNS "text"[]
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  SELECT ARRAY['postgres', 'supabase_admin']::text[]
$$;


ALTER FUNCTION "public"."internal_request_db_user_names"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."internal_request_role_names"() RETURNS "text"[]
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  SELECT ARRAY['service_role', 'postgres', 'supabase_admin']::text[]
$$;


ALTER FUNCTION "public"."internal_request_role_names"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invite_user_to_org_rbac"("email" character varying, "org_id" "uuid", "role_name" "text") RETURNS character varying
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  org record;
  invited_user record;
  current_record record;
  current_tmp_user record;
  role_id uuid;
  role_priority integer;
  caller_max_priority integer := 0;
  api_key_text text;
  api_key_row public.apikeys%ROWTYPE;
  v_granted_by uuid;
  v_principal_type text;
  v_principal_id uuid;
BEGIN
  SELECT * INTO org FROM public.orgs WHERE public.orgs.id = invite_user_to_org_rbac.org_id;
  IF org IS NULL THEN
    RETURN 'NO_ORG';
  END IF;

  SELECT r.id, r.priority_rank INTO role_id, role_priority
  FROM public.roles r
  WHERE r.name = invite_user_to_org_rbac.role_name
    AND r.scope_type = public.rbac_scope_org()
    AND r.is_assignable = true
  LIMIT 1;

  IF role_id IS NULL THEN
    RETURN 'ROLE_NOT_FOUND';
  END IF;

  SELECT public.get_apikey_header() INTO api_key_text;
  IF api_key_text IS NOT NULL THEN
    SELECT * INTO api_key_row FROM public.find_apikey_by_value(api_key_text) LIMIT 1;
    v_granted_by := api_key_row.user_id;
    v_principal_type := public.rbac_principal_apikey();
    v_principal_id := api_key_row.rbac_id;
  ELSE
    v_granted_by := auth.uid();
    v_principal_type := public.rbac_principal_user();
    v_principal_id := auth.uid();
  END IF;

  IF invite_user_to_org_rbac.role_name = public.rbac_role_org_super_admin() THEN
    IF NOT public.rbac_check_permission_direct(public.rbac_perm_org_update_user_roles(), auth.uid(), invite_user_to_org_rbac.org_id, NULL, NULL, api_key_text) THEN
      RETURN 'NO_RIGHTS';
    END IF;
  ELSE
    IF NOT public.rbac_check_permission_direct(public.rbac_perm_org_invite_user(), auth.uid(), invite_user_to_org_rbac.org_id, NULL, NULL, api_key_text) THEN
      RETURN 'NO_RIGHTS';
    END IF;
  END IF;

  IF v_principal_id IS NULL THEN
    RETURN 'NO_RIGHTS';
  END IF;

  SELECT COALESCE(MAX(r.priority_rank), 0) INTO caller_max_priority
  FROM public.role_bindings rb
  JOIN public.roles r
    ON r.id = rb.role_id
    AND r.scope_type = rb.scope_type
  WHERE rb.principal_type = v_principal_type
    AND rb.principal_id = v_principal_id
    AND rb.org_id = invite_user_to_org_rbac.org_id
    AND (rb.expires_at IS NULL OR rb.expires_at > now());

  IF caller_max_priority < role_priority THEN
    RETURN 'NO_RIGHTS';
  END IF;

  SELECT public.users.id INTO invited_user FROM public.users WHERE public.users.email = invite_user_to_org_rbac.email;

  IF invited_user IS NOT NULL THEN
    SELECT public.org_users.id INTO current_record
    FROM public.org_users
    WHERE public.org_users.user_id = invited_user.id
      AND public.org_users.org_id = invite_user_to_org_rbac.org_id;

    IF current_record IS NOT NULL THEN
      RETURN 'ALREADY_INVITED';
    ELSE
      INSERT INTO public.org_users (user_id, org_id, rbac_role_name, is_invite)
      VALUES (invited_user.id, invite_user_to_org_rbac.org_id, invite_user_to_org_rbac.role_name, true);

      INSERT INTO public.role_bindings (
        principal_type, principal_id, role_id, scope_type, org_id,
        granted_by, granted_at, expires_at, reason, is_direct
      ) VALUES (
        public.rbac_principal_user(), invited_user.id, role_id, public.rbac_scope_org(), invite_user_to_org_rbac.org_id,
        COALESCE(v_granted_by, invited_user.id), now(), now() - INTERVAL '1 second', 'Pending invitation', true
      ) ON CONFLICT DO NOTHING;

      RETURN 'OK';
    END IF;
  ELSE
    SELECT * INTO current_tmp_user
    FROM public.tmp_users
    WHERE public.tmp_users.email = invite_user_to_org_rbac.email
      AND public.tmp_users.org_id = invite_user_to_org_rbac.org_id;

    IF current_tmp_user IS NOT NULL THEN
      IF current_tmp_user.cancelled_at IS NOT NULL THEN
        IF current_tmp_user.cancelled_at > (CURRENT_TIMESTAMP - INTERVAL '3 hours') THEN
          RETURN 'TOO_RECENT_INVITATION_CANCELATION';
        ELSE
          RETURN 'NO_EMAIL';
        END IF;
      ELSE
        RETURN 'ALREADY_INVITED';
      END IF;
    ELSE
      RETURN 'NO_EMAIL';
    END IF;
  END IF;
END;
$$;


ALTER FUNCTION "public"."invite_user_to_org_rbac"("email" character varying, "org_id" "uuid", "role_name" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."invite_user_to_org_rbac"("email" character varying, "org_id" "uuid", "role_name" "text") IS '
Invite a user to an organization using RBAC roles while preserving legacy invite
flow.
';



CREATE OR REPLACE FUNCTION "public"."is_account_disabled"("user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  caller_role text;
  caller_id uuid;
BEGIN
  SELECT public.current_request_role() INTO caller_role;

  IF NOT public.is_internal_request_role(caller_role) THEN
    SELECT auth.uid() INTO caller_id;
    IF caller_id IS NULL OR caller_id <> is_account_disabled.user_id THEN
      RETURN false;
    END IF;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.to_delete_accounts
    WHERE account_id = user_id
  );
END;
$$;


ALTER FUNCTION "public"."is_account_disabled"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_allowed_action"("apikey" "text", "appid" "text") RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  PERFORM apikey;
  RETURN public.is_allowed_action_org((select owner_org FROM public.apps where app_id=appid));
END;
$$;


ALTER FUNCTION "public"."is_allowed_action"("apikey" "text", "appid" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_allowed_action_org"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN public.is_paying_and_good_plan_org(orgid);
END;
$$;


ALTER FUNCTION "public"."is_allowed_action_org"("orgid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_allowed_action_org_action"("orgid" "uuid", "actions" "public"."action_type"[]) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN public.is_paying_and_good_plan_org_action(orgid, actions);
END;
$$;


ALTER FUNCTION "public"."is_allowed_action_org_action"("orgid" "uuid", "actions" "public"."action_type"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_allowed_action_org_action"("orgid" "uuid", "actions" "public"."action_type"[], "appid" character varying) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN public.is_paying_and_good_plan_org_action(orgid, actions, appid);
END;
$$;


ALTER FUNCTION "public"."is_allowed_action_org_action"("orgid" "uuid", "actions" "public"."action_type"[], "appid" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_apikey_expired"("key_expires_at" timestamp with time zone) RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  -- NULL expires_at means key never expires
  IF key_expires_at IS NULL THEN
    RETURN false;
  END IF;

  -- Check if current time is past expiration
  RETURN NOW() > key_expires_at;
END;
$$;


ALTER FUNCTION "public"."is_apikey_expired"("key_expires_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_app_owner"("appid" character varying) RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN public.is_app_owner((SELECT auth.uid()), appid);
END;
$$;


ALTER FUNCTION "public"."is_app_owner"("appid" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_app_owner"("apikey" "text", "appid" character varying) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN public.is_app_owner(public.get_user_id(apikey), appid);
END;
$$;


ALTER FUNCTION "public"."is_app_owner"("apikey" "text", "appid" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_app_owner"("userid" "uuid", "appid" character varying) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN (SELECT EXISTS (SELECT 1
  FROM public.apps
  WHERE app_id=appid
  AND user_id=userid));
END;
$$;


ALTER FUNCTION "public"."is_app_owner"("userid" "uuid", "appid" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_bandwidth_exceeded_by_org"("org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN (SELECT bandwidth_exceeded
    FROM public.stripe_info
    WHERE stripe_info.customer_id = (SELECT customer_id FROM public.orgs WHERE id = is_bandwidth_exceeded_by_org.org_id));
END;
$$;


ALTER FUNCTION "public"."is_bandwidth_exceeded_by_org"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_build_time_exceeded_by_org"("org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN (SELECT build_time_exceeded FROM public.stripe_info
    WHERE stripe_info.customer_id = (SELECT customer_id FROM public.orgs WHERE id = is_build_time_exceeded_by_org.org_id));
END;
$$;


ALTER FUNCTION "public"."is_build_time_exceeded_by_org"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_bundle_encrypted"("session_key" "text") RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
BEGIN
  -- A bundle is considered encrypted if session_key is non-null and non-empty
  RETURN session_key IS NOT NULL AND length(btrim(session_key)) > 0;
END;
$$;


ALTER FUNCTION "public"."is_bundle_encrypted"("session_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_canceled_org"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(public.rbac_perm_org_read(), orgid, NULL::character varying, NULL::bigint)
  THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.stripe_info
    WHERE customer_id = (SELECT customer_id FROM public.orgs WHERE id = orgid)
      AND status = 'canceled'
  );
END;
$$;


ALTER FUNCTION "public"."is_canceled_org"("orgid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_good_plan_v5_org"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_product_id text;
  v_start_date date;
  v_end_date date;
  v_plan_name text;
  total_metrics record;
  v_anchor_day interval;
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(public.rbac_perm_org_read(), orgid, NULL::character varying, NULL::bigint)
  THEN
    RETURN false;
  END IF;

  SELECT
    si.product_id,
    COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::interval)
  INTO v_product_id, v_anchor_day
  FROM public.orgs o
  LEFT JOIN public.stripe_info si ON o.customer_id = si.customer_id
  WHERE o.id = orgid;

  IF v_anchor_day > now() - date_trunc('MONTH', now()) THEN
    v_start_date := (date_trunc('MONTH', now() - interval '1 MONTH') + v_anchor_day)::date;
  ELSE
    v_start_date := (date_trunc('MONTH', now()) + v_anchor_day)::date;
  END IF;
  v_end_date := (v_start_date + interval '1 MONTH')::date;

  SELECT p.name INTO v_plan_name
  FROM public.plans p
  WHERE p.stripe_id = v_product_id;

  IF v_plan_name = 'Enterprise' THEN
    RETURN true;
  END IF;

  SELECT * INTO total_metrics
  FROM public.get_total_metrics(orgid, v_start_date, v_end_date);

  RETURN EXISTS (
    SELECT 1
    FROM public.plans p
    WHERE p.name = v_plan_name
      AND p.mau >= total_metrics.mau
      AND p.bandwidth >= total_metrics.bandwidth
      AND p.storage >= total_metrics.storage
      AND p.build_time_unit >= COALESCE(total_metrics.build_time_unit, 0)
  );
END;
$$;


ALTER FUNCTION "public"."is_good_plan_v5_org"("orgid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_internal_request_role"("caller_role" "text") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  SELECT (
    caller_role = ANY (public.internal_request_role_names())
    OR (
      caller_role = ANY (ARRAY['', 'none']::text[])
      AND COALESCE(session_user, current_user) = ANY (public.internal_request_db_user_names())
    )
  )
$$;


ALTER FUNCTION "public"."is_internal_request_role"("caller_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_mau_exceeded_by_org"("org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN (SELECT mau_exceeded
    FROM public.stripe_info
    WHERE stripe_info.customer_id = (SELECT customer_id FROM public.orgs WHERE id = is_mau_exceeded_by_org.org_id));
END;
$$;


ALTER FUNCTION "public"."is_mau_exceeded_by_org"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_member_of_org"("user_id" "uuid", "org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_actor_id uuid;
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role()) THEN
    v_actor_id := public.request_actor_user_id();

    IF v_actor_id IS NULL
      OR v_actor_id <> is_member_of_org.user_id
      OR NOT public.rbac_check_permission_request(
        public.rbac_perm_org_read(),
        is_member_of_org.org_id,
        NULL::character varying,
        NULL::bigint
      )
    THEN
      RETURN false;
    END IF;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.role_bindings rb
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = is_member_of_org.user_id
      AND rb.scope_type = public.rbac_scope_org()
      AND rb.org_id = is_member_of_org.org_id
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
  );
END;
$$;


ALTER FUNCTION "public"."is_member_of_org"("user_id" "uuid", "org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_not_deleted"("email_check" character varying) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
 is_found integer;
BEGIN
  SELECT count(*)
  INTO is_found
  FROM public.deleted_account
  WHERE email=email_check;
  RETURN is_found = 0;
END;
$$;


ALTER FUNCTION "public"."is_not_deleted"("email_check" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_numeric"("text") RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $_$
BEGIN
    RETURN $1 ~ '^[0-9]+$';
END;
$_$;


ALTER FUNCTION "public"."is_numeric"("text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_onboarded_org"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(public.rbac_perm_org_read(), orgid, NULL::character varying, NULL::bigint)
  THEN
    RETURN false;
  END IF;

  RETURN EXISTS (SELECT 1 FROM public.apps WHERE owner_org = orgid)
    AND EXISTS (SELECT 1 FROM public.app_versions WHERE owner_org = orgid);
END;
$$;


ALTER FUNCTION "public"."is_onboarded_org"("orgid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_onboarding_needed_org"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(public.rbac_perm_org_read(), orgid, NULL::character varying, NULL::bigint)
  THEN
    RETURN false;
  END IF;

  RETURN EXISTS (SELECT 1 FROM public.orgs WHERE id = orgid)
    AND NOT public.is_onboarded_org(orgid)
    AND public.is_trial_org(orgid) = 0;
END;
$$;


ALTER FUNCTION "public"."is_onboarding_needed_org"("orgid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_yearly"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  is_yearly boolean;
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(public.rbac_perm_org_read_billing(), orgid, NULL::character varying, NULL::bigint)
  THEN
    RETURN false;
  END IF;

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


ALTER FUNCTION "public"."is_org_yearly"("orgid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_paying_and_good_plan_org"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  caller_role text;
BEGIN
  SELECT public.current_request_role() INTO caller_role;

  IF NOT public.is_internal_request_role(caller_role) THEN
    IF NOT public.request_has_org_read_access(is_paying_and_good_plan_org.orgid) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN (
    SELECT
      EXISTS (
        SELECT 1
        FROM public.usage_credit_balances ucb
        WHERE ucb.org_id = orgid
          AND COALESCE(ucb.available_credits, 0) > 0
      )
      OR EXISTS (
        SELECT 1
        FROM public.stripe_info
        WHERE customer_id = (SELECT customer_id FROM public.orgs WHERE id = orgid)
          AND (
            (status = 'succeeded' AND is_good_plan = true)
            OR (trial_at::date - NOW()::date > 0)
          )
      )
  );
END;
$$;


ALTER FUNCTION "public"."is_paying_and_good_plan_org"("orgid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_paying_and_good_plan_org_action"("orgid" "uuid", "actions" "public"."action_type"[]) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN public.is_paying_and_good_plan_org_action(orgid, actions, NULL::character varying);
END;
$$;


ALTER FUNCTION "public"."is_paying_and_good_plan_org_action"("orgid" "uuid", "actions" "public"."action_type"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_paying_and_good_plan_org_action"("orgid" "uuid", "actions" "public"."action_type"[], "appid" character varying) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  org_customer_id text;
  result boolean;
  has_credits boolean;
BEGIN
  IF NOT public.is_internal_request_role(public.current_request_role()) THEN
    IF appid IS NOT NULL THEN
      IF NOT public.rbac_check_permission_request(public.rbac_perm_app_read(), orgid, appid, NULL::bigint) THEN
        RETURN false;
      END IF;
    ELSIF NOT public.rbac_check_permission_request(public.rbac_perm_org_read(), orgid, NULL::character varying, NULL::bigint) THEN
      RETURN false;
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.usage_credit_balances ucb
    WHERE ucb.org_id = orgid
      AND COALESCE(ucb.available_credits, 0) > 0
  ) INTO has_credits;

  IF has_credits THEN
    RETURN true;
  END IF;

  SELECT o.customer_id INTO org_customer_id
  FROM public.orgs o
  WHERE o.id = orgid;

  SELECT (si.trial_at > now()) OR (si.status = 'succeeded' AND NOT (
      (si.mau_exceeded AND 'mau' = ANY(actions))
      OR (si.storage_exceeded AND 'storage' = ANY(actions))
      OR (si.bandwidth_exceeded AND 'bandwidth' = ANY(actions))
      OR (si.build_time_exceeded AND 'build_time' = ANY(actions))
    ))
  INTO result
  FROM public.stripe_info si
  WHERE si.customer_id = org_customer_id
  LIMIT 1;

  RETURN COALESCE(result, false);
END;
$$;


ALTER FUNCTION "public"."is_paying_and_good_plan_org_action"("orgid" "uuid", "actions" "public"."action_type"[], "appid" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_paying_org"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  caller_role text;
BEGIN
  SELECT public.current_request_role() INTO caller_role;

  IF NOT public.is_internal_request_role(caller_role) THEN
    IF NOT public.request_has_org_read_access(is_paying_org.orgid) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN (
    SELECT EXISTS (
      SELECT 1
      FROM public.stripe_info
      WHERE customer_id = (SELECT customer_id FROM public.orgs WHERE id = orgid)
        AND status = 'succeeded'
    )
  );
END;
$$;


ALTER FUNCTION "public"."is_paying_org"("orgid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_platform_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN public.is_platform_admin((SELECT auth.uid()));
END;
$$;


ALTER FUNCTION "public"."is_platform_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_platform_admin"("userid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  admin_ids_jsonb jsonb;
  is_platform_admin_from_secret boolean;
  mfa_verified boolean;
BEGIN
  SELECT public.verify_mfa() INTO mfa_verified;
  IF NOT mfa_verified THEN
    RETURN false;
  END IF;

  SELECT decrypted_secret::jsonb
  INTO admin_ids_jsonb
  FROM vault.decrypted_secrets
  WHERE name = 'admin_users';

  is_platform_admin_from_secret := COALESCE(admin_ids_jsonb ? userid::text, false);

  RETURN is_platform_admin_from_secret;
END;
$$;


ALTER FUNCTION "public"."is_platform_admin"("userid" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_platform_admin"("userid" "uuid") IS 'Checks platform admin status from admin_users and requires MFA.';



CREATE OR REPLACE FUNCTION "public"."is_rbac_enabled_globally"() RETURNS boolean
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
DECLARE
  v_setting text;
BEGIN
  SELECT decrypted_secret
  INTO v_setting
  FROM vault.decrypted_secrets
  WHERE name = 'CAPGO_RBAC_ENABLED'
  LIMIT 1;

  IF v_setting IS NULL OR btrim(v_setting) = '' THEN
    RETURN false;
  END IF;

  RETURN lower(v_setting) IN ('1', 'true', 'on', 'yes');
END;
$$;


ALTER FUNCTION "public"."is_rbac_enabled_globally"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_recent_email_otp_verified"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
DECLARE
    verified_at timestamptz;
BEGIN
    SELECT public.user_security.email_otp_verified_at
    INTO verified_at
    FROM public.user_security
    WHERE public.user_security.user_id = p_user_id;

    RETURN verified_at IS NOT NULL
        AND verified_at > (NOW() - INTERVAL '1 hour');
END;
$$;


ALTER FUNCTION "public"."is_recent_email_otp_verified"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_storage_exceeded_by_org"("org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN (SELECT storage_exceeded
    FROM public.stripe_info
    WHERE stripe_info.customer_id = (SELECT customer_id FROM public.orgs WHERE id = is_storage_exceeded_by_org.org_id));
END;
$$;


ALTER FUNCTION "public"."is_storage_exceeded_by_org"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_trial_org"("orgid" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  caller_role text;
BEGIN
  SELECT public.current_request_role() INTO caller_role;

  IF NOT public.is_internal_request_role(caller_role) THEN
    IF NOT public.request_has_org_read_access(is_trial_org.orgid) THEN
      RETURN 0;
    END IF;
  END IF;

  RETURN COALESCE(
    (
      SELECT GREATEST((trial_at::date - NOW()::date), 0)
      FROM public.stripe_info
      WHERE customer_id = (SELECT customer_id FROM public.orgs WHERE id = orgid)
    ),
    0
  );
END;
$$;


ALTER FUNCTION "public"."is_trial_org"("orgid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_user_app_admin"("p_user_id" "uuid", "p_app_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT owner_org INTO v_org_id
  FROM public.apps
  WHERE id = p_app_id
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.role_bindings rb
    INNER JOIN public.roles r ON rb.role_id = r.id
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = p_user_id
      AND (
        (rb.scope_type = public.rbac_scope_app() AND rb.app_id = p_app_id)
        OR (rb.scope_type = public.rbac_scope_org() AND rb.org_id = v_org_id)
      )
      AND r.name IN (public.rbac_role_app_admin(), public.rbac_role_org_super_admin(), public.rbac_role_org_admin())
  );
END;
$$;


ALTER FUNCTION "public"."is_user_app_admin"("p_user_id" "uuid", "p_app_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_user_app_admin"("p_user_id" "uuid", "p_app_id" "uuid") IS 'Checks whether a user has an admin role for an app, including inherited org-level admin roles (bypasses RLS to avoid recursion).';



CREATE OR REPLACE FUNCTION "public"."is_user_org_admin"("p_user_id" "uuid", "p_org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.role_bindings rb
    INNER JOIN public.roles r ON rb.role_id = r.id
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = p_user_id
      AND rb.org_id = p_org_id
      AND rb.scope_type = public.rbac_scope_org()
      AND r.name IN (public.rbac_role_org_super_admin(), public.rbac_role_org_admin())
  );
$$;


ALTER FUNCTION "public"."is_user_org_admin"("p_user_id" "uuid", "p_org_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_user_org_admin"("p_user_id" "uuid", "p_org_id" "uuid") IS 'Checks whether a user has an admin role in an organization (bypasses RLS to avoid recursion).';



CREATE OR REPLACE FUNCTION "public"."mark_app_stats_refreshed"("p_app_id" character varying) RETURNS timestamp without time zone
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_now_utc timestamp without time zone := pg_catalog.timezone('UTC', pg_catalog.clock_timestamp());
BEGIN
  IF p_app_id IS NULL OR p_app_id = '' THEN -- NOSONAR: explicit empty-string guard
    RETURN NULL;
  END IF;

  UPDATE public.apps
  SET stats_updated_at = v_now_utc
  WHERE app_id = p_app_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN v_now_utc;
END;
$$;


ALTER FUNCTION "public"."mark_app_stats_refreshed"("p_app_id" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_org_delete_cascade"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_existing text := current_setting('capgo.org_delete_cascade_org_ids', true);
BEGIN
  PERFORM set_config(
    'capgo.org_delete_cascade_org_ids',
    concat_ws(',', NULLIF(v_existing, ''), OLD.id::text),
    true
  );

  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."mark_org_delete_cascade"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mass_edit_queue_messages_cf_ids"("updates" "public"."message_update"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
DECLARE
  update_record public.message_update;
  current_message jsonb;
  current_cf_ids jsonb;
BEGIN
  FOR update_record IN SELECT * FROM unnest(updates)
  LOOP
    -- Get the current message using dynamic SQL
    EXECUTE format(
      'SELECT message FROM pgmq.q_%I WHERE msg_id = $1',
      update_record.queue
    ) INTO current_message USING update_record.msg_id;

    IF current_message IS NOT NULL THEN
      -- Check if cf_ids exists and is an array
      current_cf_ids := current_message->'cf_ids';

      IF current_cf_ids IS NULL OR NOT jsonb_typeof(current_cf_ids) = 'array' THEN
        -- Create new cf_ids array with single element
        current_message := jsonb_set(
          current_message,
          '{cf_ids}',
          jsonb_build_array(update_record.cf_id)
        );
      ELSE
        -- Append new cf_id to existing array
        current_message := jsonb_set(
          current_message,
          '{cf_ids}',
          current_cf_ids || jsonb_build_array(update_record.cf_id)
        );
      END IF;

      -- Update the message
      EXECUTE format(
        'UPDATE pgmq.q_%I SET message = $1 WHERE msg_id = $2',
        update_record.queue
      ) USING current_message, update_record.msg_id;
    END IF;
  END LOOP;
END;
$_$;


ALTER FUNCTION "public"."mass_edit_queue_messages_cf_ids"("updates" "public"."message_update"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_public_channel_overlap"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Serialize public-channel changes per app so concurrent writers cannot
  -- reintroduce overlapping public state between the normalization update and
  -- the row write itself. Taking this lock before the cross-row UPDATE also
  -- makes same-app writers wait here instead of deadlocking on channel rows.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(NEW.app_id));

  IF NEW.public IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  UPDATE public.channels AS existing
  SET public = false
  WHERE existing.app_id = NEW.app_id
    AND existing.public = true
    AND existing.id IS DISTINCT FROM NEW.id
    AND (
      (NEW.ios = true AND existing.ios = true)
      OR (NEW.android = true AND existing.android = true)
      OR (NEW.electron = true AND existing.electron = true)
    );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."normalize_public_channel_overlap"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_sso_provider_domain"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.domain := lower(btrim(NEW.domain));
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."normalize_sso_provider_domain"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."noupdate"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
DECLARE
  val record;
  is_different boolean;
BEGIN
  IF current_setting('capgo.allow_owner_org_transfer', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.rbac_check_permission_request(
    public.rbac_perm_app_update_settings(),
    OLD.owner_org,
    OLD.app_id,
    NULL::bigint
  ) THEN
    RETURN NEW;
  END IF;

  FOR val IN SELECT * FROM json_each_text(row_to_json(NEW))
  LOOP
    EXECUTE format('SELECT ($1."%s" is distinct from $2."%s")', val.key, val.key) USING NEW, OLD
    INTO is_different;

    IF is_different AND val.key <> 'version' AND val.key <> 'updated_at' THEN
      RAISE EXCEPTION 'not allowed %', val.key;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$_$;


ALTER FUNCTION "public"."noupdate"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."one_month_ahead"() RETURNS timestamp without time zone
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
   RETURN NOW() + INTERVAL '1 month';
END;
$$;


ALTER FUNCTION "public"."one_month_ahead"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."parse_cron_field"("field" "text", "current_val" integer, "max_val" integer) RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."parse_cron_field"("field" "text", "current_val" integer, "max_val" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."parse_step_pattern"("pattern" "text") RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN (regexp_replace(pattern, '\*/(\d+)', '\1'))::int;
END;
$$;


ALTER FUNCTION "public"."parse_step_pattern"("pattern" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pg_log"("decision" "text", "input" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
DECLARE
  uid uuid;
  req_id text;
  role text;
  ctx text;
  fn text;
BEGIN
  uid := auth.uid();
  req_id := current_setting('request.header.x-request-id', true);
  role := current_setting('request.jwt.claim.role', true);

  -- Best-effort: extract caller from the PL/pgSQL context
  GET DIAGNOSTICS ctx = PG_CONTEXT;
  fn := (
    SELECT regexp_replace(line, '^PL/pgSQL function ([^(]+\([^)]*\)).*$', '\1')
    FROM regexp_split_to_table(ctx, E'\n') AS line
    WHERE line LIKE 'PL/pgSQL function %'
      AND line NOT ILIKE '%pg_log(%'
      AND line NOT ILIKE '%pg_debug(%'
    LIMIT 1
  );
  IF fn IS NULL THEN
    fn := 'unknown';
  END IF;

  -- Trim overly large payloads to avoid noisy logs
  IF length(coalesce(input::text, '{}')) > 2000 THEN
    input := jsonb_build_object('truncated', true);
  END IF;

  RAISE LOG 'RLS LOG: fn=%, decision=%, uid=%, role=%, req_id=%, input=%'
    , fn
    , decision
    , uid
    , coalesce(role, 'null')
    , coalesce(req_id, 'null')
    , coalesce(input::text, '{}');
EXCEPTION WHEN OTHERS THEN
  -- Never let logging break execution paths
  NULL;
END;
$_$;


ALTER FUNCTION "public"."pg_log"("decision" "text", "input" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_last_super_admin_binding_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_remaining_count integer;
  v_delete_cascade_org_ids text[] := string_to_array(current_setting('capgo.org_delete_cascade_org_ids', true), ',');
BEGIN
  IF OLD.scope_type != public.rbac_scope_org() THEN
    RETURN OLD;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.roles r
    WHERE r.id = OLD.role_id
      AND r.name = public.rbac_role_org_super_admin()
  ) THEN
    RETURN OLD;
  END IF;

  IF OLD.org_id::text = ANY(COALESCE(v_delete_cascade_org_ids, '{}'::text[])) THEN
    RETURN OLD;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(OLD.org_id::text));

  SELECT COUNT(*) INTO v_remaining_count
  FROM public.role_bindings rb
  INNER JOIN public.roles r ON rb.role_id = r.id
  WHERE rb.scope_type = public.rbac_scope_org()
    AND rb.org_id = OLD.org_id
    AND rb.principal_type = public.rbac_principal_user()
    AND r.name = public.rbac_role_org_super_admin()
    AND rb.id != OLD.id;

  IF v_remaining_count < 1 THEN
    RAISE EXCEPTION 'CANNOT_DELETE_LAST_SUPER_ADMIN_BINDING'
      USING HINT = 'At least one super_admin binding must remain in the org';
  END IF;

  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."prevent_last_super_admin_binding_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_last_super_admin_binding_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_remaining_count integer;
  v_org_exists boolean;
BEGIN
  IF OLD.role_id IS NOT DISTINCT FROM NEW.role_id THEN
    RETURN NEW;
  END IF;

  IF OLD.scope_type != public.rbac_scope_org() THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.roles r
    WHERE r.id = OLD.role_id
      AND r.name = public.rbac_role_org_super_admin()
  ) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.roles r
    WHERE r.id = NEW.role_id
      AND r.name = public.rbac_role_org_super_admin()
  ) THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM public.orgs
    WHERE id = OLD.org_id
  ) INTO v_org_exists;

  IF NOT v_org_exists THEN
    RETURN NEW;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(OLD.org_id::text));

  SELECT COUNT(*) INTO v_remaining_count
  FROM public.role_bindings rb
  INNER JOIN public.roles r ON rb.role_id = r.id
  WHERE rb.scope_type = public.rbac_scope_org()
    AND rb.org_id = OLD.org_id
    AND rb.principal_type = public.rbac_principal_user()
    AND r.name = public.rbac_role_org_super_admin()
    AND rb.id != OLD.id;

  IF v_remaining_count < 1 THEN
    RAISE EXCEPTION 'CANNOT_DEMOTE_LAST_SUPER_ADMIN_BINDING'
      USING HINT = 'At least one super_admin binding must remain in the org';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_last_super_admin_binding_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_admin_stats"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  PERFORM pgmq.send('admin_stats', jsonb_build_object('function_name','logsnag_insights','function_type','cloudflare','payload',jsonb_build_object()));
END;
$$;


ALTER FUNCTION "public"."process_admin_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_all_cron_tasks"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
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
  -- Try to acquire an advisory lock (non-blocking)
  -- Lock ID 1 is reserved for process_all_cron_tasks
  -- pg_try_advisory_lock returns true if lock acquired, false if already held
  lock_acquired := pg_try_advisory_lock(1);

  IF NOT lock_acquired THEN
    -- Another instance is already running, skip this execution
    RAISE NOTICE 'process_all_cron_tasks: skipped, another instance is already running';
    RETURN;
  END IF;

  -- Wrap everything in a block so we can ensure the lock is released
  BEGIN
    -- Get current time components in UTC
    current_hour := EXTRACT(HOUR FROM NOW());
    current_minute := EXTRACT(MINUTE FROM NOW());
    current_second := EXTRACT(SECOND FROM NOW());
    current_dow := EXTRACT(DOW FROM NOW());
    current_day := EXTRACT(DAY FROM NOW());

    -- Loop through all enabled tasks
    FOR task IN SELECT * FROM public.cron_tasks WHERE enabled = true LOOP
      should_run := false;

      -- Check if task should run based on its schedule
      IF task.second_interval IS NOT NULL THEN
        -- Run every N seconds
        -- Since pg_cron interval is not clock-aligned, we run on every invocation
        -- for second_interval tasks (the cron job itself runs every 10 seconds)
        should_run := true;
      ELSIF task.minute_interval IS NOT NULL THEN
        -- Run every N minutes
        -- Use current_second < 10 to catch first run of each minute (works with any cron offset)
        should_run := (current_minute % task.minute_interval = 0)
                      AND (current_second < 10);
      ELSIF task.hour_interval IS NOT NULL THEN
        -- Run every N hours at specific minute
        -- Use current_second < 10 to catch first run
        should_run := (current_hour % task.hour_interval = 0)
                      AND (current_minute = COALESCE(task.run_at_minute, 0))
                      AND (current_second < 10);
      ELSIF task.run_at_hour IS NOT NULL THEN
        -- Run at specific time
        -- Use current_second < 10 to catch first run
        should_run := (current_hour = task.run_at_hour)
                      AND (current_minute = COALESCE(task.run_at_minute, 0))
                      AND (current_second < 10);

        -- Check day of week constraint
        IF should_run AND task.run_on_dow IS NOT NULL THEN
          should_run := (current_dow = task.run_on_dow);
        END IF;

        -- Check day of month constraint
        IF should_run AND task.run_on_day IS NOT NULL THEN
          should_run := (current_day = task.run_on_day);
        END IF;
      END IF;

      -- Execute the task if it should run
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
              -- Parse JSON array of queue names
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

  EXCEPTION WHEN OTHERS THEN
    -- Release the lock even if an error occurred
    PERFORM pg_advisory_unlock(1);
    RAISE;
  END;

  -- Release the advisory lock
  PERFORM pg_advisory_unlock(1);
END;
$$;


ALTER FUNCTION "public"."process_all_cron_tasks"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."process_all_cron_tasks"() IS 'Consolidated cron task processor that runs every 10 seconds. Uses advisory
lock (ID=1) to prevent concurrent execution - if a previous run is still
executing, the new invocation will skip.';



CREATE OR REPLACE FUNCTION "public"."process_billing_period_stats_email"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  org_record RECORD;
BEGIN
  -- Find all orgs whose billing cycle ends today
  -- We calculate the PREVIOUS cycle's dates to ensure we report on completed data
  FOR org_record IN (
    SELECT
      o.id AS org_id,
      o.management_email,
      si.subscription_anchor_start,
      -- Calculate the previous billing cycle dates
      -- We use (NOW() - interval '1 day') to get yesterday's cycle end date calculation
      -- This ensures we're always looking at the just-completed cycle
      CASE
        WHEN COALESCE(
          si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start),
          '0 DAYS'::INTERVAL
        ) > (NOW() - interval '1 day') - date_trunc('MONTH', NOW() - interval '1 day')
        THEN date_trunc('MONTH', (NOW() - interval '1 day') - INTERVAL '1 MONTH') +
             COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)
        ELSE date_trunc('MONTH', NOW() - interval '1 day') +
             COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)
      END AS prev_cycle_start,
      CASE
        WHEN COALESCE(
          si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start),
          '0 DAYS'::INTERVAL
        ) > (NOW() - interval '1 day') - date_trunc('MONTH', NOW() - interval '1 day')
        THEN (date_trunc('MONTH', (NOW() - interval '1 day') - INTERVAL '1 MONTH') +
              COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)) + INTERVAL '1 MONTH'
        ELSE (date_trunc('MONTH', NOW() - interval '1 day') +
              COALESCE(si.subscription_anchor_start - date_trunc('MONTH', si.subscription_anchor_start), '0 DAYS'::INTERVAL)) + INTERVAL '1 MONTH'
      END AS prev_cycle_end
    FROM public.orgs o
    JOIN public.stripe_info si ON o.customer_id = si.customer_id
    WHERE si.status = 'succeeded'
      AND o.management_email IS NOT NULL
  )
  LOOP
    -- If today is the billing cycle end date, queue the email
    -- We pass the calculated previous cycle dates to ensure correct data
    IF org_record.prev_cycle_end::date = CURRENT_DATE THEN
      PERFORM pgmq.send('cron_email',
        jsonb_build_object(
          'function_name', 'cron_email',
          'function_type', 'cloudflare',
          'payload', jsonb_build_object(
            'email', org_record.management_email,
            'orgId', org_record.org_id,
            'type', 'billing_period_stats',
            'cycleStart', org_record.prev_cycle_start,
            'cycleEnd', org_record.prev_cycle_end
          )
        )
      );
    END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."process_billing_period_stats_email"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_channel_device_counts_queue"("batch_size" integer DEFAULT 1000) RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  message_record RECORD;
  v_payload jsonb;
  v_app_id text;
  v_delta integer;
  msg_ids bigint[] := ARRAY[]::bigint[];
  processed bigint := 0;
BEGIN
  IF batch_size IS NULL OR batch_size < 1 THEN
    batch_size := 100;
  END IF;

  FOR message_record IN
    SELECT *
    FROM pgmq.read('channel_device_counts', 60, batch_size)
  LOOP
    v_payload := message_record.message;
    v_app_id := v_payload ->> 'app_id';
    v_delta := COALESCE((v_payload ->> 'delta')::integer, 0);

    IF v_app_id IS NULL OR v_delta = 0 THEN
      msg_ids := array_append(msg_ids, message_record.msg_id);
      CONTINUE;
    END IF;

    UPDATE public.apps
    SET channel_device_count = GREATEST(channel_device_count + v_delta, 0),
        updated_at = NOW()
    WHERE app_id = v_app_id;

    processed := processed + 1;
    msg_ids := array_append(msg_ids, message_record.msg_id);
  END LOOP;

  IF array_length(msg_ids, 1) IS NOT NULL THEN
    PERFORM pgmq.delete('channel_device_counts', msg_ids);
  END IF;

  RETURN processed;
END;
$$;


ALTER FUNCTION "public"."process_channel_device_counts_queue"("batch_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_cron_stats_jobs"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  app_record RECORD;
BEGIN
  FOR app_record IN (
    WITH active_apps AS (
      SELECT DISTINCT av.app_id
      FROM public.app_versions av
      WHERE av.created_at >= pg_catalog.now() - INTERVAL '30 days'

      UNION

      SELECT DISTINCT dm.app_id
      FROM public.daily_mau dm
      WHERE dm.date >= pg_catalog.now() - INTERVAL '30 days' AND dm.mau > 0

      UNION

      SELECT DISTINCT du.app_id
      FROM public.device_usage du
      WHERE du.timestamp >= pg_catalog.now() - INTERVAL '30 days'

      UNION

      SELECT DISTINCT bu.app_id
      FROM public.bandwidth_usage bu
      WHERE bu.timestamp >= pg_catalog.now() - INTERVAL '30 days'
    )
    SELECT DISTINCT
      active_apps.app_id,
      a.owner_org
    FROM active_apps
    INNER JOIN public.apps a ON a.app_id = active_apps.app_id
  )
  LOOP
    PERFORM public.queue_cron_stat_app_for_app(app_record.app_id, app_record.owner_org);
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."process_cron_stats_jobs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_cron_sync_sub_jobs"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  org_record RECORD;
BEGIN
  FOR org_record IN
    SELECT DISTINCT
      o.id,
      si.customer_id
    FROM public.orgs AS o
    INNER JOIN public.stripe_info AS si ON o.customer_id = si.customer_id
    WHERE o.customer_id IS NOT NULL
      AND si.customer_id IS NOT NULL
  LOOP
    PERFORM pgmq.send(
      'cron_sync_sub',
      pg_catalog.jsonb_build_object(
        'function_name', 'cron_sync_sub',
        'function_type', NULL,
        'payload', pg_catalog.jsonb_build_object(
          'orgId', org_record.id,
          'customerId', org_record.customer_id
        )
      )
    );
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."process_cron_sync_sub_jobs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_daily_fail_ratio_email"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  record RECORD;
  fail_threshold numeric := 0.30; -- 30% fail rate threshold
  min_installs integer := 10; -- Minimum installs to avoid false positives
BEGIN
  -- Get apps with high fail ratios from yesterday's data
  -- We use yesterday to ensure we have complete data for the day
  FOR record IN
    WITH daily_stats AS (
      SELECT
        dv.app_id,
        SUM(COALESCE(dv.install, 0)) AS total_installs,
        SUM(COALESCE(dv.fail, 0)) AS total_fails
      FROM public.daily_version dv
      WHERE dv.date = CURRENT_DATE - INTERVAL '1 day'
      GROUP BY dv.app_id
      HAVING SUM(COALESCE(dv.install, 0)) >= min_installs
    ),
    high_fail_apps AS (
      SELECT
        ds.app_id,
        ds.total_installs,
        ds.total_fails,
        -- Cap fail_percentage at 100 to handle edge cases where fails > installs
        CASE
          WHEN ds.total_installs > 0 THEN LEAST(ROUND((ds.total_fails::numeric / ds.total_installs::numeric) * 100, 2), 100)
          ELSE 0
        END AS fail_percentage,
        a.owner_org
      FROM daily_stats ds
      JOIN public.apps a ON a.app_id = ds.app_id
      WHERE ds.total_installs > 0
        AND (ds.total_fails::numeric / ds.total_installs::numeric) >= fail_threshold
    ),
    with_org_email AS (
      SELECT
        hfa.*,
        o.management_email,
        a.name AS app_name
      FROM high_fail_apps hfa
      JOIN public.orgs o ON o.id = hfa.owner_org
      JOIN public.apps a ON a.app_id = hfa.app_id
      WHERE o.management_email IS NOT NULL
        AND o.management_email != ''
    )
    SELECT * FROM with_org_email
  LOOP
    -- Queue email for each app with high fail ratio (with error handling)
    BEGIN
      PERFORM pgmq.send('cron_email',
        jsonb_build_object(
          'function_name', 'cron_email',
          'function_type', 'cloudflare',
          'payload', jsonb_build_object(
            'email', record.management_email,
            'appId', record.app_id,
            'orgId', record.owner_org,
            'type', 'daily_fail_ratio',
            'appName', record.app_name,
            'totalInstalls', record.total_installs,
            'totalFails', record.total_fails,
            'failPercentage', record.fail_percentage,
            'reportDate', (CURRENT_DATE - INTERVAL '1 day')::text
          )
        )
      );
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'process_daily_fail_ratio_email: failed to queue email for app_id %, org_id %, email %: % (%)',
          record.app_id,
          record.owner_org,
          record.management_email,
          SQLERRM,
          SQLSTATE;
    END;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."process_daily_fail_ratio_email"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_deploy_install_stats_email"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  record RECORD;
BEGIN
  FOR record IN
    WITH latest AS (
      SELECT DISTINCT ON (dh.app_id, channel_platform)
        dh.id,
        dh.app_id,
        dh.version_id,
        dh.deployed_at,
        dh.owner_org,
        dh.channel_id,
        CASE
          WHEN c.ios = true AND c.android = false THEN 'ios'
          WHEN c.android = true AND c.ios = false THEN 'android'
          ELSE 'all'
        END AS channel_platform
      FROM public.deploy_history dh
      JOIN public.channels c ON c.id = dh.channel_id
      WHERE c.public = true
        AND (c.ios = true OR c.android = true)
      ORDER BY dh.app_id, channel_platform, dh.deployed_at DESC NULLS LAST
    ),
    eligible AS (
      SELECT l.*
      FROM latest l
      WHERE l.deployed_at IS NOT NULL
        AND l.deployed_at <= NOW() - interval '24 hours'
    ),
    updated AS (
      UPDATE public.deploy_history dh
      SET install_stats_email_sent_at = NOW()
      FROM eligible e
      WHERE dh.id = e.id
        AND dh.install_stats_email_sent_at IS NULL
      RETURNING dh.id, dh.app_id, dh.version_id, dh.deployed_at, dh.owner_org, dh.channel_id
    ),
    details AS (
      SELECT
        u.id,
        u.app_id,
        u.version_id,
        u.deployed_at,
        u.owner_org,
        u.channel_id,
        e.channel_platform,
        o.management_email,
        c.name AS channel_name,
        v.name AS version_name,
        a.name AS app_name
      FROM updated u
      JOIN eligible e ON e.id = u.id
      JOIN public.orgs o ON o.id = u.owner_org
      JOIN public.channels c ON c.id = u.channel_id
      JOIN public.app_versions v ON v.id = u.version_id
      JOIN public.apps a ON a.app_id = u.app_id
    )
    SELECT
      d.*
    FROM details d
  LOOP
    IF record.management_email IS NULL OR record.management_email = '' THEN
      CONTINUE;
    END IF;

    PERFORM pgmq.send('cron_email',
      jsonb_build_object(
        'function_name', 'cron_email',
        'function_type', 'cloudflare',
        'payload', jsonb_build_object(
          'email', record.management_email,
          'appId', record.app_id,
          'type', 'deploy_install_stats',
          'deployId', record.id,
          'versionId', record.version_id,
          'versionName', record.version_name,
          'channelId', record.channel_id,
          'channelName', record.channel_name,
          'platform', record.channel_platform,
          'appName', record.app_name,
          'deployedAt', record.deployed_at
        )
      )
    );
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."process_deploy_install_stats_email"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_failed_uploads"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."process_failed_uploads"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_free_trial_expired"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  UPDATE public.stripe_info
  SET is_good_plan = false
  WHERE status <> 'succeeded' AND trial_at < NOW();
END;
$$;


ALTER FUNCTION "public"."process_free_trial_expired"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_function_queue"("queue_names" "text"[], "batch_size" integer DEFAULT 950) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  queue_name text;
BEGIN
  -- Process each queue in the array with individual exception handling
  FOREACH queue_name IN ARRAY queue_names
  LOOP
    BEGIN
      -- Call the existing single-queue function (fire-and-forget)
      PERFORM public.process_function_queue(queue_name, batch_size);
    EXCEPTION WHEN OTHERS THEN
      -- Log the error but continue processing other queues
      RAISE WARNING 'process_function_queue failed for queue "%": %', queue_name, SQLERRM;
    END;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."process_function_queue"("queue_names" "text"[], "batch_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_function_queue"("queue_name" "text", "batch_size" integer DEFAULT 950) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  headers jsonb;
  url text;
  queue_size bigint;
  calls_needed int;
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

    -- Calculate how many times to call the sync endpoint (1 call per batch_size items, max 10 calls)
    calls_needed := least(ceil(queue_size / batch_size::float)::int, 10);

    -- Call the endpoint multiple times if needed (fire-and-forget)
    FOR i IN 1..calls_needed LOOP
      PERFORM net.http_post(
        url := url,
        headers := headers,
        body := jsonb_build_object('queue_name', queue_name, 'batch_size', batch_size),
        timeout_milliseconds := 8000
      );
    END LOOP;
  END IF;
END;
$$;


ALTER FUNCTION "public"."process_function_queue"("queue_name" "text", "batch_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_queue_with_healthcheck"("queue_names" "text"[], "batch_size" integer, "healthcheck_url" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  calls_needed int;
  headers jsonb;
  queue_name text;
  queue_size bigint;
  url text;
BEGIN
  IF batch_size IS NULL OR batch_size <= 0 THEN
    RAISE EXCEPTION 'batch_size must be positive';
  END IF;

  headers := pg_catalog.jsonb_build_object(
    'Content-Type', 'application/json',
    'apisecret', public.get_apikey()
  );
  url := public.get_db_url() || '/functions/v1/triggers/queue_consumer/sync';

  FOREACH queue_name IN ARRAY queue_names LOOP
    BEGIN
      EXECUTE pg_catalog.format('SELECT count(*) FROM pgmq.%I', 'q_' || queue_name)
      INTO queue_size;

      IF queue_size > 0 THEN
        calls_needed := LEAST(
          pg_catalog.ceil(queue_size / batch_size::double precision)::int,
          10
        );
      ELSE
        calls_needed := 1;
      END IF;

      FOR i IN 1..calls_needed LOOP
        PERFORM net.http_post(
          url := url,
          headers := headers,
          body := pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
            'queue_name', queue_name,
            'batch_size', batch_size,
            'healthcheck_url', healthcheck_url
          )),
          timeout_milliseconds := 8000
        );
      END LOOP;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_queue_with_healthcheck failed for queue "%": %', queue_name, SQLERRM;
    END;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."process_queue_with_healthcheck"("queue_names" "text"[], "batch_size" integer, "healthcheck_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_stats_email_monthly"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."process_stats_email_monthly"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_stats_email_weekly"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."process_stats_email_weekly"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_subscribed_orgs"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  org_record RECORD;
BEGIN
  FOR org_record IN (
    SELECT o.id, o.customer_id
    FROM public.orgs o
    JOIN public.stripe_info si ON o.customer_id = si.customer_id
    WHERE si.status = 'succeeded'
    ORDER BY o.id ASC
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


ALTER FUNCTION "public"."process_subscribed_orgs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."queue_cron_stat_app_for_app"("p_app_id" character varying, "p_org_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_org_id uuid;
  v_now_utc timestamp without time zone;
  v_refresh_ttl CONSTANT interval := INTERVAL '5 minutes'; -- NOSONAR: function-local refresh TTL
BEGIN
  IF p_app_id IS NULL OR p_app_id = '' THEN
    RETURN;
  END IF;

  v_now_utc := pg_catalog.timezone('UTC', pg_catalog.clock_timestamp());

  UPDATE public.apps AS a
  SET stats_refresh_requested_at = v_now_utc
  WHERE a.app_id = p_app_id
    AND (p_org_id IS NULL OR a.owner_org = p_org_id)
    AND (a.stats_updated_at IS NULL OR a.stats_updated_at < v_now_utc - v_refresh_ttl)
    AND (a.stats_refresh_requested_at IS NULL OR a.stats_refresh_requested_at < v_now_utc - v_refresh_ttl)
  RETURNING a.owner_org
  INTO v_org_id;

  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pgmq.q_cron_stat_app AS queued_job
    WHERE queued_job.message->'payload'->>'appId' = p_app_id
  ) THEN
    RETURN;
  END IF;

  PERFORM pgmq.send('cron_stat_app',
    pg_catalog.jsonb_build_object(
      'function_name', 'cron_stat_app',
      'function_type', 'cloudflare',
      'payload', pg_catalog.jsonb_build_object(
        'appId', p_app_id,
        'orgId', v_org_id,
        'todayOnly', false
      )
    )
  );
END;
$$;


ALTER FUNCTION "public"."queue_cron_stat_app_for_app"("p_app_id" character varying, "p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."queue_cron_stat_org_for_org"("org_id" "uuid", "customer_id" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN

  PERFORM pgmq.send('cron_stat_org',
    jsonb_build_object(
      'function_name', 'cron_stat_org',
      'function_type', 'cloudflare',
      'payload', jsonb_build_object(
      'orgId', org_id,
      'customerId', customer_id
      )
    )
  );
END;
$$;


ALTER FUNCTION "public"."queue_cron_stat_org_for_org"("org_id" "uuid", "customer_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_check_permission"("p_permission_key" "text", "p_org_id" "uuid" DEFAULT NULL::"uuid", "p_app_id" character varying DEFAULT NULL::character varying, "p_channel_id" bigint DEFAULT NULL::bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.rbac_check_permission_direct(
    p_permission_key,
    auth.uid(),
    p_org_id,
    p_app_id,
    p_channel_id,
    NULL
  );
END;
$$;


ALTER FUNCTION "public"."rbac_check_permission"("p_permission_key" "text", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rbac_check_permission"("p_permission_key" "text", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint) IS 'Public RBAC permission check for authenticated users. Uses auth.uid() and delegates to rbac_check_permission_direct.';



CREATE OR REPLACE FUNCTION "public"."rbac_check_permission_direct"("p_permission_key" "text", "p_user_id" "uuid", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint, "p_apikey" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_allowed boolean := false;
  v_effective_org_id uuid := p_org_id;
  v_effective_user_id uuid := p_user_id;
  v_effective_app_id character varying := p_app_id;
  v_api_key public.apikeys%ROWTYPE;
  v_app_owner_org uuid;
  v_channel_org_id uuid;
  v_channel_app_id character varying;
  v_channel_scope boolean := p_channel_id IS NOT NULL;
  v_override boolean;
BEGIN
  IF p_permission_key IS NULL OR p_permission_key = '' THEN
    RETURN false;
  END IF;

  IF p_app_id IS NOT NULL THEN
    SELECT owner_org INTO v_app_owner_org
    FROM public.apps
    WHERE app_id = p_app_id
    LIMIT 1;

    IF v_app_owner_org IS NULL THEN
      RETURN false;
    END IF;

    IF v_effective_org_id IS NOT NULL AND v_effective_org_id IS DISTINCT FROM v_app_owner_org THEN
      RETURN false;
    END IF;

    v_effective_org_id := v_app_owner_org;
  END IF;

  IF p_channel_id IS NOT NULL THEN
    SELECT owner_org, app_id
    INTO v_channel_org_id, v_channel_app_id
    FROM public.channels
    WHERE id = p_channel_id
    LIMIT 1;

    IF v_channel_org_id IS NULL THEN
      RETURN false;
    END IF;

    IF v_effective_org_id IS NOT NULL AND v_effective_org_id IS DISTINCT FROM v_channel_org_id THEN
      RETURN false;
    END IF;

    IF v_effective_app_id IS NOT NULL AND v_effective_app_id IS DISTINCT FROM v_channel_app_id THEN
      RETURN false;
    END IF;

    v_effective_org_id := v_channel_org_id;
    v_effective_app_id := v_channel_app_id;
  END IF;

  IF p_apikey IS NOT NULL THEN
    SELECT * INTO v_api_key
    FROM public.find_apikey_by_value(p_apikey)
    LIMIT 1;

    IF v_api_key.id IS NULL
      OR (p_user_id IS NOT NULL AND p_user_id IS DISTINCT FROM v_api_key.user_id)
      OR v_effective_org_id IS NULL
    THEN
      RETURN false;
    END IF;

    IF public.is_apikey_expired(v_api_key.expires_at) THEN
      RETURN false;
    END IF;

    v_effective_user_id := v_api_key.user_id;

    IF (SELECT enforcing_2fa FROM public.orgs WHERE id = v_effective_org_id)
      AND NOT public.has_2fa_enabled(v_effective_user_id)
    THEN
      RETURN false;
    END IF;

    IF public.user_meets_password_policy(v_effective_user_id, v_effective_org_id) = false THEN
      RETURN false;
    END IF;

    v_allowed := public.rbac_has_permission(
      public.rbac_principal_apikey(),
      v_api_key.rbac_id,
      p_permission_key,
      v_effective_org_id,
      v_effective_app_id,
      p_channel_id
    );

    IF v_channel_scope THEN
      SELECT o.is_allowed INTO v_override
      FROM public.channel_permission_overrides o
      WHERE o.principal_type = public.rbac_principal_apikey()
        AND o.principal_id = v_api_key.rbac_id
        AND o.channel_id = p_channel_id
        AND o.permission_key = p_permission_key
      LIMIT 1;

      IF v_override IS NOT NULL THEN
        v_allowed := v_override;
      END IF;
    END IF;

    RETURN v_allowed;
  END IF;

  IF v_effective_org_id IS NOT NULL THEN
    IF (SELECT enforcing_2fa FROM public.orgs WHERE id = v_effective_org_id)
      AND (v_effective_user_id IS NULL OR NOT public.has_2fa_enabled(v_effective_user_id))
    THEN
      RETURN false;
    END IF;

    IF public.user_meets_password_policy(v_effective_user_id, v_effective_org_id) = false THEN
      RETURN false;
    END IF;
  END IF;

  IF v_effective_user_id IS NULL THEN
    RETURN false;
  END IF;

  v_allowed := public.rbac_has_permission(
    public.rbac_principal_user(),
    v_effective_user_id,
    p_permission_key,
    v_effective_org_id,
    v_effective_app_id,
    p_channel_id
  );

  IF v_channel_scope THEN
    SELECT o.is_allowed INTO v_override
    FROM public.channel_permission_overrides o
    WHERE o.principal_type = public.rbac_principal_user()
      AND o.principal_id = v_effective_user_id
      AND o.channel_id = p_channel_id
      AND o.permission_key = p_permission_key
    LIMIT 1;

    IF v_override IS NOT NULL THEN
      v_allowed := v_override;
    END IF;
  END IF;

  RETURN v_allowed;
END;
$$;


ALTER FUNCTION "public"."rbac_check_permission_direct"("p_permission_key" "text", "p_user_id" "uuid", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint, "p_apikey" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rbac_check_permission_direct"("p_permission_key" "text", "p_user_id" "uuid", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint, "p_apikey" "text") IS 'Direct RBAC permission check. Uses role_bindings only, supports hashed API keys via find_apikey_by_value, and applies channel overrides.';



CREATE OR REPLACE FUNCTION "public"."rbac_check_permission_direct_no_password_policy"("p_permission_key" "text", "p_user_id" "uuid", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint, "p_apikey" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_effective_org_id uuid := p_org_id;
  v_effective_user_id uuid := p_user_id;
  v_effective_app_id character varying := p_app_id;
  v_api_key public.apikeys%ROWTYPE;
  v_app_owner_org uuid;
  v_channel_org_id uuid;
  v_channel_app_id character varying;
BEGIN
  IF p_permission_key IS NULL OR p_permission_key = '' THEN
    RETURN false;
  END IF;

  IF p_app_id IS NOT NULL THEN
    SELECT owner_org INTO v_app_owner_org
    FROM public.apps
    WHERE app_id = p_app_id
    LIMIT 1;

    IF v_app_owner_org IS NULL THEN
      RETURN false;
    END IF;

    IF v_effective_org_id IS NOT NULL AND v_effective_org_id IS DISTINCT FROM v_app_owner_org THEN
      RETURN false;
    END IF;

    v_effective_org_id := v_app_owner_org;
  END IF;

  IF p_channel_id IS NOT NULL THEN
    SELECT owner_org, app_id
    INTO v_channel_org_id, v_channel_app_id
    FROM public.channels
    WHERE id = p_channel_id
    LIMIT 1;

    IF v_channel_org_id IS NULL THEN
      RETURN false;
    END IF;

    IF v_effective_org_id IS NOT NULL AND v_effective_org_id IS DISTINCT FROM v_channel_org_id THEN
      RETURN false;
    END IF;

    IF v_effective_app_id IS NOT NULL AND v_effective_app_id IS DISTINCT FROM v_channel_app_id THEN
      RETURN false;
    END IF;

    v_effective_org_id := v_channel_org_id;
    v_effective_app_id := v_channel_app_id;
  END IF;

  IF p_apikey IS NOT NULL THEN
    SELECT * INTO v_api_key
    FROM public.find_apikey_by_value(p_apikey)
    LIMIT 1;

    IF v_api_key.id IS NULL
      OR (p_user_id IS NOT NULL AND p_user_id IS DISTINCT FROM v_api_key.user_id)
      OR v_effective_org_id IS NULL
    THEN
      RETURN false;
    END IF;

    IF public.is_apikey_expired(v_api_key.expires_at) THEN
      RETURN false;
    END IF;

    v_effective_user_id := v_api_key.user_id;

    IF (SELECT enforcing_2fa FROM public.orgs WHERE id = v_effective_org_id)
      AND NOT public.has_2fa_enabled(v_effective_user_id)
    THEN
      RETURN false;
    END IF;

    RETURN public.rbac_has_permission(
      public.rbac_principal_apikey(),
      v_api_key.rbac_id,
      p_permission_key,
      v_effective_org_id,
      v_effective_app_id,
      p_channel_id
    );
  END IF;

  IF v_effective_org_id IS NOT NULL THEN
    IF (SELECT enforcing_2fa FROM public.orgs WHERE id = v_effective_org_id)
      AND (v_effective_user_id IS NULL OR NOT public.has_2fa_enabled(v_effective_user_id))
    THEN
      RETURN false;
    END IF;
  END IF;

  IF v_effective_user_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.rbac_has_permission(
    public.rbac_principal_user(),
    v_effective_user_id,
    p_permission_key,
    v_effective_org_id,
    v_effective_app_id,
    p_channel_id
  );
END;
$$;


ALTER FUNCTION "public"."rbac_check_permission_direct_no_password_policy"("p_permission_key" "text", "p_user_id" "uuid", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint, "p_apikey" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_check_permission_no_password_policy"("p_permission_key" "text", "p_org_id" "uuid" DEFAULT NULL::"uuid", "p_app_id" character varying DEFAULT NULL::character varying, "p_channel_id" bigint DEFAULT NULL::bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.rbac_check_permission_direct_no_password_policy(
    p_permission_key,
    auth.uid(),
    p_org_id,
    p_app_id,
    p_channel_id,
    NULL
  );
END;
$$;


ALTER FUNCTION "public"."rbac_check_permission_no_password_policy"("p_permission_key" "text", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rbac_check_permission_no_password_policy"("p_permission_key" "text", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint) IS 'RBAC permission check without password policy enforcement. Uses auth.uid() and delegates to rbac_check_permission_direct_no_password_policy.';



CREATE OR REPLACE FUNCTION "public"."rbac_check_permission_request"("p_permission_key" "text", "p_org_id" "uuid" DEFAULT NULL::"uuid", "p_app_id" character varying DEFAULT NULL::character varying, "p_channel_id" bigint DEFAULT NULL::bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN public.rbac_check_permission_direct(
    p_permission_key,
    auth.uid(),
    p_org_id,
    p_app_id,
    p_channel_id,
    public.get_apikey_header()
  );
END;
$$;


ALTER FUNCTION "public"."rbac_check_permission_request"("p_permission_key" "text", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rbac_check_permission_request"("p_permission_key" "text", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint) IS 'Request-aware RBAC permission wrapper for RLS and SQL callers. Uses auth.uid() and the API key request header.';



CREATE OR REPLACE FUNCTION "public"."rbac_has_permission"("p_principal_type" "text", "p_principal_id" "uuid", "p_permission_key" "text", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_org_id uuid := p_org_id;
  v_app_uuid uuid;
  v_app_owner_org uuid;
  v_channel_uuid uuid;
  v_channel_app_id text;
  v_channel_org_id uuid;
  v_has boolean := false;
BEGIN
  IF p_permission_key IS NULL THEN
    RETURN false;
  END IF;

  -- Resolve scope identifiers to UUIDs. Preserve the caller org when the app does not exist yet.
  IF p_app_id IS NOT NULL THEN
    SELECT id, owner_org INTO v_app_uuid, v_app_owner_org
    FROM public.apps
    WHERE app_id = p_app_id
    LIMIT 1;

    IF v_app_owner_org IS NOT NULL THEN
      v_org_id := v_app_owner_org;
    END IF;
  END IF;

  IF p_channel_id IS NOT NULL THEN
    SELECT rbac_id, app_id, owner_org INTO v_channel_uuid, v_channel_app_id, v_channel_org_id
    FROM public.channels
    WHERE id = p_channel_id
    LIMIT 1;

    IF v_channel_uuid IS NOT NULL THEN
      IF p_app_id IS NOT NULL AND p_app_id IS DISTINCT FROM v_channel_app_id THEN
        RETURN false;
      END IF;

      IF p_org_id IS NOT NULL AND p_org_id IS DISTINCT FROM v_channel_org_id THEN
        RETURN false;
      END IF;

      SELECT id INTO v_app_uuid
      FROM public.apps
      WHERE app_id = v_channel_app_id
      LIMIT 1;

      v_org_id := v_channel_org_id;
    END IF;
  END IF;

  WITH RECURSIVE scope_catalog AS (
    SELECT public.rbac_scope_org()::text AS scope_type, v_org_id AS org_id, NULL::uuid AS app_id, NULL::uuid AS channel_id WHERE v_org_id IS NOT NULL
    UNION ALL
    SELECT public.rbac_scope_app(), v_org_id, v_app_uuid, NULL::uuid WHERE v_app_uuid IS NOT NULL
    UNION ALL
    SELECT public.rbac_scope_channel(), v_org_id, v_app_uuid, v_channel_uuid WHERE v_channel_uuid IS NOT NULL
  ),
  direct_roles AS (
    SELECT rb.role_id, rb.scope_type
    FROM scope_catalog s
    JOIN public.role_bindings rb ON rb.scope_type = s.scope_type
      AND (
        (rb.scope_type = public.rbac_scope_org() AND rb.org_id = s.org_id) OR
        (rb.scope_type = public.rbac_scope_app() AND rb.org_id = s.org_id AND rb.app_id = s.app_id) OR
        (rb.scope_type = public.rbac_scope_channel() AND rb.org_id = s.org_id AND rb.app_id = s.app_id AND rb.channel_id = s.channel_id)
      )
    JOIN public.roles r ON r.id = rb.role_id
      AND r.scope_type = rb.scope_type
    WHERE rb.principal_type = p_principal_type
      AND rb.principal_id = p_principal_id
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
  ),
  group_roles AS (
    SELECT rb.role_id, rb.scope_type
    FROM scope_catalog s
    JOIN public.group_members gm ON gm.user_id = p_principal_id
    JOIN public.groups g ON g.id = gm.group_id
    JOIN public.role_bindings rb ON rb.principal_type = public.rbac_principal_group() AND rb.principal_id = gm.group_id
    JOIN public.roles r ON r.id = rb.role_id
      AND r.scope_type = rb.scope_type
    WHERE p_principal_type = public.rbac_principal_user()
      AND rb.scope_type = s.scope_type
      AND (
        (rb.scope_type = public.rbac_scope_org() AND rb.org_id = s.org_id) OR
        (rb.scope_type = public.rbac_scope_app() AND rb.org_id = s.org_id AND rb.app_id = s.app_id) OR
        (rb.scope_type = public.rbac_scope_channel() AND rb.org_id = s.org_id AND rb.app_id = s.app_id AND rb.channel_id = s.channel_id)
      )
      AND (v_org_id IS NULL OR g.org_id = v_org_id)
      AND (rb.expires_at IS NULL OR rb.expires_at > now())
  ),
  combined_roles AS (
    SELECT role_id, scope_type FROM direct_roles
    UNION
    SELECT role_id, scope_type FROM group_roles
  ),
  role_closure AS (
    SELECT role_id, scope_type FROM combined_roles
    UNION
    SELECT rh.child_role_id, rc.scope_type
    FROM public.role_hierarchy rh
    JOIN role_closure rc ON rc.role_id = rh.parent_role_id
    JOIN public.roles child_role ON child_role.id = rh.child_role_id
      AND child_role.scope_type = rc.scope_type
  ),
  perm_set AS (
    SELECT DISTINCT p.key
    FROM role_closure rc
    JOIN public.role_permissions rp ON rp.role_id = rc.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
  )
  SELECT EXISTS (SELECT 1 FROM perm_set WHERE key = p_permission_key) INTO v_has;

  RETURN v_has;
END;
$$;


ALTER FUNCTION "public"."rbac_has_permission"("p_principal_type" "text", "p_principal_id" "uuid", "p_permission_key" "text", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rbac_has_permission"("p_principal_type" "text", "p_principal_id" "uuid", "p_permission_key" "text", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint) IS 'Checks whether a principal has a permission at org/app/channel scope. App and channel bindings must match the resolved owning org so forged cross-org scope rows are ignored.';



CREATE OR REPLACE FUNCTION "public"."rbac_perm_app_build_native"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app.build_native'::text $$;


ALTER FUNCTION "public"."rbac_perm_app_build_native"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_app_create_channel"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app.create_channel'::text $$;


ALTER FUNCTION "public"."rbac_perm_app_create_channel"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_app_delete"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app.delete'::text $$;


ALTER FUNCTION "public"."rbac_perm_app_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_app_manage_devices"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app.manage_devices'::text $$;


ALTER FUNCTION "public"."rbac_perm_app_manage_devices"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_app_read"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app.read'::text $$;


ALTER FUNCTION "public"."rbac_perm_app_read"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_app_read_audit"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app.read_audit'::text $$;


ALTER FUNCTION "public"."rbac_perm_app_read_audit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_app_read_bundles"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app.read_bundles'::text $$;


ALTER FUNCTION "public"."rbac_perm_app_read_bundles"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_app_read_channels"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app.read_channels'::text $$;


ALTER FUNCTION "public"."rbac_perm_app_read_channels"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_app_read_devices"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app.read_devices'::text $$;


ALTER FUNCTION "public"."rbac_perm_app_read_devices"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_app_read_logs"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app.read_logs'::text $$;


ALTER FUNCTION "public"."rbac_perm_app_read_logs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_app_transfer"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app.transfer'::text $$;


ALTER FUNCTION "public"."rbac_perm_app_transfer"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_app_update_settings"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app.update_settings'::text $$;


ALTER FUNCTION "public"."rbac_perm_app_update_settings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_app_update_user_roles"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app.update_user_roles'::text $$;


ALTER FUNCTION "public"."rbac_perm_app_update_user_roles"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_app_upload_bundle"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app.upload_bundle'::text $$;


ALTER FUNCTION "public"."rbac_perm_app_upload_bundle"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_bundle_delete"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'bundle.delete'::text $$;


ALTER FUNCTION "public"."rbac_perm_bundle_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_bundle_read"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'bundle.read'::text $$;


ALTER FUNCTION "public"."rbac_perm_bundle_read"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_bundle_update"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'bundle.update'::text $$;


ALTER FUNCTION "public"."rbac_perm_bundle_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_channel_delete"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'channel.delete'::text $$;


ALTER FUNCTION "public"."rbac_perm_channel_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_channel_manage_forced_devices"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'channel.manage_forced_devices'::text $$;


ALTER FUNCTION "public"."rbac_perm_channel_manage_forced_devices"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_channel_promote_bundle"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'channel.promote_bundle'::text $$;


ALTER FUNCTION "public"."rbac_perm_channel_promote_bundle"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_channel_read"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'channel.read'::text $$;


ALTER FUNCTION "public"."rbac_perm_channel_read"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_channel_read_audit"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'channel.read_audit'::text $$;


ALTER FUNCTION "public"."rbac_perm_channel_read_audit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_channel_read_forced_devices"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'channel.read_forced_devices'::text $$;


ALTER FUNCTION "public"."rbac_perm_channel_read_forced_devices"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_channel_read_history"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'channel.read_history'::text $$;


ALTER FUNCTION "public"."rbac_perm_channel_read_history"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_channel_rollback_bundle"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'channel.rollback_bundle'::text $$;


ALTER FUNCTION "public"."rbac_perm_channel_rollback_bundle"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_channel_update_settings"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'channel.update_settings'::text $$;


ALTER FUNCTION "public"."rbac_perm_channel_update_settings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_org_create"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  SELECT 'org.create'::text
$$;


ALTER FUNCTION "public"."rbac_perm_org_create"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rbac_perm_org_create"() IS 'Global API-key permission for creating a new organization before an org-scoped RBAC binding can exist.';



CREATE OR REPLACE FUNCTION "public"."rbac_perm_org_create_app"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$ SELECT 'org.create_app'::text $$;


ALTER FUNCTION "public"."rbac_perm_org_create_app"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rbac_perm_org_create_app"() IS 'RBAC permission key: create an app within an organization.';



CREATE OR REPLACE FUNCTION "public"."rbac_perm_org_delete"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'org.delete'::text $$;


ALTER FUNCTION "public"."rbac_perm_org_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_org_invite_user"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'org.invite_user'::text $$;


ALTER FUNCTION "public"."rbac_perm_org_invite_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_org_read"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'org.read'::text $$;


ALTER FUNCTION "public"."rbac_perm_org_read"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_org_read_audit"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'org.read_audit'::text $$;


ALTER FUNCTION "public"."rbac_perm_org_read_audit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_org_read_billing"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'org.read_billing'::text $$;


ALTER FUNCTION "public"."rbac_perm_org_read_billing"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_org_read_billing_audit"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'org.read_billing_audit'::text $$;


ALTER FUNCTION "public"."rbac_perm_org_read_billing_audit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_org_read_invoices"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'org.read_invoices'::text $$;


ALTER FUNCTION "public"."rbac_perm_org_read_invoices"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_org_read_members"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'org.read_members'::text $$;


ALTER FUNCTION "public"."rbac_perm_org_read_members"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_org_update_billing"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'org.update_billing'::text $$;


ALTER FUNCTION "public"."rbac_perm_org_update_billing"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_org_update_settings"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'org.update_settings'::text $$;


ALTER FUNCTION "public"."rbac_perm_org_update_settings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_org_update_user_roles"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'org.update_user_roles'::text $$;


ALTER FUNCTION "public"."rbac_perm_org_update_user_roles"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_platform_db_break_glass"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'platform.db_break_glass'::text $$;


ALTER FUNCTION "public"."rbac_perm_platform_db_break_glass"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_platform_delete_orphan_users"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'platform.delete_orphan_users'::text $$;


ALTER FUNCTION "public"."rbac_perm_platform_delete_orphan_users"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_platform_impersonate_user"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'platform.impersonate_user'::text $$;


ALTER FUNCTION "public"."rbac_perm_platform_impersonate_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_platform_manage_apps_any"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'platform.manage_apps_any'::text $$;


ALTER FUNCTION "public"."rbac_perm_platform_manage_apps_any"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_platform_manage_channels_any"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'platform.manage_channels_any'::text $$;


ALTER FUNCTION "public"."rbac_perm_platform_manage_channels_any"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_platform_manage_orgs_any"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'platform.manage_orgs_any'::text $$;


ALTER FUNCTION "public"."rbac_perm_platform_manage_orgs_any"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_platform_read_all_audit"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'platform.read_all_audit'::text $$;


ALTER FUNCTION "public"."rbac_perm_platform_read_all_audit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_perm_platform_run_maintenance_jobs"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'platform.run_maintenance_jobs'::text $$;


ALTER FUNCTION "public"."rbac_perm_platform_run_maintenance_jobs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_principal_apikey"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'apikey'::text $$;


ALTER FUNCTION "public"."rbac_principal_apikey"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_principal_group"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'group'::text $$;


ALTER FUNCTION "public"."rbac_principal_group"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_principal_user"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'user'::text $$;


ALTER FUNCTION "public"."rbac_principal_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_role_apikey_org_reader"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'apikey_org_reader'::text $$;


ALTER FUNCTION "public"."rbac_role_apikey_org_reader"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_role_app_admin"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app_admin'::text $$;


ALTER FUNCTION "public"."rbac_role_app_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_role_app_developer"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app_developer'::text $$;


ALTER FUNCTION "public"."rbac_role_app_developer"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_role_app_reader"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app_reader'::text $$;


ALTER FUNCTION "public"."rbac_role_app_reader"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_role_app_uploader"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app_uploader'::text $$;


ALTER FUNCTION "public"."rbac_role_app_uploader"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_role_bundle_admin"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'bundle_admin'::text $$;


ALTER FUNCTION "public"."rbac_role_bundle_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_role_bundle_reader"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'bundle_reader'::text $$;


ALTER FUNCTION "public"."rbac_role_bundle_reader"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_role_channel_admin"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'channel_admin'::text $$;


ALTER FUNCTION "public"."rbac_role_channel_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_role_channel_reader"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'channel_reader'::text $$;


ALTER FUNCTION "public"."rbac_role_channel_reader"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_role_org_admin"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'org_admin'::text $$;


ALTER FUNCTION "public"."rbac_role_org_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_role_org_billing_admin"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'org_billing_admin'::text $$;


ALTER FUNCTION "public"."rbac_role_org_billing_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_role_org_member"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'org_member'::text $$;


ALTER FUNCTION "public"."rbac_role_org_member"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_role_org_super_admin"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'org_super_admin'::text $$;


ALTER FUNCTION "public"."rbac_role_org_super_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_role_platform_super_admin"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'platform_super_admin'::text $$;


ALTER FUNCTION "public"."rbac_role_platform_super_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_scope_app"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'app'::text $$;


ALTER FUNCTION "public"."rbac_scope_app"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_scope_bundle"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'bundle'::text $$;


ALTER FUNCTION "public"."rbac_scope_bundle"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_scope_channel"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'channel'::text $$;


ALTER FUNCTION "public"."rbac_scope_channel"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_scope_org"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'org'::text $$;


ALTER FUNCTION "public"."rbac_scope_org"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rbac_scope_platform"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$ SELECT 'platform'::text $$;


ALTER FUNCTION "public"."rbac_scope_platform"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."read_bandwidth_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) RETURNS TABLE("date" timestamp without time zone, "bandwidth" numeric, "app_id" character varying)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."read_bandwidth_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."read_device_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) RETURNS TABLE("date" "date", "mau" bigint, "app_id" character varying)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    first_seen.date AS date,
    COUNT(*)::bigint AS mau,
    p_app_id AS app_id
  FROM (
    SELECT
      MIN(DATE_TRUNC('day', device_usage.timestamp)::date) AS date,
      device_usage.device_id
    FROM public.device_usage
    WHERE
      device_usage.app_id = p_app_id
      AND device_usage.timestamp >= p_period_start
      AND device_usage.timestamp < p_period_end
    GROUP BY device_usage.device_id
  ) AS first_seen
  GROUP BY first_seen.date
  ORDER BY first_seen.date;
END;
$$;


ALTER FUNCTION "public"."read_device_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."read_native_version_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) RETURNS TABLE("date" "date", "platform" character varying, "version_build" character varying, "devices" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  WITH authorized_app AS (
    SELECT apps.app_id
    FROM public.apps
    WHERE apps.app_id = p_app_id
      AND public.rbac_check_permission_request(
        public.rbac_perm_app_read(),
        apps.owner_org,
        apps.app_id,
        NULL::bigint
      )
  ),
  daily_version_usage AS (
    SELECT
      date_trunc('day', du.timestamp)::date AS usage_date,
      COALESCE(NULLIF(du.platform, ''), NULLIF(d.platform::text, ''), 'unknown')::character varying AS usage_platform,
      COALESCE(NULLIF(du.version_build, ''), 'unknown')::character varying AS usage_version_build,
      du.device_id
    FROM public.device_usage AS du
    INNER JOIN authorized_app AS aa ON aa.app_id = du.app_id
    LEFT JOIN public.devices AS d
      ON d.app_id = du.app_id
      AND d.device_id = du.device_id
    WHERE du.timestamp >= p_period_start
      AND du.timestamp < p_period_end
  )
  SELECT
    usage_date AS date,
    usage_platform AS platform,
    usage_version_build AS version_build,
    COUNT(DISTINCT device_id)::bigint AS devices
  FROM daily_version_usage
  GROUP BY usage_date, usage_platform, usage_version_build
  ORDER BY usage_date, usage_platform, usage_version_build;
END;
$$;


ALTER FUNCTION "public"."read_native_version_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."read_native_version_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) IS 'Authorized aggregate for native version usage by platform. Raw device_usage rows remain denied by RLS.';



CREATE OR REPLACE FUNCTION "public"."read_storage_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) RETURNS TABLE("app_id" character varying, "date" "date", "storage" bigint)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."read_storage_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."read_version_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) RETURNS TABLE("app_id" character varying, "version_name" character varying, "date" timestamp without time zone, "get" bigint, "fail" bigint, "install" bigint, "uninstall" bigint)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    vu.app_id,
    -- Use version_name if available (new data), otherwise look up from app_versions (old data)
    COALESCE(vu.version_name, av.name)::character varying as version_name,
    DATE_TRUNC('day', vu.timestamp) AS date,
    SUM(CASE WHEN vu.action = 'get' THEN 1 ELSE 0 END) AS get,
    SUM(CASE WHEN vu.action = 'fail' THEN 1 ELSE 0 END) AS fail,
    SUM(CASE WHEN vu.action = 'install' THEN 1 ELSE 0 END) AS install,
    SUM(CASE WHEN vu.action = 'uninstall' THEN 1 ELSE 0 END) AS uninstall
  FROM public.version_usage vu
  LEFT JOIN public.app_versions av ON vu.version_id = av.id AND vu.version_name IS NULL
  WHERE
    vu.app_id = p_app_id
    AND vu.timestamp >= p_period_start
    AND vu.timestamp < p_period_end
  GROUP BY date, vu.app_id, COALESCE(vu.version_name, av.name)
  ORDER BY date;
END;
$$;


ALTER FUNCTION "public"."read_version_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reassign_webhook_created_by_before_user_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Preserve org-owned webhooks when a non-owner creator deletes their account.
  UPDATE "public"."webhooks" AS "webhook"
  SET "created_by" = "orgs"."created_by"
  FROM "public"."orgs" AS "orgs"
  WHERE "webhook"."org_id" = "orgs"."id"
    AND "webhook"."created_by" = OLD."id"
    AND "orgs"."created_by" <> OLD."id";

  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."reassign_webhook_created_by_before_user_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_build_time"("p_org_id" "uuid", "p_user_id" "uuid", "p_build_id" character varying, "p_platform" character varying, "p_build_time_unit" bigint, "p_app_id" character varying) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_build_log_id uuid;
  v_multiplier numeric;
  v_billable_seconds bigint;
  v_caller_user_id uuid;
BEGIN
  IF p_app_id IS NULL OR p_app_id = '' THEN
    RAISE EXCEPTION 'INVALID_APP_ID';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.apps
    WHERE app_id = p_app_id AND owner_org = p_org_id
  ) THEN
    RAISE EXCEPTION 'INVALID_APP_ID';
  END IF;

  IF public.is_internal_request_role(public.current_request_role()) THEN
    v_caller_user_id := p_user_id;
  ELSE
    v_caller_user_id := public.request_actor_user_id();
  END IF;

  IF v_caller_user_id IS NULL THEN
    RAISE EXCEPTION 'NO_RIGHTS';
  END IF;

  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(
      public.rbac_perm_app_build_native(),
      p_org_id,
      p_app_id,
      NULL::bigint
    )
  THEN
    RAISE EXCEPTION 'NO_RIGHTS';
  END IF;

  IF p_build_time_unit < 0 THEN
    RAISE EXCEPTION 'Build time cannot be negative';
  END IF;
  IF p_platform NOT IN ('ios', 'android') THEN
    RAISE EXCEPTION 'Invalid platform: %', p_platform;
  END IF;

  v_multiplier := CASE p_platform
    WHEN 'ios' THEN 2
    WHEN 'android' THEN 1
    ELSE 1
  END;

  v_billable_seconds := (p_build_time_unit * v_multiplier)::bigint;

  INSERT INTO public.build_logs (org_id, user_id, build_id, platform, build_time_unit, billable_seconds, app_id)
  VALUES (p_org_id, v_caller_user_id, p_build_id, p_platform, p_build_time_unit, v_billable_seconds, p_app_id)
  ON CONFLICT (build_id, org_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    platform = EXCLUDED.platform,
    build_time_unit = EXCLUDED.build_time_unit,
    billable_seconds = EXCLUDED.billable_seconds,
    app_id = EXCLUDED.app_id
  RETURNING id INTO v_build_log_id;

  RETURN v_build_log_id;
END;
$$;


ALTER FUNCTION "public"."record_build_time"("p_org_id" "uuid", "p_user_id" "uuid", "p_build_id" character varying, "p_platform" character varying, "p_build_time_unit" bigint, "p_app_id" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_deployment_history"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF OLD.version IS DISTINCT FROM NEW.version AND NEW.version IS NOT NULL THEN
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
      COALESCE(public.request_actor_user_id(), NEW.created_by)
    );
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."record_deployment_history"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_email_otp_verified"("p_user_id" "uuid") RETURNS timestamp with time zone
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_now timestamptz := NOW();
BEGIN
    IF "p_user_id" IS NULL THEN
        RAISE EXCEPTION 'user_id required';
    END IF;

    INSERT INTO "public"."user_security" (user_id, email_otp_verified_at, created_at, updated_at)
    VALUES ("p_user_id", v_now, v_now, v_now)
    ON CONFLICT (user_id) DO UPDATE
    SET email_otp_verified_at = EXCLUDED.email_otp_verified_at,
        updated_at = EXCLUDED.updated_at;

    RETURN v_now;
END;
$$;


ALTER FUNCTION "public"."record_email_otp_verified"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_app_rollups_after_demo_reset"("p_app_uuid" "uuid", "p_app_id" "text", "p_owner_org" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_last_version text;
  v_manifest_bundle_count bigint := 0;
  v_channel_device_count bigint := 0;
BEGIN
  SELECT "name"
  INTO v_last_version
  FROM "public"."app_versions"
  WHERE "app_id" = p_app_id
    AND "deleted" IS FALSE
  ORDER BY "created_at" DESC, "id" DESC
  LIMIT 1;

  SELECT COUNT(*)::bigint
  INTO v_manifest_bundle_count
  FROM "public"."app_versions"
  WHERE "app_id" = p_app_id
    AND "deleted" IS FALSE
    AND COALESCE("manifest_count", 0) > 0;

  SELECT COUNT(*)::bigint
  INTO v_channel_device_count
  FROM "public"."channel_devices"
  WHERE "app_id" = p_app_id;

  UPDATE "public"."apps"
  SET
    "last_version" = v_last_version,
    "manifest_bundle_count" = v_manifest_bundle_count,
    "channel_device_count" = v_channel_device_count
  WHERE "id" = p_app_uuid;

  IF p_owner_org IS NOT NULL THEN
    DELETE FROM "public"."app_metrics_cache"
    WHERE "org_id" = p_owner_org;
  END IF;
END;
$$;


ALTER FUNCTION "public"."refresh_app_rollups_after_demo_reset"("p_app_uuid" "uuid", "p_app_id" "text", "p_owner_org" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_orgs_has_usage_credits"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  WITH credit_state AS (
    SELECT
      o."id",
      COALESCE(g."has_usage_credits", false) AS "has_usage_credits"
    FROM "public"."orgs" AS o
    LEFT JOIN (
      SELECT
        grant_rows."org_id",
        bool_or(
          grant_rows."expires_at" >= now()
          AND grant_rows."credits_consumed" < grant_rows."credits_total"
        ) AS "has_usage_credits"
      FROM "public"."usage_credit_grants" AS grant_rows
      GROUP BY grant_rows."org_id"
    ) AS g ON g."org_id" = o."id"
  )
  UPDATE "public"."orgs" AS o
  SET "has_usage_credits" = credit_state."has_usage_credits"
  FROM credit_state
  WHERE o."id" = credit_state."id"
    AND o."has_usage_credits" IS DISTINCT FROM credit_state."has_usage_credits";
END;
$$;


ALTER FUNCTION "public"."refresh_orgs_has_usage_credits"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."regenerate_hashed_apikey"("p_apikey_id" bigint) RETURNS "public"."apikeys"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := public.request_actor_user_id();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No authentication provided';
  END IF;

  RETURN public.regenerate_hashed_apikey_for_user(p_apikey_id, v_user_id);
END;
$$;


ALTER FUNCTION "public"."regenerate_hashed_apikey"("p_apikey_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."regenerate_hashed_apikey_for_user"("p_apikey_id" bigint, "p_user_id" "uuid") RETURNS "public"."apikeys"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  v_plain_key text;
  v_apikey public.apikeys;
BEGIN
  v_plain_key := gen_random_uuid()::text;

  PERFORM set_config('capgo.skip_apikey_trigger', 'true', true);

  UPDATE public.apikeys
    SET key = NULL,
        key_hash = encode(extensions.digest(v_plain_key, 'sha256'), 'hex')
    WHERE id = p_apikey_id
      AND user_id = p_user_id
    RETURNING * INTO v_apikey;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'apikey_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  v_apikey.key := v_plain_key;

  RETURN v_apikey;
END;
$$;


ALTER FUNCTION "public"."regenerate_hashed_apikey_for_user"("p_apikey_id" bigint, "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_access_due_to_2fa"("org_id" "uuid", "user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    org_enforcing_2fa boolean;
BEGIN
    -- Check if org exists
    IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE public.orgs.id = reject_access_due_to_2fa.org_id) THEN
        RETURN false;
    END IF;

    -- Check if org has 2FA enforcement enabled
    SELECT enforcing_2fa INTO org_enforcing_2fa
    FROM public.orgs
    WHERE public.orgs.id = reject_access_due_to_2fa.org_id;

    -- 7.1 If a given org does not enable 2FA enforcement, return false
    IF org_enforcing_2fa = false THEN
        RETURN false;
    END IF;

    -- 7.2 If a given org REQUIRES 2FA, and has_2fa_enabled(user_id) == false, return true
    IF org_enforcing_2fa = true AND NOT public.has_2fa_enabled(reject_access_due_to_2fa.user_id) THEN
        PERFORM public.pg_log('deny: REJECT_ACCESS_DUE_TO_2FA', jsonb_build_object('org_id', org_id, 'user_id', user_id));
        RETURN true;
    END IF;

    -- 7.3 Otherwise, return false
    RETURN false;
END;
$$;


ALTER FUNCTION "public"."reject_access_due_to_2fa"("org_id" "uuid", "user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_access_due_to_2fa_for_app"("app_id" character varying) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_owner_org uuid;
  v_user_id uuid;
  v_org_enforcing_2fa boolean;
BEGIN
  SELECT owner_org INTO v_owner_org
  FROM public.apps
  WHERE public.apps.app_id = reject_access_due_to_2fa_for_app.app_id;

  IF v_owner_org IS NULL THEN
    RETURN false;
  END IF;

  IF NOT public.rbac_check_permission_request(
    public.rbac_perm_app_read(),
    v_owner_org,
    reject_access_due_to_2fa_for_app.app_id,
    NULL::bigint
  ) THEN
    RETURN false;
  END IF;

  v_user_id := public.request_actor_user_id();
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT enforcing_2fa INTO v_org_enforcing_2fa
  FROM public.orgs
  WHERE public.orgs.id = v_owner_org;

  RETURN COALESCE(v_org_enforcing_2fa, false) AND NOT public.has_2fa_enabled(v_user_id);
END;
$$;


ALTER FUNCTION "public"."reject_access_due_to_2fa_for_app"("app_id" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_access_due_to_2fa_for_org"("org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_user_id uuid;
  v_org_enforcing_2fa boolean;
BEGIN
  IF NOT public.rbac_check_permission_request(
    public.rbac_perm_org_read(),
    reject_access_due_to_2fa_for_org.org_id,
    NULL::character varying,
    NULL::bigint
  ) THEN
    RETURN true;
  END IF;

  v_user_id := public.request_actor_user_id();
  IF v_user_id IS NULL THEN
    RETURN true;
  END IF;

  SELECT enforcing_2fa INTO v_org_enforcing_2fa
  FROM public.orgs
  WHERE public.orgs.id = reject_access_due_to_2fa_for_org.org_id;

  RETURN COALESCE(v_org_enforcing_2fa, false) AND NOT public.has_2fa_enabled(v_user_id);
END;
$$;


ALTER FUNCTION "public"."reject_access_due_to_2fa_for_org"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_access_due_to_password_policy"("org_id" "uuid", "user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    org_has_policy boolean;
BEGIN
    -- Check if org exists
    IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE public.orgs.id = reject_access_due_to_password_policy.org_id) THEN
        RETURN false;
    END IF;

    -- Check if org has password policy enabled
    SELECT
        password_policy_config IS NOT NULL
        AND (password_policy_config->>'enabled')::boolean = true
    INTO org_has_policy
    FROM public.orgs
    WHERE public.orgs.id = reject_access_due_to_password_policy.org_id;

    -- If no policy enabled, don't reject
    IF NOT COALESCE(org_has_policy, false) THEN
        RETURN false;
    END IF;

    -- If org requires policy and user doesn't meet it, reject access
    IF NOT public.user_meets_password_policy(user_id, org_id) THEN
        PERFORM public.pg_log('deny: REJECT_ACCESS_DUE_TO_PASSWORD_POLICY', jsonb_build_object('org_id', org_id, 'user_id', user_id));
        RETURN true;
    END IF;

    RETURN false;
END;
$$;


ALTER FUNCTION "public"."reject_access_due_to_password_policy"("org_id" "uuid", "user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_old_jobs"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    DELETE FROM cron.job_run_details
    WHERE end_time < NOW() - interval '1 day';
END;
$$;


ALTER FUNCTION "public"."remove_old_jobs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_actor_user_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_auth_uid uuid;
  v_apikey text;
  v_api_key public.apikeys%ROWTYPE;
BEGIN
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NOT NULL THEN
    RETURN v_auth_uid;
  END IF;

  v_apikey := public.get_apikey_header();
  IF v_apikey IS NULL OR v_apikey = '' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_api_key
  FROM public.find_apikey_by_value(v_apikey)
  LIMIT 1;

  IF v_api_key.id IS NULL OR public.is_apikey_expired(v_api_key.expires_at) THEN
    RETURN NULL;
  END IF;

  RETURN v_api_key.user_id;
END;
$$;


ALTER FUNCTION "public"."request_actor_user_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_app_chart_refresh"("app_id" character varying) RETURNS TABLE("requested_at" timestamp without time zone, "queued_app_ids" character varying[], "queued_count" integer, "skipped_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_org_id uuid;
  v_before_requested_at timestamp without time zone;
  v_after_requested_at timestamp without time zone;
  v_request_started_at timestamp without time zone := pg_catalog.timezone('UTC', pg_catalog.clock_timestamp());
  v_queued boolean := false;
BEGIN
  IF request_app_chart_refresh.app_id IS NULL OR request_app_chart_refresh.app_id = '' THEN
    RAISE EXCEPTION 'App ID is required';
  END IF;

  SELECT a.owner_org, a.stats_refresh_requested_at
  INTO v_org_id, v_before_requested_at
  FROM public.apps a
  WHERE a.app_id = request_app_chart_refresh.app_id
  LIMIT 1;

  IF v_org_id IS NULL THEN
    IF public.is_internal_request_role(public.current_request_role()) THEN
      RAISE EXCEPTION 'App not found';
    END IF;
    RAISE EXCEPTION 'App access denied';
  END IF;

  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(
      public.rbac_perm_app_read(),
      v_org_id,
      request_app_chart_refresh.app_id,
      NULL::bigint
    )
  THEN
    RAISE EXCEPTION 'App access denied';
  END IF;

  PERFORM public.queue_cron_stat_app_for_app(request_app_chart_refresh.app_id, v_org_id);

  SELECT a.stats_refresh_requested_at
  INTO v_after_requested_at
  FROM public.apps a
  WHERE a.app_id = request_app_chart_refresh.app_id
  LIMIT 1;

  v_queued := v_after_requested_at IS NOT NULL
    AND v_after_requested_at >= v_request_started_at
    AND (v_before_requested_at IS NULL OR v_after_requested_at IS DISTINCT FROM v_before_requested_at);

  RETURN QUERY
  SELECT
    v_after_requested_at,
    CASE WHEN v_queued THEN ARRAY[request_app_chart_refresh.app_id]::character varying[] ELSE ARRAY[]::character varying[] END,
    CASE WHEN v_queued THEN 1 ELSE 0 END,
    CASE WHEN v_queued THEN 0 ELSE 1 END;
END;
$$;


ALTER FUNCTION "public"."request_app_chart_refresh"("app_id" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_has_app_read_access"("orgid" "uuid", "appid" character varying) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN public.rbac_check_permission_request(
    public.rbac_perm_app_read(),
    request_has_app_read_access.orgid,
    request_has_app_read_access.appid,
    NULL::bigint
  );
END;
$$;


ALTER FUNCTION "public"."request_has_app_read_access"("orgid" "uuid", "appid" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_has_org_read_access"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN public.rbac_check_permission_request(
    public.rbac_perm_org_read(),
    request_has_org_read_access.orgid,
    NULL::character varying,
    NULL::bigint
  );
END;
$$;


ALTER FUNCTION "public"."request_has_org_read_access"("orgid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_org_chart_refresh"("org_id" "uuid") RETURNS TABLE("requested_at" timestamp without time zone, "queued_app_ids" character varying[], "queued_count" integer, "skipped_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_request_started_at timestamp without time zone := pg_catalog.timezone('UTC', pg_catalog.clock_timestamp());
  v_queued_app_ids character varying[] := ARRAY[]::character varying[];
  v_queued_count integer := 0;
  v_total_count integer := 0;
  v_org_exists boolean := false;
  v_org_requested_at_before timestamp without time zone;
  v_return_requested_at timestamp without time zone;
  v_before_requested_at timestamp without time zone;
  v_after_requested_at timestamp without time zone;
  app_record record;
BEGIN
  IF request_org_chart_refresh.org_id IS NULL THEN
    RAISE EXCEPTION 'Org ID is required';
  END IF;

  SELECT o.stats_refresh_requested_at
  INTO v_org_requested_at_before
  FROM public.orgs o
  WHERE o.id = request_org_chart_refresh.org_id
  LIMIT 1;

  v_org_exists := FOUND;

  IF NOT v_org_exists THEN
    IF public.is_internal_request_role(public.current_request_role()) THEN
      RAISE EXCEPTION 'Organization not found';
    END IF;
    RAISE EXCEPTION 'Organization access denied';
  END IF;

  IF NOT public.is_internal_request_role(public.current_request_role())
    AND NOT public.rbac_check_permission_request(
      public.rbac_perm_org_read(),
      request_org_chart_refresh.org_id,
      NULL::character varying,
      NULL::bigint
    )
  THEN
    RAISE EXCEPTION 'Organization access denied';
  END IF;

  FOR app_record IN
    SELECT a.app_id, a.stats_refresh_requested_at
    FROM public.apps a
    WHERE a.owner_org = request_org_chart_refresh.org_id
    ORDER BY a.app_id
  LOOP
    v_total_count := v_total_count + 1;
    v_before_requested_at := app_record.stats_refresh_requested_at;

    PERFORM public.queue_cron_stat_app_for_app(app_record.app_id, request_org_chart_refresh.org_id);

    SELECT a.stats_refresh_requested_at
    INTO v_after_requested_at
    FROM public.apps a
    WHERE a.app_id = app_record.app_id
    LIMIT 1;

    IF v_after_requested_at IS NOT NULL
      AND v_after_requested_at >= v_request_started_at
      AND (v_before_requested_at IS NULL OR v_after_requested_at IS DISTINCT FROM v_before_requested_at) THEN
      v_queued_count := v_queued_count + 1;
      v_queued_app_ids := array_append(v_queued_app_ids, app_record.app_id);
    END IF;
  END LOOP;

  IF v_queued_count > 0 THEN
    UPDATE public.orgs
    SET stats_refresh_requested_at = v_request_started_at
    WHERE id = request_org_chart_refresh.org_id;

    v_return_requested_at := v_request_started_at;
  ELSE
    v_return_requested_at := v_org_requested_at_before;
  END IF;

  RETURN QUERY
  SELECT
    v_return_requested_at,
    COALESCE(v_queued_app_ids, ARRAY[]::character varying[]),
    v_queued_count,
    GREATEST(v_total_count - v_queued_count, 0);
END;
$$;


ALTER FUNCTION "public"."request_org_chart_refresh"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rescind_invitation"("email" "text", "org_id" "uuid") RETURNS character varying
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  tmp_user record;
BEGIN
  IF NOT public.rbac_check_permission_request(
    public.rbac_perm_org_invite_user(),
    rescind_invitation.org_id,
    NULL::character varying,
    NULL::bigint
  ) THEN
    RETURN 'NO_RIGHTS';
  END IF;

  PERFORM 1
  FROM public.orgs
  WHERE public.orgs.id = rescind_invitation.org_id;
  IF NOT FOUND THEN
    RETURN 'NO_RIGHTS';
  END IF;

  SELECT * INTO tmp_user
  FROM public.tmp_users
  WHERE public.tmp_users.email = rescind_invitation.email
    AND public.tmp_users.org_id = rescind_invitation.org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'NO_INVITATION';
  END IF;

  IF tmp_user.cancelled_at IS NOT NULL THEN
    RETURN 'ALREADY_CANCELLED';
  END IF;

  UPDATE public.tmp_users
  SET cancelled_at = CURRENT_TIMESTAMP
  WHERE public.tmp_users.id = tmp_user.id;

  RETURN 'OK';
END;
$$;


ALTER FUNCTION "public"."rescind_invitation"("email" "text", "org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_and_seed_app_data"("p_app_id" character varying, "p_org_id" "uuid" DEFAULT NULL::"uuid", "p_user_id" "uuid" DEFAULT NULL::"uuid", "p_admin_user_id" "uuid" DEFAULT NULL::"uuid", "p_stripe_customer_id" "text" DEFAULT NULL::"text", "p_plan_product_id" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
DECLARE
  org_id uuid := COALESCE(p_org_id, '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid);
  user_id uuid := COALESCE(p_user_id, '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid);
  admin_user_id uuid := COALESCE(p_admin_user_id, 'c591b04e-cf29-4945-b9a0-776d0672061a'::uuid);
  stripe_customer_id text := COALESCE(p_stripe_customer_id, 'cus_Q38uE91NP8Ufqc');
  plan_product_id text := COALESCE(p_plan_product_id, 'prod_LQIregjtNduh4q');
  org_name text := CASE
    WHEN p_org_id IS NULL THEN 'Demo org'
    ELSE concat('Seeded Org ', p_app_id)
  END;
  v1_0_1_version_id bigint; v1_0_0_version_id bigint; v1_361_0_version_id bigint; v1_360_0_version_id bigint; v1_359_0_version_id bigint;
  production_channel_id bigint; beta_channel_id bigint; development_channel_id bigint; no_access_channel_id bigint; electron_only_channel_id bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_app_id));
  PERFORM public.reset_app_data(p_app_id);
  -- Ensure the base Stripe customer and org exist so FK inserts are stable between tests
  INSERT INTO public.stripe_info (
    customer_id,
    product_id,
    subscription_id,
    status,
    trial_at,
    is_good_plan,
    plan_usage,
    subscription_anchor_start,
    subscription_anchor_end,
    mau_exceeded,
    bandwidth_exceeded,
    storage_exceeded,
    build_time_exceeded
  ) VALUES (
    stripe_customer_id,
    plan_product_id,
    'sub_seeded_demo',
    'succeeded',
    NOW() + interval '15 days',
    true,
    2,
    NOW() - interval '15 days',
    NOW() + interval '15 days',
    false,
    false,
    false,
    false
  )
  ON CONFLICT (customer_id) DO UPDATE SET
    product_id = EXCLUDED.product_id,
    subscription_id = EXCLUDED.subscription_id,
    status = EXCLUDED.status,
    trial_at = EXCLUDED.trial_at,
    is_good_plan = EXCLUDED.is_good_plan,
    plan_usage = EXCLUDED.plan_usage,
    subscription_anchor_start = EXCLUDED.subscription_anchor_start,
    subscription_anchor_end = EXCLUDED.subscription_anchor_end,
    mau_exceeded = EXCLUDED.mau_exceeded,
    bandwidth_exceeded = EXCLUDED.bandwidth_exceeded,
    storage_exceeded = EXCLUDED.storage_exceeded,
    build_time_exceeded = EXCLUDED.build_time_exceeded,
    updated_at = NOW();

  INSERT INTO public.orgs (id, created_by, created_at, updated_at, logo, name, management_email, customer_id)
  VALUES (
    org_id,
    user_id,
    NOW(),
    NOW(),
    '',
    org_name,
    'test@capgo.app',
    stripe_customer_id
  )
  ON CONFLICT (id) DO UPDATE SET
    customer_id = EXCLUDED.customer_id,
    management_email = EXCLUDED.management_email,
    name = EXCLUDED.name,
    updated_at = NOW();

  EXECUTE $sql$
    INSERT INTO public.org_users (org_id, user_id, rbac_role_name, is_invite)
    SELECT $1, $2, public.rbac_role_org_super_admin(), false
    WHERE NOT EXISTS (
      SELECT 1 FROM public.org_users ou
      WHERE ou.org_id = $1 AND ou.user_id = $2
    )
  $sql$ USING org_id, user_id;

  EXECUTE $sql2$
    INSERT INTO public.org_users (org_id, user_id, rbac_role_name, is_invite)
    SELECT $1, $2, public.rbac_role_org_super_admin(), false
    WHERE NOT EXISTS (
      SELECT 1 FROM public.org_users ou
      WHERE ou.org_id = $1 AND ou.user_id = $2
    )
  $sql2$ USING org_id, admin_user_id;

  INSERT INTO public.apps (created_at, app_id, icon_url, name, last_version, updated_at, owner_org, user_id)
  VALUES (NOW(), p_app_id, '', 'Seeded App', '1.0.0', NOW(), org_id, user_id);
  WITH version_inserts AS (
    INSERT INTO public.app_versions (created_at, app_id, name, r2_path, updated_at, deleted, external_url, checksum, storage_provider, owner_org, comment, link, user_id)
    VALUES
      (NOW(), p_app_id, '1.0.1', 'orgs/'||org_id||'/apps/'||p_app_id||'/1.0.1.zip', NOW(), 'f', NULL, '', 'r2-direct', org_id, 'Bug fixes and minor improvements', 'https://github.com/Cap-go/capgo/releases/tag/v1.0.1', user_id),
      (NOW(), p_app_id, '1.0.0', 'orgs/'||org_id||'/apps/'||p_app_id||'/1.0.0.zip', NOW(), 'f', NULL, '3885ee49', 'r2', org_id, 'Initial release', 'https://github.com/Cap-go/capgo/releases/tag/v1.0.0', user_id),
      (NOW(), p_app_id, '1.361.0', 'orgs/'||org_id||'/apps/'||p_app_id||'/1.361.0.zip', NOW(), 'f', NULL, '9d4f798a', 'r2', org_id, 'Major version update with new features', 'https://github.com/Cap-go/capgo/releases/tag/v1.361.0', user_id),
      (NOW(), p_app_id, '1.360.0', 'orgs/'||org_id||'/apps/'||p_app_id||'/1.360.0.zip', NOW(), 'f', NULL, '44913a9f', 'r2', org_id, 'Pre-release version with experimental features', 'https://github.com/Cap-go/capgo/releases/tag/v1.360.0', user_id),
      (NOW(), p_app_id, '1.359.0', 'orgs/'||org_id||'/apps/'||p_app_id||'/1.359.0.zip', NOW(), 'f', NULL, '9f74e70a', 'r2', org_id, 'Stability improvements', 'https://github.com/Cap-go/capgo/releases/tag/v1.359.0', user_id)
    RETURNING id, name
  )
  SELECT MAX(CASE WHEN name='1.0.1' THEN id END), MAX(CASE WHEN name='1.0.0' THEN id END), MAX(CASE WHEN name='1.361.0' THEN id END), MAX(CASE WHEN name='1.360.0' THEN id END), MAX(CASE WHEN name='1.359.0' THEN id END)
  INTO v1_0_1_version_id, v1_0_0_version_id, v1_361_0_version_id, v1_360_0_version_id, v1_359_0_version_id FROM version_inserts;
  WITH channel_inserts AS (
    INSERT INTO public.channels (created_at, name, app_id, version, updated_at, public, disable_auto_update_under_native, disable_auto_update, ios, android, electron, allow_device_self_set, allow_emulator, allow_device, allow_dev, allow_prod, created_by, owner_org)
    VALUES
      (NOW(), 'production', p_app_id, v1_0_0_version_id, NOW(), 't', 't', 'major'::public.disable_update, 'f', 't', 't', 't', 't', 't', 't', 't', user_id, org_id),
      (NOW(), 'beta', p_app_id, v1_361_0_version_id, NOW(), 'f', 't', 'major'::public.disable_update, 't', 't', 't', 't', 't', 't', 't', 't', user_id, org_id),
      (NOW(), 'development', p_app_id, v1_359_0_version_id, NOW(), 't', 't', 'major'::public.disable_update, 't', 'f', 'f', 't', 't', 't', 't', 't', user_id, org_id),
      (NOW(), 'no_access', p_app_id, v1_361_0_version_id, NOW(), 'f', 't', 'major'::public.disable_update, 'f', 'f', 'f', 't', 't', 't', 't', 't', user_id, org_id),
      (NOW(), 'electron_only', p_app_id, v1_360_0_version_id, NOW(), 'f', 't', 'major'::public.disable_update, 'f', 'f', 't', 't', 't', 't', 't', 't', user_id, org_id)
    RETURNING id, name
  )
  SELECT MAX(CASE WHEN name='production' THEN id END), MAX(CASE WHEN name='beta' THEN id END), MAX(CASE WHEN name='development' THEN id END), MAX(CASE WHEN name='no_access' THEN id END), MAX(CASE WHEN name='electron_only' THEN id END)
  INTO production_channel_id, beta_channel_id, development_channel_id, no_access_channel_id, electron_only_channel_id FROM channel_inserts;
  INSERT INTO public.deploy_history (created_at, updated_at, channel_id, app_id, version_id, deployed_at, owner_org, created_by)
  VALUES
    (NOW() - interval '15 days', NOW() - interval '15 days', production_channel_id, p_app_id, v1_0_0_version_id, NOW() - interval '15 days', org_id, user_id),
    (NOW() - interval '10 days', NOW() - interval '10 days', beta_channel_id, p_app_id, v1_361_0_version_id, NOW() - interval '10 days', org_id, user_id),
    (NOW() - interval '5 days', NOW() - interval '5 days', development_channel_id, p_app_id, v1_359_0_version_id, NOW() - interval '5 days', org_id, user_id),
    (NOW() - interval '3 days', NOW() - interval '3 days', no_access_channel_id, p_app_id, v1_361_0_version_id, NOW() - interval '3 days', org_id, user_id),
    (NOW() - interval '2 days', NOW() - interval '2 days', electron_only_channel_id, p_app_id, v1_360_0_version_id, NOW() - interval '2 days', org_id, user_id);
  PERFORM v1_0_1_version_id, v1_360_0_version_id;
END;
$_$;


ALTER FUNCTION "public"."reset_and_seed_app_data"("p_app_id" character varying, "p_org_id" "uuid", "p_user_id" "uuid", "p_admin_user_id" "uuid", "p_stripe_customer_id" "text", "p_plan_product_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_and_seed_app_stats_data"("p_app_id" character varying) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
  org_id uuid;
  fallback_org_id uuid := '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid;
  fallback_user_id uuid := '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_app_id || '_stats'));
  PERFORM public.reset_app_stats_data(p_app_id);
  random_uuid := gen_random_uuid();
  SELECT owner_org INTO org_id FROM public.apps WHERE app_id = p_app_id LIMIT 1;
  IF org_id IS NULL THEN
    org_id := fallback_org_id;
  END IF;
  INSERT INTO public.apps (created_at, app_id, icon_url, name, last_version, updated_at, owner_org, user_id)
  VALUES (NOW(), p_app_id, '', 'Seeded Stats App', '1.0.0', NOW(), org_id, fallback_user_id)
  ON CONFLICT (app_id) DO NOTHING;
  INSERT INTO public.devices (updated_at, device_id, version_name, app_id, platform, plugin_version, os_version, version_build, custom_id, is_prod, is_emulator)
  VALUES (NOW(), random_uuid, '1.0.0', p_app_id, 'android', '4.15.3', '9', '1.223.0', '', 't', 't'), (NOW(), random_fixed_uuid, '1.0.0', p_app_id, 'android', '4.15.3', '9', '1.223.0', '', 't', 't');
  INSERT INTO public.stats (created_at, action, device_id, version_name, app_id)
  VALUES (NOW(), 'get'::public.stats_action, random_uuid, '1.0.0', p_app_id), (NOW(), 'set'::public.stats_action, random_uuid, '1.0.0', p_app_id);
  curr_date := start_date::DATE;
  WHILE curr_date <= end_date::DATE LOOP
    random_mau := FLOOR(RANDOM() * 1000) + 1; random_bandwidth := FLOOR(RANDOM() * 1000000000) + 1; random_storage := FLOOR(RANDOM() * 1000000000) + 1;
    INSERT INTO public.daily_mau (app_id, date, mau) VALUES (p_app_id, curr_date, random_mau);
    INSERT INTO public.daily_bandwidth (app_id, date, bandwidth) VALUES (p_app_id, curr_date, random_bandwidth);
    INSERT INTO public.daily_storage (app_id, date, storage) VALUES (p_app_id, curr_date, random_storage);
    INSERT INTO public.daily_build_time (app_id, date, build_time_unit, build_count)
    VALUES (p_app_id, curr_date, FLOOR(RANDOM() * 7200) + 300, FLOOR(RANDOM() * 10) + 1);
    INSERT INTO public.daily_version (date, app_id, version_id, version_name, get, fail, install, uninstall)
    VALUES (curr_date, p_app_id, random_version_id, '1.0.0', FLOOR(RANDOM() * 100) + 1, FLOOR(RANDOM() * 10) + 1, FLOOR(RANDOM() * 50) + 1, FLOOR(RANDOM() * 20) + 1);
    curr_date := curr_date + INTERVAL '1 day';
  END LOOP;
  INSERT INTO public.storage_usage (device_id, app_id, file_size) SELECT random_uuid, p_app_id, FLOOR(RANDOM() * 10485760) - 5242880 FROM generate_series(1, 20);
  INSERT INTO public.version_usage (timestamp, app_id, version_id, action)
  SELECT start_date + (RANDOM() * (end_date - start_date)), p_app_id, random_version_id, (ARRAY['get','fail','install','uninstall'])[FLOOR(RANDOM() * 4) + 1]::public.version_action FROM generate_series(1, 30);
  INSERT INTO public.device_usage (device_id, app_id, org_id)
  SELECT random_uuid, p_app_id, org_id::text FROM generate_series(1, 50);
  INSERT INTO public.bandwidth_usage (device_id, app_id, file_size) SELECT random_uuid, p_app_id, FLOOR(RANDOM() * 10485760) + 1 FROM generate_series(1, 40);
END;
$$;


ALTER FUNCTION "public"."reset_and_seed_app_stats_data"("p_app_id" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_and_seed_data"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
DECLARE
    admin_manual_grant_id uuid;
    admin_top_up_grant_id uuid;
    demo_top_up_grant_id uuid;
    admin_bandwidth_overage_id uuid;
    demo_mau_overage_id uuid;
BEGIN
    -- Suppress cascade notices during truncation
    SET LOCAL client_min_messages = WARNING;

    -- Truncate main parent tables - CASCADE will handle dependencies
    TRUNCATE TABLE "auth"."users" CASCADE;
    TRUNCATE TABLE "storage"."buckets" CASCADE;
    TRUNCATE TABLE "public"."stripe_info" CASCADE;
    TRUNCATE TABLE "public"."plans" CASCADE;
    TRUNCATE TABLE "public"."capgo_credits_steps" CASCADE;
    TRUNCATE TABLE "public"."usage_credit_grants" CASCADE;
    TRUNCATE TABLE "public"."usage_credit_transactions" CASCADE;
    TRUNCATE TABLE "public"."usage_credit_consumptions" CASCADE;
    TRUNCATE TABLE "public"."usage_overage_events" CASCADE;
    -- RBAC tables: must truncate in order to respect foreign keys
    TRUNCATE TABLE "public"."role_bindings" RESTART IDENTITY CASCADE;
    TRUNCATE TABLE "public"."group_members" RESTART IDENTITY CASCADE;
    TRUNCATE TABLE "public"."groups" RESTART IDENTITY CASCADE;
    -- Insert seed data
    -- (Include all your INSERT statements here)

    -- Seed data
    INSERT INTO "auth"."users" ("instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at", "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token", "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at", "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin", "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change", "phone_change_token", "phone_change_sent_at", "email_change_token_current", "email_change_confirm_status", "banned_until", "reauthentication_token", "reauthentication_sent_at") VALUES
    ('00000000-0000-0000-0000-000000000000', 'c591b04e-cf29-4945-b9a0-776d0672061a', 'authenticated', 'authenticated', 'admin@capgo.app', '$2a$10$I4wgil64s1Kku/7aUnCOVuc1W5nCAeeKvHMiSKk10jo1J5fSVkK1S', NOW(), NOW(), 'oljikwwipqrkwilfsyto', NOW(), '', NULL, '', '', NULL, NOW(), '{"provider": "email", "providers": ["email"]}', '{"test_identifier": "test_admin"}', 'f', NOW(), NOW(), NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL),
    ('00000000-0000-0000-0000-000000000000', '6aa76066-55ef-4238-ade6-0b32334a4097', 'authenticated', 'authenticated', 'test@capgo.app', '$2a$10$0CErXxryZPucjJWq3O7qXeTJgN.tnNU5XCZy9pXKDWRi/aS9W7UFi', NOW(), NOW(), 'oljikwwipqrkwilfsyty', NOW(), '', NULL, '', '', NULL, NOW(), '{"provider": "email", "providers": ["email"]}', '{"test_identifier": "test_user"}', 'f', NOW(), NOW(), NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL),
    ('00000000-0000-0000-0000-000000000000', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', 'authenticated', 'authenticated', 'test2@capgo.app', '$2a$10$0CErXxryZPucjJWq3O7qXeTJgN.tnNU5XCZy9pXKDWRi/aS9W7UFi', NOW(), NOW(), 'oljikwwipqrkwilfsytt', NOW(), '', NULL, '', '', NULL, NOW(), '{"provider": "email", "providers": ["email"]}', '{"test_identifier": "test_user2"}', 'f', NOW(), NOW(), NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL),
    ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111110', 'authenticated', 'authenticated', 'nonmember@capgo.app', '$2a$10$0CErXxryZPucjJWq3O7qXeTJgN.tnNU5XCZy9pXKDWRi/aS9W7UFi', NOW(), NOW(), 'oljikwwipqrkwilfsytn', NOW(), '', NULL, '', '', NULL, NOW(), '{"provider": "email", "providers": ["email"]}', '{"test_identifier": "test_nonmember"}', 'f', NOW(), NOW(), NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL),
    ('00000000-0000-0000-0000-000000000000', '7a1b2c3d-4e5f-4a6b-7c8d-9e0f1a2b3c4d', 'authenticated', 'authenticated', 'stats@capgo.app', '$2a$10$0CErXxryZPucjJWq3O7qXeTJgN.tnNU5XCZy9pXKDWRi/aS9W7UFi', NOW(), NOW(), 'oljikwwipqrkwilfsyts', NOW(), '', NULL, '', '', NULL, NOW(), '{"provider": "email", "providers": ["email"]}', '{"test_identifier": "test_stats"}', 'f', NOW(), NOW(), NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL),
    ('00000000-0000-0000-0000-000000000000', '8b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e', 'authenticated', 'authenticated', 'rls@capgo.app', '$2a$10$0CErXxryZPucjJWq3O7qXeTJgN.tnNU5XCZy9pXKDWRi/aS9W7UFi', NOW(), NOW(), 'oljikwwipqrkwilfsytr', NOW(), '', NULL, '', '', NULL, NOW(), '{"provider": "email", "providers": ["email"]}', '{"test_identifier": "test_rls"}', 'f', NOW(), NOW(), NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL),
    ('00000000-0000-0000-0000-000000000000', 'e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a81', 'authenticated', 'authenticated', 'cli_hashed@capgo.app', '$2a$10$0CErXxryZPucjJWq3O7qXeTJgN.tnNU5XCZy9pXKDWRi/aS9W7UFi', NOW(), NOW(), 'oljikwwipqrkwilfsytc', NOW(), '', NULL, '', '', NULL, NOW(), '{"provider": "email", "providers": ["email"]}', '{"test_identifier": "test_cli_hashed"}', 'f', NOW(), NOW(), NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL),
    ('00000000-0000-0000-0000-000000000000', 'f6a7b8c9-d0e1-4f2a-9b3c-4d5e6f708193', 'authenticated', 'authenticated', 'encrypted@capgo.app', '$2a$10$0CErXxryZPucjJWq3O7qXeTJgN.tnNU5XCZy9pXKDWRi/aS9W7UFi', NOW(), NOW(), 'oljikwwipqrkwilfsyte', NOW(), '', NULL, '', '', NULL, NOW(), '{"provider": "email", "providers": ["email"]}', '{"test_identifier": "test_encrypted"}', 'f', NOW(), NOW(), NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL),
    ('00000000-0000-0000-0000-000000000000', '9f1a2b3c-4d5e-4f60-8a7b-1c2d3e4f5061', 'authenticated', 'authenticated', 'emailprefs@capgo.app', '$2a$10$0CErXxryZPucjJWq3O7qXeTJgN.tnNU5XCZy9pXKDWRi/aS9W7UFi', NOW(), NOW(), 'oljikwwipqrkwilfsytp', NOW(), '', NULL, '', '', NULL, NOW(), '{"provider": "email", "providers": ["email"]}', '{"test_identifier": "test_email_prefs"}', 'f', NOW(), NOW(), NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL),
    ('00000000-0000-0000-0000-000000000000', 'af1a2b3c-4d5e-4f60-8a7b-1c2d3e4f5062', 'authenticated', 'authenticated', 'apikey-expiration@capgo.app', '$2a$10$0CErXxryZPucjJWq3O7qXeTJgN.tnNU5XCZy9pXKDWRi/aS9W7UFi', NOW(), NOW(), 'oljikwwipqrkwilfsytq', NOW(), '', NULL, '', '', NULL, NOW(), '{"provider": "email", "providers": ["email"]}', '{"test_identifier": "test_apikey_expiration"}', 'f', NOW(), NOW(), NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL),
    ('00000000-0000-0000-0000-000000000000', 'd0f1a2b3-c4d5-4e6f-8a90-b1c2d3e4f506', 'authenticated', 'authenticated', 'apikey-management@capgo.app', '$2a$10$0CErXxryZPucjJWq3O7qXeTJgN.tnNU5XCZy9pXKDWRi/aS9W7UFi', NOW(), NOW(), 'oljikwwipqrkwilfsytm', NOW(), '', NULL, '', '', NULL, NOW(), '{"provider": "email", "providers": ["email"]}', '{"test_identifier": "test_apikey_management"}', 'f', NOW(), NOW(), NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL),
    ('00000000-0000-0000-0000-000000000000', 'b7a1d9f4-7b8f-4e3c-8f2b-1a2b3c4d5e6f', 'authenticated', 'authenticated', 'delete-user-stale@capgo.app', '$2a$10$0CErXxryZPucjJWq3O7qXeTJgN.tnNU5XCZy9pXKDWRi/aS9W7UFi', NOW(), NOW(), 'oljikwwipqrkwilfsyu1', NOW(), '', NULL, '', '', NULL, NOW() - interval '10 minutes', '{"provider": "email", "providers": ["email"]}', '{"test_identifier": "test_delete_user_stale"}', 'f', NOW(), NOW(), NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL),
    ('00000000-0000-0000-0000-000000000000', 'c8b2e0f5-8c90-4f4d-9f3c-2b3c4d5e6f70', 'authenticated', 'authenticated', 'delete-user-fresh@capgo.app', '$2a$10$0CErXxryZPucjJWq3O7qXeTJgN.tnNU5XCZy9pXKDWRi/aS9W7UFi', NOW(), NOW(), 'oljikwwipqrkwilfsyu2', NOW(), '', NULL, '', '', NULL, NOW(), '{"provider": "email", "providers": ["email"]}', '{"test_identifier": "test_delete_user_fresh"}', 'f', NOW(), NOW(), NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL);

    INSERT INTO "public"."deleted_account" ("created_at", "email", "id") VALUES
    (NOW(), encode(extensions.digest('deleted@capgo.app'::bytea, 'sha256'::text)::bytea, 'hex'::text), '00000000-0000-0000-0000-000000000001');

    INSERT INTO "public"."plans" ("created_at", "updated_at", "name", "description", "price_m", "price_y", "stripe_id", "credit_id", "id", "price_m_id", "price_y_id", "storage", "bandwidth", "mau", "market_desc", "build_time_unit", "native_build_concurrency") VALUES
    (NOW(), NOW(), 'Maker', 'plan.maker.desc', 39, 396, 'prod_LQIs1Yucml9ChU', 'prod_TJRd2hFHZsBIPK', '440cfd69-0cfd-486e-b59b-cb99f7ae76a0', 'price_1KjSGyGH46eYKnWwL4h14DsK', 'price_1KjSKIGH46eYKnWwFG9u4tNi', 3221225472, 268435456000, 10000, 'Best for small business owners', 3600, 3),
    (NOW(), NOW(), 'Enterprise', 'plan.payasyougo.desc', 239, 4799, 'prod_MH5Jh6ajC9e7ZH', 'prod_TJRd2hFHZsBIPK', '745d7ab3-6cd6-4d65-b257-de6782d5ba50', 'price_1LYX8yGH46eYKnWwzeBjISvW', 'price_1LYX8yGH46eYKnWwzeBjISvW', 12884901888, 3221225472000, 1000000, 'Best for scalling enterprises', 600000, 6),
    (NOW(), NOW(), 'Solo', 'plan.solo.desc', 14, 146, 'prod_LQIregjtNduh4q', 'prod_TJRd2hFHZsBIPK', '526e11d8-3c51-4581-ac92-4770c602f47c', 'price_1LVvuZGH46eYKnWwuGKOf4DK', 'price_1LVvuIGH46eYKnWwHMDCrxcH', 1073741824, 13958643712, 2000, 'Best for independent developers', 1800, 2),
    (NOW(), NOW(), 'Team', 'plan.team.desc', 99, 998, 'prod_LQIugvJcPrxhda', 'prod_TJRd2hFHZsBIPK', 'abd76414-8f90-49a5-b3a4-8ff4d2e12c77', 'price_1KjSIUGH46eYKnWwWHvg8XYs', 'price_1KjSLlGH46eYKnWwAwMW2wiW', 6442450944, 536870912000, 100000, 'Best for medium enterprises', 18000, 4);

    INSERT INTO
      "public"."capgo_credits_steps" (
        type,
        step_min,
        step_max,
        price_per_unit,
        unit_factor,
        org_id
      )
    VALUES
      ('mau', 0, 1000000, 0.003, 1, NULL),
      ('mau', 1000000, 3000000, 0.0022, 1, NULL),
      ('mau', 3000000, 10000000, 0.0016, 1, NULL),
      ('mau', 10000000, 15000000, 0.0014, 1, NULL),
      ('mau', 15000000, 25000000, 0.0011, 1, NULL),
      ('mau', 25000000, 40000000, 0.001, 1, NULL),
      ('mau', 40000000, 100000000, 0.0009, 1, NULL),
      ('mau', 100000000, 9223372036854775807, 0.0007, 1, NULL),
      ('bandwidth', 0, 1099511627776, 0.12, 1073741824, NULL), -- 0–1 TB
      (
        'bandwidth',
        1099511627776,
        2199023255552,
        0.10,
        1073741824,
        NULL
      ), -- 1–2 TB
      (
        'bandwidth',
        2199023255552,
        6597069766656,
        0.085,
        1073741824,
        NULL
      ), -- 2–6 TB
      (
        'bandwidth',
        6597069766656,
        13194139533312,
        0.07,
        1073741824,
        NULL
      ), -- 6–12 TB
      (
        'bandwidth',
        13194139533312,
        27487790694400,
        0.055,
        1073741824,
        NULL
      ), -- 12–25 TB
      (
        'bandwidth',
        27487790694400,
        69269232549888,
        0.04,
        1073741824,
        NULL
      ), -- 25–63 TB
      (
        'bandwidth',
        69269232549888,
        139637976727552,
        0.03,
        1073741824,
        NULL
      ), -- 63–127 TB
      (
        'bandwidth',
        139637976727552,
        9223372036854775807,
        0.02,
        1073741824,
        NULL
      ), -- 127+ TB
      ('storage', 0, 1073741824, 0.09, 1073741824, NULL), -- 0–1 GiB
      (
        'storage',
        1073741824,
        6442450944,
        0.08,
        1073741824,
        NULL
      ), -- 1–6 GiB
      (
        'storage',
        6442450944,
        26843545600,
        0.065,
        1073741824,
        NULL
      ), -- 6–25 GiB
      (
        'storage',
        26843545600,
        67645734912,
        0.05,
        1073741824,
        NULL
      ), -- 25–63 GiB
      (
        'storage',
        67645734912,
        268435456000,
        0.04,
        1073741824,
        NULL
      ), -- 63–250 GiB
      (
        'storage',
        268435456000,
        687194767360,
        0.03,
        1073741824,
        NULL
      ), -- 250–640 GiB
      (
        'storage',
        687194767360,
        1374389534720,
        0.025,
        1073741824,
        NULL
      ), -- 640–1280 GiB
      (
        'storage',
        1374389534720,
        9223372036854775807,
        0.021,
        1073741824,
        NULL
      ), -- 1280+ GiB
      ('build_time', 0, 6000, 0.16, 60, NULL), -- 0-100 minutes (in seconds, displayed as minutes)
      ('build_time', 6000, 30000, 0.14, 60, NULL), -- 100-500 minutes (in seconds, displayed as minutes)
      ('build_time', 30000, 60000, 0.12, 60, NULL), -- 500-1000 minutes (in seconds, displayed as minutes)
      ('build_time', 60000, 300000, 0.10, 60, NULL), -- 1000-5000 minutes (in seconds, displayed as minutes)
      ('build_time', 300000, 600000, 0.09, 60, NULL), -- 5000-10000 minutes (in seconds, displayed as minutes)
      ('build_time', 600000, 9223372036854775807, 0.08, 60, NULL); -- 10000+ minutes (in seconds, displayed as minutes)

    INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public") VALUES
    ('capgo', 'capgo', NULL, NOW(), NOW(), 't'),
    ('apps', 'apps', NULL, NOW(), NOW(), 'f'),
    ('images', 'images', NULL, NOW(), NOW(), 'f');

    INSERT INTO "public"."stripe_info" (
      "created_at",
      "updated_at",
      "subscription_id",
      "customer_id",
      "status",
      "product_id",
      "trial_at",
      "price_id",
      "is_good_plan",
      "plan_usage",
      "subscription_anchor_start",
      "subscription_anchor_end",
      "mau_exceeded",
      "bandwidth_exceeded",
      "storage_exceeded",
      "build_time_exceeded"
    ) VALUES
    (NOW(), NOW(), 'sub_1', 'cus_Pa0k8TO6HVln6A', 'succeeded', 'prod_LQIregjtNduh4q', CURRENT_DATE + interval '15 days', NULL, 't', 2, NOW() - interval '15 days', NOW() + interval '15 days', false, false, false, false),
    (NOW(), NOW(), 'sub_2', 'cus_Q38uE91NP8Ufqc', 'succeeded', 'prod_LQIregjtNduh4q', CURRENT_DATE + interval '15 days', NULL, 't', 2, NOW() - interval '15 days', NOW() + interval '15 days', false, false, false, false),
    (NOW(), NOW(), 'sub_3', 'cus_Pa0f3M6UCQ8g5Q', 'succeeded', 'prod_LQIregjtNduh4q', CURRENT_DATE + interval '15 days', NULL, 't', 2, NOW() - interval '15 days', NOW() + interval '15 days', false, false, false, false),
    (NOW(), NOW(), 'sub_4', 'cus_NonOwner', 'succeeded', 'prod_LQIregjtNduh4q', CURRENT_DATE + interval '15 days', NULL, 't', 2, NOW() - interval '15 days', NOW() + interval '15 days', false, false, false, false),
    (NOW(), NOW(), 'sub_5', 'cus_StatsTest', 'succeeded', 'prod_LQIregjtNduh4q', CURRENT_DATE + interval '15 days', NULL, 't', 2, NOW() - interval '15 days', NOW() + interval '15 days', false, false, false, false),
    (NOW(), NOW(), 'sub_rls', 'cus_RLSTest', 'succeeded', 'prod_LQIregjtNduh4q', CURRENT_DATE + interval '15 days', NULL, 't', 2, NOW() - interval '15 days', NOW() + interval '15 days', false, false, false, false),
    (NOW(), NOW(), 'sub_2fa_rls', 'cus_2fa_rls_test_123', 'succeeded', 'prod_LQIregjtNduh4q', CURRENT_DATE + interval '15 days', NULL, 't', 2, NOW() - interval '15 days', NOW() + interval '15 days', false, false, false, false),
    (NOW(), NOW(), 'sub_cli_hashed', 'cus_cli_hashed_test_123', 'succeeded', 'prod_LQIregjtNduh4q', CURRENT_DATE + interval '15 days', NULL, 't', 2, NOW() - interval '15 days', NOW() + interval '15 days', false, false, false, false),
    (NOW(), NOW(), 'sub_encrypted', 'cus_encrypted_test_123', 'succeeded', 'prod_LQIregjtNduh4q', CURRENT_DATE + interval '15 days', NULL, 't', 2, NOW() - interval '15 days', NOW() + interval '15 days', false, false, false, false),
    (NOW(), NOW(), 'sub_email_prefs', 'cus_email_prefs_test_123', 'succeeded', 'prod_LQIregjtNduh4q', CURRENT_DATE + interval '15 days', NULL, 't', 2, NOW() - interval '15 days', NOW() + interval '15 days', false, false, false, false),
    (NOW(), NOW(), 'sub_cron_app', 'cus_cron_app_test_123', 'succeeded', 'prod_LQIregjtNduh4q', CURRENT_DATE + interval '15 days', NULL, 't', 2, NOW() - interval '15 days', NOW() + interval '15 days', false, false, false, false),
    (NOW(), NOW(), 'sub_cron_integration', 'cus_cron_integration_test_123', 'succeeded', 'prod_LQIregjtNduh4q', CURRENT_DATE + interval '15 days', NULL, 't', 2, NOW() - interval '15 days', NOW() + interval '15 days', false, false, false, false),
    (NOW(), NOW(), 'sub_cron_queue', 'cus_cron_queue_test_123', 'succeeded', 'prod_LQIregjtNduh4q', CURRENT_DATE + interval '15 days', NULL, 't', 2, NOW() - interval '15 days', NOW() + interval '15 days', false, false, false, false),
    (NOW(), NOW(), 'sub_overage', 'cus_overage_test_123', 'succeeded', 'prod_LQIregjtNduh4q', CURRENT_DATE + interval '15 days', NULL, 't', 2, NOW() - interval '15 days', NOW() + interval '15 days', false, false, false, false),
    (NOW(), NOW(), 'sub_apikey_management', 'cus_apikey_management_test_123', 'succeeded', 'prod_LQIregjtNduh4q', CURRENT_DATE + interval '15 days', NULL, 't', 2, NOW() - interval '15 days', NOW() + interval '15 days', false, false, false, false);

    INSERT INTO "public"."users" ("created_at", "image_url", "first_name", "last_name", "country", "email", "id", "updated_at", "enable_notifications", "opt_for_newsletters") VALUES
    ('2022-06-03 05:54:15+00', '', 'admin', 'Capgo', NULL, 'admin@capgo.app', 'c591b04e-cf29-4945-b9a0-776d0672061a', NOW(), 't', 't'),
    ('2022-06-03 05:54:15+00', '', 'test', 'Capgo', NULL, 'test@capgo.app', '6aa76066-55ef-4238-ade6-0b32334a4097', NOW(), 't', 't'),
    ('2022-06-03 05:54:15+00', '', 'test2', 'Capgo', NULL, 'test2@capgo.app', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', NOW(), 't', 't'),
    ('2022-06-03 05:54:15+00', '', 'nonmember', 'Capgo', NULL, 'nonmember@capgo.app', '11111111-1111-4111-8111-111111111110', NOW(), 't', 't'),
    ('2022-06-03 05:54:15+00', '', 'stats', 'Capgo', NULL, 'stats@capgo.app', '7a1b2c3d-4e5f-4a6b-7c8d-9e0f1a2b3c4d', NOW(), 't', 't'),
    ('2022-06-03 05:54:15+00', '', 'rls', 'Capgo', NULL, 'rls@capgo.app', '8b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e', NOW(), 't', 't'),
    ('2022-06-03 05:54:15+00', '', 'cli_hashed', 'Capgo', NULL, 'cli_hashed@capgo.app', 'e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a81', NOW(), 't', 't'),
    ('2022-06-03 05:54:15+00', '', 'encrypted', 'Capgo', NULL, 'encrypted@capgo.app', 'f6a7b8c9-d0e1-4f2a-9b3c-4d5e6f708193', NOW(), 't', 't'),
    ('2022-06-03 05:54:15+00', '', 'emailprefs', 'Capgo', NULL, 'emailprefs@capgo.app', '9f1a2b3c-4d5e-4f60-8a7b-1c2d3e4f5061', NOW(), 't', 't'),
    ('2022-06-03 05:54:15+00', '', 'apikey', 'expiration', NULL, 'apikey-expiration@capgo.app', 'af1a2b3c-4d5e-4f60-8a7b-1c2d3e4f5062', NOW(), 't', 't'),
    ('2022-06-03 05:54:15+00', '', 'apikey', 'management', NULL, 'apikey-management@capgo.app', 'd0f1a2b3-c4d5-4e6f-8a90-b1c2d3e4f506', NOW(), 't', 't'),
    ('2022-06-03 05:54:15+00', '', 'delete', 'stale', NULL, 'delete-user-stale@capgo.app', 'b7a1d9f4-7b8f-4e3c-8f2b-1a2b3c4d5e6f', NOW(), 't', 't'),
    ('2022-06-03 05:54:15+00', '', 'delete', 'fresh', NULL, 'delete-user-fresh@capgo.app', 'c8b2e0f5-8c90-4f4d-9f3c-2b3c4d5e6f70', NOW(), 't', 't');

    ALTER TABLE public.orgs DISABLE TRIGGER generate_org_user_stripe_info_on_org_create;
    INSERT INTO "public"."orgs" ("id", "created_by", "created_at", "updated_at", "logo", "name", "management_email", "customer_id") VALUES
    ('22dbad8a-b885-4309-9b3b-a09f8460fb6d', 'c591b04e-cf29-4945-b9a0-776d0672061a', NOW(), NOW(), '', 'Admin org', 'admin@capgo.app', 'cus_Pa0k8TO6HVln6A'),
    ('046a36ac-e03c-4590-9257-bd6c9dba9ee8', '6aa76066-55ef-4238-ade6-0b32334a4097', NOW(), NOW(), '', 'Demo org', 'test@capgo.app', 'cus_Q38uE91NP8Ufqc'),
    ('34a8c55d-2d0f-4652-a43f-684c7a9403ac', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', NOW(), NOW(), '', 'Test2 org', 'test2@capgo.app', 'cus_Pa0f3M6UCQ8g5Q'),
    ('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', NOW(), NOW(), '', 'Non-Owner Org', 'test2@capgo.app', 'cus_NonOwner'),
    ('b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', '7a1b2c3d-4e5f-4a6b-7c8d-9e0f1a2b3c4d', NOW(), NOW(), '', 'Stats Test Org', 'stats@capgo.app', 'cus_StatsTest'),
    ('c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f', '8b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e', NOW(), NOW(), '', 'RLS Test Org', 'rls@capgo.app', 'cus_RLSTest'),
    ('d5e6f7a8-b9c0-4d1e-8f2a-3b4c5d6e7f80', '8b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e', NOW(), NOW(), '', 'RLS 2FA Test Org', 'rls@capgo.app', 'cus_2fa_rls_test_123'),
    ('f6a7b8c9-d0e1-4f2a-9b3c-4d5e6f7a8b92', 'e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a81', NOW(), NOW(), '', 'CLI Hashed Test Org', 'cli_hashed@capgo.app', 'cus_cli_hashed_test_123'),
    ('a7b8c9d0-e1f2-4a3b-9c4d-5e6f7a8b9ca4', 'f6a7b8c9-d0e1-4f2a-9b3c-4d5e6f708193', NOW(), NOW(), '', 'Encrypted Test Org', 'encrypted@capgo.app', 'cus_encrypted_test_123'),
    ('aa1b2c3d-4e5f-4a60-9b7c-1d2e3f4a5061', '9f1a2b3c-4d5e-4f60-8a7b-1c2d3e4f5061', NOW(), NOW(), '', 'Email Prefs Test Org', 'emailprefs@capgo.app', 'cus_email_prefs_test_123'),
    ('b1c2d3e4-f5a6-4b70-8c9d-0e1f2a3b4c5d', '6aa76066-55ef-4238-ade6-0b32334a4097', NOW(), NOW(), '', 'Cron App Test Org', 'test@capgo.app', 'cus_cron_app_test_123'),
    ('c2d3e4f5-a6b7-4c80-9d0e-1f2a3b4c5d6e', '6aa76066-55ef-4238-ade6-0b32334a4097', NOW(), NOW(), '', 'Cron Integration Test Org', 'test@capgo.app', 'cus_cron_integration_test_123'),
    ('d3e4f5a6-b7c8-4d90-8e1f-2a3b4c5d6e7f', '6aa76066-55ef-4238-ade6-0b32334a4097', NOW(), NOW(), '', 'Cron Queue Test Org', 'test@capgo.app', 'cus_cron_queue_test_123'),
    ('e4f5a6b7-c8d9-4ea0-9f1a-2b3c4d5e6f70', '6aa76066-55ef-4238-ade6-0b32334a4097', NOW(), NOW(), '', 'Overage Test Org', 'test@capgo.app', 'cus_overage_test_123'),
    ('e5f6a7b8-c9d0-4e1f-9a2b-3c4d5e6f7a82', '6aa76066-55ef-4238-ade6-0b32334a4097', NOW(), NOW(), '', 'Private Error Test Org', 'test@capgo.app', NULL),
    ('f1a2b3c4-d5e6-4f70-8a9b-0c1d2e3f4a50', 'd0f1a2b3-c4d5-4e6f-8a90-b1c2d3e4f506', NOW(), NOW(), '', 'API Key Management Test Org', 'apikey-management@capgo.app', 'cus_apikey_management_test_123');
    ALTER TABLE public.orgs ENABLE TRIGGER generate_org_user_stripe_info_on_org_create;

    INSERT INTO public.usage_credit_grants (
      org_id,
      credits_total,
      credits_consumed,
      granted_at,
      expires_at,
      source,
      source_ref,
      notes
    )
    VALUES
      (
        '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
        1000,
        275,
        NOW() - interval '45 days',
        NOW() + interval '6 months',
        'manual',
        '{}'::jsonb,
        'Seed usage credits for admin org'
      )
    RETURNING id INTO admin_manual_grant_id;

    INSERT INTO public.usage_credit_grants (
      org_id,
      credits_total,
      credits_consumed,
      granted_at,
      expires_at,
      source,
      source_ref,
      notes
    )
    VALUES (
      '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
      250,
      0,
      NOW() - interval '14 days',
      NOW() + interval '8 months',
      'stripe_top_up',
      jsonb_build_object('paymentIntentId', 'pi_seed_top_up_admin'),
      'Stripe top-up seed for admin org'
    )
    RETURNING id INTO admin_top_up_grant_id;

    INSERT INTO public.usage_credit_grants (
      org_id,
      credits_total,
      credits_consumed,
      granted_at,
      expires_at,
      source,
      source_ref,
      notes
    )
    VALUES (
      '046a36ac-e03c-4590-9257-bd6c9dba9ee8',
      500,
      120,
      NOW() - interval '10 days',
      NOW() + interval '3 months',
      'stripe_top_up',
      jsonb_build_object('paymentIntentId', 'pi_seed_top_up_demo'),
      'Seed usage credits for demo org'
    )
    RETURNING id INTO demo_top_up_grant_id;

    -- Seed realistic credit transactions so the Credits view has ledger data
    INSERT INTO public.usage_overage_events (
      org_id,
      metric,
      overage_amount,
      credits_estimated,
      credits_debited,
      billing_cycle_start,
      billing_cycle_end,
      details
    )
    VALUES
      (
        '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
        'bandwidth',
        2684354560,
        275,
        275,
        date_trunc('month', NOW()) - interval '1 month',
        date_trunc('month', NOW()),
        jsonb_build_object('note', 'Bandwidth spike from heavy release week')
      )
    RETURNING id INTO admin_bandwidth_overage_id;

    INSERT INTO public.usage_overage_events (
      org_id,
      metric,
      overage_amount,
      credits_estimated,
      credits_debited,
      billing_cycle_start,
      billing_cycle_end,
      details
    )
    VALUES
      (
        '046a36ac-e03c-4590-9257-bd6c9dba9ee8',
        'mau',
        185000,
        555,
        120,
        date_trunc('month', NOW()),
        date_trunc('month', NOW()) + interval '1 month',
        jsonb_build_object('note', 'Promo traffic pushed MAU above plan')
      )
    RETURNING id INTO demo_mau_overage_id;

    INSERT INTO public.usage_credit_consumptions (
      grant_id,
      org_id,
      overage_event_id,
      metric,
      credits_used,
      applied_at
    )
    VALUES
      (
        admin_manual_grant_id,
        '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
        admin_bandwidth_overage_id,
        'bandwidth',
        275,
        NOW() - interval '5 days'
      ),
      (
        demo_top_up_grant_id,
        '046a36ac-e03c-4590-9257-bd6c9dba9ee8',
        demo_mau_overage_id,
        'mau',
        120,
        NOW() - interval '1 day'
      );

    INSERT INTO public.usage_credit_transactions (
      org_id,
      grant_id,
      transaction_type,
      amount,
      balance_after,
      occurred_at,
      description,
      source_ref
    )
    VALUES
      (
        '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
        admin_manual_grant_id,
        'manual_grant',
        1000,
        1000,
        NOW() - interval '45 days',
        'Manual starter credits from support',
        jsonb_build_object('notes', 'Initial seed allocation')
      ),
      (
        '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
        admin_top_up_grant_id,
        'purchase',
        250,
        1250,
        NOW() - interval '14 days',
        'Stripe top-up: 250 credits',
        jsonb_build_object('paymentIntentId', 'pi_seed_top_up_admin', 'sessionId', 'cs_test_seed_admin')
      ),
      (
        '22dbad8a-b885-4309-9b3b-a09f8460fb6d',
        admin_manual_grant_id,
        'deduction',
        -275,
        975,
        NOW() - interval '5 days',
        'Overage deduction for bandwidth usage',
        jsonb_build_object('overage_event_id', admin_bandwidth_overage_id, 'metric', 'bandwidth')
      ),
      (
        '046a36ac-e03c-4590-9257-bd6c9dba9ee8',
        demo_top_up_grant_id,
        'purchase',
        500,
        500,
        NOW() - interval '10 days',
        'Stripe top-up: 500 credits',
        jsonb_build_object('paymentIntentId', 'pi_seed_top_up_demo', 'sessionId', 'cs_test_seed_demo')
      ),
      (
        '046a36ac-e03c-4590-9257-bd6c9dba9ee8',
        demo_top_up_grant_id,
        'deduction',
        -120,
        380,
        NOW() - interval '1 day',
        'Overage deduction for MAU spike',
        jsonb_build_object('overage_event_id', demo_mau_overage_id, 'metric', 'mau')
      );

    INSERT INTO "public"."org_users" ("org_id", "user_id", "rbac_role_name", "app_id", "channel_id", "is_invite") VALUES
    ('22dbad8a-b885-4309-9b3b-a09f8460fb6d', 'c591b04e-cf29-4945-b9a0-776d0672061a', public.rbac_role_org_super_admin(), null, null, false),
    ('046a36ac-e03c-4590-9257-bd6c9dba9ee8', '6aa76066-55ef-4238-ade6-0b32334a4097', public.rbac_role_org_super_admin(), null, null, false),
    ('34a8c55d-2d0f-4652-a43f-684c7a9403ac', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', public.rbac_role_org_super_admin(), null, null, false),
    ('046a36ac-e03c-4590-9257-bd6c9dba9ee8', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', public.rbac_role_org_member(), null, null, false),
    ('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', '6aa76066-55ef-4238-ade6-0b32334a4097', public.rbac_role_org_member(), null, null, false),
    ('b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', '7a1b2c3d-4e5f-4a6b-7c8d-9e0f1a2b3c4d', public.rbac_role_org_super_admin(), null, null, false),
    ('c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f', '8b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e', public.rbac_role_org_super_admin(), null, null, false),
    ('d5e6f7a8-b9c0-4d1e-8f2a-3b4c5d6e7f80', '8b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e', public.rbac_role_org_super_admin(), null, null, false),
    ('f6a7b8c9-d0e1-4f2a-9b3c-4d5e6f7a8b92', 'e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a81', public.rbac_role_org_super_admin(), null, null, false),
    ('046a36ac-e03c-4590-9257-bd6c9dba9ee8', 'c591b04e-cf29-4945-b9a0-776d0672061a', public.rbac_role_org_admin(), null, null, false),
    ('34a8c55d-2d0f-4652-a43f-684c7a9403ac', '6aa76066-55ef-4238-ade6-0b32334a4097', public.rbac_role_org_member(), null, null, false),
    ('a7b8c9d0-e1f2-4a3b-9c4d-5e6f7a8b9ca4', 'f6a7b8c9-d0e1-4f2a-9b3c-4d5e6f708193', public.rbac_role_org_super_admin(), null, null, false),
    ('aa1b2c3d-4e5f-4a60-9b7c-1d2e3f4a5061', '9f1a2b3c-4d5e-4f60-8a7b-1c2d3e4f5061', public.rbac_role_org_super_admin(), null, null, false),
    ('b1c2d3e4-f5a6-4b70-8c9d-0e1f2a3b4c5d', '6aa76066-55ef-4238-ade6-0b32334a4097', public.rbac_role_org_super_admin(), null, null, false),
    ('c2d3e4f5-a6b7-4c80-9d0e-1f2a3b4c5d6e', '6aa76066-55ef-4238-ade6-0b32334a4097', public.rbac_role_org_super_admin(), null, null, false),
    ('d3e4f5a6-b7c8-4d90-8e1f-2a3b4c5d6e7f', '6aa76066-55ef-4238-ade6-0b32334a4097', public.rbac_role_org_super_admin(), null, null, false),
    ('e4f5a6b7-c8d9-4ea0-9f1a-2b3c4d5e6f70', '6aa76066-55ef-4238-ade6-0b32334a4097', public.rbac_role_org_super_admin(), null, null, false),
    ('e5f6a7b8-c9d0-4e1f-9a2b-3c4d5e6f7a82', '6aa76066-55ef-4238-ade6-0b32334a4097', public.rbac_role_org_super_admin(), null, null, false),
    ('f1a2b3c4-d5e6-4f70-8a9b-0c1d2e3f4a50', 'd0f1a2b3-c4d5-4e6f-8a90-b1c2d3e4f506', public.rbac_role_org_super_admin(), null, null, false);

    INSERT INTO public.role_bindings (
      principal_type,
      principal_id,
      role_id,
      scope_type,
      org_id,
      granted_by,
      reason,
      is_direct
    )
    SELECT
      public.rbac_principal_user(),
      ou.user_id,
      roles.id,
      public.rbac_scope_org(),
      ou.org_id,
      ou.user_id,
      'Seeded user RBAC binding',
      true
    FROM public.org_users ou
    JOIN public.roles roles
      ON roles.name = ou.rbac_role_name
      AND roles.scope_type = public.rbac_scope_org()
    WHERE ou.is_invite IS NOT TRUE
      AND ou.app_id IS NULL
      AND ou.channel_id IS NULL
    ON CONFLICT DO NOTHING;

    INSERT INTO "public"."apikeys" ("id", "created_at", "user_id", "key", "updated_at", "name") VALUES
    (1, NOW(), 'c591b04e-cf29-4945-b9a0-776d0672061a', 'c591b04e-cf29-4945-b9a0-776d0672061e', NOW(), 'admin app uploader'),
    (2, NOW(), 'c591b04e-cf29-4945-b9a0-776d0672061a', '67eeaff4-ae4c-49a6-8eb1-0875f5369de1', NOW(), 'admin app reader'),
    (3, NOW(), 'c591b04e-cf29-4945-b9a0-776d0672061a', 'ae6e7458-c46d-4c00-aa3b-153b0b8520eb', NOW(), 'admin org super admin'),
    (4, NOW(), '6aa76066-55ef-4238-ade6-0b32334a4097', 'c591b04e-cf29-4945-b9a0-776d0672061b', NOW(), 'test app uploader'),
    (5, NOW(), '6aa76066-55ef-4238-ade6-0b32334a4097', '67eeaff4-ae4c-49a6-8eb1-0875f5369de0', NOW(), 'test app reader'),
    (6, NOW(), '6aa76066-55ef-4238-ade6-0b32334a4097', 'ae6e7458-c46d-4c00-aa3b-153b0b8520ea', NOW(), 'test org super admin'),
    (7, NOW(), '6aa76066-55ef-4238-ade6-0b32334a4097', '985640ce-4031-4cfd-8095-d1d1066b6b3b', NOW(), 'test app developer'),
    (8, NOW(), '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', 'ab4d9a98-ec25-4af8-933c-2aae4aa52b85', NOW(), 'test2 app uploader'),
    (9, NOW(), '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', 'ac4d9a98-ec25-4af8-933c-2aae4aa52b85', NOW(), 'test2 org super admin'),
    -- Dedicated test keys for apikeys.test.ts to avoid interference with other tests
    (10, NOW(), '6aa76066-55ef-4238-ade6-0b32334a4097', '8b2c3d4e-5f6a-4c7b-8d9e-0f1a2b3c4d5f', NOW(), 'apikey test get by id'),
    (11, NOW(), '6aa76066-55ef-4238-ade6-0b32334a4097', '8b2c3d4e-5f6a-4c7b-8d9e-0f1a2b3c4d5g', NOW(), 'apikey test update name'),
    (12, NOW(), '6aa76066-55ef-4238-ade6-0b32334a4097', '8b2c3d4e-5f6a-4c7b-8d9e-0f1a2b3c4d5a', NOW(), 'apikey test update org super admin'),
    (13, NOW(), '6aa76066-55ef-4238-ade6-0b32334a4097', '8b2c3d4e-5f6a-4c7b-8d9e-0f1a2b3c4d5d', NOW(), 'apikey test update apps'),
    -- Dedicated user and API key for statistics tests
    (14, NOW(), '7a1b2c3d-4e5f-4a6b-7c8d-9e0f1a2b3c4d', '8b2c3d4e-5f6a-4c7b-8d9e-0f1a2b3c4d5e', NOW(), 'stats test org super admin'),
    -- Dedicated user and API key for RLS hashed apikey tests (isolated to prevent interference)
    (15, NOW(), '8b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e', '9c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f', NOW(), 'rls test org super admin'),
    -- Dedicated user and API key for CLI hashed apikey tests (isolated to prevent interference)
    (110, NOW(), 'e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a81', 'a7b8c9d0-e1f2-4a3b-8c4d-5e6f7a8b9c03', NOW(), 'cli hashed test org super admin'),
    -- Dedicated user and API key for encrypted bundles tests (isolated to prevent interference)
    (111, NOW(), 'f6a7b8c9-d0e1-4f2a-9b3c-4d5e6f708193', 'b8c9d0e1-f2a3-4b4c-9d5e-6f7a8b9c0d14', NOW(), 'encrypted test org super admin'),
    -- Dedicated user and API key for apikeys.test.ts API-key compatibility management
    (112, NOW(), 'd0f1a2b3-c4d5-4e6f-8a90-b1c2d3e4f506', 'c9d0e1f2-a3b4-4c5d-8e6f-7a8b9c0d1e25', NOW(), 'apikey management test org super admin');

    -- Hashed API key for testing (hash of 'test-hashed-apikey-for-auth-test')
    -- Used by 07_auth_functions.sql tests
    INSERT INTO "public"."apikeys" ("id", "created_at", "user_id", "key", "key_hash", "updated_at", "name") VALUES
    (100, NOW(), '6aa76066-55ef-4238-ade6-0b32334a4097', NULL, encode(extensions.digest('test-hashed-apikey-for-auth-test', 'sha256'), 'hex'), NOW(), 'test hashed org super admin');

    -- Expired hashed API key for testing (expired 1 day ago)
    INSERT INTO "public"."apikeys" ("id", "created_at", "user_id", "key", "key_hash", "updated_at", "name", "expires_at") VALUES
    (101, NOW(), '6aa76066-55ef-4238-ade6-0b32334a4097', NULL, encode(extensions.digest('expired-hashed-key-for-test', 'sha256'), 'hex'), NOW(), 'test expired hashed', NOW() - INTERVAL '1 day');

    -- Expired plain API key for testing (expired 1 day ago)
    INSERT INTO "public"."apikeys" ("id", "created_at", "user_id", "key", "updated_at", "name", "expires_at") VALUES
    (102, NOW(), '6aa76066-55ef-4238-ade6-0b32334a4097', 'expired-plain-key-for-test', NOW(), 'test expired plain', NOW() - INTERVAL '1 day');

    INSERT INTO "public"."apps" ("created_at", "app_id", "icon_url", "name", "last_version", "updated_at", "owner_org", "user_id") VALUES
    (NOW(), 'com.demoadmin.app', '', 'Demo Admin app', '1.0.0', NOW(), '22dbad8a-b885-4309-9b3b-a09f8460fb6d', 'c591b04e-cf29-4945-b9a0-776d0672061a'),
    (NOW(), 'com.demo.app', '', 'Demo app', '1.0.0', NOW(), '046a36ac-e03c-4590-9257-bd6c9dba9ee8', '6aa76066-55ef-4238-ade6-0b32334a4097'),
    (NOW(), 'com.stats.app', '', 'Stats Test App', '1.0.0', NOW(), 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', '7a1b2c3d-4e5f-4a6b-7c8d-9e0f1a2b3c4d'),
    (NOW(), 'com.rls.app', '', 'RLS Test App', '1.0.0', NOW(), 'c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f', '8b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e'),
    (NOW(), 'com.encrypted.app', '', 'Encrypted Test App', '1.0.0', NOW(), 'a7b8c9d0-e1f2-4a3b-9c4d-5e6f7a8b9ca4', 'f6a7b8c9-d0e1-4f2a-9b3c-4d5e6f708193'),
    (NOW(), 'com.test2.app', '', 'Test2 App', '1.0.0', NOW(), '34a8c55d-2d0f-4652-a43f-684c7a9403ac', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5');

    WITH seed_key_roles (id, org_role_name) AS (
      VALUES
        (1, public.rbac_role_org_member()),
        (2, public.rbac_role_org_member()),
        (3, public.rbac_role_org_super_admin()),
        (4, public.rbac_role_org_member()),
        (5, public.rbac_role_org_member()),
        (6, public.rbac_role_org_super_admin()),
        (7, public.rbac_role_org_member()),
        (8, public.rbac_role_org_member()),
        (9, public.rbac_role_org_super_admin()),
        (10, public.rbac_role_org_member()),
        (11, public.rbac_role_org_member()),
        (12, public.rbac_role_org_super_admin()),
        (13, public.rbac_role_org_member()),
        (14, public.rbac_role_org_super_admin()),
        (15, public.rbac_role_org_super_admin()),
        (100, public.rbac_role_org_super_admin()),
        (101, public.rbac_role_org_super_admin()),
        (102, public.rbac_role_org_super_admin()),
        (110, public.rbac_role_org_super_admin()),
        (111, public.rbac_role_org_super_admin()),
        (112, public.rbac_role_org_super_admin())
    )
    INSERT INTO public.role_bindings (
      principal_type,
      principal_id,
      role_id,
      scope_type,
      org_id,
      granted_by,
      reason,
      is_direct
    )
    SELECT
      public.rbac_principal_apikey(),
      ak.rbac_id,
      roles.id,
      public.rbac_scope_org(),
      org_memberships.org_id,
      ak.user_id,
      'Seeded API key V2 org binding',
      true
    FROM seed_key_roles key_roles
    JOIN public.apikeys ak ON ak.id = key_roles.id
    JOIN public.org_users org_memberships
      ON org_memberships.user_id = ak.user_id
      AND org_memberships.is_invite IS NOT TRUE
    JOIN public.roles roles
      ON roles.name = key_roles.org_role_name
      AND roles.scope_type = public.rbac_scope_org()
    ON CONFLICT DO NOTHING;

    WITH seed_key_roles (id, app_role_name) AS (
      VALUES
        (1, public.rbac_role_app_uploader()),
        (2, public.rbac_role_app_reader()),
        (4, public.rbac_role_app_uploader()),
        (5, public.rbac_role_app_reader()),
        (7, public.rbac_role_app_developer()),
        (8, public.rbac_role_app_uploader()),
        (10, public.rbac_role_app_uploader()),
        (11, public.rbac_role_app_reader()),
        (13, public.rbac_role_app_developer())
    )
    INSERT INTO public.role_bindings (
      principal_type,
      principal_id,
      role_id,
      scope_type,
      org_id,
      app_id,
      granted_by,
      reason,
      is_direct
    )
    SELECT
      public.rbac_principal_apikey(),
      ak.rbac_id,
      roles.id,
      public.rbac_scope_app(),
      apps.owner_org,
      apps.id,
      ak.user_id,
      'Seeded API key V2 app binding',
      true
    FROM seed_key_roles key_roles
    JOIN public.apikeys ak ON ak.id = key_roles.id
    JOIN public.org_users org_memberships
      ON org_memberships.user_id = ak.user_id
      AND org_memberships.is_invite IS NOT TRUE
    JOIN public.apps apps ON apps.owner_org = org_memberships.org_id
    JOIN public.roles roles
      ON roles.name = key_roles.app_role_name
      AND roles.scope_type = public.rbac_scope_app()
    ON CONFLICT DO NOTHING;

    INSERT INTO "public"."app_versions" ("id", "created_at", "app_id", "name", "r2_path", "updated_at", "deleted", "external_url", "checksum", "session_key", "storage_provider", "owner_org", "user_id", "comment", "link") VALUES
    (3, NOW(), 'com.demo.app', '1.0.0', 'orgs/046a36ac-e03c-4590-9257-bd6c9dba9ee8/apps/com.demo.app/1.0.0.zip', NOW(), 'f', NULL, '3885ee49', NULL, 'r2', '046a36ac-e03c-4590-9257-bd6c9dba9ee8', '6aa76066-55ef-4238-ade6-0b32334a4097', 'its a test', 'https://capgo.app'),
    (4, NOW(), 'com.demo.app', '1.0.1', 'orgs/046a36ac-e03c-4590-9257-bd6c9dba9ee8/apps/com.demo.app/1.0.1.zip', NOW(), 'f', NULL, '', NULL, 'r2-direct', '046a36ac-e03c-4590-9257-bd6c9dba9ee8', '6aa76066-55ef-4238-ade6-0b32334a4097', 'its a test', 'https://capgo.app'),
    (5, NOW(), 'com.demo.app', '1.361.0', 'orgs/046a36ac-e03c-4590-9257-bd6c9dba9ee8/apps/com.demo.app/1.361.0.zip', NOW(), 'f', NULL, '9d4f798a', NULL, 'r2', '046a36ac-e03c-4590-9257-bd6c9dba9ee8', '6aa76066-55ef-4238-ade6-0b32334a4097', 'its a test', 'https://capgo.app'),
    (6, NOW(), 'com.demo.app', '1.360.0', 'orgs/046a36ac-e03c-4590-9257-bd6c9dba9ee8/apps/com.demo.app/1.360.0.zip', NOW(), 'f', NULL, '44913a9f', NULL, 'r2', '046a36ac-e03c-4590-9257-bd6c9dba9ee8', '6aa76066-55ef-4238-ade6-0b32334a4097', 'its a test', 'https://capgo.app'),
    (7, NOW(), 'com.demo.app', '1.359.0', 'orgs/046a36ac-e03c-4590-9257-bd6c9dba9ee8/apps/com.demo.app/1.359.0.zip', NOW(), 'f', NULL, '9f74e70a', NULL, 'r2', '046a36ac-e03c-4590-9257-bd6c9dba9ee8', '6aa76066-55ef-4238-ade6-0b32334a4097', 'its a test', 'https://capgo.app'),
    (10, NOW(), 'com.demoadmin.app', '1.0.0', 'orgs/22dbad8a-b885-4309-9b3b-a09f8460fb6d/apps/com.demoadmin.app/1.0.0.zip', NOW(), 'f', NULL, 'admin123', NULL, 'r2', '22dbad8a-b885-4309-9b3b-a09f8460fb6d', 'c591b04e-cf29-4945-b9a0-776d0672061a', 'admin app test version', 'https://capgo.app'),
    (13, NOW(), 'com.stats.app', '1.0.0', 'orgs/b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e/apps/com.stats.app/1.0.0.zip', NOW(), 'f', NULL, 'stats123', NULL, 'r2', 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', '7a1b2c3d-4e5f-4a6b-7c8d-9e0f1a2b3c4d', 'stats test version', 'https://capgo.app'),
    (16, now(), 'com.test2.app', '1.0.0', 'orgs/34a8c55d-2d0f-4652-a43f-684c7a9403ac/apps/com.test2.app/1.0.0.zip', now(), 'f', NULL, 'test2123', NULL, 'r2', '34a8c55d-2d0f-4652-a43f-684c7a9403ac', '6f0d1a2e-59ed-4769-b9d7-4d9615b28fe5', 'test2 app version', 'https://capgo.app');

    INSERT INTO "public"."app_versions_meta" ("id", "created_at", "app_id", "updated_at", "checksum", "size") VALUES
    (3, NOW(), 'com.demo.app', NOW(), '3885ee49', 1012506),
    (4, NOW(), 'com.demo.app', NOW(), '', 0),
    (5, NOW(), 'com.demo.app', NOW(), '9d4f798a', 1012529),
    (6, NOW(), 'com.demo.app', NOW(), '44913a9f', 1012541),
    (7, NOW(), 'com.demo.app', NOW(), '9f74e70a', 1012548),
    (10, NOW(), 'com.demoadmin.app', NOW(), 'admin123', 1500000),
    (13, NOW(), 'com.stats.app', NOW(), 'stats123', 850000);

    INSERT INTO "public"."channels" ("id", "created_at", "name", "app_id", "version", "updated_at", "public", "disable_auto_update_under_native", "disable_auto_update", "ios", "android", "electron", "allow_device_self_set", "allow_emulator", "allow_device", "allow_dev", "allow_prod", "created_by") VALUES
    (1, NOW(), 'production', 'com.demo.app', 3, NOW(), 't', 't', 'major'::"public"."disable_update", 'f', 't', 't', 't', 't', 't', 't', 't', '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid),
    (2, NOW(), 'no_access', 'com.demo.app', 5, NOW(), 'f', 't', 'major'::"public"."disable_update", 't', 't', 'f', 't', 't', 't', 't', 't', '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid),
    (3, NOW(), 'two_default', 'com.demo.app', 3, NOW(), 't', 't', 'major'::"public"."disable_update", 't', 'f', 'f', 't', 't', 't', 't', 't', '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid),
    (4, NOW(), 'production', 'com.stats.app', 13, NOW(), 't', 't', 'major'::"public"."disable_update", 'f', 't', 't', 't', 't', 't', 't', 't', '7a1b2c3d-4e5f-4a6b-7c8d-9e0f1a2b3c4d'::uuid),
    (5, NOW(), 'electron_only', 'com.demo.app', 3, NOW(), 'f', 't', 'major'::"public"."disable_update", 'f', 'f', 't', 't', 't', 't', 't', 't', '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid);

    INSERT INTO "public"."deploy_history" ("id", "created_at", "updated_at", "channel_id", "app_id", "version_id", "deployed_at", "owner_org", "created_by") VALUES
    (1, NOW() - interval '15 days', NOW() - interval '15 days', 1, 'com.demo.app', 3, NOW() - interval '15 days', '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid, '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid),
    (2, NOW() - interval '10 days', NOW() - interval '10 days', 1, 'com.demo.app', 5, NOW() - interval '10 days', '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid, '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid),
    (3, NOW() - interval '5 days', NOW() - interval '5 days', 1, 'com.demo.app', 3, NOW() - interval '5 days', '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid, '6aa76066-55ef-4238-ade6-0b32334a4097'::uuid),
    (4, NOW() - interval '7 days', NOW() - interval '7 days', 4, 'com.stats.app', 13, NOW() - interval '7 days', 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e'::uuid, '7a1b2c3d-4e5f-4a6b-7c8d-9e0f1a2b3c4d'::uuid);

    -- Insert test devices for RLS testing
    INSERT INTO "public"."devices" ("updated_at", "device_id", "version_name", "app_id", "platform", "plugin_version", "os_version", "version_build", "custom_id", "is_prod", "is_emulator") VALUES
    (NOW(), '00000000-0000-0000-0000-000000000001', '1.0.0', 'com.demo.app', 'ios', '4.15.3', '16.0', '1.0.0', 'test-device-1', 't', 'f'),
    (NOW(), '00000000-0000-0000-0000-000000000002', '1.0.1', 'com.demo.app', 'android', '4.15.3', '13', '1.0.1', 'test-device-2', 't', 'f'),
    (NOW(), '00000000-0000-0000-0000-000000000003', '1.361.0', 'com.demo.app', 'ios', '4.15.3', '15.0', '1.361.0', 'test-device-3', 'f', 't'),
    (NOW(), '00000000-0000-0000-0000-000000000004', '1.0.0', 'com.demoadmin.app', 'android', '4.15.3', '12', '1.0.0', 'admin-test-device', 't', 'f'),
    (NOW(), '00000000-0000-0000-0000-000000000005', '1.0.0', 'com.stats.app', 'android', '4.15.3', '11', '1.0.0', 'stats-test-device', 't', 'f'),
    (NOW(), '00000000-0000-0000-0000-000000000006', '1.0.0', 'com.demo.app', 'electron', '7.0.0', 'Linux 5.15', '1.0.0', 'electron-test-device', 't', 'f');

    -- Drop replicated orgs but keet the the seed ones
    DELETE from "public"."orgs" where POSITION('organization' in orgs.name)=1;
    PERFORM setval('public.apikeys_id_seq', 112, true);
    PERFORM setval('public.app_versions_id_seq', 16, true);
    PERFORM setval('public.channel_id_seq', 6, false);
    PERFORM setval('public.deploy_history_id_seq', 5, false);
END;
$_$;


ALTER FUNCTION "public"."reset_and_seed_data"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_and_seed_stats_data"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
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
  random_version_id BIGINT := 3;
  random_action VARCHAR(20);
  random_timestamp TIMESTAMP;
  random_daily_change NUMERIC := 0;
  previous_install BIGINT := 0;
  previous_version_id BIGINT := 3;
  current_version_id BIGINT := 4;
  demo_org_id uuid := '046a36ac-e03c-4590-9257-bd6c9dba9ee8'::uuid;
BEGIN
  -- Truncate all tables
  TRUNCATE TABLE public.daily_mau, public.daily_bandwidth, public.daily_storage, public.daily_version, public.storage_usage, public.version_usage, public.device_usage, public.bandwidth_usage, public.devices, public.stats;

  -- Generate a random UUID
  random_uuid := gen_random_uuid();

  INSERT INTO public.devices (updated_at, device_id, version_name, app_id, platform, plugin_version, os_version, version_build, custom_id, is_prod, is_emulator) VALUES
    (NOW(), random_uuid, '1.0.0', 'com.demo.app', 'android', '4.15.3', '9', '1.223.0', '', 't', 't');

  --  insert a fix device id for test
  INSERT INTO public.devices (updated_at, device_id, version_name, app_id, platform, plugin_version, os_version, version_build, custom_id, is_prod, is_emulator) VALUES
    (NOW(), '00000000-0000-0000-0000-000000000000', '1.0.0', 'com.demo.app', 'android', '4.15.3', '9', '1.223.0', '', 't', 't');

  INSERT INTO public.stats (created_at, action, device_id, version_name, app_id) VALUES
    (NOW(), 'get'::"public"."stats_action", random_uuid, '1.0.0', 'com.demo.app'),
    (NOW(), 'set'::"public"."stats_action", random_uuid, '1.0.0', 'com.demo.app');

  -- Seed data for daily_mau, daily_bandwidth, and daily_storage
  curr_date := start_date::DATE;
  WHILE curr_date <= end_date::DATE LOOP
    random_mau := FLOOR(RANDOM() * 1000) + 1;
    random_bandwidth := FLOOR(RANDOM() * 1000000000) + 1;
    random_storage := FLOOR(RANDOM() * 1000000000) + 1;

    INSERT INTO public.daily_mau (app_id, date, mau) VALUES ('com.demo.app', curr_date, random_mau);
    INSERT INTO public.daily_bandwidth (app_id, date, bandwidth) VALUES ('com.demo.app', curr_date, random_bandwidth);
    INSERT INTO public.daily_storage (app_id, date, storage) VALUES ('com.demo.app', curr_date, random_storage);

    curr_date := curr_date + INTERVAL '1 day';
  END LOOP;

  -- Seed data for daily_version

  curr_date := start_date::DATE;
  WHILE curr_date <= end_date::DATE LOOP
    IF curr_date != start_date::DATE THEN
      -- Generate a random value between 0.2 and 0.8 using a more reliable method
      random_daily_change := (random() * 0.6 + 0.2);
      IF previous_version_id = 3 THEN
        current_version_id := 4;
      ELSE
        current_version_id := 3;
      END IF;

      INSERT INTO public.daily_version (date, app_id, version_id, version_name, get, fail, install, uninstall)
      VALUES (curr_date, 'com.demo.app', previous_version_id, CASE WHEN previous_version_id = 3 THEN '1.0.0' ELSE '1.0.1' END, FLOOR(RANDOM() * 100) + 1, FLOOR(RANDOM() * 10) + 1, 0, previous_install * random_daily_change);

      INSERT INTO public.daily_version (date, app_id, version_id, version_name, get, fail, install, uninstall)
      VALUES (curr_date, 'com.demo.app', current_version_id, CASE WHEN current_version_id = 3 THEN '1.0.0' ELSE '1.0.1' END, FLOOR(RANDOM() * 100) + 1, FLOOR(RANDOM() * 10) + 1, previous_install * random_daily_change, 0);
      previous_version_id := current_version_id;
      previous_install := previous_install * random_daily_change;
    ELSE
      previous_install := FLOOR(RANDOM() * 50000) + 1;
      INSERT INTO public.daily_version (date, app_id, version_id, version_name, get, fail, install, uninstall)
      VALUES (curr_date, 'com.demo.app', current_version_id, CASE WHEN current_version_id = 3 THEN '1.0.0' ELSE '1.0.1' END, FLOOR(RANDOM() * 100) + 1, FLOOR(RANDOM() * 10) + 1, previous_install, 0);
    END IF;

    curr_date := curr_date + INTERVAL '1 day';
  END LOOP;

  -- Add daily_version data for additional apps for testing multi-app view
  curr_date := start_date::DATE + INTERVAL '5 days'; -- Start 5 days later for variety
  WHILE curr_date <= end_date::DATE LOOP
    -- Add data for com.demoadmin.app
    INSERT INTO public.daily_version (date, app_id, version_id, version_name, get, fail, install, uninstall)
    VALUES (curr_date, 'com.demoadmin.app', 10, '1.0.0', FLOOR(RANDOM() * 30) + 5, FLOOR(RANDOM() * 3) + 0, FLOOR(RANDOM() * 20) + 3, 0);

    -- Add data for com.stats.app
    INSERT INTO public.daily_version (date, app_id, version_id, version_name, get, fail, install, uninstall)
    VALUES (curr_date, 'com.stats.app', 13, '1.0.0', FLOOR(RANDOM() * 25) + 8, FLOOR(RANDOM() * 2) + 0, FLOOR(RANDOM() * 15) + 2, 0);

    curr_date := curr_date + INTERVAL '1 day';
  END LOOP;

  -- Seed data for storage_usage
  FOR i IN 1..20 LOOP
    random_file_size := FLOOR(RANDOM() * 10485760) - 5242880; -- Random size between -5MB and 5MB
    INSERT INTO public.storage_usage (device_id, app_id, file_size) VALUES (random_uuid, 'com.demo.app', random_file_size);
  END LOOP;

  -- Seed data for version_usage
  FOR i IN 1..30 LOOP
    random_timestamp := start_date + (RANDOM() * (end_date - start_date));
    random_action := (ARRAY['get', 'fail', 'install', 'uninstall'])[FLOOR(RANDOM() * 4) + 1];
    INSERT INTO public.version_usage (timestamp, app_id, version_id, action)
    VALUES (random_timestamp, 'com.demo.app', random_version_id, random_action::"public"."version_action");
  END LOOP;

  -- Seed data for device_usage
  FOR i IN 1..50 LOOP
    INSERT INTO public.device_usage (device_id, app_id, org_id)
    VALUES (random_uuid, 'com.demo.app', demo_org_id::text);
  END LOOP;

  -- Seed data for bandwidth_usage
  FOR i IN 1..40 LOOP
    random_file_size := FLOOR(RANDOM() * 10485760) + 1; -- Random size between 1 byte and 10MB
    INSERT INTO public.bandwidth_usage (device_id, app_id, file_size) VALUES (random_uuid, 'com.demo.app', random_file_size);
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."reset_and_seed_stats_data"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_app_data"("p_app_id" character varying) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    -- Use advisory lock to prevent concurrent execution for the same app
    PERFORM pg_advisory_xact_lock(hashtext(p_app_id));

    -- Delete in dependency order to avoid foreign key conflicts
    DELETE FROM public.deploy_history WHERE app_id = p_app_id;
    DELETE FROM public.channel_devices WHERE app_id = p_app_id;
    DELETE FROM public.channels WHERE app_id = p_app_id;
    DELETE FROM public.app_versions WHERE app_id = p_app_id;
    DELETE FROM public.build_requests WHERE app_id = p_app_id;
    DELETE FROM public.apps WHERE app_id = p_app_id;

    -- Advisory lock is automatically released at transaction end
END;
$$;


ALTER FUNCTION "public"."reset_app_data"("p_app_id" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_app_stats_data"("p_app_id" character varying) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Use advisory lock to prevent concurrent execution for the same app
  PERFORM pg_advisory_xact_lock(hashtext(p_app_id || '_stats'));

  -- Delete existing data for the specified app_id in dependency order
  DELETE FROM public.daily_mau WHERE app_id = p_app_id;
  DELETE FROM public.daily_bandwidth WHERE app_id = p_app_id;
  DELETE FROM public.daily_storage WHERE app_id = p_app_id;
  DELETE FROM public.daily_version WHERE app_id = p_app_id;
  DELETE FROM public.daily_build_time WHERE app_id = p_app_id;
  DELETE FROM public.storage_usage WHERE app_id = p_app_id;
  DELETE FROM public.version_usage WHERE app_id = p_app_id;
  DELETE FROM public.device_usage WHERE app_id = p_app_id;
  DELETE FROM public.bandwidth_usage WHERE app_id = p_app_id;
  DELETE FROM public.devices WHERE app_id = p_app_id;
  DELETE FROM public.stats WHERE app_id = p_app_id;

  -- Advisory lock is automatically released at transaction end
END;
$$;


ALTER FUNCTION "public"."reset_app_stats_data"("p_app_id" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_onboarding_demo_app_data"("p_app_uuid" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_app_id text;
  v_owner_org uuid;
BEGIN
  SELECT "app_id", "owner_org"
  INTO v_app_id, v_owner_org
  FROM "public"."apps"
  WHERE "id" = p_app_uuid;

  IF v_app_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM "public"."claim_legacy_onboarding_demo_data"(p_app_uuid);

  -- unknown/builtin are system placeholders maintained by app creation. They
  -- are allowed in demo-shaped legacy apps, but must never be demo-owned rows.
  DELETE FROM "public"."onboarding_demo_data" odd
  USING "public"."app_versions" av
  WHERE odd."app_id" = v_app_id
    AND odd."relation_name" IN ('app_versions', 'app_versions_meta')
    AND odd."row_key" = av."id"::text
    AND av."app_id" = v_app_id
    AND av."name" IN ('unknown', 'builtin');

  -- Refuse to delete tracked parents when any untracked child row points at
  -- them. Without these guards, ON DELETE CASCADE could remove real data that
  -- a user attached to a demo-created version or channel.
  IF EXISTS (
    WITH tracked_versions AS (
      SELECT "row_key"::bigint AS "id"
      FROM "public"."onboarding_demo_data"
      WHERE "app_id" = v_app_id
        AND "relation_name" = 'app_versions'
    )
    SELECT 1
    FROM "public"."channels" c
    INNER JOIN tracked_versions tv ON tv."id" = c."version"
    WHERE NOT EXISTS (
      SELECT 1
      FROM "public"."onboarding_demo_data" odd
      WHERE odd."app_id" = v_app_id
        AND odd."relation_name" = 'channels'
        AND odd."row_key" = c."id"::text
    )
  ) THEN
    RAISE EXCEPTION 'reset_onboarding_demo_app_data: refusing to cascade from demo versions into untracked channels for app %', v_app_id;
  END IF;

  IF EXISTS (
    WITH tracked_versions AS (
      SELECT "row_key"::bigint AS "id"
      FROM "public"."onboarding_demo_data"
      WHERE "app_id" = v_app_id
        AND "relation_name" = 'app_versions'
    )
    SELECT 1
    FROM "public"."deploy_history" dh
    INNER JOIN tracked_versions tv ON tv."id" = dh."version_id"
    WHERE NOT EXISTS (
      SELECT 1
      FROM "public"."onboarding_demo_data" odd
      WHERE odd."app_id" = v_app_id
        AND odd."relation_name" = 'deploy_history'
        AND odd."row_key" = dh."id"::text
    )
  ) THEN
    RAISE EXCEPTION 'reset_onboarding_demo_app_data: refusing to cascade from demo versions into untracked deploy history for app %', v_app_id;
  END IF;

  IF EXISTS (
    WITH tracked_versions AS (
      SELECT "row_key"::bigint AS "id"
      FROM "public"."onboarding_demo_data"
      WHERE "app_id" = v_app_id
        AND "relation_name" = 'app_versions'
    )
    SELECT 1
    FROM "public"."manifest" m
    INNER JOIN tracked_versions tv ON tv."id" = m."app_version_id"
    WHERE NOT EXISTS (
      SELECT 1
      FROM "public"."onboarding_demo_data" odd
      WHERE odd."app_id" = v_app_id
        AND odd."relation_name" = 'manifest'
        AND odd."row_key" = m."id"::text
    )
  ) THEN
    RAISE EXCEPTION 'reset_onboarding_demo_app_data: refusing to cascade from demo versions into untracked manifest rows for app %', v_app_id;
  END IF;

  IF EXISTS (
    WITH tracked_versions AS (
      SELECT "row_key"::bigint AS "id"
      FROM "public"."onboarding_demo_data"
      WHERE "app_id" = v_app_id
        AND "relation_name" = 'app_versions'
    )
    SELECT 1
    FROM "public"."app_versions_meta" avm
    INNER JOIN tracked_versions tv ON tv."id" = avm."id"
    WHERE NOT EXISTS (
      SELECT 1
      FROM "public"."onboarding_demo_data" odd
      WHERE odd."app_id" = v_app_id
        AND odd."relation_name" = 'app_versions_meta'
        AND odd."row_key" = avm."id"::text
    )
  ) THEN
    RAISE EXCEPTION 'reset_onboarding_demo_app_data: refusing to cascade from demo versions into untracked version metadata for app %', v_app_id;
  END IF;

  IF EXISTS (
    WITH tracked_versions AS (
      SELECT "row_key"::bigint AS "id"
      FROM "public"."onboarding_demo_data"
      WHERE "app_id" = v_app_id
        AND "relation_name" = 'app_versions'
    )
    SELECT 1
    FROM "public"."permissions" p
    INNER JOIN tracked_versions tv ON tv."id" = p."bundle_id"
  ) OR EXISTS (
    WITH tracked_versions AS (
      SELECT "row_key"::bigint AS "id"
      FROM "public"."onboarding_demo_data"
      WHERE "app_id" = v_app_id
        AND "relation_name" = 'app_versions'
    )
    SELECT 1
    FROM "public"."role_bindings" rb
    INNER JOIN tracked_versions tv ON tv."id" = rb."bundle_id"
  ) THEN
    RAISE EXCEPTION 'reset_onboarding_demo_app_data: refusing to cascade from demo versions into RBAC rows for app %', v_app_id;
  END IF;

  IF EXISTS (
    WITH tracked_versions AS (
      SELECT "row_key"::bigint AS "id"
      FROM "public"."onboarding_demo_data"
      WHERE "app_id" = v_app_id
        AND "relation_name" = 'app_versions'
    )
    SELECT 1
    FROM "public"."version_meta" vm
    INNER JOIN tracked_versions tv ON tv."id" = vm."version_id"
    WHERE vm."app_id" = v_app_id
  ) THEN
    RAISE EXCEPTION 'reset_onboarding_demo_app_data: refusing to delete demo versions with non-nullable version metrics for app %', v_app_id;
  END IF;

  IF EXISTS (
    WITH tracked_channels AS (
      SELECT "row_key"::bigint AS "id"
      FROM "public"."onboarding_demo_data"
      WHERE "app_id" = v_app_id
        AND "relation_name" = 'channels'
    )
    SELECT 1
    FROM "public"."deploy_history" dh
    INNER JOIN tracked_channels tc ON tc."id" = dh."channel_id"
    WHERE NOT EXISTS (
      SELECT 1
      FROM "public"."onboarding_demo_data" odd
      WHERE odd."app_id" = v_app_id
        AND odd."relation_name" = 'deploy_history'
        AND odd."row_key" = dh."id"::text
    )
  ) THEN
    RAISE EXCEPTION 'reset_onboarding_demo_app_data: refusing to cascade from demo channels into untracked deploy history for app %', v_app_id;
  END IF;

  IF EXISTS (
    WITH tracked_channels AS (
      SELECT "row_key"::bigint AS "id"
      FROM "public"."onboarding_demo_data"
      WHERE "app_id" = v_app_id
        AND "relation_name" = 'channels'
    )
    SELECT 1
    FROM "public"."channel_devices" cd
    INNER JOIN tracked_channels tc ON tc."id" = cd."channel_id"
    WHERE NOT EXISTS (
      SELECT 1
      FROM "public"."onboarding_demo_data" odd
      WHERE odd."app_id" = v_app_id
        AND odd."relation_name" = 'channel_devices'
        AND odd."row_key" = cd."id"::text
    )
  ) THEN
    RAISE EXCEPTION 'reset_onboarding_demo_app_data: refusing to delete demo channels with untracked channel devices for app %', v_app_id;
  END IF;

  IF EXISTS (
    WITH tracked_channels AS (
      SELECT c."id", c."rbac_id"
      FROM "public"."channels" c
      INNER JOIN "public"."onboarding_demo_data" odd
        ON odd."app_id" = v_app_id
        AND odd."relation_name" = 'channels'
        AND odd."row_key" = c."id"::text
    )
    SELECT 1
    FROM "public"."channel_permission_overrides" cpo
    INNER JOIN tracked_channels tc ON tc."id" = cpo."channel_id"
  ) OR EXISTS (
    WITH tracked_channels AS (
      SELECT c."id", c."rbac_id"
      FROM "public"."channels" c
      INNER JOIN "public"."onboarding_demo_data" odd
        ON odd."app_id" = v_app_id
        AND odd."relation_name" = 'channels'
        AND odd."row_key" = c."id"::text
    )
    SELECT 1
    FROM "public"."org_users" ou
    INNER JOIN tracked_channels tc ON tc."id" = ou."channel_id"
  ) OR EXISTS (
    WITH tracked_channels AS (
      SELECT c."id", c."rbac_id"
      FROM "public"."channels" c
      INNER JOIN "public"."onboarding_demo_data" odd
        ON odd."app_id" = v_app_id
        AND odd."relation_name" = 'channels'
        AND odd."row_key" = c."id"::text
    )
    SELECT 1
    FROM "public"."role_bindings" rb
    INNER JOIN tracked_channels tc ON tc."rbac_id" = rb."channel_id"
  ) THEN
    RAISE EXCEPTION 'reset_onboarding_demo_app_data: refusing to cascade from demo channels into access-control rows for app %', v_app_id;
  END IF;

  DELETE FROM "public"."channel_devices" cd
  USING "public"."onboarding_demo_data" odd
  WHERE odd."app_id" = v_app_id
    AND odd."relation_name" = 'channel_devices'
    AND odd."row_key" = cd."id"::text;

  DELETE FROM "public"."deploy_history" dh
  USING "public"."onboarding_demo_data" odd
  WHERE odd."app_id" = v_app_id
    AND odd."relation_name" = 'deploy_history'
    AND odd."row_key" = dh."id"::text;

  DELETE FROM "public"."manifest" m
  USING "public"."onboarding_demo_data" odd
  WHERE odd."app_id" = v_app_id
    AND odd."relation_name" = 'manifest'
    AND odd."row_key" = m."id"::text;

  DELETE FROM "public"."build_requests" br
  USING "public"."onboarding_demo_data" odd
  WHERE odd."app_id" = v_app_id
    AND odd."relation_name" = 'build_requests'
    AND odd."row_key" = br."id"::text;

  DELETE FROM "public"."devices" d
  USING "public"."onboarding_demo_data" odd
  WHERE odd."app_id" = v_app_id
    AND odd."relation_name" = 'devices'
    AND odd."row_key" = d."id"::text;

  DELETE FROM "public"."channels" c
  USING "public"."onboarding_demo_data" odd
  WHERE odd."app_id" = v_app_id
    AND odd."relation_name" = 'channels'
    AND odd."row_key" = c."id"::text;

  DELETE FROM "public"."app_versions_meta" avm
  USING "public"."onboarding_demo_data" odd
  WHERE odd."app_id" = v_app_id
    AND odd."relation_name" = 'app_versions_meta'
    AND odd."row_key" = avm."id"::text;

  UPDATE "public"."devices" d
  SET "version" = NULL
  WHERE d."app_id" = v_app_id
    AND EXISTS (
      SELECT 1
      FROM "public"."onboarding_demo_data" odd
      WHERE odd."app_id" = v_app_id
        AND odd."relation_name" = 'app_versions'
        AND odd."row_key" = d."version"::text
    );

  UPDATE "public"."daily_version" dv
  SET "version_id" = NULL
  WHERE dv."app_id" = v_app_id
    AND EXISTS (
      SELECT 1
      FROM "public"."onboarding_demo_data" odd
      WHERE odd."app_id" = v_app_id
        AND odd."relation_name" = 'app_versions'
        AND odd."row_key" = dv."version_id"::text
    );

  UPDATE "public"."version_usage" vu
  SET "version_id" = NULL
  WHERE vu."app_id" = v_app_id
    AND EXISTS (
      SELECT 1
      FROM "public"."onboarding_demo_data" odd
      WHERE odd."app_id" = v_app_id
        AND odd."relation_name" = 'app_versions'
        AND odd."row_key" = vu."version_id"::text
    );

  DELETE FROM "public"."app_versions" av
  USING "public"."onboarding_demo_data" odd
  WHERE odd."app_id" = v_app_id
    AND odd."relation_name" = 'app_versions'
    AND odd."row_key" = av."id"::text;

  DELETE FROM "public"."onboarding_demo_data"
  WHERE "app_id" = v_app_id;

  PERFORM "public"."refresh_app_rollups_after_demo_reset"(p_app_uuid, v_app_id, v_owner_org);
END;
$$;


ALTER FUNCTION "public"."reset_onboarding_demo_app_data"("p_app_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restore_deleted_account"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  auth_uid uuid;
  auth_email text;
  last_sign_in_at_ts timestamptz;
  hashed_email text;
  restored_account_id uuid;
BEGIN
  SELECT "auth"."uid"() INTO auth_uid;
  IF auth_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT "email", "last_sign_in_at"
  INTO auth_email, last_sign_in_at_ts
  FROM "auth"."users"
  WHERE "id" = auth_uid;

  IF last_sign_in_at_ts IS NULL OR last_sign_in_at_ts < NOW() - INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'reauth_required' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM "public"."to_delete_accounts"
  WHERE "account_id" = auth_uid
    AND "removal_date" > NOW()
    AND "removal_date" <= NOW() + INTERVAL '30 days'
  RETURNING "account_id" INTO restored_account_id;

  IF restored_account_id IS NULL THEN
    RAISE EXCEPTION 'restore_window_expired' USING ERRCODE = 'P0001';
  END IF;

  IF auth_email IS NOT NULL AND auth_email <> '' THEN
    hashed_email := "encode"("extensions"."digest"(auth_email::text, 'sha256'::text), 'hex'::text);

    DELETE FROM "public"."deleted_account"
    WHERE "email" = hashed_email;
  END IF;
END;
$$;


ALTER FUNCTION "public"."restore_deleted_account"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."restore_deleted_account"() IS 'Restore the authenticated user account while still inside the delayed deletion window. Requires a recent sign-in.';



CREATE OR REPLACE FUNCTION "public"."sanitize_apps_text_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW."name" := public.strip_html(NEW."name");
  NEW."icon_url" := public.strip_html(NEW."icon_url");
  IF (TG_OP = 'UPDATE') THEN
    NEW."updated_at" := now();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sanitize_apps_text_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sanitize_orgs_text_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW."name" := public.strip_html(NEW."name");
  NEW."management_email" := public.strip_html(NEW."management_email");
  NEW."logo" := public.strip_html(NEW."logo");
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sanitize_orgs_text_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sanitize_tmp_users_text_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW."email" := public.strip_html(NEW."email");
  NEW."first_name" := public.strip_html(NEW."first_name");
  NEW."last_name" := public.strip_html(NEW."last_name");
  IF (TG_OP = 'UPDATE') THEN
    NEW."updated_at" := now();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sanitize_tmp_users_text_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sanitize_users_text_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW."email" := public.strip_html(NEW."email");
  NEW."first_name" := public.strip_html(NEW."first_name");
  NEW."last_name" := public.strip_html(NEW."last_name");
  NEW."country" := public.strip_html(NEW."country");
  IF (TG_OP = 'UPDATE') THEN
    NEW."updated_at" := now();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sanitize_users_text_fields"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_metrics_cache" (
    "id" bigint NOT NULL,
    "org_id" "uuid" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "response" "jsonb" NOT NULL,
    "cached_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_metrics_cache" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seed_get_app_metrics_caches"("p_org_id" "uuid", "p_start_date" "date", "p_end_date" "date") RETURNS "public"."app_metrics_cache"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    metrics_json jsonb;
    cache_record public.app_metrics_cache%ROWTYPE;
BEGIN
    WITH DateSeries AS (
        SELECT generate_series(p_start_date, p_end_date, '1 day'::interval)::date AS date
    ),
    all_apps AS (
        SELECT apps.app_id, apps.owner_org
        FROM public.apps
        WHERE apps.owner_org = p_org_id
        UNION
        SELECT deleted_apps.app_id, deleted_apps.owner_org
        FROM public.deleted_apps
        WHERE deleted_apps.owner_org = p_org_id
    ),
    deleted_metrics AS (
        SELECT
            deleted_apps.app_id,
            deleted_apps.deleted_at::date AS date,
            COUNT(*) AS deleted_count
        FROM public.deleted_apps
        WHERE deleted_apps.owner_org = p_org_id
        AND deleted_apps.deleted_at::date BETWEEN p_start_date AND p_end_date
        GROUP BY deleted_apps.app_id, deleted_apps.deleted_at::date
    ),
    metrics AS (
        SELECT
            aa.app_id,
            ds.date::date,
            COALESCE(dm.mau, 0) AS mau,
            COALESCE(dst.storage, 0) AS storage,
            COALESCE(db.bandwidth, 0) AS bandwidth,
            COALESCE(dbt.build_time_unit, 0) AS build_time_unit,
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
            public.daily_build_time dbt ON aa.app_id = dbt.app_id AND ds.date = dbt.date
        LEFT JOIN
            public.daily_version dv ON aa.app_id = dv.app_id AND ds.date = dv.date
        LEFT JOIN
            deleted_metrics del ON aa.app_id = del.app_id AND ds.date = del.date
        GROUP BY
            aa.app_id, ds.date, dm.mau, dst.storage, db.bandwidth, dbt.build_time_unit, del.deleted_count
    )
    SELECT COALESCE(
        jsonb_agg(row_to_json(metrics) ORDER BY metrics.app_id, metrics.date),
        '[]'::jsonb
    )
    INTO metrics_json
    FROM metrics;

    INSERT INTO public.app_metrics_cache (org_id, start_date, end_date, response, cached_at)
    VALUES (p_org_id, p_start_date, p_end_date, metrics_json, clock_timestamp())
    ON CONFLICT (org_id) DO UPDATE
        SET start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date,
            response = EXCLUDED.response,
            cached_at = EXCLUDED.cached_at
    RETURNING * INTO cache_record;

    RETURN cache_record;
END;
$$;


ALTER FUNCTION "public"."seed_get_app_metrics_caches"("p_org_id" "uuid", "p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seed_org_metrics_cache"("p_org_id" "uuid", "p_start_date" "date", "p_end_date" "date") RETURNS "public"."org_metrics_cache"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    cache_record public.org_metrics_cache%ROWTYPE;
BEGIN
    INSERT INTO public.org_metrics_cache (
        org_id,
        start_date,
        end_date,
        mau,
        storage,
        bandwidth,
        build_time_unit,
        get,
        fail,
        install,
        uninstall,
        cached_at
    )
    SELECT
        org_id,
        start_date,
        end_date,
        mau,
        storage,
        bandwidth,
        build_time_unit,
        get,
        fail,
        install,
        uninstall,
        cached_at
    FROM public.calculate_org_metrics_cache_entry(p_org_id, p_start_date, p_end_date)
    ON CONFLICT (org_id) DO UPDATE
        SET start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date,
            mau = EXCLUDED.mau,
            storage = EXCLUDED.storage,
            bandwidth = EXCLUDED.bandwidth,
            build_time_unit = EXCLUDED.build_time_unit,
            get = EXCLUDED.get,
            fail = EXCLUDED.fail,
            install = EXCLUDED.install,
            uninstall = EXCLUDED.uninstall,
            cached_at = EXCLUDED.cached_at
    RETURNING * INTO cache_record;

    RETURN cache_record;
END;
$$;


ALTER FUNCTION "public"."seed_org_metrics_cache"("p_org_id" "uuid", "p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_build_time_exceeded_by_org"("org_id" "uuid", "disabled" boolean) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  UPDATE public.stripe_info SET build_time_exceeded = disabled
  WHERE stripe_info.customer_id = (SELECT customer_id FROM public.orgs WHERE id = set_build_time_exceeded_by_org.org_id);
END;
$$;


ALTER FUNCTION "public"."set_build_time_exceeded_by_org"("org_id" "uuid", "disabled" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_deleted_at_on_soft_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Only set deleted_at when deleted changes from false to true
  -- and deleted_at is not already set (allows manual override if needed)
  IF NEW.deleted = true AND (OLD.deleted = false OR OLD.deleted IS NULL) AND NEW.deleted_at IS NULL THEN
    NEW.deleted_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_deleted_at_on_soft_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_webhook_created_by"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  creator_id uuid;
BEGIN
  creator_id := public.request_actor_user_id();

  IF creator_id IS NOT NULL THEN
    NEW.created_by := creator_id;
  ELSIF NEW.created_by IS NULL THEN
    SELECT orgs.created_by
    INTO creator_id
    FROM public.orgs AS orgs
    WHERE orgs.id = NEW.org_id;

    NEW.created_by := creator_id;
  END IF;

  IF NEW.created_by IS NULL THEN
    RAISE EXCEPTION 'webhooks.created_by cannot be null';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_webhook_created_by"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."strip_html"("input" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  SELECT CASE
    WHEN input IS NULL THEN NULL
    ELSE btrim(regexp_replace(input, '<[^>]*>', '', 'g'))
  END;
$$;


ALTER FUNCTION "public"."strip_html"("input" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_org_has_usage_credits_from_grants"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_org_id uuid;
BEGIN
  FOR v_org_id IN
    SELECT DISTINCT affected."org_id"
    FROM (VALUES (NEW."org_id"), (OLD."org_id")) AS affected("org_id")
    WHERE affected."org_id" IS NOT NULL
  LOOP
    UPDATE "public"."orgs" AS o
    SET "has_usage_credits" = credit_state."has_usage_credits"
    FROM (
      SELECT EXISTS (
        SELECT 1
        FROM "public"."usage_credit_grants" AS g
        WHERE g."org_id" = v_org_id
          AND g."expires_at" >= now()
          AND g."credits_consumed" < g."credits_total"
      ) AS "has_usage_credits"
    ) AS credit_state
    WHERE o."id" = v_org_id
      AND o."has_usage_credits" IS DISTINCT FROM credit_state."has_usage_credits";
  END LOOP;

  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."sync_org_has_usage_credits_from_grants"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."top_up_usage_credits"("p_org_id" "uuid", "p_amount" numeric, "p_expires_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_source" "text" DEFAULT 'manual'::"text", "p_source_ref" "jsonb" DEFAULT NULL::"jsonb", "p_notes" "text" DEFAULT NULL::"text") RETURNS TABLE("grant_id" "uuid", "transaction_id" bigint, "available_credits" numeric, "total_credits" numeric, "next_expiration" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  c_empty CONSTANT text := '';
  c_service_role CONSTANT text := 'service_role';
  c_default_source CONSTANT text := 'manual';
  c_purchase CONSTANT public.credit_transaction_type := 'purchase'::public.credit_transaction_type;
  c_session_id_key CONSTANT text := 'sessionId';
  c_payment_intent_key CONSTANT text := 'paymentIntentId';
  v_request_role text := current_setting('request.jwt.claim.role', true);
  v_effective_expires timestamptz := COALESCE(p_expires_at, NOW() + interval '1 year');
  v_source_ref jsonb := p_source_ref;
  v_session_id text := NULLIF(v_source_ref ->> c_session_id_key, c_empty);
  v_payment_intent_id text := NULLIF(v_source_ref ->> c_payment_intent_key, c_empty);
  v_grant_id uuid;
  v_transaction_id bigint;
  v_available numeric := 0;
  v_total numeric := 0;
  v_next_expiration timestamptz;
  v_existing_transaction_id bigint;
  v_existing_grant_id uuid;
BEGIN
  IF current_user <> 'postgres' AND COALESCE(v_request_role, c_empty) <> c_service_role THEN
    RAISE EXCEPTION 'insufficient_privileges';
  END IF;

  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'org_id is required';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  -- Guard the grant/transaction creation inside a subtransaction so we can detect
  -- race-condition duplicates via the new unique indexes and return the existing
  -- ledger row instead of creating another grant.
  BEGIN
    INSERT INTO public.usage_credit_grants (
      org_id,
      credits_total,
      credits_consumed,
      granted_at,
      expires_at,
      source,
      source_ref,
      notes
    )
    VALUES (
      p_org_id,
      p_amount,
      0,
      NOW(),
      v_effective_expires,
      COALESCE(NULLIF(p_source, c_empty), c_default_source),
      v_source_ref,
      p_notes
    )
    RETURNING id INTO v_grant_id;

    SELECT
      COALESCE(b.total_credits, 0),
      COALESCE(b.available_credits, 0),
      b.next_expiration
    INTO v_total, v_available, v_next_expiration
    FROM public.usage_credit_balances AS b
    WHERE b.org_id = p_org_id;

    INSERT INTO public.usage_credit_transactions (
      org_id,
      grant_id,
      transaction_type,
      amount,
      balance_after,
      description,
      source_ref
    )
    VALUES (
      p_org_id,
      v_grant_id,
      c_purchase,
      p_amount,
      v_available,
      p_notes,
      v_source_ref
    )
    RETURNING id INTO v_transaction_id;

  EXCEPTION WHEN unique_violation THEN
    IF v_session_id IS NULL AND v_payment_intent_id IS NULL THEN
      RAISE;
    END IF;

    SELECT t.id, t.grant_id
    INTO v_existing_transaction_id, v_existing_grant_id
    FROM public.usage_credit_transactions AS t
    WHERE t.org_id = p_org_id
      AND t.transaction_type = c_purchase
      AND (
        (v_session_id IS NOT NULL AND t.source_ref ->> c_session_id_key = v_session_id)
        OR (v_payment_intent_id IS NOT NULL AND t.source_ref ->> c_payment_intent_key = v_payment_intent_id)
      )
    ORDER BY t.id DESC
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE;
    END IF;

    SELECT
      COALESCE(b.total_credits, 0),
      COALESCE(b.available_credits, 0),
      b.next_expiration
    INTO v_total, v_available, v_next_expiration
    FROM public.usage_credit_balances AS b
    WHERE b.org_id = p_org_id;

    v_grant_id := v_existing_grant_id;
    v_transaction_id := v_existing_transaction_id;
  END;

  grant_id := v_grant_id;
  transaction_id := v_transaction_id;
  available_credits := v_available;
  total_credits := v_total;
  next_expiration := v_next_expiration;

  RETURN NEXT;
  RETURN;
END;
$$;


ALTER FUNCTION "public"."top_up_usage_credits"("p_org_id" "uuid", "p_amount" numeric, "p_expires_at" timestamp with time zone, "p_source" "text", "p_source_ref" "jsonb", "p_notes" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."top_up_usage_credits"("p_org_id" "uuid", "p_amount" numeric, "p_expires_at" timestamp with time zone, "p_source" "text", "p_source_ref" "jsonb", "p_notes" "text") IS 'Grants credits to an organization, records the transaction ledger entry, and returns the updated balances.';



CREATE OR REPLACE FUNCTION "public"."total_bundle_storage_bytes"() RETURNS bigint
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT (
    -- Sum bundle sizes only for active app versions.
    COALESCE(
      (
        SELECT SUM(avm.size)
        FROM public.app_versions_meta avm
        INNER JOIN public.app_versions av ON av.id = avm.id
        WHERE av.deleted = false
      ),
      0
    ) +
    -- Sum manifest file sizes only for active app versions.
    COALESCE(
      (
        SELECT SUM(m.file_size)
        FROM public.manifest m
        WHERE EXISTS (
          SELECT 1
          FROM public.app_versions av
          WHERE av.id = m.app_version_id
            AND av.deleted = false
        )
      ),
      0
    )
  )::bigint;
$$;


ALTER FUNCTION "public"."total_bundle_storage_bytes"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."total_bundle_storage_bytes"() IS 'Returns active bundle storage in bytes including bundle sizes (app_versions_meta.size) and manifest file sizes for non-deleted app versions.';



CREATE OR REPLACE FUNCTION "public"."track_onboarding_demo_data"("p_app_id" "text", "p_owner_org" "uuid", "p_relation_name" "text", "p_row_keys" "text"[], "p_seed_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF p_app_id IS NULL OR btrim(p_app_id) = '' THEN
    RAISE EXCEPTION 'track_onboarding_demo_data: app_id is required';
  END IF;

  IF p_owner_org IS NULL THEN
    RAISE EXCEPTION 'track_onboarding_demo_data: owner_org is required';
  END IF;

  IF p_seed_id IS NULL THEN
    RAISE EXCEPTION 'track_onboarding_demo_data: seed_id is required';
  END IF;

  IF p_relation_name IS NULL OR NOT (
    p_relation_name = ANY (ARRAY[
      'app_versions'::text,
      'app_versions_meta'::text,
      'manifest'::text,
      'channels'::text,
      'channel_devices'::text,
      'deploy_history'::text,
      'devices'::text,
      'build_requests'::text
    ])
  ) THEN
    RAISE EXCEPTION 'track_onboarding_demo_data: unsupported relation %', p_relation_name;
  END IF;

  INSERT INTO "public"."onboarding_demo_data" (
    "app_id",
    "owner_org",
    "relation_name",
    "row_key",
    "seed_id"
  )
  SELECT
    p_app_id,
    p_owner_org,
    p_relation_name,
    key_value,
    p_seed_id
  FROM "unnest"(p_row_keys) AS keys("key_value")
  WHERE "key_value" IS NOT NULL
    AND "btrim"("key_value") <> ''
  ON CONFLICT ("app_id", "relation_name", "row_key") DO UPDATE
  SET
    "owner_org" = EXCLUDED."owner_org",
    "seed_id" = EXCLUDED."seed_id",
    "created_at" = "now"();
END;
$$;


ALTER FUNCTION "public"."track_onboarding_demo_data"("p_app_id" "text", "p_owner_org" "uuid", "p_relation_name" "text", "p_row_keys" "text"[], "p_seed_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transfer_app"("p_app_id" character varying, "p_new_org_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_old_org_id uuid;
    v_user_id uuid;
    v_last_transfer jsonb;
    v_last_transfer_date timestamp;
    v_transfer_error constant text := 'Unable to process transfer request.';
    v_app_id_key constant text := 'app_id';
    v_old_org_id_key constant text := 'old_org_id';
    v_new_org_id_key constant text := 'new_org_id';
    v_uid_key constant text := 'uid';
BEGIN
  SELECT owner_org, transfer_history[array_length(transfer_history, 1)]
  INTO v_old_org_id, v_last_transfer
  FROM public.apps
  WHERE app_id = p_app_id;

  IF v_old_org_id IS NULL THEN
    RAISE EXCEPTION '%', v_transfer_error;
  END IF;

  v_user_id := (SELECT auth.uid());

  IF v_user_id IS NULL THEN
    PERFORM public.pg_log(
      'deny: TRANSFER_NO_AUTH',
      jsonb_build_object(v_app_id_key, p_app_id, v_new_org_id_key, p_new_org_id)
    );
    RAISE EXCEPTION '%', v_transfer_error;
  END IF;

  IF NOT public.rbac_check_permission(
      public.rbac_perm_app_transfer(),
      v_old_org_id,
      p_app_id,
      NULL::bigint
  ) THEN
    PERFORM public.pg_log(
      'deny: TRANSFER_OLD_ORG_RIGHTS',
      jsonb_build_object(
        v_app_id_key, p_app_id,
        v_old_org_id_key, v_old_org_id,
        v_new_org_id_key, p_new_org_id,
        v_uid_key, v_user_id
      )
    );
    RAISE EXCEPTION '%', v_transfer_error;
  END IF;

  IF NOT public.rbac_check_permission(
      public.rbac_perm_app_transfer(),
      p_new_org_id,
      NULL::character varying,
      NULL::bigint
  ) THEN
    PERFORM public.pg_log(
      'deny: TRANSFER_NEW_ORG_RIGHTS',
      jsonb_build_object(
        v_app_id_key, p_app_id,
        v_old_org_id_key, v_old_org_id,
        v_new_org_id_key, p_new_org_id,
        v_uid_key, v_user_id
      )
    );
    RAISE EXCEPTION '%', v_transfer_error;
  END IF;

  IF v_last_transfer IS NOT NULL THEN
    v_last_transfer_date := (v_last_transfer->>'transferred_at')::timestamp;
    IF v_last_transfer_date + interval '32 days' > now() THEN
      RAISE EXCEPTION
          'Cannot transfer app. Must wait at least 32 days '
          'between transfers. Last transfer was on %',
          v_last_transfer_date;
    END IF;
  END IF;

  BEGIN
    -- Allow the guarded owner_org cascade only inside the approved transfer path.
    PERFORM set_config('capgo.allow_owner_org_transfer', 'true', true);

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

    UPDATE public.app_versions
    SET owner_org = p_new_org_id
    WHERE app_id = p_app_id;

    UPDATE public.app_versions_meta
    SET owner_org = p_new_org_id
    WHERE app_id = p_app_id;

    UPDATE public.channel_devices
    SET owner_org = p_new_org_id
    WHERE app_id = p_app_id;

    UPDATE public.channels
    SET owner_org = p_new_org_id
    WHERE app_id = p_app_id;

    UPDATE public.deploy_history
    SET owner_org = p_new_org_id
    WHERE app_id = p_app_id;

    PERFORM set_config('capgo.allow_owner_org_transfer', 'false', true);
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM set_config('capgo.allow_owner_org_transfer', 'false', true);
      RAISE;
  END;

END;
$$;


ALTER FUNCTION "public"."transfer_app"("p_app_id" character varying, "p_new_org_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."transfer_app"("p_app_id" character varying, "p_new_org_id" "uuid") IS 'Transfers an app and all its related data to a new organization. Requires app.transfer permission on both source and destination organizations.';



CREATE OR REPLACE FUNCTION "public"."trigger_http_queue_post_to_function"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."trigger_http_queue_post_to_function"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_webhook_on_audit_log"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Queue the audit log event for webhook dispatch
  PERFORM pgmq.send(
    'webhook_dispatcher',
    jsonb_build_object(
      'function_name', 'webhook_dispatcher',
      'function_type', 'cloudflare',
      'payload', jsonb_build_object(
        'audit_log_id', NEW.id,
        'table_name', NEW.table_name,
        'operation', NEW.operation,
        'org_id', NEW.org_id,
        'record_id', NEW.record_id,
        'old_record', NEW.old_record,
        'new_record', NEW.new_record,
        'changed_fields', NEW.changed_fields,
        'user_id', NEW.user_id,
        'created_at', NEW.created_at
      )
    )
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_webhook_on_audit_log"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_app_versions_retention"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    UPDATE public.app_versions
    SET deleted = true
    WHERE app_versions.deleted = false
      AND (SELECT retention FROM public.apps WHERE apps.app_id = app_versions.app_id) >= 0
      AND (SELECT retention FROM public.apps WHERE apps.app_id = app_versions.app_id) < 63113904
      AND app_versions.created_at < (
          SELECT NOW() - make_interval(secs => apps.retention)
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


ALTER FUNCTION "public"."update_app_versions_retention"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_apps_build_timeout_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW."build_timeout_updated_at" := COALESCE(NEW."build_timeout_updated_at", now());
  ELSIF NEW."build_timeout_seconds" IS DISTINCT FROM OLD."build_timeout_seconds" THEN
    NEW."build_timeout_updated_at" := now();
  ELSE
    NEW."build_timeout_updated_at" := OLD."build_timeout_updated_at";
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_apps_build_timeout_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_org_invite_role_rbac"("p_org_id" "uuid", "p_user_id" "uuid", "p_new_role_name" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  role_id uuid;
BEGIN
  SELECT id INTO role_id
  FROM public.roles r
  WHERE r.name = p_new_role_name
    AND r.scope_type = public.rbac_scope_org()
    AND r.is_assignable = true
  LIMIT 1;

  IF role_id IS NULL THEN
    RAISE EXCEPTION 'ROLE_NOT_FOUND';
  END IF;

  IF p_new_role_name = public.rbac_role_org_super_admin() THEN
    IF NOT public.rbac_check_permission_request(public.rbac_perm_org_update_user_roles(), p_org_id, NULL::character varying, NULL::bigint) THEN
      RAISE EXCEPTION 'NO_PERMISSION_TO_UPDATE_ROLES';
    END IF;
  ELSE
    IF NOT public.rbac_check_permission_request(public.rbac_perm_org_invite_user(), p_org_id, NULL::character varying, NULL::bigint) THEN
      RAISE EXCEPTION 'NO_PERMISSION_TO_UPDATE_ROLES';
    END IF;
  END IF;

  UPDATE public.org_users
  SET rbac_role_name = p_new_role_name,
      updated_at = now()
  WHERE org_id = p_org_id
    AND user_id = p_user_id
    AND is_invite IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_INVITATION';
  END IF;

  RETURN 'OK';
END;
$$;


ALTER FUNCTION "public"."update_org_invite_role_rbac"("p_org_id" "uuid", "p_user_id" "uuid", "p_new_role_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_org_member_role"("p_org_id" "uuid", "p_user_id" "uuid", "p_new_role_name" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_new_role_id uuid;
  v_existing_binding_id uuid;
  v_org_created_by uuid;
  v_role_family text;
BEGIN
  -- Check if user has permission to update roles
  IF NOT public.rbac_check_permission_direct(public.rbac_perm_org_update_user_roles(), auth.uid(), p_org_id, NULL, NULL) THEN
    RAISE EXCEPTION 'NO_PERMISSION_TO_UPDATE_ROLES';
  END IF;

  -- Get org owner to prevent removing the last super admin
  SELECT created_by INTO v_org_created_by
  FROM public.orgs
  WHERE id = p_org_id;

  -- Prevent changing the org owner's role
  IF p_user_id = v_org_created_by THEN
    RAISE EXCEPTION 'CANNOT_CHANGE_OWNER_ROLE';
  END IF;

  -- Validate the new role exists and is an org-level role
  SELECT r.id, r.scope_type INTO v_new_role_id, v_role_family
  FROM public.roles r
  WHERE r.name = p_new_role_name
  LIMIT 1;

  IF v_new_role_id IS NULL THEN
    RAISE EXCEPTION 'ROLE_NOT_FOUND';
  END IF;

  IF v_role_family != public.rbac_scope_org() THEN
    RAISE EXCEPTION 'ROLE_MUST_BE_ORG_LEVEL';
  END IF;

  -- Check if changing from super_admin and if this is the last super_admin
  IF EXISTS (
    SELECT 1
    FROM public.role_bindings rb
    INNER JOIN public.roles r ON rb.role_id = r.id
    WHERE rb.principal_id = p_user_id
      AND rb.principal_type = public.rbac_principal_user()
      AND rb.scope_type = public.rbac_scope_org()
      AND rb.org_id = p_org_id
      AND r.name = public.rbac_role_org_super_admin()
  ) THEN
    -- Count super admins in this org
    IF (
      SELECT COUNT(*)
      FROM public.role_bindings rb
      INNER JOIN public.roles r ON rb.role_id = r.id
      WHERE rb.scope_type = public.rbac_scope_org()
        AND rb.org_id = p_org_id
        AND rb.principal_type = public.rbac_principal_user()
        AND r.name = public.rbac_role_org_super_admin()
    ) <= 1 AND p_new_role_name != public.rbac_role_org_super_admin() THEN
      RAISE EXCEPTION 'CANNOT_REMOVE_LAST_SUPER_ADMIN';
    END IF;
  END IF;

  -- Find existing role binding for this user at org level
  SELECT rb.id INTO v_existing_binding_id
  FROM public.role_bindings rb
  INNER JOIN public.roles r ON rb.role_id = r.id
  WHERE rb.principal_id = p_user_id
    AND rb.principal_type = public.rbac_principal_user()
    AND rb.scope_type = public.rbac_scope_org()
    AND rb.org_id = p_org_id
    AND r.scope_type = public.rbac_scope_org()
  LIMIT 1;

  -- Delete existing org-level role binding if it exists
  IF v_existing_binding_id IS NOT NULL THEN
    DELETE FROM public.role_bindings
    WHERE id = v_existing_binding_id;
  END IF;

  -- Create new role binding
  INSERT INTO public.role_bindings (
    principal_type,
    principal_id,
    role_id,
    scope_type,
    org_id,
    app_id,
    channel_id,
    granted_by,
    granted_at,
    reason,
    is_direct
  ) VALUES (
    public.rbac_principal_user(),
    p_user_id,
    v_new_role_id,
    public.rbac_scope_org(),
    p_org_id,
    NULL,
    NULL,
    auth.uid(),
    NOW(),
    'Role updated via update_org_member_role',
    true
  );

  RETURN 'OK';
END;
$$;


ALTER FUNCTION "public"."update_org_member_role"("p_org_id" "uuid", "p_user_id" "uuid", "p_new_role_name" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_org_member_role"("p_org_id" "uuid", "p_user_id" "uuid", "p_new_role_name" "text") IS 'Updates an organization member''s role. Requires org.update_user_roles permission. Returns OK on success.';



CREATE OR REPLACE FUNCTION "public"."update_sso_providers_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_sso_providers_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_tmp_invite_role_rbac"("p_org_id" "uuid", "p_email" "text", "p_new_role_name" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  role_id uuid;
BEGIN
  SELECT id INTO role_id
  FROM public.roles r
  WHERE r.name = p_new_role_name
    AND r.scope_type = public.rbac_scope_org()
    AND r.is_assignable = true
  LIMIT 1;

  IF role_id IS NULL THEN
    RAISE EXCEPTION 'ROLE_NOT_FOUND';
  END IF;

  IF p_new_role_name = public.rbac_role_org_super_admin() THEN
    IF NOT public.rbac_check_permission_request(public.rbac_perm_org_update_user_roles(), p_org_id, NULL::character varying, NULL::bigint) THEN
      RAISE EXCEPTION 'NO_PERMISSION_TO_UPDATE_ROLES';
    END IF;
  ELSE
    IF NOT public.rbac_check_permission_request(public.rbac_perm_org_invite_user(), p_org_id, NULL::character varying, NULL::bigint) THEN
      RAISE EXCEPTION 'NO_PERMISSION_TO_UPDATE_ROLES';
    END IF;
  END IF;

  UPDATE public.tmp_users
  SET rbac_role_name = p_new_role_name,
      updated_at = now()
  WHERE org_id = p_org_id
    AND email = p_email
    AND cancelled_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_INVITATION';
  END IF;

  RETURN 'OK';
END;
$$;


ALTER FUNCTION "public"."update_tmp_invite_role_rbac"("p_org_id" "uuid", "p_email" "text", "p_new_role_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_webhook_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_webhook_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_version_meta"("p_app_id" character varying, "p_version_id" bigint, "p_size" bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_owner_org uuid;
  v_existing_count integer;
  v_version_exists boolean;
BEGIN
  IF p_size = 0 THEN
    RETURN FALSE;
  END IF;

  SELECT owner_org
  INTO v_owner_org
  FROM public.apps
  WHERE app_id = p_app_id
  LIMIT 1;

  IF v_owner_org IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.app_versions av
    WHERE av.app_id = p_app_id
      AND av.id = p_version_id
  )
  INTO v_version_exists;

  IF NOT v_version_exists THEN
    RETURN FALSE;
  END IF;

  IF COALESCE(current_setting('role', true), '') NOT IN ('service_role', 'postgres')
    AND COALESCE(session_user, current_user) NOT IN ('service_role', 'postgres')
    AND NOT public.rbac_check_permission_request(
      public.rbac_perm_app_upload_bundle(),
      v_owner_org,
      p_app_id,
      NULL::bigint
    )
  THEN
    RETURN FALSE;
  END IF;

  IF p_size > 0 THEN
    SELECT COUNT(*) INTO v_existing_count
    FROM public.version_meta
    WHERE public.version_meta.app_id = p_app_id
      AND public.version_meta.version_id = p_version_id
      AND public.version_meta.size > 0;
  ELSIF p_size < 0 THEN
    SELECT COUNT(*) INTO v_existing_count
    FROM public.version_meta
    WHERE public.version_meta.app_id = p_app_id
      AND public.version_meta.version_id = p_version_id
      AND public.version_meta.size < 0;
  END IF;

  IF v_existing_count > 0 THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.version_meta (app_id, version_id, size)
  VALUES (p_app_id, p_version_id, p_size);

  RETURN TRUE;
EXCEPTION
  WHEN unique_violation THEN
    RETURN FALSE;
END;
$$;


ALTER FUNCTION "public"."upsert_version_meta"("p_app_id" character varying, "p_version_id" bigint, "p_size" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."usage_credit_readable_org_ids"() RETURNS "uuid"[]
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT COALESCE(pg_catalog.array_agg(DISTINCT orgs.id), '{}'::uuid[])
  FROM public.orgs
  WHERE public.rbac_check_permission_request(
    public.rbac_perm_org_read_billing(),
    orgs.id,
    NULL::character varying,
    NULL::bigint
  );
$$;


ALTER FUNCTION "public"."usage_credit_readable_org_ids"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."usage_credit_readable_org_ids"() IS 'Returns org IDs whose usage-credit rows are readable by the current user session or Capgo API key through RBAC billing-read permission checks.';



CREATE OR REPLACE FUNCTION "public"."user_has_app_update_user_roles"("p_user_id" "uuid", "p_app_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_app_id_varchar text;
  v_org_id uuid;
  v_caller_id uuid;
BEGIN
  SELECT auth.uid() INTO v_caller_id;

  IF v_caller_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT apps.app_id, apps.owner_org
  INTO v_app_id_varchar, v_org_id
  FROM public.apps
  WHERE apps.id = p_app_id
  LIMIT 1;

  IF v_app_id_varchar IS NULL OR v_org_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_caller_id <> p_user_id THEN
    IF NOT public.rbac_check_permission_direct(
      public.rbac_perm_app_update_user_roles(),
      v_caller_id,
      v_org_id,
      v_app_id_varchar,
      NULL::bigint,
      NULL::text
    ) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN public.rbac_check_permission_direct(
    public.rbac_perm_app_update_user_roles(),
    p_user_id,
    v_org_id,
    v_app_id_varchar,
    NULL::bigint,
    NULL::text
  );
END;
$$;


ALTER FUNCTION "public"."user_has_app_update_user_roles"("p_user_id" "uuid", "p_app_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."user_has_app_update_user_roles"("p_user_id" "uuid", "p_app_id" "uuid") IS 'Checks app.update_user_roles using RBAC only. The caller must be the checked user or already hold the same RBAC permission.';



CREATE OR REPLACE FUNCTION "public"."user_has_role_in_app"("p_user_id" "uuid", "p_app_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_caller_id uuid;
  v_org_id uuid;
BEGIN
  -- Use SELECT to evaluate auth.uid() once
  SELECT auth.uid() INTO v_caller_id;

  IF v_caller_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_caller_id <> p_user_id THEN
    SELECT owner_org INTO v_org_id
    FROM public.apps
    WHERE id = p_app_id
    LIMIT 1;

    IF v_org_id IS NULL THEN
      RETURN false;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.role_bindings rb
      WHERE rb.principal_type = public.rbac_principal_user()
        AND rb.principal_id = v_caller_id
        AND (rb.org_id = v_org_id OR rb.app_id = p_app_id)
    ) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.role_bindings rb
    WHERE rb.principal_type = public.rbac_principal_user()
      AND rb.principal_id = p_user_id
      AND rb.app_id = p_app_id
      AND rb.scope_type = public.rbac_scope_app()
  );
END;
$$;


ALTER FUNCTION "public"."user_has_role_in_app"("p_user_id" "uuid", "p_app_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."user_has_role_in_app"("p_user_id" "uuid", "p_app_id" "uuid") IS 'Checks whether a user has a role in an app (bypasses RLS to avoid recursion). Optimized with SELECT auth.uid() pattern.';



CREATE OR REPLACE FUNCTION "public"."user_meets_password_policy"("user_id" "uuid", "org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    org_policy_config jsonb;
    org_policy_hash text;
    compliance_record_hash text;
BEGIN
    -- Get org's password policy config
    SELECT password_policy_config
    INTO org_policy_config
    FROM public.orgs
    WHERE public.orgs.id = user_meets_password_policy.org_id;

    -- If no policy or policy is disabled, user passes
    IF org_policy_config IS NULL OR COALESCE((org_policy_config->>'enabled')::boolean, false) = false THEN
        RETURN true;
    END IF;

    -- Compute the hash of the current policy
    org_policy_hash := public.get_password_policy_hash(org_policy_config);

    -- Check if user has a valid compliance record with matching policy hash
    SELECT policy_hash INTO compliance_record_hash
    FROM public.user_password_compliance
    WHERE public.user_password_compliance.user_id = user_meets_password_policy.user_id
      AND public.user_password_compliance.org_id = user_meets_password_policy.org_id;

    -- User passes if they have a compliance record AND the policy hash matches
    -- (If policy changed, they need to re-validate)
    RETURN compliance_record_hash IS NOT NULL AND compliance_record_hash = org_policy_hash;
END;
$$;


ALTER FUNCTION "public"."user_meets_password_policy"("user_id" "uuid", "org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_api_key_hash"("plain_key" "text", "stored_hash" "text") RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN encode(extensions.digest(plain_key, 'sha256'), 'hex') = stored_hash;
END;
$$;


ALTER FUNCTION "public"."verify_api_key_hash"("plain_key" "text", "stored_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_mfa"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN (
    array[(SELECT coalesce(auth.jwt()->>'aal', 'aal1'))] <@ (
      SELECT
          CASE
            WHEN count(id) > 0 THEN array['aal2']
            ELSE array['aal1', 'aal2']
          END AS aal
        FROM auth.mfa_factors
        WHERE (SELECT auth.uid()) = user_id AND status = 'verified'
    )
  ) OR (
    EXISTS(
      SELECT 1 FROM jsonb_array_elements((SELECT auth.jwt())->'amr') AS amr_elem
      WHERE amr_elem->>'method' = 'otp'
    )
  );
END;
$$;


ALTER FUNCTION "public"."verify_mfa"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."apikey_global_permissions" (
    "id" bigint NOT NULL,
    "apikey_rbac_id" "uuid" NOT NULL,
    "permission_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "granted_by" "uuid",
    "reason" "text",
    CONSTRAINT "apikey_global_permissions_permission_key_not_empty" CHECK (("permission_key" <> ''::"text"))
);


ALTER TABLE "public"."apikey_global_permissions" OWNER TO "postgres";


COMMENT ON TABLE "public"."apikey_global_permissions" IS 'Global permissions for API keys where no org/app/channel target exists yet. Currently used to grandfather org creation for existing write-capable keys without granting it to future keys by default.';



ALTER TABLE "public"."apikey_global_permissions" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."apikey_global_permissions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."apikeys" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."apikeys_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."app_metrics_cache" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."app_metrics_cache_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



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



CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "table_name" "text" NOT NULL,
    "record_id" "text" NOT NULL,
    "operation" "text" NOT NULL,
    "user_id" "uuid",
    "org_id" "uuid" NOT NULL,
    "old_record" "jsonb",
    "new_record" "jsonb",
    "changed_fields" "text"[]
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."audit_logs" IS 'Audit log for tracking changes to orgs, apps, channels, app_versions, and org_users tables';



COMMENT ON COLUMN "public"."audit_logs"."table_name" IS 'Name of the table that was modified (orgs, apps, channels, app_versions, org_users)';



COMMENT ON COLUMN "public"."audit_logs"."record_id" IS 'Primary key of the affected record';



COMMENT ON COLUMN "public"."audit_logs"."operation" IS 'Type of operation: INSERT, UPDATE, or DELETE';



COMMENT ON COLUMN "public"."audit_logs"."user_id" IS 'User who made the change (from auth.uid() or API key)';



COMMENT ON COLUMN "public"."audit_logs"."org_id" IS 'Organization context for filtering';



COMMENT ON COLUMN "public"."audit_logs"."old_record" IS 'Previous state of the record (null for INSERT)';



COMMENT ON COLUMN "public"."audit_logs"."new_record" IS 'New state of the record (null for DELETE)';



COMMENT ON COLUMN "public"."audit_logs"."changed_fields" IS 'Array of field names that changed (for UPDATE operations)';



CREATE SEQUENCE IF NOT EXISTS "public"."audit_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."audit_logs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."audit_logs_id_seq" OWNED BY "public"."audit_logs"."id";



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


ALTER SEQUENCE "public"."bandwidth_usage_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."bandwidth_usage_id_seq" OWNED BY "public"."bandwidth_usage"."id";



CREATE TABLE IF NOT EXISTS "public"."build_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "build_id" character varying NOT NULL,
    "platform" character varying NOT NULL,
    "billable_seconds" bigint NOT NULL,
    "build_time_unit" bigint NOT NULL,
    "app_id" character varying,
    CONSTRAINT "build_logs_billable_seconds_check" CHECK (("billable_seconds" >= 0)),
    CONSTRAINT "build_logs_build_time_unit_check" CHECK (("build_time_unit" >= 0)),
    CONSTRAINT "build_logs_platform_check" CHECK ((("platform")::"text" = ANY (ARRAY[('ios'::character varying)::"text", ('android'::character varying)::"text"])))
);


ALTER TABLE "public"."build_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."build_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "app_id" character varying NOT NULL,
    "owner_org" "uuid" NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "platform" character varying NOT NULL,
    "build_mode" character varying DEFAULT 'release'::character varying NOT NULL,
    "build_config" "jsonb" DEFAULT '{}'::"jsonb",
    "status" character varying DEFAULT 'pending'::character varying NOT NULL,
    "builder_job_id" character varying,
    "upload_session_key" character varying NOT NULL,
    "upload_path" character varying NOT NULL,
    "upload_url" character varying NOT NULL,
    "upload_expires_at" timestamp with time zone NOT NULL,
    "last_error" "text",
    "runner_wait_seconds" bigint DEFAULT 0 NOT NULL,
    "ai_analyzed" boolean DEFAULT false NOT NULL,
    CONSTRAINT "build_requests_platform_check" CHECK ((("platform")::"text" = ANY ((ARRAY['ios'::character varying, 'android'::character varying])::"text"[])))
);


ALTER TABLE "public"."build_requests" OWNER TO "postgres";


COMMENT ON COLUMN "public"."build_requests"."runner_wait_seconds" IS 'Self-hosted runner wait time reported by builder, in seconds. Informational only; not used for billing.';



COMMENT ON COLUMN "public"."build_requests"."ai_analyzed" IS 'Set true after a successful AI analysis of this failed build. Enforces one-analysis-per-job for cost control.';



CREATE TABLE IF NOT EXISTS "public"."capgo_credits_steps" (
    "id" bigint NOT NULL,
    "step_min" bigint NOT NULL,
    "step_max" bigint NOT NULL,
    "price_per_unit" double precision NOT NULL,
    "type" "text" NOT NULL,
    "unit_factor" bigint DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "org_id" "uuid",
    CONSTRAINT "step_range_check" CHECK (("step_min" < "step_max"))
);


ALTER TABLE "public"."capgo_credits_steps" OWNER TO "postgres";


COMMENT ON TABLE "public"."capgo_credits_steps" IS 'Table to store token pricing tiers';



COMMENT ON COLUMN "public"."capgo_credits_steps"."id" IS 'The unique identifier for the pricing tier';



COMMENT ON COLUMN "public"."capgo_credits_steps"."step_min" IS 'The minimum number of credits for this tier';



COMMENT ON COLUMN "public"."capgo_credits_steps"."step_max" IS 'The maximum number of credits for this tier';



COMMENT ON COLUMN "public"."capgo_credits_steps"."price_per_unit" IS 'The price per token in this tier';



COMMENT ON COLUMN "public"."capgo_credits_steps"."unit_factor" IS 'The unit conversion factor (e.g., bytes to GB = 1073741824)';



COMMENT ON COLUMN "public"."capgo_credits_steps"."created_at" IS 'Timestamp when the tier was created';



COMMENT ON COLUMN "public"."capgo_credits_steps"."updated_at" IS 'Timestamp when the tier was last updated';



COMMENT ON COLUMN "public"."capgo_credits_steps"."org_id" IS 'Optional organization owner for this pricing tier';



CREATE SEQUENCE IF NOT EXISTS "public"."capgo_credits_steps_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."capgo_credits_steps_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."capgo_credits_steps_id_seq" OWNED BY "public"."capgo_credits_steps"."id";



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
    "version" bigint,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "public" boolean DEFAULT false NOT NULL,
    "disable_auto_update_under_native" boolean DEFAULT true NOT NULL,
    "ios" boolean DEFAULT true NOT NULL,
    "android" boolean DEFAULT true NOT NULL,
    "allow_device_self_set" boolean DEFAULT false NOT NULL,
    "allow_emulator" boolean DEFAULT true NOT NULL,
    "allow_device" boolean DEFAULT true NOT NULL,
    "allow_dev" boolean DEFAULT true NOT NULL,
    "allow_prod" boolean DEFAULT true NOT NULL,
    "disable_auto_update" "public"."disable_update" DEFAULT 'major'::"public"."disable_update" NOT NULL,
    "owner_org" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "rbac_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "electron" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."channels" OWNER TO "postgres";


COMMENT ON COLUMN "public"."channels"."rbac_id" IS 'Stable UUID to bind RBAC roles to channel scope.';



ALTER TABLE "public"."channels" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."channel_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."channel_permission_overrides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "principal_type" "text" NOT NULL,
    "principal_id" "uuid" NOT NULL,
    "channel_id" bigint NOT NULL,
    "permission_key" "text" NOT NULL,
    "is_allowed" boolean NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "channel_permission_overrides_principal_type_check" CHECK (("principal_type" = ANY (ARRAY["public"."rbac_principal_user"(), "public"."rbac_principal_group"(), "public"."rbac_principal_apikey"()])))
);


ALTER TABLE "public"."channel_permission_overrides" OWNER TO "postgres";


COMMENT ON TABLE "public"."channel_permission_overrides" IS 'Delta-only overrides for channel-scoped permissions (user > group, deny > allow).';



COMMENT ON COLUMN "public"."channel_permission_overrides"."principal_type" IS 'user | group | apikey.';



COMMENT ON COLUMN "public"."channel_permission_overrides"."principal_id" IS 'users.id, groups.id, or apikeys.rbac_id depending on principal_type.';



COMMENT ON COLUMN "public"."channel_permission_overrides"."channel_id" IS 'public.channels.id target for the override.';



COMMENT ON COLUMN "public"."channel_permission_overrides"."permission_key" IS 'RBAC permission key (channel.*).';



CREATE TABLE IF NOT EXISTS "public"."compatibility_events" (
    "id" bigint NOT NULL,
    "org_id" "uuid" NOT NULL,
    "app_id" "text" NOT NULL,
    "source" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "channel_id" bigint,
    "channel_name" "text" NOT NULL,
    "current_version_id" bigint,
    "current_version_name" "text" NOT NULL,
    "previous_version_id" bigint,
    "previous_version_name" "text" NOT NULL,
    "offenders" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    "resolution_kind" "text",
    "resolution_note" "text",
    "change_occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."compatibility_events" OWNER TO "postgres";


ALTER TABLE "public"."compatibility_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."compatibility_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."cron_tasks" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "task_type" "public"."cron_task_type" DEFAULT 'function'::"public"."cron_task_type" NOT NULL,
    "target" "text" NOT NULL,
    "batch_size" integer,
    "payload" "jsonb",
    "second_interval" integer,
    "minute_interval" integer,
    "hour_interval" integer,
    "run_at_hour" integer,
    "run_at_minute" integer,
    "run_at_second" integer DEFAULT 0,
    "run_on_dow" integer,
    "run_on_day" integer,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "healthcheck_url" "text"
);


ALTER TABLE "public"."cron_tasks" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."cron_tasks_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."cron_tasks_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."cron_tasks_id_seq" OWNED BY "public"."cron_tasks"."id";



CREATE TABLE IF NOT EXISTS "public"."daily_bandwidth" (
    "id" integer NOT NULL,
    "app_id" character varying(255) NOT NULL,
    "date" "date" NOT NULL,
    "bandwidth" bigint NOT NULL
)
WITH ("autovacuum_vacuum_scale_factor"='0.05', "autovacuum_analyze_scale_factor"='0.02');


ALTER TABLE "public"."daily_bandwidth" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."daily_bandwidth_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."daily_bandwidth_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."daily_bandwidth_id_seq" OWNED BY "public"."daily_bandwidth"."id";



CREATE TABLE IF NOT EXISTS "public"."daily_build_time" (
    "app_id" character varying NOT NULL,
    "date" "date" NOT NULL,
    "build_time_unit" bigint DEFAULT 0 NOT NULL,
    "build_count" bigint DEFAULT 0 NOT NULL,
    CONSTRAINT "daily_build_time_build_count_check" CHECK (("build_count" >= 0)),
    CONSTRAINT "daily_build_time_build_time_unit_check" CHECK (("build_time_unit" >= 0))
);


ALTER TABLE "public"."daily_build_time" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_mau" (
    "id" integer NOT NULL,
    "app_id" character varying(255) NOT NULL,
    "date" "date" NOT NULL,
    "mau" bigint NOT NULL
)
WITH ("autovacuum_vacuum_scale_factor"='0.05', "autovacuum_analyze_scale_factor"='0.02');


ALTER TABLE "public"."daily_mau" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."daily_mau_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."daily_mau_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."daily_mau_id_seq" OWNED BY "public"."daily_mau"."id";



CREATE TABLE IF NOT EXISTS "public"."daily_revenue_metrics" (
    "date_id" character varying NOT NULL,
    "customer_id" character varying NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "opening_mrr" double precision DEFAULT 0 NOT NULL,
    "new_business_mrr" double precision DEFAULT 0 NOT NULL,
    "expansion_mrr" double precision DEFAULT 0 NOT NULL,
    "contraction_mrr" double precision DEFAULT 0 NOT NULL,
    "churn_mrr" double precision DEFAULT 0 NOT NULL,
    "churn_mrr_solo" double precision DEFAULT 0 NOT NULL,
    "churn_mrr_maker" double precision DEFAULT 0 NOT NULL,
    "churn_mrr_team" double precision DEFAULT 0 NOT NULL,
    "churn_mrr_enterprise" double precision DEFAULT 0 NOT NULL,
    "contraction_mrr_solo" double precision DEFAULT 0 NOT NULL,
    "contraction_mrr_maker" double precision DEFAULT 0 NOT NULL,
    "contraction_mrr_team" double precision DEFAULT 0 NOT NULL,
    "contraction_mrr_enterprise" double precision DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."daily_revenue_metrics" OWNER TO "postgres";


COMMENT ON TABLE "public"."daily_revenue_metrics" IS 'Daily MRR movement rollup per customer, fed by Stripe webhook events for admin retention analytics.';



COMMENT ON COLUMN "public"."daily_revenue_metrics"."opening_mrr" IS 'Customer monthly recurring revenue at the start of the UTC day, before any tracked movement.';



COMMENT ON COLUMN "public"."daily_revenue_metrics"."new_business_mrr" IS 'New monthly recurring revenue created on the day.';



COMMENT ON COLUMN "public"."daily_revenue_metrics"."expansion_mrr" IS 'Expansion monthly recurring revenue added on the day.';



COMMENT ON COLUMN "public"."daily_revenue_metrics"."contraction_mrr" IS 'Monthly recurring revenue lost to downgrades on the day.';



COMMENT ON COLUMN "public"."daily_revenue_metrics"."churn_mrr" IS 'Monthly recurring revenue fully lost to churn on the day.';



COMMENT ON COLUMN "public"."daily_revenue_metrics"."churn_mrr_solo" IS 'Solo plan MRR fully lost to churn on the day.';



COMMENT ON COLUMN "public"."daily_revenue_metrics"."churn_mrr_maker" IS 'Maker plan MRR fully lost to churn on the day.';



COMMENT ON COLUMN "public"."daily_revenue_metrics"."churn_mrr_team" IS 'Team plan MRR fully lost to churn on the day.';



COMMENT ON COLUMN "public"."daily_revenue_metrics"."churn_mrr_enterprise" IS 'Enterprise plan MRR fully lost to churn on the day.';



COMMENT ON COLUMN "public"."daily_revenue_metrics"."contraction_mrr_solo" IS 'Solo plan MRR lost to downgrades on the day.';



COMMENT ON COLUMN "public"."daily_revenue_metrics"."contraction_mrr_maker" IS 'Maker plan MRR lost to downgrades on the day.';



COMMENT ON COLUMN "public"."daily_revenue_metrics"."contraction_mrr_team" IS 'Team plan MRR lost to downgrades on the day.';



COMMENT ON COLUMN "public"."daily_revenue_metrics"."contraction_mrr_enterprise" IS 'Enterprise plan MRR lost to downgrades on the day.';



CREATE TABLE IF NOT EXISTS "public"."daily_storage" (
    "id" integer NOT NULL,
    "app_id" character varying(255) NOT NULL,
    "date" "date" NOT NULL,
    "storage" bigint NOT NULL
)
WITH ("autovacuum_vacuum_scale_factor"='0.05', "autovacuum_analyze_scale_factor"='0.02');


ALTER TABLE "public"."daily_storage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_storage_hourly" (
    "app_id" character varying(255) NOT NULL,
    "owner_org" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "storage_byte_hours" double precision DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."daily_storage_hourly" OWNER TO "postgres";


COMMENT ON TABLE "public"."daily_storage_hourly" IS 'Shadow daily storage-hour usage, recorded as byte-hours. This is intentionally not used for billing until storage-hour billing is explicitly enabled.';



COMMENT ON COLUMN "public"."daily_storage_hourly"."storage_byte_hours" IS 'Byte-hour contribution for this UTC day.';



CREATE SEQUENCE IF NOT EXISTS "public"."daily_storage_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."daily_storage_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."daily_storage_id_seq" OWNED BY "public"."daily_storage"."id";



CREATE TABLE IF NOT EXISTS "public"."daily_version" (
    "date" "date" NOT NULL,
    "app_id" character varying(255) NOT NULL,
    "version_id" bigint,
    "get" bigint,
    "fail" bigint,
    "install" bigint,
    "uninstall" bigint,
    "version_name" character varying(255) NOT NULL
)
WITH ("autovacuum_vacuum_scale_factor"='0.05', "autovacuum_analyze_scale_factor"='0.02');


ALTER TABLE "public"."daily_version" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deleted_account" (
    "created_at" timestamp with time zone DEFAULT "now"(),
    "email" character varying DEFAULT ''::character varying NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL
);


ALTER TABLE "public"."deleted_account" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deleted_apps" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "app_id" character varying NOT NULL,
    "owner_org" "uuid" NOT NULL,
    "deleted_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."deleted_apps" OWNER TO "postgres";


ALTER TABLE "public"."deleted_apps" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."deleted_apps_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."deploy_history" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "channel_id" bigint NOT NULL,
    "app_id" character varying NOT NULL,
    "version_id" bigint NOT NULL,
    "deployed_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid" NOT NULL,
    "owner_org" "uuid" NOT NULL,
    "install_stats_email_sent_at" timestamp with time zone
);


ALTER TABLE "public"."deploy_history" OWNER TO "postgres";


ALTER TABLE "public"."deploy_history" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."deploy_history_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."device_usage" (
    "id" integer NOT NULL,
    "device_id" character varying(255) NOT NULL,
    "app_id" character varying(255) NOT NULL,
    "timestamp" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "org_id" character varying(255) NOT NULL,
    "version_build" character varying(70),
    "platform" character varying(32)
);


ALTER TABLE "public"."device_usage" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."device_usage_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."device_usage_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."device_usage_id_seq" OWNED BY "public"."device_usage"."id";



CREATE TABLE IF NOT EXISTS "public"."devices" (
    "updated_at" timestamp with time zone NOT NULL,
    "device_id" "text" NOT NULL,
    "version" bigint,
    "app_id" character varying(50) NOT NULL,
    "platform" "public"."platform_os" NOT NULL,
    "plugin_version" character varying(20) DEFAULT '2.3.3'::"text" NOT NULL,
    "os_version" character varying(20),
    "version_build" character varying(70) DEFAULT 'builtin'::"text",
    "custom_id" character varying(36) DEFAULT ''::"text" NOT NULL,
    "is_prod" boolean DEFAULT true,
    "is_emulator" boolean DEFAULT false,
    "id" bigint NOT NULL,
    "version_name" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "default_channel" character varying(255),
    "key_id" character varying(20)
);


ALTER TABLE "public"."devices" OWNER TO "postgres";


COMMENT ON COLUMN "public"."devices"."default_channel" IS 'The default channel name that the device is configured to request updates from';



COMMENT ON COLUMN "public"."devices"."key_id" IS 'First 20 characters of the base64-encoded public key (identifies which key is in use)';



ALTER TABLE "public"."devices" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."devices_id_seq"
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
    "paying_monthly" integer DEFAULT 0,
    "paying_yearly" integer DEFAULT 0,
    "updates_last_month" bigint DEFAULT '0'::bigint,
    "updates_external" bigint DEFAULT '0'::bigint,
    "success_rate" double precision,
    "plan_solo" bigint DEFAULT 0,
    "plan_maker" bigint DEFAULT 0,
    "plan_team" bigint DEFAULT 0,
    "devices_last_month" bigint DEFAULT 0,
    "registers_today" bigint DEFAULT 0 NOT NULL,
    "bundle_storage_gb" double precision DEFAULT 0 NOT NULL,
    "mrr" double precision DEFAULT 0 NOT NULL,
    "total_revenue" double precision DEFAULT 0 NOT NULL,
    "revenue_solo" double precision DEFAULT 0 NOT NULL,
    "revenue_maker" double precision DEFAULT 0 NOT NULL,
    "revenue_team" double precision DEFAULT 0 NOT NULL,
    "revenue_enterprise" double precision DEFAULT 0 NOT NULL,
    "plan_solo_monthly" integer DEFAULT 0 NOT NULL,
    "plan_solo_yearly" integer DEFAULT 0 NOT NULL,
    "plan_maker_monthly" integer DEFAULT 0 NOT NULL,
    "plan_maker_yearly" integer DEFAULT 0 NOT NULL,
    "plan_team_monthly" integer DEFAULT 0 NOT NULL,
    "plan_team_yearly" integer DEFAULT 0 NOT NULL,
    "plan_enterprise" integer DEFAULT 0 NOT NULL,
    "plan_enterprise_monthly" integer DEFAULT 0 NOT NULL,
    "plan_enterprise_yearly" integer DEFAULT 0 NOT NULL,
    "new_paying_orgs" integer DEFAULT 0 NOT NULL,
    "canceled_orgs" integer DEFAULT 0 NOT NULL,
    "credits_bought" bigint DEFAULT 0 NOT NULL,
    "credits_consumed" bigint DEFAULT 0 NOT NULL,
    "devices_last_month_ios" bigint DEFAULT 0,
    "devices_last_month_android" bigint DEFAULT 0,
    "plugin_version_breakdown" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "plugin_major_breakdown" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "builds_total" bigint DEFAULT 0,
    "builds_ios" bigint DEFAULT 0,
    "builds_android" bigint DEFAULT 0,
    "builds_last_month" bigint DEFAULT 0,
    "builds_last_month_ios" bigint DEFAULT 0,
    "builds_last_month_android" bigint DEFAULT 0,
    "upgraded_orgs" integer DEFAULT 0 NOT NULL,
    "builds_success_total" bigint DEFAULT 0,
    "builds_success_ios" bigint DEFAULT 0,
    "builds_success_android" bigint DEFAULT 0,
    "demo_apps_created" integer DEFAULT 0 NOT NULL,
    "org_conversion_rate" double precision DEFAULT 0 NOT NULL,
    "build_total_seconds_day_ios" bigint DEFAULT 0 NOT NULL,
    "build_total_seconds_day_android" bigint DEFAULT 0 NOT NULL,
    "build_count_day_ios" integer DEFAULT 0 NOT NULL,
    "build_count_day_android" integer DEFAULT 0 NOT NULL,
    "build_avg_seconds_day_ios" double precision DEFAULT 0 NOT NULL,
    "build_avg_seconds_day_android" double precision DEFAULT 0 NOT NULL,
    "nrr" double precision DEFAULT 100 NOT NULL,
    "churn_revenue" double precision DEFAULT 0 NOT NULL,
    "churn_revenue_solo" double precision DEFAULT 0 NOT NULL,
    "churn_revenue_maker" double precision DEFAULT 0 NOT NULL,
    "churn_revenue_team" double precision DEFAULT 0 NOT NULL,
    "churn_revenue_enterprise" double precision DEFAULT 0 NOT NULL,
    "plugin_version_ladder" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "builder_active_paying_clients_60d" integer DEFAULT 0 NOT NULL,
    "live_updates_active_paying_clients_60d" integer DEFAULT 0 NOT NULL,
    "plan_solo_conversion_rate" double precision DEFAULT 0 NOT NULL,
    "plan_maker_conversion_rate" double precision DEFAULT 0 NOT NULL,
    "plan_team_conversion_rate" double precision DEFAULT 0 NOT NULL,
    "plan_enterprise_conversion_rate" double precision DEFAULT 0 NOT NULL,
    "plan_total_conversion_rate" double precision DEFAULT 0 NOT NULL,
    "average_ltv" double precision DEFAULT 0 NOT NULL,
    "shortest_ltv" double precision DEFAULT 0 NOT NULL,
    "longest_ltv" double precision DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."global_stats" OWNER TO "postgres";


COMMENT ON COLUMN "public"."global_stats"."mrr" IS 'Total Monthly Recurring Revenue in dollars';



COMMENT ON COLUMN "public"."global_stats"."total_revenue" IS 'Total Annual Recurring Revenue (ARR) in dollars';



COMMENT ON COLUMN "public"."global_stats"."revenue_solo" IS 'Solo plan ARR in dollars';



COMMENT ON COLUMN "public"."global_stats"."revenue_maker" IS 'Maker plan ARR in dollars';



COMMENT ON COLUMN "public"."global_stats"."revenue_team" IS 'Team plan ARR in dollars';



COMMENT ON COLUMN "public"."global_stats"."revenue_enterprise" IS 'Enterprise plan ARR in dollars';



COMMENT ON COLUMN "public"."global_stats"."plan_solo_monthly" IS 'Number of Solo plan monthly subscriptions';



COMMENT ON COLUMN "public"."global_stats"."plan_solo_yearly" IS 'Number of Solo plan yearly subscriptions';



COMMENT ON COLUMN "public"."global_stats"."plan_maker_monthly" IS 'Number of Maker plan monthly subscriptions';



COMMENT ON COLUMN "public"."global_stats"."plan_maker_yearly" IS 'Number of Maker plan yearly subscriptions';



COMMENT ON COLUMN "public"."global_stats"."plan_team_monthly" IS 'Number of Team plan monthly subscriptions';



COMMENT ON COLUMN "public"."global_stats"."plan_team_yearly" IS 'Number of Team plan yearly subscriptions';



COMMENT ON COLUMN "public"."global_stats"."plan_enterprise_monthly" IS 'Number of Enterprise plan monthly subscriptions';



COMMENT ON COLUMN "public"."global_stats"."plan_enterprise_yearly" IS 'Number of Enterprise plan yearly subscriptions';



COMMENT ON COLUMN "public"."global_stats"."new_paying_orgs" IS 'Number of new paying organizations today';



COMMENT ON COLUMN "public"."global_stats"."canceled_orgs" IS 'Number of canceled subscriptions today';



COMMENT ON COLUMN "public"."global_stats"."credits_bought" IS 'Total credits purchased today';



COMMENT ON COLUMN "public"."global_stats"."credits_consumed" IS 'Total credits consumed today';



COMMENT ON COLUMN "public"."global_stats"."plugin_version_breakdown" IS 'JSON breakdown of plugin version percentages. Format: {"version": percentage, ...}';



COMMENT ON COLUMN "public"."global_stats"."plugin_major_breakdown" IS 'JSON breakdown of plugin major version percentages. Format: {"major_version": percentage, ...}';



COMMENT ON COLUMN "public"."global_stats"."builds_total" IS 'Total number of native builds recorded (all time)';



COMMENT ON COLUMN "public"."global_stats"."builds_ios" IS 'Total number of iOS native builds recorded (all time)';



COMMENT ON COLUMN "public"."global_stats"."builds_android" IS 'Total number of Android native builds recorded (all time)';



COMMENT ON COLUMN "public"."global_stats"."builds_last_month" IS 'Number of native builds in the last 30 days';



COMMENT ON COLUMN "public"."global_stats"."builds_last_month_ios" IS 'Number of iOS native builds in the last 30 days';



COMMENT ON COLUMN "public"."global_stats"."builds_last_month_android" IS 'Number of Android native builds in the last 30 days';



COMMENT ON COLUMN "public"."global_stats"."upgraded_orgs" IS 'Number of organizations that upgraded plans in the last 24 hours';



COMMENT ON COLUMN "public"."global_stats"."builds_success_total" IS 'Total number of successful native builds recorded (all time)';



COMMENT ON COLUMN "public"."global_stats"."builds_success_ios" IS 'Total number of successful iOS native builds recorded (all time)';



COMMENT ON COLUMN "public"."global_stats"."builds_success_android" IS 'Total number of successful Android native builds recorded (all time)';



COMMENT ON COLUMN "public"."global_stats"."demo_apps_created" IS 'Number of demo apps created in the last 24 hours';



COMMENT ON COLUMN "public"."global_stats"."org_conversion_rate" IS 'Percentage of organizations that are paying (paying / orgs * 100)';



COMMENT ON COLUMN "public"."global_stats"."build_total_seconds_day_ios" IS 'Total iOS build seconds recorded for the UTC day';



COMMENT ON COLUMN "public"."global_stats"."build_total_seconds_day_android" IS 'Total Android build seconds recorded for the UTC day';



COMMENT ON COLUMN "public"."global_stats"."build_count_day_ios" IS 'Total iOS builds recorded for the UTC day';



COMMENT ON COLUMN "public"."global_stats"."build_count_day_android" IS 'Total Android builds recorded for the UTC day';



COMMENT ON COLUMN "public"."global_stats"."build_avg_seconds_day_ios" IS 'Average iOS build duration in seconds for the UTC day';



COMMENT ON COLUMN "public"."global_stats"."build_avg_seconds_day_android" IS 'Average Android build duration in seconds for the UTC day';



COMMENT ON COLUMN "public"."global_stats"."nrr" IS 'Net Revenue Retention percentage for the day based on prior-day MRR, excluding new business.';



COMMENT ON COLUMN "public"."global_stats"."churn_revenue" IS 'Total monthly recurring revenue lost to churn and downgrades on the day in dollars.';



COMMENT ON COLUMN "public"."global_stats"."churn_revenue_solo" IS 'Solo plan MRR lost to churn and downgrades on the day.';



COMMENT ON COLUMN "public"."global_stats"."churn_revenue_maker" IS 'Maker plan MRR lost to churn and downgrades on the day.';



COMMENT ON COLUMN "public"."global_stats"."churn_revenue_team" IS 'Team plan MRR lost to churn and downgrades on the day.';



COMMENT ON COLUMN "public"."global_stats"."churn_revenue_enterprise" IS 'Enterprise plan MRR lost to churn and downgrades on the day.';



COMMENT ON COLUMN "public"."global_stats"."builder_active_paying_clients_60d" IS 'Number of paying clients with Capgo Builder activity in the trailing 60 days for the UTC day.';



COMMENT ON COLUMN "public"."global_stats"."live_updates_active_paying_clients_60d" IS 'Number of paying clients with Live Updates activity in the trailing 60 days for the UTC day.';



COMMENT ON COLUMN "public"."global_stats"."plan_solo_conversion_rate" IS 'Percentage of organizations converted to the Solo plan (plan_solo / orgs * 100)';



COMMENT ON COLUMN "public"."global_stats"."plan_maker_conversion_rate" IS 'Percentage of organizations converted to the Maker plan (plan_maker / orgs * 100)';



COMMENT ON COLUMN "public"."global_stats"."plan_team_conversion_rate" IS 'Percentage of organizations converted to the Team plan (plan_team / orgs * 100)';



COMMENT ON COLUMN "public"."global_stats"."plan_enterprise_conversion_rate" IS 'Percentage of organizations converted to the Enterprise plan (plan_enterprise / orgs * 100)';



COMMENT ON COLUMN "public"."global_stats"."plan_total_conversion_rate" IS 'Percentage of organizations converted to any paid plan ((plan_solo + plan_maker + plan_team + plan_enterprise) / orgs * 100)';



COMMENT ON COLUMN "public"."global_stats"."average_ltv" IS 'Average estimated customer LTV in dollars for the daily snapshot.';



COMMENT ON COLUMN "public"."global_stats"."shortest_ltv" IS 'Lowest estimated customer LTV in dollars for the daily snapshot.';



COMMENT ON COLUMN "public"."global_stats"."longest_ltv" IS 'Highest estimated customer LTV in dollars for the daily snapshot.';



CREATE TABLE IF NOT EXISTS "public"."group_members" (
    "group_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "added_by" "uuid",
    "added_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."group_members" OWNER TO "postgres";


COMMENT ON TABLE "public"."group_members" IS 'Membership join table linking users to groups.';



CREATE TABLE IF NOT EXISTS "public"."groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_system" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."groups" OWNER TO "postgres";


COMMENT ON TABLE "public"."groups" IS 'Org-scoped groups/teams. Groups are a principal for role bindings.';



CREATE TABLE IF NOT EXISTS "public"."manifest" (
    "id" integer NOT NULL,
    "app_version_id" bigint NOT NULL,
    "file_name" character varying NOT NULL,
    "s3_path" character varying NOT NULL,
    "file_hash" character varying NOT NULL,
    "file_size" bigint DEFAULT 0
)
WITH ("autovacuum_vacuum_scale_factor"='0.05', "autovacuum_analyze_scale_factor"='0.02');


ALTER TABLE "public"."manifest" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."manifest_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."manifest_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."manifest_id_seq" OWNED BY "public"."manifest"."id";



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


CREATE TABLE IF NOT EXISTS "public"."onboarding_demo_data" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "app_id" character varying NOT NULL,
    "owner_org" "uuid" NOT NULL,
    "relation_name" "text" NOT NULL,
    "row_key" "text" NOT NULL,
    "seed_id" "uuid" NOT NULL,
    CONSTRAINT "onboarding_demo_data_relation_name_check" CHECK (("relation_name" = ANY (ARRAY['app_versions'::"text", 'app_versions_meta'::"text", 'manifest'::"text", 'channels'::"text", 'channel_devices'::"text", 'deploy_history'::"text", 'devices'::"text", 'build_requests'::"text"])))
);


ALTER TABLE "public"."onboarding_demo_data" OWNER TO "postgres";


COMMENT ON TABLE "public"."onboarding_demo_data" IS 'Tracks rows created by onboarding demo seeding so demo resets can delete only demo-owned data.';



COMMENT ON COLUMN "public"."onboarding_demo_data"."row_key" IS 'Primary-row identifier as text. Only exact rows created or confidently fingerprinted by onboarding demo seeding are tracked.';



CREATE TABLE IF NOT EXISTS "public"."org_users" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "app_id" character varying,
    "channel_id" bigint,
    "rbac_role_name" "text" DEFAULT 'org_member'::"text",
    "is_invite" boolean DEFAULT false NOT NULL
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
    "customer_id" character varying,
    "stats_updated_at" timestamp without time zone,
    "last_stats_updated_at" timestamp without time zone,
    "enforcing_2fa" boolean DEFAULT false NOT NULL,
    "email_preferences" "jsonb" DEFAULT '{"onboarding": true, "usage_limit": true, "credit_usage": true, "device_error": true, "weekly_stats": true, "monthly_stats": true, "bundle_created": true, "bundle_deployed": true, "deploy_stats_24h": true, "billing_period_stats": true, "channel_self_rejected": true}'::"jsonb" NOT NULL,
    "enforce_hashed_api_keys" boolean DEFAULT false NOT NULL,
    "require_apikey_expiration" boolean DEFAULT false NOT NULL,
    "max_apikey_expiration_days" integer,
    "password_policy_config" "jsonb",
    "enforce_encrypted_bundles" boolean DEFAULT false NOT NULL,
    "required_encryption_key" character varying(21) DEFAULT NULL::character varying,
    "has_usage_credits" boolean DEFAULT false NOT NULL,
    "website" "text",
    "stats_refresh_requested_at" timestamp without time zone,
    "onboarding" "jsonb" DEFAULT '{"intent": "unknown"}'::"jsonb" NOT NULL,
    CONSTRAINT "orgs_max_apikey_expiration_days_valid" CHECK ((("max_apikey_expiration_days" IS NULL) OR (("max_apikey_expiration_days" >= 1) AND ("max_apikey_expiration_days" <= 365)))),
    CONSTRAINT "orgs_onboarding_valid" CHECK ((("jsonb_typeof"("onboarding") = 'object'::"text") AND ((NOT ("onboarding" ? 'intent'::"text")) OR (("onboarding" ->> 'intent'::"text") = ANY (ARRAY['unknown'::"text", 'ota'::"text", 'builder'::"text", 'both'::"text", 'exploring'::"text"]))))),
    CONSTRAINT "orgs_password_policy_config_min_length_check" CHECK ((("password_policy_config" IS NULL) OR (("jsonb_typeof"("password_policy_config") = 'object'::"text") AND ((NOT ("password_policy_config" ? 'min_length'::"text")) OR (("jsonb_typeof"(("password_policy_config" -> 'min_length'::"text")) = 'number'::"text") AND ((("password_policy_config" ->> 'min_length'::"text"))::numeric = "trunc"((("password_policy_config" ->> 'min_length'::"text"))::numeric)) AND (((("password_policy_config" ->> 'min_length'::"text"))::numeric >= (6)::numeric) AND ((("password_policy_config" ->> 'min_length'::"text"))::numeric <= (72)::numeric))))))),
    CONSTRAINT "orgs_required_encryption_key_valid" CHECK ((("required_encryption_key" IS NULL) OR ("length"(("required_encryption_key")::"text") = ANY (ARRAY[20, 21]))))
);


ALTER TABLE "public"."orgs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."orgs"."enforcing_2fa" IS 'When true, all members of this organization must have 2FA enabled to access the organization';



COMMENT ON COLUMN "public"."orgs"."email_preferences" IS 'JSONB object containing email notification preferences for the organization. When enabled, emails are also sent to the management_email if it differs from admin user emails. Keys: usage_limit, credit_usage, onboarding, weekly_stats, monthly_stats, billing_period_stats, deploy_stats_24h, bundle_created, bundle_deployed, device_error, channel_self_rejected. All default to true.';



COMMENT ON COLUMN "public"."orgs"."enforce_hashed_api_keys" IS 'When true, only hashed API keys can access this organization. Plain-text keys will be rejected.';



COMMENT ON COLUMN "public"."orgs"."require_apikey_expiration" IS 'When true, API keys used with this organization must have an expiration date set.';



COMMENT ON COLUMN "public"."orgs"."max_apikey_expiration_days" IS 'Maximum number of days an API key can be valid when creating/updating keys limited to this org. NULL means no maximum.';



COMMENT ON COLUMN "public"."orgs"."password_policy_config" IS 'JSON configuration for password policy: {enabled: boolean, min_length: number, require_uppercase: boolean, require_number: boolean, require_special: boolean}';



COMMENT ON COLUMN "public"."orgs"."enforce_encrypted_bundles" IS 'When true, all bundles uploaded to this organization must be encrypted (have session_key set). Unencrypted bundles will be rejected.';



COMMENT ON COLUMN "public"."orgs"."required_encryption_key" IS 'Optional: First 21 characters of the base64-encoded public key. When set, only bundles encrypted with this specific key (matching key_id) will be accepted.';



COMMENT ON COLUMN "public"."orgs"."has_usage_credits" IS 'True only with positive, unexpired usage credits.';



COMMENT ON COLUMN "public"."orgs"."onboarding" IS 'Onboarding answers (extensible JSONB). Currently: {"intent": unknown|ota|builder|both|exploring}. Used for segmentation and to tailor the org experience.';



CREATE TABLE IF NOT EXISTS "public"."permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "scope_type" "text" NOT NULL,
    "bundle_id" bigint,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "permissions_scope_type_check" CHECK (("scope_type" = ANY (ARRAY["public"."rbac_scope_platform"(), "public"."rbac_scope_org"(), "public"."rbac_scope_app"(), "public"."rbac_scope_bundle"(), "public"."rbac_scope_channel"()]))),
    CONSTRAINT "permissions_scope_type_no_platform" CHECK (("scope_type" <> "public"."rbac_scope_platform"()))
);


ALTER TABLE "public"."permissions" OWNER TO "postgres";


COMMENT ON TABLE "public"."permissions" IS 'Atomic permission keys; used by role_permissions. Only priority permissions are seeded in Phase 1.';



CREATE TABLE IF NOT EXISTS "public"."plans" (
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" character varying DEFAULT ''::character varying NOT NULL,
    "description" character varying DEFAULT ''::character varying NOT NULL,
    "price_m" bigint DEFAULT '0'::bigint NOT NULL,
    "price_y" bigint DEFAULT '0'::bigint NOT NULL,
    "stripe_id" character varying DEFAULT ''::character varying NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "price_m_id" character varying NOT NULL,
    "price_y_id" character varying NOT NULL,
    "storage" bigint NOT NULL,
    "bandwidth" bigint NOT NULL,
    "mau" bigint DEFAULT '0'::bigint NOT NULL,
    "market_desc" character varying DEFAULT ''::character varying,
    "build_time_unit" bigint DEFAULT 0 NOT NULL,
    "credit_id" "text" NOT NULL,
    "native_build_concurrency" integer DEFAULT 2 NOT NULL,
    CONSTRAINT "plans_native_build_concurrency_positive" CHECK (("native_build_concurrency" > 0))
);


ALTER TABLE "public"."plans" OWNER TO "postgres";


COMMENT ON COLUMN "public"."plans"."build_time_unit" IS 'Maximum build time in seconds per billing cycle';



COMMENT ON COLUMN "public"."plans"."credit_id" IS 'Stripe product identifier used for purchasing additional credits.';



COMMENT ON COLUMN "public"."plans"."native_build_concurrency" IS 'Maximum number of active native builds allowed concurrently for this plan.';



CREATE TABLE IF NOT EXISTS "public"."processed_stripe_events" (
    "event_id" "text" NOT NULL,
    "customer_id" character varying NOT NULL,
    "date_id" character varying NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."processed_stripe_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."processed_stripe_events" IS 'Idempotency ledger for Stripe webhook events that have already updated retention revenue metrics.';



CREATE TABLE IF NOT EXISTS "public"."role_bindings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "principal_type" "text" NOT NULL,
    "principal_id" "uuid" NOT NULL,
    "role_id" "uuid" NOT NULL,
    "scope_type" "text" NOT NULL,
    "org_id" "uuid",
    "app_id" "uuid",
    "bundle_id" bigint,
    "channel_id" "uuid",
    "granted_by" "uuid" NOT NULL,
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "reason" "text",
    "is_direct" boolean DEFAULT true NOT NULL,
    CONSTRAINT "role_bindings_check" CHECK (((("scope_type" = "public"."rbac_scope_platform"()) AND ("org_id" IS NULL) AND ("app_id" IS NULL) AND ("bundle_id" IS NULL) AND ("channel_id" IS NULL)) OR (("scope_type" = "public"."rbac_scope_org"()) AND ("org_id" IS NOT NULL) AND ("app_id" IS NULL) AND ("bundle_id" IS NULL) AND ("channel_id" IS NULL)) OR (("scope_type" = "public"."rbac_scope_app"()) AND ("org_id" IS NOT NULL) AND ("app_id" IS NOT NULL) AND ("bundle_id" IS NULL) AND ("channel_id" IS NULL)) OR (("scope_type" = "public"."rbac_scope_bundle"()) AND ("org_id" IS NOT NULL) AND ("app_id" IS NOT NULL) AND ("bundle_id" IS NOT NULL) AND ("channel_id" IS NULL)) OR (("scope_type" = "public"."rbac_scope_channel"()) AND ("org_id" IS NOT NULL) AND ("app_id" IS NOT NULL) AND ("bundle_id" IS NULL) AND ("channel_id" IS NOT NULL)))),
    CONSTRAINT "role_bindings_principal_type_check" CHECK (("principal_type" = ANY (ARRAY["public"."rbac_principal_user"(), "public"."rbac_principal_group"(), "public"."rbac_principal_apikey"()]))),
    CONSTRAINT "role_bindings_scope_type_check" CHECK (("scope_type" = ANY (ARRAY["public"."rbac_scope_platform"(), "public"."rbac_scope_org"(), "public"."rbac_scope_app"(), "public"."rbac_scope_bundle"(), "public"."rbac_scope_channel"()]))),
    CONSTRAINT "role_bindings_scope_type_no_platform" CHECK (("scope_type" <> "public"."rbac_scope_platform"()))
);


ALTER TABLE "public"."role_bindings" OWNER TO "postgres";


COMMENT ON TABLE "public"."role_bindings" IS 'Assign roles to principals at a scope. SSD: only one role per scope_type per scope/principal.';



CREATE TABLE IF NOT EXISTS "public"."role_hierarchy" (
    "parent_role_id" "uuid" NOT NULL,
    "child_role_id" "uuid" NOT NULL,
    CONSTRAINT "role_hierarchy_check" CHECK (("parent_role_id" IS DISTINCT FROM "child_role_id"))
);


ALTER TABLE "public"."role_hierarchy" OWNER TO "postgres";


COMMENT ON TABLE "public"."role_hierarchy" IS 'Explicit role inheritance. Parent inherits all permissions of its children (acyclic by convention).';



CREATE TABLE IF NOT EXISTS "public"."role_permissions" (
    "role_id" "uuid" NOT NULL,
    "permission_id" "uuid" NOT NULL
);


ALTER TABLE "public"."role_permissions" OWNER TO "postgres";


COMMENT ON TABLE "public"."role_permissions" IS 'Join table assigning permission keys to roles.';



CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "scope_type" "text" NOT NULL,
    "description" "text",
    "priority_rank" integer DEFAULT 0 NOT NULL,
    "is_assignable" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "roles_scope_type_check" CHECK (("scope_type" = ANY (ARRAY["public"."rbac_scope_platform"(), "public"."rbac_scope_org"(), "public"."rbac_scope_app"(), "public"."rbac_scope_bundle"(), "public"."rbac_scope_channel"()]))),
    CONSTRAINT "roles_scope_type_no_platform" CHECK (("scope_type" <> "public"."rbac_scope_platform"()))
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


COMMENT ON TABLE "public"."roles" IS 'Canonical RBAC roles. Scope_type indicates the native scope the role is defined for.';



CREATE TABLE IF NOT EXISTS "public"."sso_providers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "domain" "text" NOT NULL,
    "provider_id" "text",
    "status" "text" DEFAULT 'pending_verification'::"text" NOT NULL,
    "enforce_sso" boolean DEFAULT false NOT NULL,
    "dns_verification_token" "text" NOT NULL,
    "dns_verified_at" timestamp with time zone,
    "metadata_url" "text",
    "attribute_mapping" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "sso_providers_domain_lowercase_check" CHECK (("domain" = "lower"("btrim"("domain")))),
    CONSTRAINT "sso_providers_status_check" CHECK (("status" = ANY (ARRAY['pending_verification'::"text", 'verified'::"text", 'active'::"text", 'disabled'::"text"])))
);


ALTER TABLE "public"."sso_providers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stats" (
    "created_at" timestamp with time zone NOT NULL,
    "action" "public"."stats_action" NOT NULL,
    "device_id" character varying(36) NOT NULL,
    "app_id" character varying(50) NOT NULL,
    "id" bigint NOT NULL,
    "version_name" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "metadata" "jsonb"
);


ALTER TABLE "public"."stats" OWNER TO "postgres";


ALTER TABLE "public"."stats" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."stats_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



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


ALTER SEQUENCE "public"."storage_usage_id_seq" OWNER TO "postgres";


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
    "subscription_anchor_start" timestamp with time zone DEFAULT "now"() NOT NULL,
    "subscription_anchor_end" timestamp with time zone DEFAULT "public"."one_month_ahead"() NOT NULL,
    "canceled_at" timestamp with time zone,
    "mau_exceeded" boolean DEFAULT false,
    "storage_exceeded" boolean DEFAULT false,
    "bandwidth_exceeded" boolean DEFAULT false,
    "id" integer NOT NULL,
    "plan_calculated_at" timestamp with time zone,
    "build_time_exceeded" boolean DEFAULT false,
    "upgraded_at" timestamp with time zone,
    "paid_at" timestamp with time zone,
    "customer_country" character varying(2),
    "last_stripe_event_at" timestamp with time zone
);


ALTER TABLE "public"."stripe_info" OWNER TO "postgres";


COMMENT ON COLUMN "public"."stripe_info"."build_time_exceeded" IS 'Organization exceeded build time limit';



COMMENT ON COLUMN "public"."stripe_info"."upgraded_at" IS 'Timestamp of last paid plan upgrade for the org';



COMMENT ON COLUMN "public"."stripe_info"."paid_at" IS 'Timestamp when the org first became a paying customer';



COMMENT ON COLUMN "public"."stripe_info"."customer_country" IS 'Latest ISO 3166-1 alpha-2 billing country code synced from the Stripe customer profile.';



COMMENT ON COLUMN "public"."stripe_info"."last_stripe_event_at" IS 'Timestamp of the most recent Stripe event applied to this row, used for webhook ordering checks.';



CREATE SEQUENCE IF NOT EXISTS "public"."stripe_info_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."stripe_info_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."stripe_info_id_seq" OWNED BY "public"."stripe_info"."id";



CREATE TABLE IF NOT EXISTS "public"."tmp_users" (
    "id" integer NOT NULL,
    "email" "text" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "invite_magic_string" "text" DEFAULT "encode"("extensions"."gen_random_bytes"(128), 'hex'::"text") NOT NULL,
    "future_uuid" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "cancelled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "rbac_role_name" "text" DEFAULT 'org_member'::"text" NOT NULL
);


ALTER TABLE "public"."tmp_users" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."tmp_users_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."tmp_users_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."tmp_users_id_seq" OWNED BY "public"."tmp_users"."id";



CREATE TABLE IF NOT EXISTS "public"."to_delete_accounts" (
    "id" integer NOT NULL,
    "account_id" "uuid" NOT NULL,
    "removed_data" "jsonb",
    "removal_date" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."to_delete_accounts" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."to_delete_accounts_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."to_delete_accounts_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."to_delete_accounts_id_seq" OWNED BY "public"."to_delete_accounts"."id";



CREATE TABLE IF NOT EXISTS "public"."usage_credit_grants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "credits_total" numeric(18,6) NOT NULL,
    "credits_consumed" numeric(18,6) DEFAULT 0 NOT NULL,
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '1 year'::interval) NOT NULL,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "source_ref" "jsonb",
    "notes" "text",
    CONSTRAINT "usage_credit_grants_check" CHECK (("credits_consumed" <= "credits_total")),
    CONSTRAINT "usage_credit_grants_credits_consumed_check" CHECK (("credits_consumed" >= (0)::numeric)),
    CONSTRAINT "usage_credit_grants_credits_total_check" CHECK (("credits_total" >= (0)::numeric)),
    CONSTRAINT "usage_credit_grants_source_check" CHECK (("source" = ANY ('{manual,stripe_top_up}'::"text"[])))
);


ALTER TABLE "public"."usage_credit_grants" OWNER TO "postgres";


COMMENT ON TABLE "public"."usage_credit_grants" IS 'Records every block of credits granted to an org, tracking totals, consumption and expiry.';



CREATE OR REPLACE VIEW "public"."usage_credit_balances" WITH ("security_invoker"='true') AS
 SELECT "org_id",
    "sum"(GREATEST("credits_total", (0)::numeric)) AS "total_credits",
    "sum"(GREATEST(
        CASE
            WHEN ("expires_at" >= "now"()) THEN ("credits_total" - "credits_consumed")
            ELSE (0)::numeric
        END, (0)::numeric)) AS "available_credits",
    "min"(
        CASE
            WHEN (("credits_total" - "credits_consumed") > (0)::numeric) THEN "expires_at"
            ELSE NULL::timestamp with time zone
        END) AS "next_expiration"
   FROM "public"."usage_credit_grants"
  GROUP BY "org_id";


ALTER VIEW "public"."usage_credit_balances" OWNER TO "postgres";


COMMENT ON VIEW "public"."usage_credit_balances" IS 'Aggregated balance view per org: total credits granted, remaining unexpired credits, and the closest upcoming expiry. Respects RLS policies.';



CREATE TABLE IF NOT EXISTS "public"."usage_credit_consumptions" (
    "id" bigint NOT NULL,
    "grant_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "overage_event_id" "uuid",
    "metric" "public"."credit_metric_type" NOT NULL,
    "credits_used" numeric(18,6) NOT NULL,
    "applied_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "usage_credit_consumptions_credits_used_check" CHECK (("credits_used" > (0)::numeric))
);


ALTER TABLE "public"."usage_credit_consumptions" OWNER TO "postgres";


COMMENT ON TABLE "public"."usage_credit_consumptions" IS 'Detailed allocation records showing which grants covered each overage event and how many credits were used.';



CREATE SEQUENCE IF NOT EXISTS "public"."usage_credit_consumptions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."usage_credit_consumptions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."usage_credit_consumptions_id_seq" OWNED BY "public"."usage_credit_consumptions"."id";



CREATE TABLE IF NOT EXISTS "public"."usage_credit_transactions" (
    "id" bigint NOT NULL,
    "org_id" "uuid" NOT NULL,
    "grant_id" "uuid",
    "transaction_type" "public"."credit_transaction_type" NOT NULL,
    "amount" numeric(18,6) NOT NULL,
    "balance_after" numeric(18,6),
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "description" "text",
    "source_ref" "jsonb"
);


ALTER TABLE "public"."usage_credit_transactions" OWNER TO "postgres";


COMMENT ON TABLE "public"."usage_credit_transactions" IS 'General ledger of credit movements (grants, purchases, deductions, expiries, refunds) with running balances.';



CREATE TABLE IF NOT EXISTS "public"."usage_overage_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "metric" "public"."credit_metric_type" NOT NULL,
    "overage_amount" numeric(20,6) NOT NULL,
    "credits_estimated" numeric(18,6) NOT NULL,
    "credits_debited" numeric(18,6) DEFAULT 0 NOT NULL,
    "credit_step_id" bigint,
    "billing_cycle_start" "date",
    "billing_cycle_end" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "details" "jsonb",
    CONSTRAINT "usage_overage_events_credits_debited_check" CHECK (("credits_debited" >= (0)::numeric)),
    CONSTRAINT "usage_overage_events_credits_estimated_check" CHECK (("credits_estimated" >= (0)::numeric)),
    CONSTRAINT "usage_overage_events_overage_amount_check" CHECK (("overage_amount" >= (0)::numeric))
);


ALTER TABLE "public"."usage_overage_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."usage_overage_events" IS 'Snapshots of detected plan overages, capturing usage, credits applied, and linkage back to pricing tiers.';



CREATE OR REPLACE VIEW "public"."usage_credit_ledger" WITH ("security_invoker"='true', "security_barrier"='true') AS
 WITH "overage_allocations" AS (
         SELECT "e"."id" AS "overage_event_id",
            "e"."org_id",
            "e"."metric",
            "e"."overage_amount",
            "e"."credits_estimated",
            "e"."credits_debited",
            "e"."billing_cycle_start",
            "e"."billing_cycle_end",
            "e"."created_at",
            "e"."details",
            COALESCE("sum"("c"."credits_used"), (0)::numeric) AS "credits_applied",
            "jsonb_agg"("jsonb_build_object"('grant_id', "c"."grant_id", 'credits_used', "c"."credits_used", 'grant_source', "g"."source", 'grant_expires_at', "g"."expires_at", 'grant_notes', "g"."notes") ORDER BY "g"."expires_at", "g"."granted_at") FILTER (WHERE ("c"."grant_id" IS NOT NULL)) AS "grant_allocations"
           FROM (("public"."usage_overage_events" "e"
             LEFT JOIN "public"."usage_credit_consumptions" "c" ON (("e"."id" = "c"."overage_event_id")))
             LEFT JOIN "public"."usage_credit_grants" "g" ON (("c"."grant_id" = "g"."id")))
          GROUP BY "e"."id", "e"."org_id", "e"."metric", "e"."overage_amount", "e"."credits_estimated", "e"."credits_debited", "e"."billing_cycle_start", "e"."billing_cycle_end", "e"."created_at", "e"."details"
        ), "aggregated_deductions" AS (
         SELECT "a"."org_id",
            'deduction'::"public"."credit_transaction_type" AS "transaction_type",
            "a"."overage_event_id",
            "a"."metric",
            "a"."overage_amount",
            "a"."billing_cycle_start",
            "a"."billing_cycle_end",
            "a"."grant_allocations",
            "a"."details",
            "min"("t"."id") AS "id",
            "sum"("t"."amount") AS "amount",
            "min"("t"."balance_after") AS "balance_after",
            "max"("t"."occurred_at") AS "occurred_at",
            "min"("t"."description") AS "description_raw",
            COALESCE(NULLIF(("a"."details" ->> 'note'::"text"), ''::"text"), NULLIF(("a"."details" ->> 'description'::"text"), ''::"text"), "min"("t"."description"), "format"('Overage %s'::"text", ("a"."metric")::"text")) AS "description",
            "jsonb_build_object"('overage_event_id', "a"."overage_event_id", 'metric', ("a"."metric")::"text", 'overage_amount', "a"."overage_amount", 'grant_allocations', "a"."grant_allocations") AS "source_ref"
           FROM ("public"."usage_credit_transactions" "t"
             JOIN "overage_allocations" "a" ON (((("t"."source_ref" ->> 'overage_event_id'::"text"))::"uuid" = "a"."overage_event_id")))
          WHERE (("t"."transaction_type" = 'deduction'::"public"."credit_transaction_type") AND ("t"."source_ref" ? 'overage_event_id'::"text"))
          GROUP BY "a"."overage_event_id", "a"."metric", "a"."overage_amount", "a"."billing_cycle_start", "a"."billing_cycle_end", "a"."grant_allocations", "a"."details", "a"."org_id"
        ), "other_transactions" AS (
         SELECT "t"."id",
            "t"."org_id",
            "t"."transaction_type",
            "t"."amount",
            "t"."balance_after",
            "t"."occurred_at",
            "t"."description",
            "t"."source_ref",
            NULL::"uuid" AS "overage_event_id",
            NULL::"public"."credit_metric_type" AS "metric",
            NULL::numeric AS "overage_amount",
            NULL::"date" AS "billing_cycle_start",
            NULL::"date" AS "billing_cycle_end",
            NULL::"jsonb" AS "grant_allocations"
           FROM "public"."usage_credit_transactions" "t"
          WHERE (("t"."transaction_type" <> 'deduction'::"public"."credit_transaction_type") OR ("t"."source_ref" IS NULL) OR (NOT ("t"."source_ref" ? 'overage_event_id'::"text")))
        )
 SELECT "aggregated_deductions"."id",
    "aggregated_deductions"."org_id",
    "aggregated_deductions"."transaction_type",
    "aggregated_deductions"."amount",
    "aggregated_deductions"."balance_after",
    "aggregated_deductions"."occurred_at",
    "aggregated_deductions"."description",
    "aggregated_deductions"."source_ref",
    "aggregated_deductions"."overage_event_id",
    "aggregated_deductions"."metric",
    "aggregated_deductions"."overage_amount",
    "aggregated_deductions"."billing_cycle_start",
    "aggregated_deductions"."billing_cycle_end",
    "aggregated_deductions"."grant_allocations",
    NULL::"jsonb" AS "details"
   FROM "aggregated_deductions"
UNION ALL
 SELECT "other_transactions"."id",
    "other_transactions"."org_id",
    "other_transactions"."transaction_type",
    "other_transactions"."amount",
    "other_transactions"."balance_after",
    "other_transactions"."occurred_at",
    "other_transactions"."description",
    "other_transactions"."source_ref",
    "other_transactions"."overage_event_id",
    "other_transactions"."metric",
    "other_transactions"."overage_amount",
    "other_transactions"."billing_cycle_start",
    "other_transactions"."billing_cycle_end",
    "other_transactions"."grant_allocations",
    NULL::"jsonb" AS "details"
   FROM "other_transactions";


ALTER VIEW "public"."usage_credit_ledger" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."usage_credit_transactions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."usage_credit_transactions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."usage_credit_transactions_id_seq" OWNED BY "public"."usage_credit_transactions"."id";



CREATE TABLE IF NOT EXISTS "public"."user_password_compliance" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "validated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "policy_hash" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_password_compliance" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_password_compliance" IS 'Tracks which users have verified their passwords meet their org password policy requirements';



COMMENT ON COLUMN "public"."user_password_compliance"."policy_hash" IS 'MD5 hash of the password_policy_config when the user validated. If policy changes, user must re-validate.';



ALTER TABLE "public"."user_password_compliance" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."user_password_compliance_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."user_security" (
    "user_id" "uuid" NOT NULL,
    "email_otp_verified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_security" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_security" IS 'Tracks email OTP verification state used to gate MFA enrollment';



COMMENT ON COLUMN "public"."user_security"."email_otp_verified_at" IS 'Last successful email OTP verification used for MFA enrollment';



CREATE TABLE IF NOT EXISTS "public"."users" (
    "created_at" timestamp with time zone DEFAULT "now"(),
    "image_url" character varying,
    "first_name" character varying,
    "last_name" character varying,
    "country" character varying,
    "email" character varying NOT NULL,
    "id" "uuid" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "enable_notifications" boolean DEFAULT true NOT NULL,
    "opt_for_newsletters" boolean DEFAULT true NOT NULL,
    "ban_time" timestamp with time zone,
    "email_preferences" "jsonb" DEFAULT '{"onboarding": true, "usage_limit": true, "credit_usage": true, "device_error": true, "weekly_stats": true, "monthly_stats": true, "bundle_created": true, "bundle_deployed": true, "deploy_stats_24h": true, "cli_realtime_feed": true, "builder_onboarding": true, "bundle_incompatible": true, "billing_period_stats": true, "channel_self_rejected": true}'::"jsonb" NOT NULL,
    "created_via_invite" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."users" OWNER TO "postgres";


COMMENT ON COLUMN "public"."users"."email_preferences" IS 'Per-user email notification preferences. Keys: usage_limit, credit_usage, onboarding, builder_onboarding, weekly_stats, monthly_stats, billing_period_stats, deploy_stats_24h, bundle_created, bundle_deployed, device_error, channel_self_rejected, cli_realtime_feed, bundle_incompatible. Values are booleans.';



COMMENT ON COLUMN "public"."users"."created_via_invite" IS 'True when the account was created through /private/accept_invitation (invited members), false for normal self-signups.';



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
    "version_id" bigint,
    "action" "public"."version_action" NOT NULL,
    "version_name" character varying(255)
);


ALTER TABLE "public"."version_usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webhook_deliveries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "webhook_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "audit_log_id" bigint,
    "event_type" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "request_payload" "jsonb" NOT NULL,
    "response_status" integer,
    "response_body" "text",
    "response_headers" "jsonb",
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 10 NOT NULL,
    "next_retry_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "duration_ms" integer,
    "delivery_version" "text" DEFAULT 'legacy'::"text" NOT NULL,
    CONSTRAINT "webhook_deliveries_delivery_version_check" CHECK (("delivery_version" ~ '^(legacy|standard)$'::"text"))
);


ALTER TABLE "public"."webhook_deliveries" OWNER TO "postgres";


COMMENT ON COLUMN "public"."webhook_deliveries"."delivery_version" IS 'Delivery format version used for this webhook attempt.';



CREATE TABLE IF NOT EXISTS "public"."webhooks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "url" "text" NOT NULL,
    "secret" "text" DEFAULT ('whsec_'::"text" || "encode"("extensions"."gen_random_bytes"(32), 'base64'::"text")) NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "events" "text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "delivery_version" "text" DEFAULT 'legacy'::"text" NOT NULL,
    CONSTRAINT "webhooks_delivery_version_check" CHECK (("delivery_version" ~ '^(legacy|standard)$'::"text"))
);


ALTER TABLE "public"."webhooks" OWNER TO "postgres";


COMMENT ON COLUMN "public"."webhooks"."secret" IS 'Standard Webhooks HMAC-SHA256 secret in whsec_ base64 format.';



COMMENT ON COLUMN "public"."webhooks"."delivery_version" IS 'Webhook delivery format version. legacy preserves existing Capgo payloads; standard uses Standard Webhooks payload and headers.';



ALTER TABLE ONLY "public"."audit_logs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."audit_logs_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."bandwidth_usage" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."bandwidth_usage_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."capgo_credits_steps" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."capgo_credits_steps_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."cron_tasks" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."cron_tasks_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."daily_bandwidth" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."daily_bandwidth_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."daily_mau" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."daily_mau_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."daily_storage" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."daily_storage_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."device_usage" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."device_usage_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."manifest" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."manifest_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."storage_usage" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."storage_usage_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."stripe_info" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."stripe_info_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."tmp_users" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."tmp_users_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."to_delete_accounts" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."to_delete_accounts_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."usage_credit_consumptions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."usage_credit_consumptions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."usage_credit_transactions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."usage_credit_transactions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."apikey_global_permissions"
    ADD CONSTRAINT "apikey_global_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."apikey_global_permissions"
    ADD CONSTRAINT "apikey_global_permissions_rbac_permission_unique" UNIQUE ("apikey_rbac_id", "permission_key");



ALTER TABLE ONLY "public"."apikeys"
    ADD CONSTRAINT "apikeys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."apikeys"
    ADD CONSTRAINT "apikeys_rbac_id_key" UNIQUE ("rbac_id");



ALTER TABLE ONLY "public"."app_metrics_cache"
    ADD CONSTRAINT "app_metrics_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_versions_meta"
    ADD CONSTRAINT "app_versions_meta_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_versions"
    ADD CONSTRAINT "app_versions_name_app_id_key" UNIQUE ("name", "app_id");



ALTER TABLE ONLY "public"."app_versions"
    ADD CONSTRAINT "app_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."apps"
    ADD CONSTRAINT "apps_id_unique" UNIQUE ("id");



ALTER TABLE ONLY "public"."apps"
    ADD CONSTRAINT "apps_pkey" PRIMARY KEY ("app_id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bandwidth_usage"
    ADD CONSTRAINT "bandwidth_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."build_logs"
    ADD CONSTRAINT "build_logs_build_id_org_id_unique" UNIQUE ("build_id", "org_id");



ALTER TABLE ONLY "public"."build_requests"
    ADD CONSTRAINT "build_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."capgo_credits_steps"
    ADD CONSTRAINT "capgo_credits_steps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."channel_devices"
    ADD CONSTRAINT "channel_devices_app_id_device_id_key" UNIQUE ("app_id", "device_id");



ALTER TABLE ONLY "public"."channel_permission_overrides"
    ADD CONSTRAINT "channel_permission_overrides_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "channel_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "channels_rbac_id_key" UNIQUE ("rbac_id");



ALTER TABLE ONLY "public"."compatibility_events"
    ADD CONSTRAINT "compatibility_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cron_tasks"
    ADD CONSTRAINT "cron_tasks_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."cron_tasks"
    ADD CONSTRAINT "cron_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_bandwidth"
    ADD CONSTRAINT "daily_bandwidth_pkey" PRIMARY KEY ("app_id", "date");



ALTER TABLE ONLY "public"."daily_build_time"
    ADD CONSTRAINT "daily_build_time_pkey" PRIMARY KEY ("app_id", "date");



ALTER TABLE ONLY "public"."daily_mau"
    ADD CONSTRAINT "daily_mau_pkey" PRIMARY KEY ("app_id", "date");



ALTER TABLE ONLY "public"."daily_revenue_metrics"
    ADD CONSTRAINT "daily_revenue_metrics_pkey" PRIMARY KEY ("date_id", "customer_id");



ALTER TABLE ONLY "public"."daily_storage_hourly"
    ADD CONSTRAINT "daily_storage_hourly_pkey" PRIMARY KEY ("app_id", "date");



ALTER TABLE ONLY "public"."daily_storage"
    ADD CONSTRAINT "daily_storage_pkey" PRIMARY KEY ("app_id", "date");



ALTER TABLE ONLY "public"."daily_version"
    ADD CONSTRAINT "daily_version_app_date_version_name_key" UNIQUE ("app_id", "date", "version_name");



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



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_pkey" PRIMARY KEY ("group_id", "user_id");



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_org_name_unique" UNIQUE ("org_id", "name");



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."manifest"
    ADD CONSTRAINT "manifest_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("owner_org", "event", "uniq_id");



ALTER TABLE ONLY "public"."onboarding_demo_data"
    ADD CONSTRAINT "onboarding_demo_data_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."org_metrics_cache"
    ADD CONSTRAINT "org_metrics_cache_pkey" PRIMARY KEY ("org_id");



ALTER TABLE ONLY "public"."org_users"
    ADD CONSTRAINT "org_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orgs"
    ADD CONSTRAINT "orgs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("name", "stripe_id", "id");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_stripe_id_key" UNIQUE ("stripe_id");



ALTER TABLE ONLY "public"."processed_stripe_events"
    ADD CONSTRAINT "processed_stripe_events_pkey" PRIMARY KEY ("event_id");



ALTER TABLE ONLY "public"."role_bindings"
    ADD CONSTRAINT "role_bindings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_hierarchy"
    ADD CONSTRAINT "role_hierarchy_pkey" PRIMARY KEY ("parent_role_id", "child_role_id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "permission_id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sso_providers"
    ADD CONSTRAINT "sso_providers_domain_key" UNIQUE ("domain");



ALTER TABLE ONLY "public"."sso_providers"
    ADD CONSTRAINT "sso_providers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stats"
    ADD CONSTRAINT "stats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."storage_usage"
    ADD CONSTRAINT "storage_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stripe_info"
    ADD CONSTRAINT "stripe_info_pkey" PRIMARY KEY ("customer_id");



ALTER TABLE ONLY "public"."tmp_users"
    ADD CONSTRAINT "tmp_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."to_delete_accounts"
    ADD CONSTRAINT "to_delete_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orgs"
    ADD CONSTRAINT "unique customer_id on orgs" UNIQUE ("customer_id");



ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "unique_name_app_id" UNIQUE ("name", "app_id");



ALTER TABLE ONLY "public"."orgs"
    ADD CONSTRAINT "unique_name_created_by" UNIQUE ("name", "created_by");



ALTER TABLE ONLY "public"."usage_credit_consumptions"
    ADD CONSTRAINT "usage_credit_consumptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usage_credit_grants"
    ADD CONSTRAINT "usage_credit_grants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usage_credit_transactions"
    ADD CONSTRAINT "usage_credit_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usage_overage_events"
    ADD CONSTRAINT "usage_overage_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_password_compliance"
    ADD CONSTRAINT "user_password_compliance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_password_compliance"
    ADD CONSTRAINT "user_password_compliance_user_id_org_id_key" UNIQUE ("user_id", "org_id");



ALTER TABLE ONLY "public"."user_security"
    ADD CONSTRAINT "user_security_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."version_meta"
    ADD CONSTRAINT "version_meta_pkey" PRIMARY KEY ("timestamp", "app_id", "version_id", "size");



ALTER TABLE ONLY "public"."webhook_deliveries"
    ADD CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhooks"
    ADD CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id");



CREATE INDEX "apikeys_key_idx" ON "public"."apikeys" USING "btree" ("key");



CREATE UNIQUE INDEX "app_metrics_cache_org_id_key" ON "public"."app_metrics_cache" USING "btree" ("org_id");



CREATE INDEX "app_versions_cli_version_idx" ON "public"."app_versions" USING "btree" ("cli_version");



CREATE INDEX "app_versions_meta_app_id_idx" ON "public"."app_versions_meta" USING "btree" ("app_id");



CREATE INDEX "app_versions_r2_path_idx" ON "public"."app_versions" USING "btree" ("r2_path");



CREATE INDEX "capgo_credits_steps_range_idx" ON "public"."capgo_credits_steps" USING "btree" ("step_min", "step_max");



CREATE INDEX "channel_devices_device_id_idx" ON "public"."channel_devices" USING "btree" ("device_id");



CREATE INDEX "channel_permission_overrides_channel_idx" ON "public"."channel_permission_overrides" USING "btree" ("channel_id");



CREATE INDEX "channel_permission_overrides_permission_idx" ON "public"."channel_permission_overrides" USING "btree" ("permission_key");



CREATE INDEX "channel_permission_overrides_principal_idx" ON "public"."channel_permission_overrides" USING "btree" ("principal_type", "principal_id");



CREATE UNIQUE INDEX "channel_permission_overrides_unique" ON "public"."channel_permission_overrides" USING "btree" ("principal_type", "principal_id", "channel_id", "permission_key");



CREATE UNIQUE INDEX "channels_one_public_android_per_app_key" ON "public"."channels" USING "btree" ("app_id") WHERE (("public" = true) AND ("android" = true));



CREATE UNIQUE INDEX "channels_one_public_electron_per_app_key" ON "public"."channels" USING "btree" ("app_id") WHERE (("public" = true) AND ("electron" = true));



CREATE UNIQUE INDEX "channels_one_public_ios_per_app_key" ON "public"."channels" USING "btree" ("app_id") WHERE (("public" = true) AND ("ios" = true));



CREATE INDEX "daily_revenue_metrics_date_id_idx" ON "public"."daily_revenue_metrics" USING "btree" ("date_id");



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



CREATE INDEX "finx_channels_app_id" ON "public"."channels" USING "btree" ("app_id");



CREATE INDEX "finx_channels_owner_org" ON "public"."channels" USING "btree" ("owner_org");



CREATE INDEX "finx_channels_version" ON "public"."channels" USING "btree" ("version");



CREATE INDEX "finx_org_users_channel_id" ON "public"."org_users" USING "btree" ("channel_id");



CREATE INDEX "finx_org_users_org_id" ON "public"."org_users" USING "btree" ("org_id");



CREATE INDEX "finx_org_users_user_id" ON "public"."org_users" USING "btree" ("user_id");



CREATE INDEX "finx_orgs_created_by" ON "public"."orgs" USING "btree" ("created_by");



CREATE INDEX "finx_orgs_stripe_info" ON "public"."stripe_info" USING "btree" ("product_id");



CREATE INDEX "idx_apikeys_expires_at" ON "public"."apikeys" USING "btree" ("expires_at") WHERE ("expires_at" IS NOT NULL);



CREATE INDEX "idx_apikeys_key_hash" ON "public"."apikeys" USING "btree" ("key_hash") WHERE ("key_hash" IS NOT NULL);



CREATE INDEX "idx_app_id_app_versions" ON "public"."app_versions" USING "btree" ("app_id");



CREATE UNIQUE INDEX "idx_app_id_device_id_channel_id_channel_devices" ON "public"."channel_devices" USING "btree" ("app_id", "device_id", "channel_id");



CREATE INDEX "idx_app_id_name_app_versions" ON "public"."app_versions" USING "btree" ("app_id", "name");



CREATE INDEX "idx_app_id_public_channel" ON "public"."channels" USING "btree" ("app_id", "public");



CREATE INDEX "idx_app_id_version_name_devices" ON "public"."devices" USING "btree" ("app_id", "version_name");



CREATE INDEX "idx_app_versions_created_at" ON "public"."app_versions" USING "btree" ("created_at");



CREATE INDEX "idx_app_versions_created_at_app_id" ON "public"."app_versions" USING "btree" ("created_at", "app_id");



CREATE INDEX "idx_app_versions_deleted" ON "public"."app_versions" USING "btree" ("deleted");



CREATE INDEX "idx_app_versions_deleted_at" ON "public"."app_versions" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NOT NULL);



CREATE INDEX "idx_app_versions_id" ON "public"."app_versions" USING "btree" ("id");



CREATE INDEX "idx_app_versions_key_id" ON "public"."app_versions" USING "btree" ("key_id") WHERE ("key_id" IS NOT NULL);



CREATE INDEX "idx_app_versions_meta_id" ON "public"."app_versions_meta" USING "btree" ("id");



CREATE INDEX "idx_app_versions_name" ON "public"."app_versions" USING "btree" ("name");



CREATE INDEX "idx_app_versions_owner_org_not_deleted" ON "public"."app_versions" USING "btree" ("owner_org") WHERE ("deleted" = false);



CREATE INDEX "idx_app_versions_retention_cleanup" ON "public"."app_versions" USING "btree" ("deleted", "created_at", "app_id") WHERE ("deleted" = false);



CREATE INDEX "idx_apps_default_upload_channel" ON "public"."apps" USING "btree" ("default_upload_channel");



CREATE INDEX "idx_audit_logs_created_at" ON "public"."audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_audit_logs_operation" ON "public"."audit_logs" USING "btree" ("operation");



CREATE INDEX "idx_audit_logs_org_created" ON "public"."audit_logs" USING "btree" ("org_id", "created_at" DESC);



CREATE INDEX "idx_audit_logs_org_id" ON "public"."audit_logs" USING "btree" ("org_id");



CREATE INDEX "idx_audit_logs_record_id" ON "public"."audit_logs" USING "btree" ("record_id");



CREATE INDEX "idx_audit_logs_table_name" ON "public"."audit_logs" USING "btree" ("table_name");



CREATE INDEX "idx_audit_logs_user_id" ON "public"."audit_logs" USING "btree" ("user_id");



CREATE INDEX "idx_build_logs_app_id_created_at" ON "public"."build_logs" USING "btree" ("app_id", "created_at");



CREATE INDEX "idx_build_logs_created_at_platform" ON "public"."build_logs" USING "btree" ("created_at", "platform");



CREATE INDEX "idx_build_logs_org_created" ON "public"."build_logs" USING "btree" ("org_id", "created_at" DESC);



CREATE INDEX "idx_build_logs_user_id" ON "public"."build_logs" USING "btree" ("user_id");



CREATE INDEX "idx_build_requests_app" ON "public"."build_requests" USING "btree" ("app_id");



CREATE INDEX "idx_build_requests_job" ON "public"."build_requests" USING "btree" ("builder_job_id");



CREATE INDEX "idx_build_requests_org" ON "public"."build_requests" USING "btree" ("owner_org");



CREATE INDEX "idx_build_requests_requested_by" ON "public"."build_requests" USING "btree" ("requested_by");



CREATE INDEX "idx_capgo_credits_steps_org_id" ON "public"."capgo_credits_steps" USING "btree" ("org_id");



CREATE INDEX "idx_channels_app_id_name" ON "public"."channels" USING "btree" ("app_id", "name");



CREATE INDEX "idx_channels_app_id_version" ON "public"."channels" USING "btree" ("app_id", "version");



CREATE INDEX "idx_channels_public_app_id_android" ON "public"."channels" USING "btree" ("public", "app_id", "android");



CREATE INDEX "idx_channels_public_app_id_ios" ON "public"."channels" USING "btree" ("public", "app_id", "ios");



CREATE INDEX "idx_compatibility_events_app_created" ON "public"."compatibility_events" USING "btree" ("app_id", "created_at" DESC);



CREATE INDEX "idx_compatibility_events_unresolved" ON "public"."compatibility_events" USING "btree" ("app_id") WHERE ("resolved_at" IS NULL);



CREATE INDEX "idx_cron_tasks_enabled" ON "public"."cron_tasks" USING "btree" ("enabled") WHERE ("enabled" = true);



CREATE INDEX "idx_daily_bandwidth_app_id_date" ON "public"."daily_bandwidth" USING "btree" ("app_id", "date");



CREATE INDEX "idx_daily_build_time_app_date" ON "public"."daily_build_time" USING "btree" ("app_id", "date");



CREATE INDEX "idx_daily_mau_app_id_date" ON "public"."daily_mau" USING "btree" ("app_id", "date");



CREATE INDEX "idx_daily_storage_app_id_date" ON "public"."daily_storage" USING "btree" ("app_id", "date");



CREATE INDEX "idx_daily_storage_hourly_date" ON "public"."daily_storage_hourly" USING "btree" ("date");



CREATE INDEX "idx_daily_storage_hourly_owner_org_date" ON "public"."daily_storage_hourly" USING "btree" ("owner_org", "date");



CREATE INDEX "idx_daily_version_app_id" ON "public"."daily_version" USING "btree" ("app_id");



CREATE INDEX "idx_daily_version_app_id_date" ON "public"."daily_version" USING "btree" ("app_id", "date");



CREATE INDEX "idx_daily_version_version_name" ON "public"."daily_version" USING "btree" ("version_name");



CREATE INDEX "idx_deleted_apps_app_id" ON "public"."deleted_apps" USING "btree" ("app_id");



CREATE INDEX "idx_deleted_apps_deleted_at" ON "public"."deleted_apps" USING "btree" ("deleted_at");



CREATE INDEX "idx_deleted_apps_owner_org" ON "public"."deleted_apps" USING "btree" ("owner_org");



CREATE INDEX "idx_deploy_history_created_by" ON "public"."deploy_history" USING "btree" ("created_by");



CREATE INDEX "idx_device_usage_app_timestamp_platform_version_build" ON "public"."device_usage" USING "btree" ("app_id", "timestamp", "platform", "version_build");



CREATE INDEX "idx_device_usage_app_timestamp_version_build" ON "public"."device_usage" USING "btree" ("app_id", "timestamp", "version_build");



CREATE INDEX "idx_devices_default_channel" ON "public"."devices" USING "btree" ("default_channel");



CREATE INDEX "idx_devices_key_id" ON "public"."devices" USING "btree" ("key_id") WHERE ("key_id" IS NOT NULL);



CREATE INDEX "idx_group_members_user_id_group_id" ON "public"."group_members" USING "btree" ("user_id", "group_id");



CREATE INDEX "idx_manifest_app_version_id" ON "public"."manifest" USING "btree" ("app_version_id");



CREATE INDEX "idx_manifest_file_hash" ON "public"."manifest" USING "btree" ("file_hash");



CREATE INDEX "idx_manifest_file_name" ON "public"."manifest" USING "btree" ("file_name");



CREATE INDEX "idx_orgs_customer_id" ON "public"."orgs" USING "btree" ("customer_id");



CREATE INDEX "idx_orgs_email_preferences" ON "public"."orgs" USING "gin" ("email_preferences");



CREATE INDEX "idx_sso_providers_org_id" ON "public"."sso_providers" USING "btree" ("org_id");



CREATE INDEX "idx_stats_app_id_action" ON "public"."stats" USING "btree" ("app_id", "action");



CREATE INDEX "idx_stats_app_id_created_at" ON "public"."stats" USING "btree" ("app_id", "created_at");



CREATE INDEX "idx_stats_app_id_device_id" ON "public"."stats" USING "btree" ("app_id", "device_id");



CREATE INDEX "idx_stats_app_id_version_name" ON "public"."stats" USING "btree" ("app_id", "version_name");



CREATE INDEX "idx_stripe_info_customer_covering" ON "public"."stripe_info" USING "btree" ("customer_id") INCLUDE ("product_id", "subscription_anchor_start", "subscription_anchor_end");



CREATE INDEX "idx_stripe_info_customer_id" ON "public"."stripe_info" USING "btree" ("customer_id");



CREATE INDEX "idx_stripe_info_status_plan" ON "public"."stripe_info" USING "btree" ("status", "is_good_plan") WHERE (("status" = 'succeeded'::"public"."stripe_status") AND ("is_good_plan" = true));



CREATE INDEX "idx_stripe_info_trial" ON "public"."stripe_info" USING "btree" ("trial_at") WHERE ("trial_at" IS NOT NULL);



CREATE INDEX "idx_usage_credit_consumptions_grant" ON "public"."usage_credit_consumptions" USING "btree" ("grant_id", "applied_at" DESC);



CREATE INDEX "idx_usage_credit_consumptions_org_time" ON "public"."usage_credit_consumptions" USING "btree" ("org_id", "applied_at" DESC);



CREATE INDEX "idx_usage_credit_consumptions_overage_event_id" ON "public"."usage_credit_consumptions" USING "btree" ("overage_event_id");



CREATE INDEX "idx_usage_credit_grants_org_expires" ON "public"."usage_credit_grants" USING "btree" ("org_id", "expires_at");



CREATE INDEX "idx_usage_credit_grants_org_remaining" ON "public"."usage_credit_grants" USING "btree" ("org_id", (("credits_total" - "credits_consumed")));



CREATE INDEX "idx_usage_credit_transactions_grant" ON "public"."usage_credit_transactions" USING "btree" ("grant_id", "occurred_at" DESC);



CREATE INDEX "idx_usage_credit_transactions_org_id" ON "public"."usage_credit_transactions" USING "btree" ("org_id");



CREATE INDEX "idx_usage_credit_transactions_org_time" ON "public"."usage_credit_transactions" USING "btree" ("org_id", "occurred_at" DESC);



CREATE INDEX "idx_usage_overage_events_credit_step_id" ON "public"."usage_overage_events" USING "btree" ("credit_step_id");



CREATE INDEX "idx_usage_overage_events_metric" ON "public"."usage_overage_events" USING "btree" ("metric");



CREATE INDEX "idx_usage_overage_events_org_id" ON "public"."usage_overage_events" USING "btree" ("org_id");



CREATE INDEX "idx_usage_overage_events_org_time" ON "public"."usage_overage_events" USING "btree" ("org_id", "created_at" DESC);



CREATE INDEX "idx_user_password_compliance_user_org" ON "public"."user_password_compliance" USING "btree" ("user_id", "org_id");



CREATE INDEX "idx_users_email_preferences" ON "public"."users" USING "gin" ("email_preferences");



CREATE INDEX "idx_version_meta_app_id_timestamp" ON "public"."version_meta" USING "btree" ("app_id", "timestamp");



CREATE INDEX "idx_version_usage_version_name" ON "public"."version_usage" USING "btree" ("version_name");



CREATE INDEX "notifications_uniq_id_idx" ON "public"."notifications" USING "btree" ("uniq_id");



CREATE UNIQUE INDEX "onboarding_demo_data_app_relation_row_key_idx" ON "public"."onboarding_demo_data" USING "btree" ("app_id", "relation_name", "row_key");



CREATE INDEX "onboarding_demo_data_seed_id_idx" ON "public"."onboarding_demo_data" USING "btree" ("seed_id");



CREATE INDEX "org_users_app_id_idx" ON "public"."org_users" USING "btree" ("app_id");



CREATE INDEX "orgs_enforce_hashed_api_keys_true_idx" ON "public"."orgs" USING "btree" ("id") WHERE ("enforce_hashed_api_keys" = true);



CREATE INDEX "orgs_updated_at_id_idx" ON "public"."orgs" USING "btree" ("updated_at" DESC) INCLUDE ("id") WHERE ("customer_id" IS NOT NULL);



CREATE INDEX "processed_stripe_events_customer_id_date_id_idx" ON "public"."processed_stripe_events" USING "btree" ("customer_id", "date_id");



CREATE UNIQUE INDEX "role_bindings_app_scope_uniq" ON "public"."role_bindings" USING "btree" ("principal_type", "principal_id", "app_id", "scope_type") WHERE ("scope_type" = "public"."rbac_scope_app"());



CREATE UNIQUE INDEX "role_bindings_bundle_scope_uniq" ON "public"."role_bindings" USING "btree" ("principal_type", "principal_id", "bundle_id", "scope_type") WHERE ("scope_type" = "public"."rbac_scope_bundle"());



CREATE UNIQUE INDEX "role_bindings_channel_scope_uniq" ON "public"."role_bindings" USING "btree" ("principal_type", "principal_id", "channel_id", "scope_type") WHERE ("scope_type" = "public"."rbac_scope_channel"());



CREATE UNIQUE INDEX "role_bindings_org_scope_uniq" ON "public"."role_bindings" USING "btree" ("principal_type", "principal_id", "org_id", "scope_type") WHERE ("scope_type" = "public"."rbac_scope_org"());



CREATE INDEX "role_bindings_principal_scope_idx" ON "public"."role_bindings" USING "btree" ("principal_type", "principal_id", "scope_type", "org_id", "app_id", "channel_id");



CREATE INDEX "role_bindings_scope_idx" ON "public"."role_bindings" USING "btree" ("scope_type", "org_id", "app_id", "channel_id");



CREATE INDEX "si_customer_status_trial_idx" ON "public"."stripe_info" USING "btree" ("customer_id", "status", "trial_at") INCLUDE ("mau_exceeded", "storage_exceeded", "bandwidth_exceeded");



CREATE INDEX "stripe_info_paid_at_idx" ON "public"."stripe_info" USING "btree" ("paid_at") WHERE ("paid_at" IS NOT NULL);



CREATE INDEX "tmp_users_invite_magic_string_idx" ON "public"."tmp_users" USING "btree" ("invite_magic_string");



CREATE UNIQUE INDEX "tmp_users_org_id_email_idx" ON "public"."tmp_users" USING "btree" ("org_id", "email");



CREATE UNIQUE INDEX "to_delete_accounts_account_id_key" ON "public"."to_delete_accounts" USING "btree" ("account_id");



CREATE INDEX "to_delete_accounts_removal_date_idx" ON "public"."to_delete_accounts" USING "btree" ("removal_date");



CREATE UNIQUE INDEX "unique_app_version_negative" ON "public"."version_meta" USING "btree" ("app_id", "version_id") WHERE ("size" < 0);



CREATE UNIQUE INDEX "unique_app_version_positive" ON "public"."version_meta" USING "btree" ("app_id", "version_id") WHERE ("size" > 0);



CREATE UNIQUE INDEX "uq_compatibility_events_dedup" ON "public"."compatibility_events" USING "btree" ("app_id", "channel_id", "platform", "current_version_id", "previous_version_id", "change_occurred_at") NULLS NOT DISTINCT;



CREATE UNIQUE INDEX "usage_credit_transactions_purchase_payment_intent_id_idx" ON "public"."usage_credit_transactions" USING "btree" ((("source_ref" ->> 'paymentIntentId'::"text"))) WHERE (("transaction_type" = 'purchase'::"public"."credit_transaction_type") AND (("source_ref" ->> 'paymentIntentId'::"text") IS NOT NULL));



CREATE UNIQUE INDEX "usage_credit_transactions_purchase_session_id_idx" ON "public"."usage_credit_transactions" USING "btree" ((("source_ref" ->> 'sessionId'::"text"))) WHERE (("transaction_type" = 'purchase'::"public"."credit_transaction_type") AND (("source_ref" ->> 'sessionId'::"text") IS NOT NULL));



CREATE INDEX "webhook_deliveries_org_id_created_idx" ON "public"."webhook_deliveries" USING "btree" ("org_id", "created_at" DESC);



CREATE INDEX "webhook_deliveries_pending_retry_idx" ON "public"."webhook_deliveries" USING "btree" ("status", "next_retry_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "webhook_deliveries_webhook_id_idx" ON "public"."webhook_deliveries" USING "btree" ("webhook_id");



CREATE INDEX "webhooks_enabled_idx" ON "public"."webhooks" USING "btree" ("org_id", "enabled") WHERE ("enabled" = true);



CREATE INDEX "webhooks_org_id_idx" ON "public"."webhooks" USING "btree" ("org_id");



CREATE OR REPLACE TRIGGER "aggregate_build_log_to_daily_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."build_logs" FOR EACH ROW EXECUTE FUNCTION "public"."aggregate_build_log_to_daily"();



CREATE OR REPLACE TRIGGER "apikeys_enforce_expiration_policy" BEFORE INSERT OR UPDATE ON "public"."apikeys" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_apikey_expiration_policy"();



CREATE OR REPLACE TRIGGER "apikeys_force_server_key" BEFORE INSERT OR UPDATE ON "public"."apikeys" FOR EACH ROW EXECUTE FUNCTION "public"."apikeys_force_server_key"();



CREATE CONSTRAINT TRIGGER "apikeys_strip_plain_key_for_hashed" AFTER INSERT OR UPDATE ON "public"."apikeys" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "public"."apikeys_strip_plain_key_for_hashed"();



CREATE OR REPLACE TRIGGER "audit_app_versions_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."app_versions" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();



CREATE OR REPLACE TRIGGER "audit_apps_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."apps" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();



CREATE OR REPLACE TRIGGER "audit_channels_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."channels" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();



CREATE OR REPLACE TRIGGER "audit_org_users_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."org_users" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();



CREATE OR REPLACE TRIGGER "audit_orgs_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."orgs" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();



CREATE OR REPLACE TRIGGER "bind_creating_apikey_to_org_on_create" AFTER INSERT ON "public"."orgs" FOR EACH ROW EXECUTE FUNCTION "public"."bind_creating_apikey_to_org_on_create"();



CREATE OR REPLACE TRIGGER "channel_device_count_enqueue" AFTER INSERT OR DELETE ON "public"."channel_devices" FOR EACH ROW EXECUTE FUNCTION "public"."enqueue_channel_device_counts"();



CREATE OR REPLACE TRIGGER "check_if_org_can_exist_org_users" AFTER DELETE ON "public"."org_users" FOR EACH ROW EXECUTE FUNCTION "public"."check_if_org_can_exist"();



CREATE OR REPLACE TRIGGER "check_privileges" BEFORE INSERT OR UPDATE ON "public"."org_users" FOR EACH ROW EXECUTE FUNCTION "public"."check_org_user_privileges"();



CREATE OR REPLACE TRIGGER "cleanup_apikey_role_bindings_on_delete" BEFORE DELETE ON "public"."apikeys" FOR EACH ROW EXECUTE FUNCTION "public"."cleanup_apikey_role_bindings"();



CREATE OR REPLACE TRIGGER "cleanup_onboarding_app_data_on_complete" AFTER UPDATE OF "need_onboarding" ON "public"."apps" FOR EACH ROW WHEN ((("old"."need_onboarding" IS TRUE) AND ("new"."need_onboarding" IS FALSE))) EXECUTE FUNCTION "public"."cleanup_onboarding_app_data_on_complete"();



CREATE OR REPLACE TRIGGER "credit_usage_alert_on_transactions" AFTER INSERT ON "public"."usage_credit_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."enqueue_credit_usage_alert"();



CREATE OR REPLACE TRIGGER "enforce_channel_version_promotion_permission" BEFORE UPDATE OF "version" ON "public"."channels" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_channel_version_promotion_permission"();



CREATE OR REPLACE TRIGGER "enforce_encrypted_bundle_trigger" BEFORE INSERT OR UPDATE OF "name", "app_id", "session_key", "key_id", "storage_provider", "r2_path", "external_url", "checksum", "manifest", "native_packages" ON "public"."app_versions" FOR EACH ROW EXECUTE FUNCTION "public"."check_encrypted_bundle_on_insert"();



CREATE OR REPLACE TRIGGER "enforce_role_binding_role_scope" BEFORE INSERT OR UPDATE OF "role_id", "scope_type" ON "public"."role_bindings" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_role_binding_role_scope"();



COMMENT ON TRIGGER "enforce_role_binding_role_scope" ON "public"."role_bindings" IS 'Prevents mixed-scope RBAC bindings such as org roles attached to app scope rows.';



CREATE OR REPLACE TRIGGER "force_valid_apikey_name" BEFORE INSERT OR UPDATE ON "public"."apikeys" FOR EACH ROW EXECUTE FUNCTION "public"."auto_apikey_name_by_id"();



CREATE OR REPLACE TRIGGER "force_valid_owner_org_app_versions" BEFORE INSERT OR UPDATE ON "public"."app_versions" FOR EACH ROW EXECUTE FUNCTION "public"."auto_owner_org_by_app_id"();



CREATE OR REPLACE TRIGGER "force_valid_owner_org_app_versions_meta" BEFORE INSERT OR UPDATE ON "public"."app_versions_meta" FOR EACH ROW EXECUTE FUNCTION "public"."auto_owner_org_by_app_id"();



CREATE OR REPLACE TRIGGER "force_valid_owner_org_channel_devices" BEFORE INSERT OR UPDATE ON "public"."channel_devices" FOR EACH ROW EXECUTE FUNCTION "public"."auto_owner_org_by_app_id"();



CREATE OR REPLACE TRIGGER "force_valid_owner_org_channels" BEFORE INSERT OR UPDATE ON "public"."channels" FOR EACH ROW EXECUTE FUNCTION "public"."auto_owner_org_by_app_id"();



CREATE OR REPLACE TRIGGER "generate_org_user_stripe_info_on_org_create" AFTER INSERT ON "public"."orgs" FOR EACH ROW EXECUTE FUNCTION "public"."generate_org_user_stripe_info_on_org_create"();



CREATE OR REPLACE TRIGGER "guard_owner_org_reassignment_app_versions" BEFORE UPDATE OF "owner_org" ON "public"."app_versions" FOR EACH ROW EXECUTE FUNCTION "public"."guard_owner_org_reassignment"();



CREATE OR REPLACE TRIGGER "guard_owner_org_reassignment_app_versions_meta" BEFORE UPDATE OF "owner_org" ON "public"."app_versions_meta" FOR EACH ROW EXECUTE FUNCTION "public"."guard_owner_org_reassignment"();



CREATE OR REPLACE TRIGGER "guard_owner_org_reassignment_apps" BEFORE UPDATE OF "owner_org" ON "public"."apps" FOR EACH ROW EXECUTE FUNCTION "public"."guard_owner_org_reassignment"();



CREATE OR REPLACE TRIGGER "guard_owner_org_reassignment_channel_devices" BEFORE UPDATE OF "owner_org" ON "public"."channel_devices" FOR EACH ROW EXECUTE FUNCTION "public"."guard_owner_org_reassignment"();



CREATE OR REPLACE TRIGGER "guard_owner_org_reassignment_channels" BEFORE UPDATE OF "owner_org" ON "public"."channels" FOR EACH ROW EXECUTE FUNCTION "public"."guard_owner_org_reassignment"();



CREATE OR REPLACE TRIGGER "handle_build_requests_updated_at" BEFORE UPDATE ON "public"."build_requests" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_sso_providers_updated_at" BEFORE UPDATE ON "public"."sso_providers" FOR EACH ROW EXECUTE FUNCTION "public"."update_sso_providers_updated_at"();



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."apikeys" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."app_versions" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."app_versions_meta" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE INSERT OR UPDATE ON "public"."apps" FOR EACH ROW EXECUTE FUNCTION "public"."sanitize_apps_text_fields"();



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."capgo_credits_steps" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."channel_devices" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."channels" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."org_users" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."plans" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."stripe_info" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE INSERT OR UPDATE ON "public"."tmp_users" FOR EACH ROW EXECUTE FUNCTION "public"."sanitize_tmp_users_text_fields"();



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE INSERT OR UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."sanitize_users_text_fields"();



CREATE OR REPLACE TRIGGER "mark_org_delete_cascade" BEFORE DELETE ON "public"."orgs" FOR EACH ROW EXECUTE FUNCTION "public"."mark_org_delete_cascade"();



CREATE OR REPLACE TRIGGER "normalize_public_channel_overlap_before_upsert" BEFORE INSERT OR UPDATE OF "public", "ios", "android", "electron", "app_id" ON "public"."channels" FOR EACH ROW EXECUTE FUNCTION "public"."normalize_public_channel_overlap"();



CREATE OR REPLACE TRIGGER "normalize_sso_provider_domain_before_upsert" BEFORE INSERT OR UPDATE OF "domain" ON "public"."sso_providers" FOR EACH ROW EXECUTE FUNCTION "public"."normalize_sso_provider_domain"();



CREATE OR REPLACE TRIGGER "noupdate" BEFORE UPDATE ON "public"."channels" FOR EACH ROW EXECUTE FUNCTION "public"."noupdate"();



CREATE OR REPLACE TRIGGER "on_app_create" AFTER INSERT ON "public"."apps" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('on_app_create');



CREATE OR REPLACE TRIGGER "on_app_delete" AFTER DELETE ON "public"."apps" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('on_app_delete');



CREATE OR REPLACE TRIGGER "on_app_update" AFTER UPDATE OF "icon_url" ON "public"."apps" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('on_app_update');



CREATE OR REPLACE TRIGGER "on_audit_log_webhook" AFTER INSERT ON "public"."audit_logs" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_webhook_on_audit_log"();



CREATE OR REPLACE TRIGGER "on_channel_update" AFTER UPDATE ON "public"."channels" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('on_channel_update');



CREATE OR REPLACE TRIGGER "on_manifest_create" AFTER INSERT ON "public"."manifest" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('on_manifest_create');



CREATE OR REPLACE TRIGGER "on_org_create" AFTER INSERT ON "public"."orgs" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('on_organization_create');



CREATE OR REPLACE TRIGGER "on_org_update" AFTER UPDATE OF "logo" ON "public"."orgs" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('on_org_update');



CREATE OR REPLACE TRIGGER "on_organization_delete" AFTER DELETE ON "public"."orgs" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('on_organization_delete');



CREATE OR REPLACE TRIGGER "on_user_create" AFTER INSERT ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('on_user_create');



CREATE OR REPLACE TRIGGER "on_user_delete" AFTER DELETE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('on_user_delete');



CREATE OR REPLACE TRIGGER "on_user_update" AFTER UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('on_user_update');



CREATE OR REPLACE TRIGGER "on_version_create" AFTER INSERT ON "public"."app_versions" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('on_version_create');



CREATE OR REPLACE TRIGGER "on_version_delete" AFTER DELETE ON "public"."app_versions" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('on_version_delete');



CREATE OR REPLACE TRIGGER "on_version_update" AFTER UPDATE ON "public"."app_versions" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_http_queue_post_to_function"('on_version_update');



CREATE OR REPLACE TRIGGER "prevent_last_super_admin_delete" BEFORE DELETE ON "public"."role_bindings" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_last_super_admin_binding_delete"();



CREATE OR REPLACE TRIGGER "prevent_last_super_admin_update" BEFORE UPDATE OF "role_id" ON "public"."role_bindings" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_last_super_admin_binding_update"();



CREATE OR REPLACE TRIGGER "reassign_webhook_created_by_before_user_delete" BEFORE DELETE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."reassign_webhook_created_by_before_user_delete"();



CREATE OR REPLACE TRIGGER "record_deployment_history_trigger" AFTER UPDATE OF "version" ON "public"."channels" FOR EACH ROW EXECUTE FUNCTION "public"."record_deployment_history"();



CREATE OR REPLACE TRIGGER "role_bindings_enforce_apikey_expiration_policy" BEFORE INSERT OR UPDATE OF "principal_type", "principal_id", "org_id", "expires_at" ON "public"."role_bindings" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_apikey_role_binding_expiration_policy"();



CREATE OR REPLACE TRIGGER "sanitize_orgs_text_fields" BEFORE INSERT OR UPDATE ON "public"."orgs" FOR EACH ROW EXECUTE FUNCTION "public"."sanitize_orgs_text_fields"();



CREATE OR REPLACE TRIGGER "set_deleted_at_trigger" BEFORE UPDATE ON "public"."app_versions" FOR EACH ROW EXECUTE FUNCTION "public"."set_deleted_at_on_soft_delete"();



CREATE OR REPLACE TRIGGER "set_webhook_created_by" BEFORE INSERT ON "public"."webhooks" FOR EACH ROW EXECUTE FUNCTION "public"."set_webhook_created_by"();



CREATE OR REPLACE TRIGGER "trg_sync_org_has_usage_credits" AFTER INSERT OR DELETE OR UPDATE ON "public"."usage_credit_grants" FOR EACH ROW EXECUTE FUNCTION "public"."sync_org_has_usage_credits_from_grants"();



CREATE OR REPLACE TRIGGER "update_apps_build_timeout_updated_at" BEFORE INSERT OR UPDATE ON "public"."apps" FOR EACH ROW EXECUTE FUNCTION "public"."update_apps_build_timeout_updated_at"();



CREATE OR REPLACE TRIGGER "update_webhooks_updated_at" BEFORE UPDATE ON "public"."webhooks" FOR EACH ROW EXECUTE FUNCTION "public"."update_webhook_updated_at"();



ALTER TABLE ONLY "public"."apikey_global_permissions"
    ADD CONSTRAINT "apikey_global_permissions_apikey_rbac_id_fkey" FOREIGN KEY ("apikey_rbac_id") REFERENCES "public"."apikeys"("rbac_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."apikey_global_permissions"
    ADD CONSTRAINT "apikey_global_permissions_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."apikeys"
    ADD CONSTRAINT "apikeys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_metrics_cache"
    ADD CONSTRAINT "app_metrics_cache_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_versions"
    ADD CONSTRAINT "app_versions_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_versions_meta"
    ADD CONSTRAINT "app_versions_meta_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_versions_meta"
    ADD CONSTRAINT "app_versions_meta_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."app_versions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."apps"
    ADD CONSTRAINT "apps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."build_logs"
    ADD CONSTRAINT "build_logs_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."build_requests"
    ADD CONSTRAINT "build_requests_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."build_requests"
    ADD CONSTRAINT "build_requests_owner_org_fkey" FOREIGN KEY ("owner_org") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."build_requests"
    ADD CONSTRAINT "build_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."capgo_credits_steps"
    ADD CONSTRAINT "capgo_credits_steps_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."channel_devices"
    ADD CONSTRAINT "channel_devices_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."channel_devices"
    ADD CONSTRAINT "channel_devices_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id");



ALTER TABLE ONLY "public"."channel_permission_overrides"
    ADD CONSTRAINT "channel_permission_overrides_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."channel_permission_overrides"
    ADD CONSTRAINT "channel_permission_overrides_permission_key_fkey" FOREIGN KEY ("permission_key") REFERENCES "public"."permissions"("key") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "channels_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "channels_version_fkey" FOREIGN KEY ("version") REFERENCES "public"."app_versions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."compatibility_events"
    ADD CONSTRAINT "compatibility_events_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."compatibility_events"
    ADD CONSTRAINT "compatibility_events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_build_time"
    ADD CONSTRAINT "daily_build_time_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_storage_hourly"
    ADD CONSTRAINT "daily_storage_hourly_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_storage_hourly"
    ADD CONSTRAINT "daily_storage_hourly_owner_org_fkey" FOREIGN KEY ("owner_org") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deploy_history"
    ADD CONSTRAINT "deploy_history_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deploy_history"
    ADD CONSTRAINT "deploy_history_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deploy_history"
    ADD CONSTRAINT "deploy_history_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deploy_history"
    ADD CONSTRAINT "deploy_history_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "public"."app_versions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."manifest"
    ADD CONSTRAINT "manifest_app_version_id_fkey" FOREIGN KEY ("app_version_id") REFERENCES "public"."app_versions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."onboarding_demo_data"
    ADD CONSTRAINT "onboarding_demo_data_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."onboarding_demo_data"
    ADD CONSTRAINT "onboarding_demo_data_owner_org_fkey" FOREIGN KEY ("owner_org") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."org_metrics_cache"
    ADD CONSTRAINT "org_metrics_cache_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



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



ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "owner_org_id_fkey" FOREIGN KEY ("owner_org") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "owner_org_id_fkey" FOREIGN KEY ("owner_org") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "public"."app_versions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_bindings"
    ADD CONSTRAINT "role_bindings_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_bindings"
    ADD CONSTRAINT "role_bindings_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "public"."app_versions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_bindings"
    ADD CONSTRAINT "role_bindings_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("rbac_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_bindings"
    ADD CONSTRAINT "role_bindings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_bindings"
    ADD CONSTRAINT "role_bindings_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_hierarchy"
    ADD CONSTRAINT "role_hierarchy_child_role_id_fkey" FOREIGN KEY ("child_role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_hierarchy"
    ADD CONSTRAINT "role_hierarchy_parent_role_id_fkey" FOREIGN KEY ("parent_role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sso_providers"
    ADD CONSTRAINT "sso_providers_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stripe_info"
    ADD CONSTRAINT "stripe_info_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."plans"("stripe_id");



ALTER TABLE ONLY "public"."tmp_users"
    ADD CONSTRAINT "tmp_users_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."to_delete_accounts"
    ADD CONSTRAINT "to_delete_accounts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."usage_credit_consumptions"
    ADD CONSTRAINT "usage_credit_consumptions_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "public"."usage_credit_grants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."usage_credit_consumptions"
    ADD CONSTRAINT "usage_credit_consumptions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."usage_credit_consumptions"
    ADD CONSTRAINT "usage_credit_consumptions_overage_event_id_fkey" FOREIGN KEY ("overage_event_id") REFERENCES "public"."usage_overage_events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."usage_credit_grants"
    ADD CONSTRAINT "usage_credit_grants_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."usage_credit_transactions"
    ADD CONSTRAINT "usage_credit_transactions_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "public"."usage_credit_grants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."usage_credit_transactions"
    ADD CONSTRAINT "usage_credit_transactions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."usage_overage_events"
    ADD CONSTRAINT "usage_overage_events_credit_step_id_fkey" FOREIGN KEY ("credit_step_id") REFERENCES "public"."capgo_credits_steps"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."usage_overage_events"
    ADD CONSTRAINT "usage_overage_events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_password_compliance"
    ADD CONSTRAINT "user_password_compliance_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_password_compliance"
    ADD CONSTRAINT "user_password_compliance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_security"
    ADD CONSTRAINT "user_security_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."webhook_deliveries"
    ADD CONSTRAINT "webhook_deliveries_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."webhook_deliveries"
    ADD CONSTRAINT "webhook_deliveries_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhooks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."webhooks"
    ADD CONSTRAINT "webhooks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."webhooks"
    ADD CONSTRAINT "webhooks_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



CREATE POLICY "Allow RBAC app_versions insert" ON "public"."app_versions" FOR INSERT TO "anon" WITH CHECK ("public"."rbac_check_permission_request"("public"."rbac_perm_app_upload_bundle"(), "owner_org", "app_id", NULL::bigint));



CREATE POLICY "Allow RBAC app_versions select" ON "public"."app_versions" FOR SELECT TO "authenticated", "anon" USING ("public"."rbac_check_permission_request"("public"."rbac_perm_app_read_bundles"(), "owner_org", "app_id", NULL::bigint));



CREATE POLICY "Allow RBAC app_versions super-admin access" ON "public"."app_versions" FOR DELETE TO "authenticated", "anon" USING ("public"."rbac_check_permission_request"("public"."rbac_perm_bundle_delete"(), "owner_org", "app_id", NULL::bigint));



CREATE POLICY "Allow RBAC app_versions update" ON "public"."app_versions" FOR UPDATE TO "authenticated", "anon" USING (((("deleted" IS NOT TRUE) AND ("public"."rbac_check_permission_request"("public"."rbac_perm_app_upload_bundle"(), "owner_org", "app_id", NULL::bigint) OR "public"."rbac_check_permission_request"("public"."rbac_perm_bundle_update"(), "owner_org", "app_id", NULL::bigint))) OR "public"."rbac_check_permission_request"("public"."rbac_perm_bundle_delete"(), "owner_org", "app_id", NULL::bigint))) WITH CHECK (((("deleted" IS NOT TRUE) AND ("public"."rbac_check_permission_request"("public"."rbac_perm_app_upload_bundle"(), "owner_org", "app_id", NULL::bigint) OR "public"."rbac_check_permission_request"("public"."rbac_perm_bundle_update"(), "owner_org", "app_id", NULL::bigint))) OR "public"."rbac_check_permission_request"("public"."rbac_perm_bundle_delete"(), "owner_org", "app_id", NULL::bigint)));



CREATE POLICY "Allow RBAC app_versions_meta select" ON "public"."app_versions_meta" FOR SELECT TO "authenticated", "anon" USING ("public"."rbac_check_permission_request"("public"."rbac_perm_app_read_bundles"(), "owner_org", "app_id", NULL::bigint));



CREATE POLICY "Allow RBAC apps insert" ON "public"."apps" FOR INSERT TO "authenticated", "anon" WITH CHECK ("public"."rbac_check_permission_request"("public"."rbac_perm_org_create_app"(), "owner_org", NULL::character varying, NULL::bigint));



CREATE POLICY "Allow RBAC apps select" ON "public"."apps" FOR SELECT TO "authenticated", "anon" USING ("public"."rbac_check_permission_request"("public"."rbac_perm_app_read"(), "owner_org", "app_id", NULL::bigint));



CREATE POLICY "Allow RBAC apps super-admin access" ON "public"."apps" FOR DELETE TO "authenticated", "anon" USING ("public"."rbac_check_permission_request"("public"."rbac_perm_app_delete"(), "owner_org", "app_id", NULL::bigint));



CREATE POLICY "Allow RBAC apps update" ON "public"."apps" FOR UPDATE TO "authenticated", "anon" USING ("public"."rbac_check_permission_request"("public"."rbac_perm_app_update_settings"(), "owner_org", "app_id", NULL::bigint)) WITH CHECK ("public"."rbac_check_permission_request"("public"."rbac_perm_app_update_settings"(), "owner_org", "app_id", NULL::bigint));



CREATE POLICY "Allow RBAC channel_devices delete" ON "public"."channel_devices" FOR DELETE TO "authenticated", "anon" USING ("public"."rbac_check_permission_request"("public"."rbac_perm_channel_manage_forced_devices"(), "owner_org", "app_id", "channel_id"));



CREATE POLICY "Allow RBAC channel_devices insert" ON "public"."channel_devices" FOR INSERT TO "authenticated" WITH CHECK ("public"."rbac_check_permission_request"("public"."rbac_perm_channel_manage_forced_devices"(), "owner_org", "app_id", "channel_id"));



CREATE POLICY "Allow RBAC channel_devices select" ON "public"."channel_devices" FOR SELECT TO "authenticated", "anon" USING ("public"."rbac_check_permission_request"("public"."rbac_perm_channel_read_forced_devices"(), "owner_org", "app_id", "channel_id"));



CREATE POLICY "Allow RBAC channel_devices update" ON "public"."channel_devices" FOR UPDATE TO "authenticated", "anon" USING ("public"."rbac_check_permission_request"("public"."rbac_perm_channel_manage_forced_devices"(), "owner_org", "app_id", "channel_id")) WITH CHECK ("public"."rbac_check_permission_request"("public"."rbac_perm_channel_manage_forced_devices"(), "owner_org", "app_id", "channel_id"));



CREATE POLICY "Allow RBAC channels delete" ON "public"."channels" FOR DELETE TO "authenticated", "anon" USING ("public"."rbac_check_permission_request"("public"."rbac_perm_channel_delete"(), "owner_org", "app_id", "id"));



CREATE POLICY "Allow RBAC channels insert" ON "public"."channels" FOR INSERT TO "authenticated", "anon" WITH CHECK ("public"."rbac_check_permission_request"("public"."rbac_perm_app_create_channel"(), "owner_org", "app_id", NULL::bigint));



CREATE POLICY "Allow RBAC channels select" ON "public"."channels" FOR SELECT TO "authenticated", "anon" USING ("public"."rbac_check_permission_request"("public"."rbac_perm_channel_read"(), "owner_org", "app_id", "id"));



CREATE POLICY "Allow RBAC channels update" ON "public"."channels" FOR UPDATE TO "authenticated", "anon" USING ("public"."rbac_check_permission_request"("public"."rbac_perm_channel_update_settings"(), "owner_org", "app_id", "id")) WITH CHECK ("public"."rbac_check_permission_request"("public"."rbac_perm_channel_update_settings"(), "owner_org", "app_id", "id"));



CREATE POLICY "Allow RBAC daily_bandwidth select" ON "public"."daily_bandwidth" FOR SELECT TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."apps"
  WHERE ((("apps"."app_id")::"text" = ("daily_bandwidth"."app_id")::"text") AND "public"."rbac_check_permission_request"("public"."rbac_perm_app_read"(), "apps"."owner_org", "apps"."app_id", NULL::bigint)))));



CREATE POLICY "Allow RBAC daily_mau select" ON "public"."daily_mau" FOR SELECT TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."apps"
  WHERE ((("apps"."app_id")::"text" = ("daily_mau"."app_id")::"text") AND "public"."rbac_check_permission_request"("public"."rbac_perm_app_read"(), "apps"."owner_org", "apps"."app_id", NULL::bigint)))));



CREATE POLICY "Allow RBAC daily_storage select" ON "public"."daily_storage" FOR SELECT TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."apps"
  WHERE ((("apps"."app_id")::"text" = ("daily_storage"."app_id")::"text") AND "public"."rbac_check_permission_request"("public"."rbac_perm_app_read"(), "apps"."owner_org", "apps"."app_id", NULL::bigint)))));



CREATE POLICY "Allow RBAC daily_storage_hourly select" ON "public"."daily_storage_hourly" FOR SELECT TO "authenticated", "anon" USING ("public"."rbac_check_permission_request"("public"."rbac_perm_app_read"(), "owner_org", "app_id", NULL::bigint));



CREATE POLICY "Allow RBAC daily_version select" ON "public"."daily_version" FOR SELECT TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."apps"
  WHERE ((("apps"."app_id")::"text" = ("daily_version"."app_id")::"text") AND "public"."rbac_check_permission_request"("public"."rbac_perm_app_read"(), "apps"."owner_org", "apps"."app_id", NULL::bigint)))));



CREATE POLICY "Allow RBAC manifest select" ON "public"."manifest" FOR SELECT TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."app_versions" "av"
  WHERE (("av"."id" = "manifest"."app_version_id") AND "public"."rbac_check_permission_request"("public"."rbac_perm_app_read_bundles"(), "av"."owner_org", "av"."app_id", NULL::bigint)))));



CREATE POLICY "Allow RBAC orgs select" ON "public"."orgs" FOR SELECT TO "authenticated", "anon" USING ("public"."rbac_check_permission_request"("public"."rbac_perm_org_read"(), "id", NULL::character varying, NULL::bigint));



CREATE POLICY "Allow RBAC stats select" ON "public"."stats" FOR SELECT TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."apps"
  WHERE ((("apps"."app_id")::"text" = ("stats"."app_id")::"text") AND "public"."rbac_check_permission_request"("public"."rbac_perm_app_read"(), "apps"."owner_org", "apps"."app_id", NULL::bigint)))));



CREATE POLICY "Allow insert org for user" ON "public"."orgs" FOR INSERT TO "authenticated" WITH CHECK (("created_by" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Allow member and owner to select" ON "public"."org_users" FOR SELECT TO "authenticated", "anon" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."rbac_check_permission_request"("public"."rbac_perm_org_read_members"(), "org_id", NULL::character varying, NULL::bigint)));



CREATE POLICY "Allow org admin to insert" ON "public"."org_users" FOR INSERT TO "authenticated", "anon" WITH CHECK ("public"."rbac_check_permission_request"("public"."rbac_perm_org_update_user_roles"(), "org_id", NULL::character varying, NULL::bigint));



CREATE POLICY "Allow org admin to update" ON "public"."org_users" FOR UPDATE TO "authenticated", "anon" USING ("public"."rbac_check_permission_request"("public"."rbac_perm_org_update_user_roles"(), "org_id", NULL::character varying, NULL::bigint)) WITH CHECK ("public"."rbac_check_permission_request"("public"."rbac_perm_org_update_user_roles"(), "org_id", NULL::character varying, NULL::bigint));



CREATE POLICY "Allow org delete for super_admin" ON "public"."orgs" FOR DELETE TO "authenticated", "anon" USING ("public"."rbac_check_permission_request"("public"."rbac_perm_org_delete"(), "id", NULL::character varying, NULL::bigint));



CREATE POLICY "Allow org member to insert devices" ON "public"."devices" FOR INSERT TO "authenticated", "anon" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."apps"
  WHERE ((("apps"."app_id")::"text" = ("devices"."app_id")::"text") AND "public"."rbac_check_permission_request"("public"."rbac_perm_app_manage_devices"(), "apps"."owner_org", "apps"."app_id", NULL::bigint)))));



CREATE POLICY "Allow org member to select devices" ON "public"."devices" FOR SELECT TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."apps"
  WHERE ((("apps"."app_id")::"text" = ("devices"."app_id")::"text") AND "public"."rbac_check_permission_request"("public"."rbac_perm_app_read_devices"(), "apps"."owner_org", "apps"."app_id", NULL::bigint)))));



CREATE POLICY "Allow org member to select stripe_info" ON "public"."stripe_info" FOR SELECT TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."orgs"
  WHERE ((("orgs"."customer_id")::"text" = ("stripe_info"."customer_id")::"text") AND "public"."rbac_check_permission_request"("public"."rbac_perm_org_read_billing"(), "orgs"."id", NULL::character varying, NULL::bigint)))));



CREATE POLICY "Allow org member to update devices" ON "public"."devices" FOR UPDATE TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."apps"
  WHERE ((("apps"."app_id")::"text" = ("devices"."app_id")::"text") AND "public"."rbac_check_permission_request"("public"."rbac_perm_app_manage_devices"(), "apps"."owner_org", "apps"."app_id", NULL::bigint))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."apps"
  WHERE ((("apps"."app_id")::"text" = ("devices"."app_id")::"text") AND "public"."rbac_check_permission_request"("public"."rbac_perm_app_manage_devices"(), "apps"."owner_org", "apps"."app_id", NULL::bigint)))));



CREATE POLICY "Allow org members to select build_logs" ON "public"."build_logs" FOR SELECT TO "authenticated", "anon" USING ("public"."rbac_check_permission_request"("public"."rbac_perm_app_read_logs"(), "org_id", "app_id", NULL::bigint));



CREATE POLICY "Allow org members to select build_requests" ON "public"."build_requests" FOR SELECT TO "authenticated", "anon" USING ("public"."rbac_check_permission_request"("public"."rbac_perm_app_read_logs"(), "owner_org", "app_id", NULL::bigint));



CREATE POLICY "Allow org members to select daily_build_time" ON "public"."daily_build_time" FOR SELECT TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."apps"
  WHERE ((("apps"."app_id")::"text" = ("daily_build_time"."app_id")::"text") AND "public"."rbac_check_permission_request"("public"."rbac_perm_app_read"(), "apps"."owner_org", "apps"."app_id", NULL::bigint)))));



CREATE POLICY "Allow org members to select usage_credit_consumptions" ON "public"."usage_credit_consumptions" FOR SELECT TO "authenticated", "anon" USING (("org_id" = ANY (COALESCE(( SELECT "public"."usage_credit_readable_org_ids"() AS "usage_credit_readable_org_ids"), '{}'::"uuid"[]))));



CREATE POLICY "Allow org members to select usage_credit_grants" ON "public"."usage_credit_grants" FOR SELECT TO "authenticated", "anon" USING (("org_id" = ANY (COALESCE(( SELECT "public"."usage_credit_readable_org_ids"() AS "usage_credit_readable_org_ids"), '{}'::"uuid"[]))));



CREATE POLICY "Allow org members to select usage_credit_transactions" ON "public"."usage_credit_transactions" FOR SELECT TO "authenticated", "anon" USING (("org_id" = ANY (COALESCE(( SELECT "public"."usage_credit_readable_org_ids"() AS "usage_credit_readable_org_ids"), '{}'::"uuid"[]))));



CREATE POLICY "Allow org members to select usage_overage_events" ON "public"."usage_overage_events" FOR SELECT TO "authenticated", "anon" USING (("org_id" = ANY (COALESCE(( SELECT "public"."usage_credit_readable_org_ids"() AS "usage_credit_readable_org_ids"), '{}'::"uuid"[]))));



CREATE POLICY "Allow org settings update via RBAC" ON "public"."orgs" FOR UPDATE TO "authenticated", "anon" USING ("public"."rbac_check_permission_request"("public"."rbac_perm_org_update_settings"(), "id", NULL::character varying, NULL::bigint)) WITH CHECK (("public"."rbac_check_permission_request"("public"."rbac_perm_org_update_settings"(), "id", NULL::character varying, NULL::bigint) AND (("enforcing_2fa" IS NOT TRUE) OR "public"."has_2fa_enabled"())));



CREATE POLICY "Allow owner to delete own apikeys" ON "public"."apikeys" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Allow owner to insert own users" ON "public"."users" FOR INSERT TO "authenticated" WITH CHECK ((("id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "public"."is_not_deleted"("users"."email") AS "is_not_deleted")));



CREATE POLICY "Allow owner to select own apikeys" ON "public"."apikeys" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Allow owner to select own user" ON "public"."users" FOR SELECT TO "authenticated" USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "public"."is_not_deleted"("users"."email") AS "is_not_deleted")));



CREATE POLICY "Allow owner to update own users" ON "public"."users" FOR UPDATE TO "authenticated" USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "public"."is_not_deleted"("users"."email") AS "is_not_deleted"))) WITH CHECK ((("id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "public"."is_not_deleted"("users"."email") AS "is_not_deleted")));



CREATE POLICY "Allow select via RBAC" ON "public"."audit_logs" FOR SELECT TO "authenticated", "anon" USING (("org_id" = ANY (COALESCE(( SELECT "public"."audit_logs_allowed_orgs"() AS "audit_logs_allowed_orgs"), '{}'::"uuid"[]))));



CREATE POLICY "Allow service_role full access" ON "public"."usage_credit_consumptions" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Allow service_role full access" ON "public"."usage_credit_grants" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Allow service_role full access" ON "public"."usage_credit_transactions" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Allow service_role full access" ON "public"."usage_overage_events" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Allow service_role full access to webhook_deliveries" ON "public"."webhook_deliveries" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Allow service_role full access to webhooks" ON "public"."webhooks" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Allow to self delete" ON "public"."org_users" FOR DELETE TO "authenticated", "anon" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."rbac_check_permission_request"("public"."rbac_perm_org_update_user_roles"(), "org_id", NULL::character varying, NULL::bigint)));



CREATE POLICY "Allow users to view deploy history for their org" ON "public"."deploy_history" FOR SELECT TO "authenticated" USING (( SELECT (( SELECT "auth"."uid"() AS "uid") IN ( SELECT "org_users"."user_id"
           FROM "public"."org_users"
          WHERE ("org_users"."org_id" = "deploy_history"."owner_org")))));



CREATE POLICY "Anyone can read capgo_credits_steps" ON "public"."capgo_credits_steps" FOR SELECT USING (true);



CREATE POLICY "Deny all" ON "public"."app_metrics_cache" USING (false) WITH CHECK (false);



CREATE POLICY "Deny all" ON "public"."org_metrics_cache" USING (false) WITH CHECK (false);



CREATE POLICY "Deny all access" ON "public"."cron_tasks" USING (false) WITH CHECK (false);



CREATE POLICY "Deny all access" ON "public"."daily_revenue_metrics" USING (false) WITH CHECK (false);



CREATE POLICY "Deny all access" ON "public"."processed_stripe_events" USING (false) WITH CHECK (false);



CREATE POLICY "Deny all access" ON "public"."to_delete_accounts" USING (false) WITH CHECK (false);



CREATE POLICY "Deny client insert on apikeys" ON "public"."apikeys" AS RESTRICTIVE FOR INSERT TO "authenticated", "anon" WITH CHECK (false);



CREATE POLICY "Deny client update on apikeys" ON "public"."apikeys" AS RESTRICTIVE FOR UPDATE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Deny anon select on apikeys" ON "public"."apikeys" AS RESTRICTIVE FOR SELECT TO "anon" USING (false);



CREATE POLICY "Deny anon delete on apikeys" ON "public"."apikeys" AS RESTRICTIVE FOR DELETE TO "anon" USING (false);



CREATE POLICY "Deny delete for org members" ON "public"."usage_credit_consumptions" AS RESTRICTIVE FOR DELETE TO "authenticated", "anon" USING (false);



CREATE POLICY "Deny delete for org members" ON "public"."usage_credit_grants" AS RESTRICTIVE FOR DELETE TO "authenticated", "anon" USING (false);



CREATE POLICY "Deny delete for org members" ON "public"."usage_credit_transactions" AS RESTRICTIVE FOR DELETE TO "authenticated", "anon" USING (false);



CREATE POLICY "Deny delete for org members" ON "public"."usage_overage_events" AS RESTRICTIVE FOR DELETE TO "authenticated", "anon" USING (false);



CREATE POLICY "Deny delete on apikey_global_permissions" ON "public"."apikey_global_permissions" AS RESTRICTIVE FOR DELETE TO "authenticated", "anon" USING (false);



CREATE POLICY "Deny delete on daily_storage_hourly" ON "public"."daily_storage_hourly" AS RESTRICTIVE FOR DELETE TO "authenticated", "anon" USING (false);



CREATE POLICY "Deny delete on deploy history" ON "public"."deploy_history" FOR DELETE USING (false);



CREATE POLICY "Deny insert for org members" ON "public"."usage_credit_consumptions" AS RESTRICTIVE FOR INSERT TO "authenticated", "anon" WITH CHECK (false);



CREATE POLICY "Deny insert for org members" ON "public"."usage_credit_grants" AS RESTRICTIVE FOR INSERT TO "authenticated", "anon" WITH CHECK (false);



CREATE POLICY "Deny insert for org members" ON "public"."usage_credit_transactions" AS RESTRICTIVE FOR INSERT TO "authenticated", "anon" WITH CHECK (false);



CREATE POLICY "Deny insert for org members" ON "public"."usage_overage_events" AS RESTRICTIVE FOR INSERT TO "authenticated", "anon" WITH CHECK (false);



CREATE POLICY "Deny insert on apikey_global_permissions" ON "public"."apikey_global_permissions" AS RESTRICTIVE FOR INSERT TO "authenticated", "anon" WITH CHECK (false);



CREATE POLICY "Deny insert on daily_storage_hourly" ON "public"."daily_storage_hourly" AS RESTRICTIVE FOR INSERT TO "authenticated", "anon" WITH CHECK (false);



CREATE POLICY "Deny insert via RBAC" ON "public"."deploy_history" FOR INSERT WITH CHECK (false);



CREATE POLICY "Deny select on apikey_global_permissions" ON "public"."apikey_global_permissions" AS RESTRICTIVE FOR SELECT TO "authenticated", "anon" USING (false);



CREATE POLICY "Deny update for org members" ON "public"."usage_credit_consumptions" AS RESTRICTIVE FOR UPDATE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Deny update for org members" ON "public"."usage_credit_grants" AS RESTRICTIVE FOR UPDATE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Deny update for org members" ON "public"."usage_credit_transactions" AS RESTRICTIVE FOR UPDATE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Deny update for org members" ON "public"."usage_overage_events" AS RESTRICTIVE FOR UPDATE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Deny update on apikey_global_permissions" ON "public"."apikey_global_permissions" AS RESTRICTIVE FOR UPDATE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Deny update on daily_storage_hourly" ON "public"."daily_storage_hourly" AS RESTRICTIVE FOR UPDATE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Deny user access to onboarding demo data" ON "public"."onboarding_demo_data" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "Disable for all" ON "public"."bandwidth_usage" USING (false) WITH CHECK (false);



CREATE POLICY "Disable for all" ON "public"."device_usage" USING (false) WITH CHECK (false);



CREATE POLICY "Disable for all" ON "public"."notifications" USING (false) WITH CHECK (false);



CREATE POLICY "Disable for all" ON "public"."storage_usage" USING (false) WITH CHECK (false);



CREATE POLICY "Disable for all" ON "public"."tmp_users" USING (false) WITH CHECK (false);



CREATE POLICY "Disable for all" ON "public"."version_meta" USING (false) WITH CHECK (false);



CREATE POLICY "Disable for all" ON "public"."version_usage" USING (false) WITH CHECK (false);



CREATE POLICY "Disallow owner to delete own users" ON "public"."users" FOR DELETE TO "authenticated", "anon" USING (false);



CREATE POLICY "Enable select for anyone" ON "public"."plans" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Enable update for users based on email" ON "public"."deleted_account" TO "authenticated" WITH CHECK (("encode"("extensions"."digest"(( SELECT "auth"."email"() AS "email"), 'sha256'::"text"), 'hex'::"text") = ("email")::"text"));



CREATE POLICY "Prevent non 2FA access" ON "public"."apikeys" AS RESTRICTIVE TO "authenticated" USING ("public"."verify_mfa"());



CREATE POLICY "Prevent non 2FA access" ON "public"."app_versions" AS RESTRICTIVE TO "authenticated" USING ("public"."verify_mfa"());



CREATE POLICY "Prevent non 2FA access" ON "public"."apps" AS RESTRICTIVE TO "authenticated" USING ("public"."verify_mfa"());



CREATE POLICY "Prevent non 2FA access" ON "public"."channel_devices" AS RESTRICTIVE TO "authenticated" USING ("public"."verify_mfa"());



CREATE POLICY "Prevent non 2FA access" ON "public"."channels" AS RESTRICTIVE TO "authenticated" USING ("public"."verify_mfa"());



CREATE POLICY "Prevent non 2FA access" ON "public"."org_users" AS RESTRICTIVE TO "authenticated" USING ("public"."verify_mfa"());



CREATE POLICY "Prevent non 2FA access" ON "public"."orgs" AS RESTRICTIVE TO "authenticated" USING ("public"."verify_mfa"());



CREATE POLICY "Prevent update on deploy history" ON "public"."deploy_history" FOR UPDATE USING (false) WITH CHECK (false);



CREATE POLICY "Prevent users from deleting manifest entries" ON "public"."manifest" AS RESTRICTIVE FOR DELETE TO "authenticated", "anon" USING (false);



CREATE POLICY "Prevent users from inserting manifest entries" ON "public"."manifest" AS RESTRICTIVE FOR INSERT TO "authenticated", "anon" WITH CHECK (false);



CREATE POLICY "Prevent users from updating manifest entries" ON "public"."manifest" AS RESTRICTIVE FOR UPDATE TO "anon", "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "Service role manages build logs" ON "public"."build_logs" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role manages build requests" ON "public"."build_requests" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role manages build time" ON "public"."daily_build_time" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Users can read own password compliance" ON "public"."user_password_compliance" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "allow_org_admins_insert_sso_providers" ON "public"."sso_providers" FOR INSERT TO "authenticated", "anon" WITH CHECK ("public"."rbac_check_permission_request"("public"."rbac_perm_org_update_settings"(), "org_id", NULL::character varying, NULL::bigint));



CREATE POLICY "allow_org_admins_select_sso_providers" ON "public"."sso_providers" FOR SELECT TO "authenticated", "anon" USING ("public"."rbac_check_permission_request"("public"."rbac_perm_org_update_settings"(), "org_id", NULL::character varying, NULL::bigint));



CREATE POLICY "allow_org_admins_update_sso_providers" ON "public"."sso_providers" FOR UPDATE TO "authenticated", "anon" USING ("public"."rbac_check_permission_request"("public"."rbac_perm_org_update_settings"(), "org_id", NULL::character varying, NULL::bigint)) WITH CHECK ("public"."rbac_check_permission_request"("public"."rbac_perm_org_update_settings"(), "org_id", NULL::character varying, NULL::bigint));



CREATE POLICY "allow_org_super_admins_delete_sso_providers" ON "public"."sso_providers" FOR DELETE TO "authenticated", "anon" USING ("public"."rbac_check_permission_request"("public"."rbac_perm_org_update_user_roles"(), "org_id", NULL::character varying, NULL::bigint));



ALTER TABLE "public"."apikey_global_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."apikeys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_metrics_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_versions_meta" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."apps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bandwidth_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."build_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."build_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."capgo_credits_steps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."channel_devices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."channel_permission_overrides" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "channel_permission_overrides_admin_delete" ON "public"."channel_permission_overrides" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."channels"
     JOIN "public"."apps" ON ((("channels"."app_id")::"text" = ("apps"."app_id")::"text")))
  WHERE (("channels"."id" = "channel_permission_overrides"."channel_id") AND "public"."rbac_check_permission"("public"."rbac_perm_app_update_user_roles"(), "apps"."owner_org", "apps"."app_id", NULL::bigint)))));



COMMENT ON POLICY "channel_permission_overrides_admin_delete" ON "public"."channel_permission_overrides" IS 'Authenticated app admins can delete channel permission overrides.';



CREATE POLICY "channel_permission_overrides_admin_insert" ON "public"."channel_permission_overrides" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."channels"
     JOIN "public"."apps" ON ((("channels"."app_id")::"text" = ("apps"."app_id")::"text")))
  WHERE (("channels"."id" = "channel_permission_overrides"."channel_id") AND "public"."rbac_check_permission"("public"."rbac_perm_app_update_user_roles"(), "apps"."owner_org", "apps"."app_id", NULL::bigint)))));



COMMENT ON POLICY "channel_permission_overrides_admin_insert" ON "public"."channel_permission_overrides" IS 'Authenticated app admins can insert channel permission overrides.';



CREATE POLICY "channel_permission_overrides_admin_select" ON "public"."channel_permission_overrides" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."channels"
     JOIN "public"."apps" ON ((("channels"."app_id")::"text" = ("apps"."app_id")::"text")))
  WHERE (("channels"."id" = "channel_permission_overrides"."channel_id") AND "public"."rbac_check_permission"("public"."rbac_perm_app_update_user_roles"(), "apps"."owner_org", "apps"."app_id", NULL::bigint)))));



COMMENT ON POLICY "channel_permission_overrides_admin_select" ON "public"."channel_permission_overrides" IS 'Authenticated app admins can read channel permission overrides. Single SELECT policy to avoid multiple permissive policies.';



CREATE POLICY "channel_permission_overrides_admin_update" ON "public"."channel_permission_overrides" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."channels"
     JOIN "public"."apps" ON ((("channels"."app_id")::"text" = ("apps"."app_id")::"text")))
  WHERE (("channels"."id" = "channel_permission_overrides"."channel_id") AND "public"."rbac_check_permission"("public"."rbac_perm_app_update_user_roles"(), "apps"."owner_org", "apps"."app_id", NULL::bigint))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."channels"
     JOIN "public"."apps" ON ((("channels"."app_id")::"text" = ("apps"."app_id")::"text")))
  WHERE (("channels"."id" = "channel_permission_overrides"."channel_id") AND "public"."rbac_check_permission"("public"."rbac_perm_app_update_user_roles"(), "apps"."owner_org", "apps"."app_id", NULL::bigint)))));



COMMENT ON POLICY "channel_permission_overrides_admin_update" ON "public"."channel_permission_overrides" IS 'Authenticated app admins can update channel permission overrides.';



ALTER TABLE "public"."channels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."compatibility_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "compatibility_events_deny_delete" ON "public"."compatibility_events" AS RESTRICTIVE FOR DELETE TO "anon", "authenticated" USING (false);



CREATE POLICY "compatibility_events_deny_insert" ON "public"."compatibility_events" AS RESTRICTIVE FOR INSERT TO "anon", "authenticated" WITH CHECK (false);



CREATE POLICY "compatibility_events_deny_update" ON "public"."compatibility_events" AS RESTRICTIVE FOR UPDATE TO "anon", "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "compatibility_events_select" ON "public"."compatibility_events" FOR SELECT TO "authenticated" USING ("public"."rbac_check_permission"("public"."rbac_perm_app_read"(), "org_id", ("app_id")::character varying, NULL::bigint));



ALTER TABLE "public"."cron_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_bandwidth" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_build_time" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_mau" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_revenue_metrics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_storage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_storage_hourly" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_version" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deleted_account" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deleted_apps" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "deny_all_access" ON "public"."deleted_apps" USING (false) WITH CHECK (false);



CREATE POLICY "deny_direct_delete_on_webhook_deliveries" ON "public"."webhook_deliveries" AS RESTRICTIVE FOR DELETE TO "authenticated", "anon" USING (false);



CREATE POLICY "deny_direct_delete_on_webhooks" ON "public"."webhooks" AS RESTRICTIVE FOR DELETE TO "authenticated", "anon" USING (false);



CREATE POLICY "deny_direct_insert_on_webhook_deliveries" ON "public"."webhook_deliveries" AS RESTRICTIVE FOR INSERT TO "authenticated", "anon" WITH CHECK (false);



CREATE POLICY "deny_direct_insert_on_webhooks" ON "public"."webhooks" AS RESTRICTIVE FOR INSERT TO "authenticated", "anon" WITH CHECK (false);



CREATE POLICY "deny_direct_select_on_webhook_deliveries" ON "public"."webhook_deliveries" AS RESTRICTIVE FOR SELECT TO "authenticated", "anon" USING (false);



CREATE POLICY "deny_direct_select_on_webhooks" ON "public"."webhooks" AS RESTRICTIVE FOR SELECT TO "authenticated", "anon" USING (false);



CREATE POLICY "deny_direct_update_on_webhook_deliveries" ON "public"."webhook_deliveries" AS RESTRICTIVE FOR UPDATE TO "authenticated", "anon" USING (false) WITH CHECK (false);



CREATE POLICY "deny_direct_update_on_webhooks" ON "public"."webhooks" AS RESTRICTIVE FOR UPDATE TO "authenticated", "anon" USING (false) WITH CHECK (false);



ALTER TABLE "public"."deploy_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."device_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."devices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."global_stats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."group_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "group_members_delete" ON "public"."group_members" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."groups"
  WHERE (("groups"."id" = "group_members"."group_id") AND "public"."rbac_check_permission_request"("public"."rbac_perm_org_update_user_roles"(), "groups"."org_id", NULL::character varying, NULL::bigint)))));



CREATE POLICY "group_members_insert" ON "public"."group_members" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."groups"
  WHERE (("groups"."id" = "group_members"."group_id") AND "public"."rbac_check_permission_request"("public"."rbac_perm_org_update_user_roles"(), "groups"."org_id", NULL::character varying, NULL::bigint)))));



CREATE POLICY "group_members_select" ON "public"."group_members" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ( SELECT "auth"."uid"() AS "current_uid") "actor_ref"
  WHERE (EXISTS ( SELECT 1
           FROM ("public"."groups"
             JOIN "public"."org_users" ON (("groups"."org_id" = "org_users"."org_id")))
          WHERE (("groups"."id" = "group_members"."group_id") AND ("org_users"."user_id" = "actor_ref"."current_uid")))))));



CREATE POLICY "group_members_update" ON "public"."group_members" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."groups"
  WHERE (("groups"."id" = "group_members"."group_id") AND "public"."rbac_check_permission_request"("public"."rbac_perm_org_update_user_roles"(), "groups"."org_id", NULL::character varying, NULL::bigint)))));



ALTER TABLE "public"."groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "groups_delete" ON "public"."groups" FOR DELETE TO "authenticated" USING ("public"."rbac_check_permission_request"("public"."rbac_perm_org_update_user_roles"(), "org_id", NULL::character varying, NULL::bigint));



CREATE POLICY "groups_insert" ON "public"."groups" FOR INSERT TO "authenticated" WITH CHECK ("public"."rbac_check_permission_request"("public"."rbac_perm_org_update_user_roles"(), "org_id", NULL::character varying, NULL::bigint));



CREATE POLICY "groups_select" ON "public"."groups" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ( SELECT "auth"."uid"() AS "current_uid") "actor_ref"
  WHERE (EXISTS ( SELECT 1
           FROM "public"."org_users"
          WHERE (("org_users"."org_id" = "groups"."org_id") AND ("org_users"."user_id" = "actor_ref"."current_uid")))))));



CREATE POLICY "groups_update" ON "public"."groups" FOR UPDATE TO "authenticated" USING ("public"."rbac_check_permission_request"("public"."rbac_perm_org_update_user_roles"(), "org_id", NULL::character varying, NULL::bigint));



ALTER TABLE "public"."manifest" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."onboarding_demo_data" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."org_metrics_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."org_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orgs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "permissions_delete" ON "public"."permissions" FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "permissions_insert" ON "public"."permissions" FOR INSERT TO "authenticated" WITH CHECK (false);



CREATE POLICY "permissions_select" ON "public"."permissions" FOR SELECT TO "authenticated" USING (true);



COMMENT ON POLICY "permissions_select" ON "public"."permissions" IS 'All authenticated users can read permissions. Single SELECT policy to avoid multiple permissive policies.';



CREATE POLICY "permissions_update" ON "public"."permissions" FOR UPDATE TO "authenticated" USING (false);



ALTER TABLE "public"."plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."processed_stripe_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."role_bindings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "role_bindings_delete" ON "public"."role_bindings" FOR DELETE TO "authenticated" USING (((("scope_type" = "public"."rbac_scope_org"()) AND "public"."rbac_check_permission_request"("public"."rbac_perm_org_update_user_roles"(), "org_id", NULL::character varying, NULL::bigint)) OR (("scope_type" = "public"."rbac_scope_app"()) AND (EXISTS ( SELECT 1
   FROM "public"."apps"
  WHERE (("apps"."id" = "role_bindings"."app_id") AND "public"."rbac_check_permission_request"("public"."rbac_perm_app_update_user_roles"(), "apps"."owner_org", "apps"."app_id", NULL::bigint))))) OR (("scope_type" = "public"."rbac_scope_channel"()) AND (EXISTS ( SELECT 1
   FROM "public"."channels"
  WHERE (("channels"."rbac_id" = "role_bindings"."channel_id") AND "public"."rbac_check_permission_request"("public"."rbac_perm_app_update_user_roles"(), "channels"."owner_org", "channels"."app_id", "channels"."id")))))));



CREATE POLICY "role_bindings_insert" ON "public"."role_bindings" FOR INSERT TO "authenticated" WITH CHECK (((("scope_type" = "public"."rbac_scope_org"()) AND "public"."rbac_check_permission_request"("public"."rbac_perm_org_update_user_roles"(), "org_id", NULL::character varying, NULL::bigint)) OR (("scope_type" = "public"."rbac_scope_app"()) AND (EXISTS ( SELECT 1
   FROM "public"."apps"
  WHERE (("apps"."id" = "role_bindings"."app_id") AND "public"."rbac_check_permission_request"("public"."rbac_perm_app_update_user_roles"(), "apps"."owner_org", "apps"."app_id", NULL::bigint))))) OR (("scope_type" = "public"."rbac_scope_channel"()) AND (EXISTS ( SELECT 1
   FROM "public"."channels"
  WHERE (("channels"."rbac_id" = "role_bindings"."channel_id") AND "public"."rbac_check_permission_request"("public"."rbac_perm_app_update_user_roles"(), "channels"."owner_org", "channels"."app_id", "channels"."id")))))));



CREATE POLICY "role_bindings_select" ON "public"."role_bindings" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ( SELECT "auth"."uid"() AS "current_uid") "actor_ref"
  WHERE ("public"."is_user_org_admin"("actor_ref"."current_uid", "role_bindings"."org_id") OR (("role_bindings"."scope_type" = "public"."rbac_scope_app"()) AND "public"."is_user_app_admin"("actor_ref"."current_uid", "role_bindings"."app_id")) OR (("role_bindings"."scope_type" = "public"."rbac_scope_app"()) AND ("role_bindings"."app_id" IS NOT NULL) AND "public"."user_has_role_in_app"("actor_ref"."current_uid", "role_bindings"."app_id")) OR (("role_bindings"."scope_type" = "public"."rbac_scope_channel"()) AND ("role_bindings"."channel_id" IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM ("public"."channels" "c"
             JOIN "public"."apps" "a" ON ((("c"."app_id")::"text" = ("a"."app_id")::"text")))
          WHERE (("c"."rbac_id" = "role_bindings"."channel_id") AND "public"."is_user_app_admin"("actor_ref"."current_uid", "a"."id")))))))));



CREATE POLICY "role_bindings_update" ON "public"."role_bindings" FOR UPDATE TO "authenticated" USING (((("scope_type" = "public"."rbac_scope_org"()) AND "public"."rbac_check_permission_request"("public"."rbac_perm_org_update_user_roles"(), "org_id", NULL::character varying, NULL::bigint)) OR (("scope_type" = "public"."rbac_scope_app"()) AND (EXISTS ( SELECT 1
   FROM "public"."apps"
  WHERE (("apps"."id" = "role_bindings"."app_id") AND "public"."rbac_check_permission_request"("public"."rbac_perm_app_update_user_roles"(), "apps"."owner_org", "apps"."app_id", NULL::bigint))))) OR (("scope_type" = "public"."rbac_scope_channel"()) AND (EXISTS ( SELECT 1
   FROM "public"."channels"
  WHERE (("channels"."rbac_id" = "role_bindings"."channel_id") AND "public"."rbac_check_permission_request"("public"."rbac_perm_app_update_user_roles"(), "channels"."owner_org", "channels"."app_id", "channels"."id")))))));



ALTER TABLE "public"."role_hierarchy" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "role_hierarchy_delete" ON "public"."role_hierarchy" FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "role_hierarchy_insert" ON "public"."role_hierarchy" FOR INSERT TO "authenticated" WITH CHECK (false);



CREATE POLICY "role_hierarchy_select" ON "public"."role_hierarchy" FOR SELECT TO "authenticated" USING (true);



COMMENT ON POLICY "role_hierarchy_select" ON "public"."role_hierarchy" IS 'All authenticated users can read role_hierarchy. Single SELECT policy to avoid multiple permissive policies.';



CREATE POLICY "role_hierarchy_update" ON "public"."role_hierarchy" FOR UPDATE TO "authenticated" USING (false);



ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "role_permissions_delete" ON "public"."role_permissions" FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "role_permissions_insert" ON "public"."role_permissions" FOR INSERT TO "authenticated" WITH CHECK (false);



CREATE POLICY "role_permissions_select" ON "public"."role_permissions" FOR SELECT TO "authenticated" USING (true);



COMMENT ON POLICY "role_permissions_select" ON "public"."role_permissions" IS 'All authenticated users can read role_permissions. Single SELECT policy to avoid multiple permissive policies.';



CREATE POLICY "role_permissions_update" ON "public"."role_permissions" FOR UPDATE TO "authenticated" USING (false);



ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "roles_delete" ON "public"."roles" FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "roles_insert" ON "public"."roles" FOR INSERT TO "authenticated" WITH CHECK (false);



CREATE POLICY "roles_select" ON "public"."roles" FOR SELECT TO "authenticated" USING (true);



COMMENT ON POLICY "roles_select" ON "public"."roles" IS 'All authenticated users can read roles. Single SELECT policy to avoid multiple permissive policies.';



CREATE POLICY "roles_update" ON "public"."roles" FOR UPDATE TO "authenticated" USING (false);



ALTER TABLE "public"."sso_providers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."storage_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stripe_info" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tmp_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."to_delete_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."usage_credit_consumptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."usage_credit_grants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."usage_credit_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."usage_overage_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_password_compliance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_security" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_can_read_own_security_status" ON "public"."user_security" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."version_meta" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."version_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."webhook_deliveries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."webhooks" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "capgo_private" TO "anon";
GRANT USAGE ON SCHEMA "capgo_private" TO "authenticated";
GRANT USAGE ON SCHEMA "capgo_private" TO "service_role";



REVOKE USAGE ON SCHEMA "public" FROM PUBLIC;
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "capgo_private"."matches_app_storage_rbac_owner"("folder_user_id" "text", "target_app_id" character varying, "permission_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "capgo_private"."matches_app_storage_rbac_owner"("folder_user_id" "text", "target_app_id" character varying, "permission_key" "text") TO "anon";
GRANT ALL ON FUNCTION "capgo_private"."matches_app_storage_rbac_owner"("folder_user_id" "text", "target_app_id" character varying, "permission_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "capgo_private"."matches_app_storage_rbac_owner"("folder_user_id" "text", "target_app_id" character varying, "permission_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."accept_invitation_to_org"("org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_invitation_to_org"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_invitation_to_org"("org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."acknowledge_compatibility_event"("event_id" bigint, "note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."acknowledge_compatibility_event"("event_id" bigint, "note" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."acknowledge_compatibility_event"("event_id" bigint, "note" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."aggregate_build_log_to_daily"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."apikey_has_current_org_create_capability"("p_apikey_rbac_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apikey_has_current_org_create_capability"("p_apikey_rbac_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."apikey_has_global_permission"("p_apikey" "text", "p_permission_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apikey_has_global_permission"("p_apikey" "text", "p_permission_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."apikeys_force_server_key"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apikeys_force_server_key"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."apikeys_strip_plain_key_for_hashed"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apikeys_strip_plain_key_for_hashed"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."app_versions_readable_app_ids"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."app_versions_readable_app_ids"() TO "service_role";
GRANT ALL ON FUNCTION "public"."app_versions_readable_app_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."app_versions_readable_app_ids"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."apply_usage_overage"("p_org_id" "uuid", "p_metric" "public"."credit_metric_type", "p_overage_amount" numeric, "p_billing_cycle_start" timestamp with time zone, "p_billing_cycle_end" timestamp with time zone, "p_details" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_usage_overage"("p_org_id" "uuid", "p_metric" "public"."credit_metric_type", "p_overage_amount" numeric, "p_billing_cycle_start" timestamp with time zone, "p_billing_cycle_end" timestamp with time zone, "p_details" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."audit_log_trigger"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."audit_log_trigger"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."audit_logs_allowed_orgs"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."audit_logs_allowed_orgs"() TO "service_role";
GRANT ALL ON FUNCTION "public"."audit_logs_allowed_orgs"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_logs_allowed_orgs"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."auto_apikey_name_by_id"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."auto_owner_org_by_app_id"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."bind_creating_apikey_to_org_on_create"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bind_creating_apikey_to_org_on_create"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."calculate_credit_cost"("p_metric" "public"."credit_metric_type", "p_overage_amount" numeric) FROM PUBLIC;



GRANT ALL ON TABLE "public"."org_metrics_cache" TO "anon";
GRANT ALL ON TABLE "public"."org_metrics_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."org_metrics_cache" TO "service_role";



REVOKE ALL ON FUNCTION "public"."calculate_org_metrics_cache_entry"("p_org_id" "uuid", "p_start_date" "date", "p_end_date" "date") FROM PUBLIC;



GRANT ALL ON TABLE "public"."apikeys" TO "anon";
GRANT ALL ON TABLE "public"."apikeys" TO "authenticated";
GRANT ALL ON TABLE "public"."apikeys" TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_apikey_hashed_key_enforcement"("apikey_row" "public"."apikeys") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_apikey_hashed_key_enforcement"("apikey_row" "public"."apikeys") TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_domain_sso"("p_domain" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_domain_sso"("p_domain" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."check_domain_sso"("p_domain" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_domain_sso"("p_domain" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."check_encrypted_bundle_on_insert"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_encrypted_bundle_on_insert"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_if_org_can_exist"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_if_org_can_exist"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_org_encrypted_bundle_enforcement"("org_id" "uuid", "session_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_org_encrypted_bundle_enforcement"("org_id" "uuid", "session_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_org_encrypted_bundle_enforcement"("org_id" "uuid", "session_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_org_hashed_key_enforcement"("org_id" "uuid", "apikey_row" "public"."apikeys") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_org_hashed_key_enforcement"("org_id" "uuid", "apikey_row" "public"."apikeys") TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_org_members_2fa_enabled"("org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_org_members_2fa_enabled"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_org_members_2fa_enabled"("org_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."check_org_members_2fa_enabled"("org_id" "uuid") TO "anon";



REVOKE ALL ON FUNCTION "public"."check_org_members_password_policy"("org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_org_members_password_policy"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_org_members_password_policy"("org_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."check_org_members_password_policy"("org_id" "uuid") TO "anon";



REVOKE ALL ON FUNCTION "public"."check_org_user_privileges"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_org_user_privileges"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_revert_to_builtin_version"("appid" character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_revert_to_builtin_version"("appid" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."check_revert_to_builtin_version"("appid" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_revert_to_builtin_version"("appid" character varying) TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_legacy_onboarding_demo_data"("p_app_uuid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_legacy_onboarding_demo_data"("p_app_uuid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cleanup_apikey_role_bindings"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_apikey_role_bindings"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cleanup_expired_apikeys"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."cleanup_expired_demo_apps"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_expired_demo_apps"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cleanup_frequent_job_details"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."cleanup_job_run_details_7days"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."cleanup_old_audit_logs"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_old_audit_logs"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cleanup_old_channel_devices"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_old_channel_devices"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_old_channel_devices"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_old_channel_devices"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cleanup_onboarding_app_data_on_complete"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_onboarding_app_data_on_complete"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cleanup_queue_messages"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."cleanup_tmp_users"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_tmp_users"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cleanup_webhook_deliveries"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."clear_onboarding_app_data"("p_app_uuid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clear_onboarding_app_data"("p_app_uuid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."clear_onboarding_app_data"("p_app_uuid" "uuid", "p_preserve_app_version_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clear_onboarding_app_data"("p_app_uuid" "uuid", "p_preserve_app_version_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."cli_check_permission"("apikey" "text", "permission_key" "text", "org_id" "uuid", "app_id" "text", "channel_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cli_check_permission"("apikey" "text", "permission_key" "text", "org_id" "uuid", "app_id" "text", "channel_id" bigint) TO "service_role";
GRANT ALL ON FUNCTION "public"."cli_check_permission"("apikey" "text", "permission_key" "text", "org_id" "uuid", "app_id" "text", "channel_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."cli_check_permission"("apikey" "text", "permission_key" "text", "org_id" "uuid", "app_id" "text", "channel_id" bigint) TO "authenticated";



GRANT ALL ON FUNCTION "public"."convert_bytes_to_gb"("bytes_value" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."convert_bytes_to_gb"("bytes_value" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."convert_bytes_to_gb"("bytes_value" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."convert_bytes_to_mb"("bytes_value" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."convert_bytes_to_mb"("bytes_value" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."convert_bytes_to_mb"("bytes_value" double precision) TO "service_role";



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



REVOKE ALL ON FUNCTION "public"."count_non_compliant_bundles"("org_id" "uuid", "required_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."count_non_compliant_bundles"("org_id" "uuid", "required_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_non_compliant_bundles"("org_id" "uuid", "required_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."current_request_role"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_accounts_marked_for_deletion"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_accounts_marked_for_deletion"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_group_with_bindings"("group_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_group_with_bindings"("group_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."delete_group_with_bindings"("group_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."delete_http_response"("request_id" bigint) FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."delete_non_compliant_bundles"("org_id" "uuid", "required_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_non_compliant_bundles"("org_id" "uuid", "required_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_non_compliant_bundles"("org_id" "uuid", "required_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_old_deleted_apps"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."delete_old_deleted_versions"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_old_deleted_versions"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_org_member_role"("p_org_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_org_member_role"("p_org_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_org_member_role"("p_org_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_apikey_expiration_policy"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_apikey_expiration_policy"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_apikey_role_binding_expiration_policy"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_apikey_role_binding_expiration_policy"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_channel_version_promotion_permission"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_channel_version_promotion_permission"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_email_otp_for_mfa"() FROM PUBLIC;



GRANT ALL ON FUNCTION "public"."enforce_role_binding_role_scope"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enqueue_channel_device_counts"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."enqueue_credit_usage_alert"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."exist_app_v2"("appid" character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."exist_app_v2"("appid" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."exist_app_v2"("appid" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."exist_app_v2"("appid" character varying) TO "service_role";



REVOKE ALL ON FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying) TO "service_role";



REVOKE ALL ON FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."exist_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."expire_usage_credits"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."find_apikey_by_value"("key_value" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."find_apikey_by_value"("key_value" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."find_best_plan_v3"("mau" bigint, "bandwidth" double precision, "storage" double precision, "build_time_unit" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."find_best_plan_v3"("mau" bigint, "bandwidth" double precision, "storage" double precision, "build_time_unit" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_best_plan_v3"("mau" bigint, "bandwidth" double precision, "storage" double precision, "build_time_unit" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."find_fit_plan_v3"("mau" bigint, "bandwidth" bigint, "storage" bigint, "build_time_unit" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."find_fit_plan_v3"("mau" bigint, "bandwidth" bigint, "storage" bigint, "build_time_unit" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_fit_plan_v3"("mau" bigint, "bandwidth" bigint, "storage" bigint, "build_time_unit" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."force_valid_user_id_on_app"() FROM PUBLIC;



GRANT ALL ON FUNCTION "public"."generate_org_on_user_create"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."generate_org_user_stripe_info_on_org_create"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_org_user_stripe_info_on_org_create"() TO "service_role";



GRANT ALL ON TABLE "public"."apps" TO "anon";
GRANT ALL ON TABLE "public"."apps" TO "authenticated";
GRANT ALL ON TABLE "public"."apps" TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_accessible_apps_for_apikey_v2"("apikey" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_accessible_apps_for_apikey_v2"("apikey" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_accessible_apps_for_apikey_v2"("apikey" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_accessible_apps_for_apikey_v2"("apikey" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_account_removal_date"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_account_removal_date"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_account_removal_date"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_apikey"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_apikey"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_apikey_header"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_apikey_header"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_apikey_header"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_app_access_rbac"("p_app_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_app_access_rbac"("p_app_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_app_access_rbac"("p_app_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_app_metrics"("org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_app_metrics"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_app_metrics"("org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_app_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_app_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_app_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_app_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_app_metrics"("p_org_id" "uuid", "p_app_id" character varying, "p_start_date" "date", "p_end_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_app_metrics"("p_org_id" "uuid", "p_app_id" character varying, "p_start_date" "date", "p_end_date" "date") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_app_metrics"("p_org_id" "uuid", "p_app_id" character varying, "p_start_date" "date", "p_end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_app_metrics"("p_org_id" "uuid", "p_app_id" character varying, "p_start_date" "date", "p_end_date" "date") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_app_versions"("appid" character varying, "name_version" character varying, "apikey" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_current_plan_max_org"("orgid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_current_plan_max_org"("orgid" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_current_plan_max_org"("orgid" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_current_plan_name_org"("orgid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_current_plan_name_org"("orgid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_plan_name_org"("orgid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_customer_counts"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_customer_counts"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_cycle_info_org"("orgid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_cycle_info_org"("orgid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_cycle_info_org"("orgid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_db_url"() FROM PUBLIC;



GRANT ALL ON FUNCTION "public"."get_global_metrics"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_global_metrics"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_global_metrics"("org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_global_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_global_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_global_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_invite_by_magic_lookup"("lookup" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_invite_by_magic_lookup"("lookup" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_invite_by_magic_lookup"("lookup" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_invite_by_magic_lookup"("lookup" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_mfa_email_otp_enforced_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_next_cron_time"("p_schedule" "text", "p_timestamp" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_next_cron_time"("p_schedule" "text", "p_timestamp" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_next_cron_time"("p_schedule" "text", "p_timestamp" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_next_cron_value"("pattern" "text", "current_val" integer, "max_val" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_next_cron_value"("pattern" "text", "current_val" integer, "max_val" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_next_cron_value"("pattern" "text", "current_val" integer, "max_val" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_next_stats_update_date"("org" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_next_stats_update_date"("org" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_next_stats_update_date"("org" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_org_apikeys"("p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_org_apikeys"("p_org_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_org_apikeys"("p_org_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_org_apps_with_last_upload"("p_org_id" "uuid", "p_search" "text", "p_sort_by" "text", "p_sort_desc" boolean, "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_org_apps_with_last_upload"("p_org_id" "uuid", "p_search" "text", "p_sort_by" "text", "p_sort_desc" boolean, "p_limit" integer, "p_offset" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."get_org_apps_with_last_upload"("p_org_id" "uuid", "p_search" "text", "p_sort_by" "text", "p_sort_desc" boolean, "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_org_apps_with_last_upload"("p_org_id" "uuid", "p_search" "text", "p_sort_by" "text", "p_sort_desc" boolean, "p_limit" integer, "p_offset" integer) TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_org_build_time_unit"("p_org_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_org_build_time_unit"("p_org_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_org_build_time_unit"("p_org_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_org_members"("guild_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_org_members"("guild_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_org_members"("guild_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_org_members"("guild_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_org_members"("user_id" "uuid", "guild_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_org_members"("user_id" "uuid", "guild_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_org_members_rbac"("p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_org_members_rbac"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_org_members_rbac"("p_org_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_org_members_rbac"("p_org_id" "uuid") TO "anon";



REVOKE ALL ON FUNCTION "public"."get_org_user_access_rbac"("p_user_id" "uuid", "p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_org_user_access_rbac"("p_user_id" "uuid", "p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_org_user_access_rbac"("p_user_id" "uuid", "p_org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_organization_cli_warnings"("orgid" "uuid", "cli_version" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_organization_cli_warnings"("orgid" "uuid", "cli_version" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_organization_cli_warnings"("orgid" "uuid", "cli_version" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_organization_cli_warnings"("orgid" "uuid", "cli_version" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_orgs_v6"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_orgs_v6"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_orgs_v6"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_orgs_v6"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_orgs_v7"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_orgs_v7"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_orgs_v7"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_orgs_v7"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_orgs_v7"("userid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_orgs_v7"("userid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_owner_org_by_app_id_internal"("p_app_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_owner_org_by_app_id_internal"("p_app_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_password_policy_hash"("policy_config" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."get_password_policy_hash"("policy_config" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_password_policy_hash"("policy_config" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_plan_usage_and_fit"("orgid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_plan_usage_and_fit"("orgid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_plan_usage_and_fit_uncached"("orgid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_plan_usage_and_fit_uncached"("orgid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid", "cycle_start" "date", "cycle_end" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid", "cycle_start" "date", "cycle_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_plan_usage_percent_detailed"("orgid" "uuid", "cycle_start" "date", "cycle_end" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_sso_enforcement_by_domain"("p_domain" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_sso_enforcement_by_domain"("p_domain" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_sso_enforcement_by_domain"("p_domain" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_sso_enforcement_by_domain"("p_domain" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_total_app_storage_size_orgs"("org_id" "uuid", "app_id" character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_total_app_storage_size_orgs"("org_id" "uuid", "app_id" character varying) TO "service_role";
GRANT ALL ON FUNCTION "public"."get_total_app_storage_size_orgs"("org_id" "uuid", "app_id" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."get_total_app_storage_size_orgs"("org_id" "uuid", "app_id" character varying) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_total_metrics"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_total_metrics"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_total_metrics"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_total_metrics"("org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_total_metrics"("org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_total_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_total_metrics"("org_id" "uuid", "start_date" "date", "end_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_total_storage_size_org"("org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_total_storage_size_org"("org_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_total_storage_size_org"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_total_storage_size_org"("org_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_update_stats"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."get_user_id"("apikey" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_id"("apikey" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_id"("apikey" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_user_id"("apikey" "text", "app_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_id"("apikey" "text", "app_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_id"("apikey" "text", "app_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_user_main_org_id"("user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_main_org_id"("user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_user_main_org_id"("user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_user_main_org_id_by_app_id"("app_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_main_org_id_by_app_id"("app_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_main_org_id_by_app_id"("app_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_main_org_id_by_app_id"("app_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_user_org_ids"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_org_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_org_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_org_ids"() TO "service_role";



GRANT ALL ON TABLE "public"."app_versions" TO "anon";
GRANT ALL ON TABLE "public"."app_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."app_versions" TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_versions_with_no_metadata"() FROM PUBLIC;



GRANT ALL ON FUNCTION "public"."get_weekly_stats"("app_id" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."get_weekly_stats"("app_id" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_weekly_stats"("app_id" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_owner_org_reassignment"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_2fa_enabled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_2fa_enabled"() TO "anon";
GRANT ALL ON FUNCTION "public"."has_2fa_enabled"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_2fa_enabled"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_2fa_enabled"("user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_2fa_enabled"("user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_seeded_demo_data"("p_app_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_seeded_demo_data"("p_app_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."internal_request_db_user_names"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."internal_request_db_user_names"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."internal_request_role_names"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."internal_request_role_names"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."invite_user_to_org_rbac"("email" character varying, "org_id" "uuid", "role_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."invite_user_to_org_rbac"("email" character varying, "org_id" "uuid", "role_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."invite_user_to_org_rbac"("email" character varying, "org_id" "uuid", "role_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invite_user_to_org_rbac"("email" character varying, "org_id" "uuid", "role_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_account_disabled"("user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_account_disabled"("user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."is_account_disabled"("user_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."is_allowed_action"("apikey" "text", "appid" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_allowed_action"("apikey" "text", "appid" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_allowed_action"("apikey" "text", "appid" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_allowed_action_org"("orgid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_allowed_action_org"("orgid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_allowed_action_org"("orgid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_allowed_action_org"("orgid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_allowed_action_org_action"("orgid" "uuid", "actions" "public"."action_type"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_allowed_action_org_action"("orgid" "uuid", "actions" "public"."action_type"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."is_allowed_action_org_action"("orgid" "uuid", "actions" "public"."action_type"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_allowed_action_org_action"("orgid" "uuid", "actions" "public"."action_type"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_allowed_action_org_action"("orgid" "uuid", "actions" "public"."action_type"[], "appid" character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_allowed_action_org_action"("orgid" "uuid", "actions" "public"."action_type"[], "appid" character varying) TO "service_role";
GRANT ALL ON FUNCTION "public"."is_allowed_action_org_action"("orgid" "uuid", "actions" "public"."action_type"[], "appid" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."is_allowed_action_org_action"("orgid" "uuid", "actions" "public"."action_type"[], "appid" character varying) TO "authenticated";



GRANT ALL ON FUNCTION "public"."is_apikey_expired"("key_expires_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."is_apikey_expired"("key_expires_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_apikey_expired"("key_expires_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_app_owner"("appid" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."is_app_owner"("appid" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_app_owner"("appid" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_app_owner"("apikey" "text", "appid" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."is_app_owner"("apikey" "text", "appid" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_app_owner"("apikey" "text", "appid" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_app_owner"("userid" "uuid", "appid" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."is_app_owner"("userid" "uuid", "appid" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_app_owner"("userid" "uuid", "appid" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_bandwidth_exceeded_by_org"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_bandwidth_exceeded_by_org"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_bandwidth_exceeded_by_org"("org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_build_time_exceeded_by_org"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_build_time_exceeded_by_org"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_build_time_exceeded_by_org"("org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_bundle_encrypted"("session_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_bundle_encrypted"("session_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_bundle_encrypted"("session_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_canceled_org"("orgid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_canceled_org"("orgid" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."is_canceled_org"("orgid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_canceled_org"("orgid" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."is_good_plan_v5_org"("orgid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_good_plan_v5_org"("orgid" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."is_good_plan_v5_org"("orgid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_good_plan_v5_org"("orgid" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."is_internal_request_role"("caller_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_internal_request_role"("caller_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_mau_exceeded_by_org"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_mau_exceeded_by_org"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_mau_exceeded_by_org"("org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_member_of_org"("user_id" "uuid", "org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_member_of_org"("user_id" "uuid", "org_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."is_member_of_org"("user_id" "uuid", "org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_member_of_org"("user_id" "uuid", "org_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."is_not_deleted"("email_check" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."is_not_deleted"("email_check" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_not_deleted"("email_check" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_numeric"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_numeric"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_numeric"("text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_onboarded_org"("orgid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_onboarded_org"("orgid" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."is_onboarded_org"("orgid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_onboarded_org"("orgid" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."is_onboarding_needed_org"("orgid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_onboarding_needed_org"("orgid" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."is_onboarding_needed_org"("orgid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_onboarding_needed_org"("orgid" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."is_org_yearly"("orgid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_org_yearly"("orgid" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."is_org_yearly"("orgid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_yearly"("orgid" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."is_paying_and_good_plan_org"("orgid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_paying_and_good_plan_org"("orgid" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."is_paying_and_good_plan_org"("orgid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_paying_and_good_plan_org"("orgid" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."is_paying_and_good_plan_org_action"("orgid" "uuid", "actions" "public"."action_type"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_paying_and_good_plan_org_action"("orgid" "uuid", "actions" "public"."action_type"[]) TO "service_role";
GRANT ALL ON FUNCTION "public"."is_paying_and_good_plan_org_action"("orgid" "uuid", "actions" "public"."action_type"[]) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."is_paying_and_good_plan_org_action"("orgid" "uuid", "actions" "public"."action_type"[], "appid" character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_paying_and_good_plan_org_action"("orgid" "uuid", "actions" "public"."action_type"[], "appid" character varying) TO "service_role";
GRANT ALL ON FUNCTION "public"."is_paying_and_good_plan_org_action"("orgid" "uuid", "actions" "public"."action_type"[], "appid" character varying) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."is_paying_org"("orgid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_paying_org"("orgid" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."is_paying_org"("orgid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_paying_org"("orgid" "uuid") TO "anon";



REVOKE ALL ON FUNCTION "public"."is_platform_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "service_role";
GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."is_platform_admin"("userid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_platform_admin"("userid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_rbac_enabled_globally"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_recent_email_otp_verified"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_storage_exceeded_by_org"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_storage_exceeded_by_org"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_storage_exceeded_by_org"("org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_trial_org"("orgid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_trial_org"("orgid" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."is_trial_org"("orgid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_trial_org"("orgid" "uuid") TO "anon";



REVOKE ALL ON FUNCTION "public"."is_user_app_admin"("p_user_id" "uuid", "p_app_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_user_app_admin"("p_user_id" "uuid", "p_app_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_user_app_admin"("p_user_id" "uuid", "p_app_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_user_org_admin"("p_user_id" "uuid", "p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_user_org_admin"("p_user_id" "uuid", "p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_user_org_admin"("p_user_id" "uuid", "p_org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_app_stats_refreshed"("p_app_id" character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_app_stats_refreshed"("p_app_id" character varying) TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_org_delete_cascade"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_org_delete_cascade"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."mass_edit_queue_messages_cf_ids"("updates" "public"."message_update"[]) FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."normalize_public_channel_overlap"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."normalize_public_channel_overlap"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."normalize_sso_provider_domain"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."normalize_sso_provider_domain"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."noupdate"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."noupdate"() TO "service_role";



GRANT ALL ON FUNCTION "public"."one_month_ahead"() TO "anon";
GRANT ALL ON FUNCTION "public"."one_month_ahead"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."one_month_ahead"() TO "service_role";



GRANT ALL ON FUNCTION "public"."parse_cron_field"("field" "text", "current_val" integer, "max_val" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."parse_cron_field"("field" "text", "current_val" integer, "max_val" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."parse_cron_field"("field" "text", "current_val" integer, "max_val" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."parse_step_pattern"("pattern" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."parse_step_pattern"("pattern" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."parse_step_pattern"("pattern" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pg_log"("decision" "text", "input" "jsonb") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."prevent_last_super_admin_binding_delete"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_last_super_admin_binding_delete"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prevent_last_super_admin_binding_update"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_last_super_admin_binding_update"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_admin_stats"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."process_all_cron_tasks"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_all_cron_tasks"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_billing_period_stats_email"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."process_channel_device_counts_queue"("batch_size" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_channel_device_counts_queue"("batch_size" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_cron_stats_jobs"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_cron_stats_jobs"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_cron_sync_sub_jobs"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_cron_sync_sub_jobs"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_daily_fail_ratio_email"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_daily_fail_ratio_email"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_daily_fail_ratio_email"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_daily_fail_ratio_email"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_deploy_install_stats_email"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."process_failed_uploads"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."process_free_trial_expired"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."process_function_queue"("queue_names" "text"[], "batch_size" integer) FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."process_function_queue"("queue_name" "text", "batch_size" integer) FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."process_queue_with_healthcheck"("queue_names" "text"[], "batch_size" integer, "healthcheck_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_queue_with_healthcheck"("queue_names" "text"[], "batch_size" integer, "healthcheck_url" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_stats_email_monthly"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."process_stats_email_weekly"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."process_subscribed_orgs"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_subscribed_orgs"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."queue_cron_stat_app_for_app"("p_app_id" character varying, "p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."queue_cron_stat_app_for_app"("p_app_id" character varying, "p_org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."queue_cron_stat_org_for_org"("org_id" "uuid", "customer_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."queue_cron_stat_org_for_org"("org_id" "uuid", "customer_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rbac_check_permission"("p_permission_key" "text", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rbac_check_permission"("p_permission_key" "text", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_check_permission"("p_permission_key" "text", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."rbac_check_permission_direct"("p_permission_key" "text", "p_user_id" "uuid", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint, "p_apikey" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rbac_check_permission_direct"("p_permission_key" "text", "p_user_id" "uuid", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint, "p_apikey" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."rbac_check_permission_direct"("p_permission_key" "text", "p_user_id" "uuid", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint, "p_apikey" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."rbac_check_permission_direct_no_password_policy"("p_permission_key" "text", "p_user_id" "uuid", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint, "p_apikey" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rbac_check_permission_direct_no_password_policy"("p_permission_key" "text", "p_user_id" "uuid", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint, "p_apikey" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."rbac_check_permission_direct_no_password_policy"("p_permission_key" "text", "p_user_id" "uuid", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint, "p_apikey" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."rbac_check_permission_no_password_policy"("p_permission_key" "text", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rbac_check_permission_no_password_policy"("p_permission_key" "text", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_check_permission_no_password_policy"("p_permission_key" "text", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."rbac_check_permission_request"("p_permission_key" "text", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rbac_check_permission_request"("p_permission_key" "text", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint) TO "service_role";
GRANT ALL ON FUNCTION "public"."rbac_check_permission_request"("p_permission_key" "text", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_check_permission_request"("p_permission_key" "text", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."rbac_has_permission"("p_principal_type" "text", "p_principal_id" "uuid", "p_permission_key" "text", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rbac_has_permission"("p_principal_type" "text", "p_principal_id" "uuid", "p_permission_key" "text", "p_org_id" "uuid", "p_app_id" character varying, "p_channel_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_app_build_native"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_build_native"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_build_native"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_app_create_channel"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_create_channel"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_create_channel"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_app_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_app_manage_devices"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_manage_devices"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_manage_devices"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_app_read"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_read"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_read"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_app_read_audit"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_read_audit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_read_audit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_app_read_bundles"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_read_bundles"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_read_bundles"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_app_read_channels"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_read_channels"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_read_channels"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_app_read_devices"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_read_devices"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_read_devices"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_app_read_logs"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_read_logs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_read_logs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_app_transfer"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_transfer"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_transfer"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_app_update_settings"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_update_settings"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_update_settings"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_app_update_user_roles"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_update_user_roles"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_update_user_roles"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_app_upload_bundle"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_upload_bundle"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_app_upload_bundle"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_bundle_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_bundle_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_bundle_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_bundle_read"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_bundle_read"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_bundle_read"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_bundle_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_bundle_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_bundle_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_channel_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_channel_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_channel_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_channel_manage_forced_devices"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_channel_manage_forced_devices"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_channel_manage_forced_devices"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_channel_promote_bundle"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_channel_promote_bundle"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_channel_promote_bundle"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_channel_read"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_channel_read"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_channel_read"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_channel_read_audit"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_channel_read_audit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_channel_read_audit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_channel_read_forced_devices"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_channel_read_forced_devices"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_channel_read_forced_devices"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_channel_read_history"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_channel_read_history"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_channel_read_history"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_channel_rollback_bundle"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_channel_rollback_bundle"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_channel_rollback_bundle"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_channel_update_settings"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_channel_update_settings"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_channel_update_settings"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."rbac_perm_org_create"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rbac_perm_org_create"() TO "service_role";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_create"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_create"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."rbac_perm_org_create_app"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rbac_perm_org_create_app"() TO "service_role";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_create_app"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_create_app"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."rbac_perm_org_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_org_invite_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_invite_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_invite_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_org_read"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_read"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_read"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_org_read_audit"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_read_audit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_read_audit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_org_read_billing"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_read_billing"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_read_billing"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_org_read_billing_audit"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_read_billing_audit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_read_billing_audit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_org_read_invoices"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_read_invoices"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_read_invoices"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_org_read_members"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_read_members"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_read_members"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_org_update_billing"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_update_billing"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_update_billing"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_org_update_settings"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_update_settings"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_update_settings"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_org_update_user_roles"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_update_user_roles"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_org_update_user_roles"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_platform_db_break_glass"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_platform_db_break_glass"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_platform_db_break_glass"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_platform_delete_orphan_users"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_platform_delete_orphan_users"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_platform_delete_orphan_users"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_platform_impersonate_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_platform_impersonate_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_platform_impersonate_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_platform_manage_apps_any"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_platform_manage_apps_any"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_platform_manage_apps_any"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_platform_manage_channels_any"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_platform_manage_channels_any"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_platform_manage_channels_any"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_platform_manage_orgs_any"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_platform_manage_orgs_any"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_platform_manage_orgs_any"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_platform_read_all_audit"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_platform_read_all_audit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_platform_read_all_audit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_perm_platform_run_maintenance_jobs"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_perm_platform_run_maintenance_jobs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_perm_platform_run_maintenance_jobs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_principal_apikey"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_principal_apikey"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_principal_apikey"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_principal_group"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_principal_group"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_principal_group"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_principal_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_principal_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_principal_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."rbac_role_apikey_org_reader"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rbac_role_apikey_org_reader"() TO "service_role";
GRANT ALL ON FUNCTION "public"."rbac_role_apikey_org_reader"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_role_apikey_org_reader"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."rbac_role_app_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_role_app_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_role_app_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_role_app_developer"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_role_app_developer"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_role_app_developer"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_role_app_reader"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_role_app_reader"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_role_app_reader"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_role_app_uploader"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_role_app_uploader"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_role_app_uploader"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_role_bundle_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_role_bundle_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_role_bundle_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_role_bundle_reader"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_role_bundle_reader"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_role_bundle_reader"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_role_channel_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_role_channel_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_role_channel_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_role_channel_reader"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_role_channel_reader"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_role_channel_reader"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_role_org_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_role_org_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_role_org_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_role_org_billing_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_role_org_billing_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_role_org_billing_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_role_org_member"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_role_org_member"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_role_org_member"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_role_org_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_role_org_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_role_org_super_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_role_platform_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_role_platform_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_role_platform_super_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_scope_app"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_scope_app"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_scope_app"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_scope_bundle"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_scope_bundle"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_scope_bundle"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_scope_channel"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_scope_channel"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_scope_channel"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_scope_org"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_scope_org"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_scope_org"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rbac_scope_platform"() TO "anon";
GRANT ALL ON FUNCTION "public"."rbac_scope_platform"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rbac_scope_platform"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."read_bandwidth_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."read_bandwidth_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."read_bandwidth_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."read_bandwidth_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."read_device_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."read_device_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."read_device_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."read_device_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."read_native_version_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."read_native_version_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "service_role";
GRANT ALL ON FUNCTION "public"."read_native_version_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."read_native_version_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "anon";



GRANT ALL ON FUNCTION "public"."read_storage_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."read_storage_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."read_storage_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."read_version_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."read_version_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."read_version_usage"("p_app_id" character varying, "p_period_start" timestamp without time zone, "p_period_end" timestamp without time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."reassign_webhook_created_by_before_user_delete"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reassign_webhook_created_by_before_user_delete"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_build_time"("p_org_id" "uuid", "p_user_id" "uuid", "p_build_id" character varying, "p_platform" character varying, "p_build_time_unit" bigint, "p_app_id" character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_build_time"("p_org_id" "uuid", "p_user_id" "uuid", "p_build_id" character varying, "p_platform" character varying, "p_build_time_unit" bigint, "p_app_id" character varying) TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_deployment_history"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_deployment_history"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_email_otp_verified"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_email_otp_verified"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_app_rollups_after_demo_reset"("p_app_uuid" "uuid", "p_app_id" "text", "p_owner_org" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_app_rollups_after_demo_reset"("p_app_uuid" "uuid", "p_app_id" "text", "p_owner_org" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_orgs_has_usage_credits"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_orgs_has_usage_credits"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."regenerate_hashed_apikey"("p_apikey_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."regenerate_hashed_apikey"("p_apikey_id" bigint) TO "service_role";
GRANT ALL ON FUNCTION "public"."regenerate_hashed_apikey"("p_apikey_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."regenerate_hashed_apikey"("p_apikey_id" bigint) TO "authenticated";



GRANT ALL ON FUNCTION "public"."regenerate_hashed_apikey_for_user"("p_apikey_id" bigint, "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reject_access_due_to_2fa"("org_id" "uuid", "user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reject_access_due_to_2fa"("org_id" "uuid", "user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reject_access_due_to_2fa_for_app"("app_id" character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reject_access_due_to_2fa_for_app"("app_id" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."reject_access_due_to_2fa_for_app"("app_id" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_access_due_to_2fa_for_app"("app_id" character varying) TO "service_role";



REVOKE ALL ON FUNCTION "public"."reject_access_due_to_2fa_for_org"("org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reject_access_due_to_2fa_for_org"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reject_access_due_to_2fa_for_org"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_access_due_to_2fa_for_org"("org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reject_access_due_to_password_policy"("org_id" "uuid", "user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reject_access_due_to_password_policy"("org_id" "uuid", "user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."remove_old_jobs"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."request_actor_user_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_actor_user_id"() TO "service_role";
GRANT ALL ON FUNCTION "public"."request_actor_user_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."request_actor_user_id"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."request_app_chart_refresh"("app_id" character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_app_chart_refresh"("app_id" character varying) TO "service_role";
GRANT ALL ON FUNCTION "public"."request_app_chart_refresh"("app_id" character varying) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."request_has_app_read_access"("orgid" "uuid", "appid" character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_has_app_read_access"("orgid" "uuid", "appid" character varying) TO "service_role";
GRANT ALL ON FUNCTION "public"."request_has_app_read_access"("orgid" "uuid", "appid" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."request_has_app_read_access"("orgid" "uuid", "appid" character varying) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."request_has_org_read_access"("orgid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_has_org_read_access"("orgid" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."request_has_org_read_access"("orgid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."request_has_org_read_access"("orgid" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."request_org_chart_refresh"("org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_org_chart_refresh"("org_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."request_org_chart_refresh"("org_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."rescind_invitation"("email" "text", "org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rescind_invitation"("email" "text", "org_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."rescind_invitation"("email" "text", "org_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."reset_and_seed_app_data"("p_app_id" character varying, "p_org_id" "uuid", "p_user_id" "uuid", "p_admin_user_id" "uuid", "p_stripe_customer_id" "text", "p_plan_product_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_and_seed_app_data"("p_app_id" character varying, "p_org_id" "uuid", "p_user_id" "uuid", "p_admin_user_id" "uuid", "p_stripe_customer_id" "text", "p_plan_product_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reset_and_seed_app_stats_data"("p_app_id" character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_and_seed_app_stats_data"("p_app_id" character varying) TO "service_role";



REVOKE ALL ON FUNCTION "public"."reset_and_seed_data"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_and_seed_data"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."reset_and_seed_stats_data"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_and_seed_stats_data"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."reset_app_data"("p_app_id" character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_app_data"("p_app_id" character varying) TO "service_role";



REVOKE ALL ON FUNCTION "public"."reset_app_stats_data"("p_app_id" character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_app_stats_data"("p_app_id" character varying) TO "service_role";



REVOKE ALL ON FUNCTION "public"."reset_onboarding_demo_app_data"("p_app_uuid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_onboarding_demo_app_data"("p_app_uuid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."restore_deleted_account"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."restore_deleted_account"() TO "service_role";
GRANT ALL ON FUNCTION "public"."restore_deleted_account"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."sanitize_apps_text_fields"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sanitize_apps_text_fields"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sanitize_orgs_text_fields"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sanitize_orgs_text_fields"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sanitize_tmp_users_text_fields"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sanitize_tmp_users_text_fields"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sanitize_users_text_fields"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sanitize_users_text_fields"() TO "service_role";



GRANT ALL ON TABLE "public"."app_metrics_cache" TO "anon";
GRANT ALL ON TABLE "public"."app_metrics_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."app_metrics_cache" TO "service_role";



REVOKE ALL ON FUNCTION "public"."seed_get_app_metrics_caches"("p_org_id" "uuid", "p_start_date" "date", "p_end_date" "date") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."seed_org_metrics_cache"("p_org_id" "uuid", "p_start_date" "date", "p_end_date" "date") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."set_build_time_exceeded_by_org"("org_id" "uuid", "disabled" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_build_time_exceeded_by_org"("org_id" "uuid", "disabled" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_deleted_at_on_soft_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_deleted_at_on_soft_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_deleted_at_on_soft_delete"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_webhook_created_by"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_webhook_created_by"() TO "service_role";



GRANT ALL ON FUNCTION "public"."strip_html"("input" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strip_html"("input" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strip_html"("input" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_org_has_usage_credits_from_grants"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_org_has_usage_credits_from_grants"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."top_up_usage_credits"("p_org_id" "uuid", "p_amount" numeric, "p_expires_at" timestamp with time zone, "p_source" "text", "p_source_ref" "jsonb", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."top_up_usage_credits"("p_org_id" "uuid", "p_amount" numeric, "p_expires_at" timestamp with time zone, "p_source" "text", "p_source_ref" "jsonb", "p_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."total_bundle_storage_bytes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."total_bundle_storage_bytes"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."track_onboarding_demo_data"("p_app_id" "text", "p_owner_org" "uuid", "p_relation_name" "text", "p_row_keys" "text"[], "p_seed_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."track_onboarding_demo_data"("p_app_id" "text", "p_owner_org" "uuid", "p_relation_name" "text", "p_row_keys" "text"[], "p_seed_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."transfer_app"("p_app_id" character varying, "p_new_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transfer_app"("p_app_id" character varying, "p_new_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transfer_app"("p_app_id" character varying, "p_new_org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."trigger_http_queue_post_to_function"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."trigger_webhook_on_audit_log"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."update_app_versions_retention"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_app_versions_retention"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_apps_build_timeout_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_apps_build_timeout_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_org_invite_role_rbac"("p_org_id" "uuid", "p_user_id" "uuid", "p_new_role_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_org_invite_role_rbac"("p_org_id" "uuid", "p_user_id" "uuid", "p_new_role_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_org_invite_role_rbac"("p_org_id" "uuid", "p_user_id" "uuid", "p_new_role_name" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."update_org_invite_role_rbac"("p_org_id" "uuid", "p_user_id" "uuid", "p_new_role_name" "text") TO "anon";



REVOKE ALL ON FUNCTION "public"."update_org_member_role"("p_org_id" "uuid", "p_user_id" "uuid", "p_new_role_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_org_member_role"("p_org_id" "uuid", "p_user_id" "uuid", "p_new_role_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_org_member_role"("p_org_id" "uuid", "p_user_id" "uuid", "p_new_role_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_sso_providers_updated_at"() TO "service_role";
GRANT ALL ON FUNCTION "public"."update_sso_providers_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_sso_providers_updated_at"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."update_tmp_invite_role_rbac"("p_org_id" "uuid", "p_email" "text", "p_new_role_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_tmp_invite_role_rbac"("p_org_id" "uuid", "p_email" "text", "p_new_role_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_tmp_invite_role_rbac"("p_org_id" "uuid", "p_email" "text", "p_new_role_name" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."update_tmp_invite_role_rbac"("p_org_id" "uuid", "p_email" "text", "p_new_role_name" "text") TO "anon";



REVOKE ALL ON FUNCTION "public"."update_webhook_updated_at"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."upsert_version_meta"("p_app_id" character varying, "p_version_id" bigint, "p_size" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_version_meta"("p_app_id" character varying, "p_version_id" bigint, "p_size" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."usage_credit_readable_org_ids"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."usage_credit_readable_org_ids"() TO "service_role";
GRANT ALL ON FUNCTION "public"."usage_credit_readable_org_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."usage_credit_readable_org_ids"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."user_has_app_update_user_roles"("p_user_id" "uuid", "p_app_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."user_has_app_update_user_roles"("p_user_id" "uuid", "p_app_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_has_app_update_user_roles"("p_user_id" "uuid", "p_app_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."user_has_role_in_app"("p_user_id" "uuid", "p_app_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."user_has_role_in_app"("p_user_id" "uuid", "p_app_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_has_role_in_app"("p_user_id" "uuid", "p_app_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."user_meets_password_policy"("user_id" "uuid", "org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."user_meets_password_policy"("user_id" "uuid", "org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."verify_api_key_hash"("plain_key" "text", "stored_hash" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_api_key_hash"("plain_key" "text", "stored_hash" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_api_key_hash"("plain_key" "text", "stored_hash" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."verify_mfa"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_mfa"() TO "anon";
GRANT ALL ON FUNCTION "public"."verify_mfa"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_mfa"() TO "service_role";



GRANT ALL ON TABLE "public"."apikey_global_permissions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."apikey_global_permissions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."apikey_global_permissions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."apikey_global_permissions_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."apikeys_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."apikeys_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."apikeys_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."app_metrics_cache_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."app_metrics_cache_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."app_metrics_cache_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."app_versions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."app_versions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."app_versions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."app_versions_meta" TO "anon";
GRANT ALL ON TABLE "public"."app_versions_meta" TO "authenticated";
GRANT ALL ON TABLE "public"."app_versions_meta" TO "service_role";



GRANT ALL ON SEQUENCE "public"."app_versions_meta_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."app_versions_meta_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."app_versions_meta_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";
GRANT SELECT ON TABLE "public"."audit_logs" TO "anon";



GRANT ALL ON SEQUENCE "public"."audit_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."audit_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."bandwidth_usage" TO "anon";
GRANT ALL ON TABLE "public"."bandwidth_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."bandwidth_usage" TO "service_role";



GRANT ALL ON SEQUENCE "public"."bandwidth_usage_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."bandwidth_usage_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."bandwidth_usage_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."build_logs" TO "anon";
GRANT ALL ON TABLE "public"."build_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."build_logs" TO "service_role";



GRANT ALL ON TABLE "public"."build_requests" TO "anon";
GRANT ALL ON TABLE "public"."build_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."build_requests" TO "service_role";



GRANT ALL ON TABLE "public"."capgo_credits_steps" TO "anon";
GRANT ALL ON TABLE "public"."capgo_credits_steps" TO "authenticated";
GRANT ALL ON TABLE "public"."capgo_credits_steps" TO "service_role";



GRANT ALL ON SEQUENCE "public"."capgo_credits_steps_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."capgo_credits_steps_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."capgo_credits_steps_id_seq" TO "service_role";



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



GRANT ALL ON TABLE "public"."channel_permission_overrides" TO "anon";
GRANT ALL ON TABLE "public"."channel_permission_overrides" TO "authenticated";
GRANT ALL ON TABLE "public"."channel_permission_overrides" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."compatibility_events" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."compatibility_events" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."compatibility_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."compatibility_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."compatibility_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."compatibility_events_id_seq" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."cron_tasks" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."cron_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."cron_tasks" TO "service_role";



GRANT ALL ON SEQUENCE "public"."cron_tasks_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."cron_tasks_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."cron_tasks_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."daily_bandwidth" TO "anon";
GRANT ALL ON TABLE "public"."daily_bandwidth" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_bandwidth" TO "service_role";



GRANT ALL ON SEQUENCE "public"."daily_bandwidth_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."daily_bandwidth_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."daily_bandwidth_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."daily_build_time" TO "anon";
GRANT ALL ON TABLE "public"."daily_build_time" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_build_time" TO "service_role";



GRANT ALL ON TABLE "public"."daily_mau" TO "anon";
GRANT ALL ON TABLE "public"."daily_mau" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_mau" TO "service_role";



GRANT ALL ON SEQUENCE "public"."daily_mau_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."daily_mau_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."daily_mau_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."daily_revenue_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."daily_storage" TO "anon";
GRANT ALL ON TABLE "public"."daily_storage" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_storage" TO "service_role";



GRANT ALL ON TABLE "public"."daily_storage_hourly" TO "anon";
GRANT ALL ON TABLE "public"."daily_storage_hourly" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_storage_hourly" TO "service_role";



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



GRANT ALL ON SEQUENCE "public"."devices_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."devices_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."devices_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."global_stats" TO "service_role";



GRANT ALL ON TABLE "public"."group_members" TO "anon";
GRANT ALL ON TABLE "public"."group_members" TO "authenticated";
GRANT ALL ON TABLE "public"."group_members" TO "service_role";



GRANT ALL ON TABLE "public"."groups" TO "anon";
GRANT ALL ON TABLE "public"."groups" TO "authenticated";
GRANT ALL ON TABLE "public"."groups" TO "service_role";



GRANT ALL ON TABLE "public"."manifest" TO "anon";
GRANT ALL ON TABLE "public"."manifest" TO "authenticated";
GRANT ALL ON TABLE "public"."manifest" TO "service_role";



GRANT ALL ON SEQUENCE "public"."manifest_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."manifest_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."manifest_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."onboarding_demo_data" TO "service_role";



GRANT ALL ON TABLE "public"."org_users" TO "anon";
GRANT ALL ON TABLE "public"."org_users" TO "authenticated";
GRANT ALL ON TABLE "public"."org_users" TO "service_role";



GRANT ALL ON SEQUENCE "public"."org_users_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."org_users_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."org_users_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."orgs" TO "anon";
GRANT ALL ON TABLE "public"."orgs" TO "authenticated";
GRANT ALL ON TABLE "public"."orgs" TO "service_role";



GRANT ALL ON TABLE "public"."permissions" TO "anon";
GRANT ALL ON TABLE "public"."permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."permissions" TO "service_role";



GRANT ALL ON TABLE "public"."plans" TO "anon";
GRANT ALL ON TABLE "public"."plans" TO "authenticated";
GRANT ALL ON TABLE "public"."plans" TO "service_role";



GRANT ALL ON TABLE "public"."processed_stripe_events" TO "service_role";



GRANT ALL ON TABLE "public"."role_bindings" TO "anon";
GRANT ALL ON TABLE "public"."role_bindings" TO "authenticated";
GRANT ALL ON TABLE "public"."role_bindings" TO "service_role";



GRANT ALL ON TABLE "public"."role_hierarchy" TO "anon";
GRANT ALL ON TABLE "public"."role_hierarchy" TO "authenticated";
GRANT ALL ON TABLE "public"."role_hierarchy" TO "service_role";



GRANT ALL ON TABLE "public"."role_permissions" TO "anon";
GRANT ALL ON TABLE "public"."role_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."role_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";



GRANT ALL ON TABLE "public"."sso_providers" TO "anon";
GRANT ALL ON TABLE "public"."sso_providers" TO "authenticated";
GRANT ALL ON TABLE "public"."sso_providers" TO "service_role";



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



GRANT ALL ON TABLE "public"."tmp_users" TO "anon";
GRANT ALL ON TABLE "public"."tmp_users" TO "authenticated";
GRANT ALL ON TABLE "public"."tmp_users" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tmp_users_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tmp_users_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tmp_users_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."to_delete_accounts" TO "anon";
GRANT ALL ON TABLE "public"."to_delete_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."to_delete_accounts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."to_delete_accounts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."to_delete_accounts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."to_delete_accounts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."usage_credit_grants" TO "anon";
GRANT ALL ON TABLE "public"."usage_credit_grants" TO "authenticated";
GRANT ALL ON TABLE "public"."usage_credit_grants" TO "service_role";



GRANT ALL ON TABLE "public"."usage_credit_balances" TO "anon";
GRANT ALL ON TABLE "public"."usage_credit_balances" TO "authenticated";
GRANT ALL ON TABLE "public"."usage_credit_balances" TO "service_role";



GRANT ALL ON TABLE "public"."usage_credit_consumptions" TO "anon";
GRANT ALL ON TABLE "public"."usage_credit_consumptions" TO "authenticated";
GRANT ALL ON TABLE "public"."usage_credit_consumptions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."usage_credit_consumptions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."usage_credit_consumptions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."usage_credit_consumptions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."usage_credit_transactions" TO "anon";
GRANT ALL ON TABLE "public"."usage_credit_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."usage_credit_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."usage_overage_events" TO "anon";
GRANT ALL ON TABLE "public"."usage_overage_events" TO "authenticated";
GRANT ALL ON TABLE "public"."usage_overage_events" TO "service_role";



GRANT ALL ON TABLE "public"."usage_credit_ledger" TO "anon";
GRANT ALL ON TABLE "public"."usage_credit_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."usage_credit_ledger" TO "service_role";



GRANT ALL ON SEQUENCE "public"."usage_credit_transactions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."usage_credit_transactions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."usage_credit_transactions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_password_compliance" TO "anon";
GRANT ALL ON TABLE "public"."user_password_compliance" TO "authenticated";
GRANT ALL ON TABLE "public"."user_password_compliance" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_password_compliance_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_password_compliance_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_password_compliance_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_security" TO "anon";
GRANT ALL ON TABLE "public"."user_security" TO "authenticated";
GRANT ALL ON TABLE "public"."user_security" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."version_meta" TO "anon";
GRANT ALL ON TABLE "public"."version_meta" TO "authenticated";
GRANT ALL ON TABLE "public"."version_meta" TO "service_role";



GRANT ALL ON TABLE "public"."version_usage" TO "anon";
GRANT ALL ON TABLE "public"."version_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."version_usage" TO "service_role";



GRANT ALL ON TABLE "public"."webhook_deliveries" TO "service_role";



GRANT ALL ON TABLE "public"."webhooks" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
