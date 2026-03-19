-- Harden remaining helper RPCs from GHSA-hc74 by adding caller-aware authz
-- checks and revoking unnecessary anonymous access on self-only helpers.

REVOKE ALL ON FUNCTION "public"."is_canceled_org"("orgid" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."is_canceled_org"("orgid" "uuid") FROM "anon";
REVOKE ALL ON FUNCTION "public"."is_canceled_org"("orgid" "uuid") FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_canceled_org"("orgid" "uuid") TO "anon";
GRANT EXECUTE ON FUNCTION "public"."is_canceled_org"("orgid" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_canceled_org"("orgid" "uuid") TO "service_role";

CREATE OR REPLACE FUNCTION "public"."is_canceled_org"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  caller_role text;
  caller_id uuid;
BEGIN
  SELECT COALESCE(current_setting('role', true), '') INTO caller_role;

  IF NOT (
    caller_role IN ('service_role', 'postgres', 'supabase_admin')
    OR (
      caller_role IN ('', 'none')
      AND COALESCE(session_user, current_user) IN ('postgres', 'supabase_admin')
    )
  ) THEN
    SELECT public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], is_canceled_org.orgid)
    INTO caller_id;

    IF caller_id IS NULL OR NOT public.check_min_rights(
      'read'::public.user_min_right,
      caller_id,
      is_canceled_org.orgid,
      NULL::character varying,
      NULL::bigint
    ) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN (
    SELECT EXISTS (
      SELECT 1
      FROM public.stripe_info
      WHERE customer_id = (SELECT customer_id FROM public.orgs WHERE id = orgid)
        AND status = 'canceled'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION "public"."is_good_plan_v5_org"("orgid" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."is_good_plan_v5_org"("orgid" "uuid") FROM "anon";
REVOKE ALL ON FUNCTION "public"."is_good_plan_v5_org"("orgid" "uuid") FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_good_plan_v5_org"("orgid" "uuid") TO "anon";
GRANT EXECUTE ON FUNCTION "public"."is_good_plan_v5_org"("orgid" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_good_plan_v5_org"("orgid" "uuid") TO "service_role";

CREATE OR REPLACE FUNCTION "public"."is_good_plan_v5_org"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_product_id text;
  v_start_date date;
  v_end_date date;
  v_plan_name text;
  total_metrics RECORD;
  v_anchor_day interval;
  caller_role text;
  caller_id uuid;
BEGIN
  SELECT COALESCE(current_setting('role', true), '') INTO caller_role;

  IF NOT (
    caller_role IN ('service_role', 'postgres', 'supabase_admin')
    OR (
      caller_role IN ('', 'none')
      AND COALESCE(session_user, current_user) IN ('postgres', 'supabase_admin')
    )
  ) THEN
    SELECT public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], is_good_plan_v5_org.orgid)
    INTO caller_id;

    IF caller_id IS NULL OR NOT public.check_min_rights(
      'read'::public.user_min_right,
      caller_id,
      is_good_plan_v5_org.orgid,
      NULL::character varying,
      NULL::bigint
    ) THEN
      RETURN false;
    END IF;
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

REVOKE ALL ON FUNCTION "public"."is_onboarded_org"("orgid" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."is_onboarded_org"("orgid" "uuid") FROM "anon";
REVOKE ALL ON FUNCTION "public"."is_onboarded_org"("orgid" "uuid") FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_onboarded_org"("orgid" "uuid") TO "anon";
GRANT EXECUTE ON FUNCTION "public"."is_onboarded_org"("orgid" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_onboarded_org"("orgid" "uuid") TO "service_role";

CREATE OR REPLACE FUNCTION "public"."is_onboarded_org"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  caller_role text;
  caller_id uuid;
BEGIN
  SELECT COALESCE(current_setting('role', true), '') INTO caller_role;

  IF NOT (
    caller_role IN ('service_role', 'postgres', 'supabase_admin')
    OR (
      caller_role IN ('', 'none')
      AND COALESCE(session_user, current_user) IN ('postgres', 'supabase_admin')
    )
  ) THEN
    SELECT public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], is_onboarded_org.orgid)
    INTO caller_id;

    IF caller_id IS NULL OR NOT public.check_min_rights(
      'read'::public.user_min_right,
      caller_id,
      is_onboarded_org.orgid,
      NULL::character varying,
      NULL::bigint
    ) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN (
    SELECT EXISTS (SELECT 1 FROM public.apps WHERE owner_org = orgid)
  ) AND (
    SELECT EXISTS (SELECT 1 FROM public.app_versions WHERE owner_org = orgid)
  );
END;
$$;

REVOKE ALL ON FUNCTION "public"."is_onboarding_needed_org"("orgid" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."is_onboarding_needed_org"("orgid" "uuid") FROM "anon";
REVOKE ALL ON FUNCTION "public"."is_onboarding_needed_org"("orgid" "uuid") FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_onboarding_needed_org"("orgid" "uuid") TO "anon";
GRANT EXECUTE ON FUNCTION "public"."is_onboarding_needed_org"("orgid" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_onboarding_needed_org"("orgid" "uuid") TO "service_role";

CREATE OR REPLACE FUNCTION "public"."is_onboarding_needed_org"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" = ''
    AS $$
DECLARE
  caller_role text;
  caller_id uuid;
BEGIN
  SELECT COALESCE(current_setting('role', true), '') INTO caller_role;

  IF NOT (
    caller_role IN ('service_role', 'postgres', 'supabase_admin')
    OR (
      caller_role IN ('', 'none')
      AND COALESCE(session_user, current_user) IN ('postgres', 'supabase_admin')
    )
  ) THEN
    SELECT public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], is_onboarding_needed_org.orgid)
    INTO caller_id;

    IF caller_id IS NULL OR NOT public.check_min_rights(
      'read'::public.user_min_right,
      caller_id,
      is_onboarding_needed_org.orgid,
      NULL::character varying,
      NULL::bigint
    ) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN (
    EXISTS (
      SELECT 1 FROM public.orgs
      WHERE id = is_onboarding_needed_org.orgid
    )
    AND
    NOT public.is_onboarded_org(is_onboarding_needed_org.orgid)
    AND public.is_trial_org(is_onboarding_needed_org.orgid) = 0
  );
END;
$$;

REVOKE ALL ON FUNCTION "public"."is_org_yearly"("orgid" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."is_org_yearly"("orgid" "uuid") FROM "anon";
REVOKE ALL ON FUNCTION "public"."is_org_yearly"("orgid" "uuid") FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_org_yearly"("orgid" "uuid") TO "anon";
GRANT EXECUTE ON FUNCTION "public"."is_org_yearly"("orgid" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_org_yearly"("orgid" "uuid") TO "service_role";

CREATE OR REPLACE FUNCTION "public"."is_org_yearly"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  is_yearly boolean;
  caller_role text;
  caller_id uuid;
BEGIN
  SELECT COALESCE(current_setting('role', true), '') INTO caller_role;

  IF NOT (
    caller_role IN ('service_role', 'postgres', 'supabase_admin')
    OR (
      caller_role IN ('', 'none')
      AND COALESCE(session_user, current_user) IN ('postgres', 'supabase_admin')
    )
  ) THEN
    SELECT public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], is_org_yearly.orgid)
    INTO caller_id;

    IF caller_id IS NULL OR NOT public.check_min_rights(
      'read'::public.user_min_right,
      caller_id,
      is_org_yearly.orgid,
      NULL::character varying,
      NULL::bigint
    ) THEN
      RETURN false;
    END IF;
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

REVOKE ALL ON FUNCTION "public"."is_paying_and_good_plan_org"("orgid" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."is_paying_and_good_plan_org"("orgid" "uuid") FROM "anon";
REVOKE ALL ON FUNCTION "public"."is_paying_and_good_plan_org"("orgid" "uuid") FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_paying_and_good_plan_org"("orgid" "uuid") TO "anon";
GRANT EXECUTE ON FUNCTION "public"."is_paying_and_good_plan_org"("orgid" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_paying_and_good_plan_org"("orgid" "uuid") TO "service_role";

CREATE OR REPLACE FUNCTION "public"."is_paying_and_good_plan_org"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  caller_role text;
  caller_id uuid;
BEGIN
  SELECT COALESCE(current_setting('role', true), '') INTO caller_role;

  IF NOT (
    caller_role IN ('service_role', 'postgres', 'supabase_admin')
    OR (
      caller_role IN ('', 'none')
      AND COALESCE(session_user, current_user) IN ('postgres', 'supabase_admin')
    )
  ) THEN
    SELECT public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], is_paying_and_good_plan_org.orgid)
    INTO caller_id;

    IF caller_id IS NULL OR NOT public.check_min_rights(
      'read'::public.user_min_right,
      caller_id,
      is_paying_and_good_plan_org.orgid,
      NULL::character varying,
      NULL::bigint
    ) THEN
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
            OR (trial_at::date - now()::date > 0)
          )
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION "public"."get_total_storage_size_org"("org_id" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_total_storage_size_org"("org_id" "uuid") FROM "anon";
REVOKE ALL ON FUNCTION "public"."get_total_storage_size_org"("org_id" "uuid") FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_total_storage_size_org"("org_id" "uuid") TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_total_storage_size_org"("org_id" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_total_storage_size_org"("org_id" "uuid") TO "service_role";

CREATE OR REPLACE FUNCTION "public"."get_total_storage_size_org"("org_id" "uuid") RETURNS double precision
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  total_size double precision := 0;
  caller_role text;
  caller_id uuid;
BEGIN
  SELECT COALESCE(current_setting('role', true), '') INTO caller_role;

  IF NOT (
    caller_role IN ('service_role', 'postgres', 'supabase_admin')
    OR (
      caller_role IN ('', 'none')
      AND COALESCE(session_user, current_user) IN ('postgres', 'supabase_admin')
    )
  ) THEN
    SELECT public.get_identity_org_allowed('{read,upload,write,all}'::public.key_mode[], get_total_storage_size_org.org_id)
    INTO caller_id;

    IF caller_id IS NULL OR NOT public.check_min_rights(
      'read'::public.user_min_right,
      caller_id,
      get_total_storage_size_org.org_id,
      NULL::character varying,
      NULL::bigint
    ) THEN
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

REVOKE ALL ON FUNCTION "public"."get_total_app_storage_size_orgs"("org_id" "uuid", "app_id" character varying) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_total_app_storage_size_orgs"("org_id" "uuid", "app_id" character varying) FROM "anon";
REVOKE ALL ON FUNCTION "public"."get_total_app_storage_size_orgs"("org_id" "uuid", "app_id" character varying) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_total_app_storage_size_orgs"("org_id" "uuid", "app_id" character varying) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_total_app_storage_size_orgs"("org_id" "uuid", "app_id" character varying) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_total_app_storage_size_orgs"("org_id" "uuid", "app_id" character varying) TO "service_role";

CREATE OR REPLACE FUNCTION "public"."get_total_app_storage_size_orgs"("org_id" "uuid", "app_id" character varying) RETURNS double precision
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  total_size double precision := 0;
  caller_role text;
  caller_id uuid;
BEGIN
  SELECT COALESCE(current_setting('role', true), '') INTO caller_role;

  IF NOT (
    caller_role IN ('service_role', 'postgres', 'supabase_admin')
    OR (
      caller_role IN ('', 'none')
      AND COALESCE(session_user, current_user) IN ('postgres', 'supabase_admin')
    )
  ) THEN
    SELECT public.get_identity_org_appid(
      '{read,upload,write,all}'::public.key_mode[],
      get_total_app_storage_size_orgs.org_id,
      get_total_app_storage_size_orgs.app_id
    )
    INTO caller_id;

    IF caller_id IS NULL OR NOT public.check_min_rights(
      'read'::public.user_min_right,
      caller_id,
      get_total_app_storage_size_orgs.org_id,
      get_total_app_storage_size_orgs.app_id,
      NULL::bigint
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

REVOKE ALL ON FUNCTION "public"."get_user_main_org_id"("user_id" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_user_main_org_id"("user_id" "uuid") FROM "anon";
REVOKE ALL ON FUNCTION "public"."get_user_main_org_id"("user_id" "uuid") FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_user_main_org_id"("user_id" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_user_main_org_id"("user_id" "uuid") TO "service_role";

CREATE OR REPLACE FUNCTION "public"."get_user_main_org_id"("user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  org_id uuid;
  caller_role text;
  caller_id uuid;
BEGIN
  SELECT COALESCE(current_setting('role', true), '') INTO caller_role;

  IF NOT (
    caller_role IN ('service_role', 'postgres', 'supabase_admin')
    OR (
      caller_role IN ('', 'none')
      AND COALESCE(session_user, current_user) IN ('postgres', 'supabase_admin')
    )
  ) THEN
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

REVOKE ALL ON FUNCTION "public"."is_member_of_org"("user_id" "uuid", "org_id" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."is_member_of_org"("user_id" "uuid", "org_id" "uuid") FROM "anon";
REVOKE ALL ON FUNCTION "public"."is_member_of_org"("user_id" "uuid", "org_id" "uuid") FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_member_of_org"("user_id" "uuid", "org_id" "uuid") TO "anon";
GRANT EXECUTE ON FUNCTION "public"."is_member_of_org"("user_id" "uuid", "org_id" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_member_of_org"("user_id" "uuid", "org_id" "uuid") TO "service_role";

CREATE OR REPLACE FUNCTION "public"."is_member_of_org"("user_id" "uuid", "org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  is_found integer;
  caller_role text;
  caller_id uuid;
BEGIN
  SELECT COALESCE(current_setting('role', true), '') INTO caller_role;

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

REVOKE ALL ON FUNCTION "public"."is_account_disabled"("user_id" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."is_account_disabled"("user_id" "uuid") FROM "anon";
REVOKE ALL ON FUNCTION "public"."is_account_disabled"("user_id" "uuid") FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_account_disabled"("user_id" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_account_disabled"("user_id" "uuid") TO "service_role";

CREATE OR REPLACE FUNCTION "public"."is_account_disabled"("user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  caller_role text;
  caller_id uuid;
BEGIN
  SELECT COALESCE(current_setting('role', true), '') INTO caller_role;

  IF caller_role NOT IN ('service_role', 'postgres', 'supabase_admin')
    AND COALESCE(session_user, current_user) NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
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
