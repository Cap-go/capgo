CREATE OR REPLACE FUNCTION "public"."current_request_role"()
RETURNS "text"
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

CREATE OR REPLACE FUNCTION "public"."is_internal_request_role"("caller_role" text)
RETURNS boolean
LANGUAGE "sql" STABLE
SET "search_path" TO ''
AS $$
  SELECT (
    caller_role = ANY (ARRAY['service_role', 'postgres', 'supabase_admin']::text[])
    OR (
      caller_role = ANY (ARRAY['', 'none']::text[])
      AND COALESCE(session_user, current_user) = ANY (ARRAY['postgres', 'supabase_admin']::text[])
    )
  )
$$;

ALTER FUNCTION "public"."is_internal_request_role"(text) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."is_internal_request_role"(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION "public"."request_has_org_read_access"("orgid" "uuid")
RETURNS boolean
LANGUAGE "plpgsql" STABLE
SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  caller_id uuid;
BEGIN
  SELECT public.get_identity_org_allowed(
    '{read,upload,write,all}'::public.key_mode[],
    request_has_org_read_access.orgid
  )
  INTO caller_id;

  RETURN (
    caller_id IS NOT NULL
    AND public.check_min_rights(
      'read'::public.user_min_right,
      caller_id,
      request_has_org_read_access.orgid,
      NULL::character varying,
      NULL::bigint
    )
  );
END;
$$;

ALTER FUNCTION "public"."request_has_org_read_access"("orgid" "uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."request_has_org_read_access"("orgid" "uuid") FROM PUBLIC;

CREATE OR REPLACE FUNCTION "public"."request_has_app_read_access"("orgid" "uuid", "appid" character varying)
RETURNS boolean
LANGUAGE "plpgsql" STABLE
SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  caller_id uuid;
BEGIN
  SELECT public.get_identity_org_appid(
    '{read,upload,write,all}'::public.key_mode[],
    request_has_app_read_access.orgid,
    request_has_app_read_access.appid
  )
  INTO caller_id;

  RETURN (
    caller_id IS NOT NULL
    AND public.check_min_rights(
      'read'::public.user_min_right,
      caller_id,
      request_has_app_read_access.orgid,
      request_has_app_read_access.appid,
      NULL::bigint
    )
  );
END;
$$;

ALTER FUNCTION "public"."request_has_app_read_access"("orgid" "uuid", "appid" character varying) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."request_has_app_read_access"("orgid" "uuid", "appid" character varying) FROM PUBLIC;

CREATE OR REPLACE FUNCTION "public"."is_platform_admin"("userid" "uuid")
RETURNS boolean
LANGUAGE "plpgsql"
SECURITY DEFINER
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

CREATE OR REPLACE FUNCTION "public"."is_platform_admin"()
RETURNS boolean
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO ''
AS $$
BEGIN
  RETURN public.is_platform_admin((SELECT auth.uid()));
END;
$$;

ALTER FUNCTION "public"."is_platform_admin"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."is_platform_admin"("userid" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."is_platform_admin"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."is_platform_admin"("userid" "uuid") TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."is_platform_admin"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_platform_admin"() TO "service_role";

CREATE OR REPLACE FUNCTION "public"."is_paying_org"("orgid" "uuid")
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
REVOKE ALL ON FUNCTION "public"."is_paying_org"("orgid" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."is_paying_org"("orgid" "uuid") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."is_paying_org"("orgid" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_paying_org"("orgid" "uuid") TO "service_role";

CREATE OR REPLACE FUNCTION "public"."is_trial_org"("orgid" "uuid")
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
REVOKE ALL ON FUNCTION "public"."is_trial_org"("orgid" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."is_trial_org"("orgid" "uuid") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."is_trial_org"("orgid" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_trial_org"("orgid" "uuid") TO "service_role";

CREATE OR REPLACE FUNCTION "public"."get_current_plan_max_org"("orgid" "uuid")
RETURNS TABLE("mau" bigint, "bandwidth" bigint, "storage" bigint, "build_time_unit" bigint)
LANGUAGE "plpgsql" STABLE SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  v_request_user uuid;
  v_request_role text;
  v_is_internal boolean;
BEGIN
  SELECT public.current_request_role() INTO v_request_role;

  v_is_internal := public.is_internal_request_role(v_request_role);

  IF NOT v_is_internal THEN
    v_request_user := public.get_identity_org_allowed(
      '{read,upload,write,all}'::public.key_mode[],
      get_current_plan_max_org.orgid
    );

    IF NOT public.request_has_org_read_access(get_current_plan_max_org.orgid) THEN
      PERFORM public.pg_log(
        'deny: NO_RIGHTS',
        pg_catalog.jsonb_build_object(
          'orgid',
          get_current_plan_max_org.orgid,
          'uid',
          v_request_user
        )
      );
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  SELECT p.mau, p.bandwidth, p.storage, p.build_time_unit
  FROM public.orgs o
  JOIN public.stripe_info si ON o.customer_id = si.customer_id
  JOIN public.plans p ON si.product_id = p.stripe_id
  WHERE o.id = orgid;
END;
$$;

ALTER FUNCTION "public"."get_current_plan_max_org"("orgid" "uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."get_current_plan_max_org"("orgid" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_current_plan_max_org"("orgid" "uuid") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."get_current_plan_max_org"("orgid" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_current_plan_max_org"("orgid" "uuid") TO "service_role";

CREATE OR REPLACE FUNCTION "public"."is_paying_and_good_plan_org"("orgid" "uuid")
RETURNS boolean
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  caller_role text;
  caller_id uuid;
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

ALTER FUNCTION "public"."get_user_main_org_id"("user_id" "uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."get_user_main_org_id"("user_id" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_user_main_org_id"("user_id" "uuid") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."get_user_main_org_id"("user_id" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_user_main_org_id"("user_id" "uuid") TO "service_role";

CREATE OR REPLACE FUNCTION "public"."get_total_storage_size_org"("org_id" "uuid")
RETURNS double precision
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  total_size double precision := 0;
  caller_role text;
  caller_id uuid;
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

ALTER FUNCTION "public"."is_account_disabled"("user_id" "uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."is_account_disabled"("user_id" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."is_account_disabled"("user_id" "uuid") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."is_account_disabled"("user_id" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_account_disabled"("user_id" "uuid") TO "service_role";

CREATE OR REPLACE FUNCTION "public"."get_total_app_storage_size_orgs"("org_id" "uuid", "app_id" character varying)
RETURNS double precision
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  total_size double precision := 0;
  caller_role text;
  caller_id uuid;
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

CREATE OR REPLACE FUNCTION "public"."get_user_main_org_id"("user_id" "uuid")
RETURNS "uuid"
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

CREATE OR REPLACE FUNCTION "public"."is_member_of_org"("user_id" "uuid", "org_id" "uuid")
RETURNS boolean
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  is_found integer;
  caller_role text;
  caller_id uuid;
BEGIN
  SELECT public.current_request_role() INTO caller_role;

  IF NOT (
    caller_role IN ('service_role', 'postgres', 'supabase_admin')
    OR (
      caller_role IN ('', 'none')
      AND COALESCE(session_user, current_user) IN ('postgres', 'supabase_admin')
    )
  ) THEN
    SELECT public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], is_member_of_org.org_id)
    INTO caller_id;

    IF caller_id IS NULL OR caller_id <> is_member_of_org.user_id OR NOT public.check_min_rights(
      'read'::public.user_min_right,
      caller_id,
      is_member_of_org.org_id,
      NULL::character varying,
      NULL::bigint
    ) THEN
      RETURN false;
    END IF;
  END IF;

  SELECT count(*)
  INTO is_found
  FROM public.orgs
  JOIN public.org_users ON org_users.org_id = orgs.id
  WHERE org_users.user_id = is_member_of_org.user_id
    AND orgs.id = is_member_of_org.org_id;

  RETURN is_found != 0;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."is_account_disabled"("user_id" "uuid")
RETURNS boolean
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  caller_role text;
  caller_id uuid;
BEGIN
  SELECT public.current_request_role() INTO caller_role;

  IF NOT (
    caller_role IN ('service_role', 'postgres', 'supabase_admin')
    OR (
      caller_role IN ('', 'none')
      AND COALESCE(session_user, current_user) IN ('postgres', 'supabase_admin')
    )
  ) THEN
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

REVOKE ALL ON FUNCTION "public"."get_org_perm_for_apikey_v2"("apikey" "text", "app_id" "text") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_org_perm_for_apikey_v2"("apikey" "text", "app_id" "text") FROM "anon";
REVOKE ALL ON FUNCTION "public"."get_org_perm_for_apikey_v2"("apikey" "text", "app_id" "text") FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_org_perm_for_apikey_v2"("apikey" "text", "app_id" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."rbac_enable_for_org"("p_org_id" "uuid", "p_granted_by" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."rbac_enable_for_org"("p_org_id" "uuid", "p_granted_by" "uuid") FROM "anon";
REVOKE ALL ON FUNCTION "public"."rbac_enable_for_org"("p_org_id" "uuid", "p_granted_by" "uuid") FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."rbac_enable_for_org"("p_org_id" "uuid", "p_granted_by" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."rbac_migrate_org_users_to_bindings"("p_org_id" "uuid", "p_granted_by" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."rbac_migrate_org_users_to_bindings"("p_org_id" "uuid", "p_granted_by" "uuid") FROM "anon";
REVOKE ALL ON FUNCTION "public"."rbac_migrate_org_users_to_bindings"("p_org_id" "uuid", "p_granted_by" "uuid") FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."rbac_migrate_org_users_to_bindings"("p_org_id" "uuid", "p_granted_by" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."rbac_rollback_org"("p_org_id" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."rbac_rollback_org"("p_org_id" "uuid") FROM "anon";
REVOKE ALL ON FUNCTION "public"."rbac_rollback_org"("p_org_id" "uuid") FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."rbac_rollback_org"("p_org_id" "uuid") TO "service_role";
