-- RBAC is now always on. Keep the old org flag only as a compatibility output
-- field, but make it impossible to use as a writable downgrade switch.
UPDATE public.orgs
SET use_new_rbac = true
WHERE use_new_rbac IS DISTINCT FROM true;

ALTER TABLE public.orgs
  ALTER COLUMN use_new_rbac SET DEFAULT true;

COMMENT ON COLUMN public.orgs.use_new_rbac IS
  'Compatibility field retained for old org payloads. RBAC is always enabled and this value is forced true.';

CREATE OR REPLACE FUNCTION public.force_org_rbac_enabled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.use_new_rbac := true;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.force_org_rbac_enabled() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.force_org_rbac_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.force_org_rbac_enabled() TO service_role;

DROP TRIGGER IF EXISTS force_org_rbac_enabled ON public.orgs;
CREATE TRIGGER force_org_rbac_enabled
BEFORE INSERT OR UPDATE OF use_new_rbac
ON public.orgs
FOR EACH ROW
EXECUTE FUNCTION public.force_org_rbac_enabled();

DROP POLICY IF EXISTS "Deny disabling RBAC flag on org insert" ON "public"."orgs";
CREATE POLICY "Deny disabling RBAC flag on org insert"
ON "public"."orgs"
AS RESTRICTIVE
FOR INSERT
TO "anon", "authenticated"
WITH CHECK ("use_new_rbac" IS TRUE);

DROP POLICY IF EXISTS "Deny disabling RBAC flag on org update" ON "public"."orgs";
CREATE POLICY "Deny disabling RBAC flag on org update"
ON "public"."orgs"
AS RESTRICTIVE
FOR UPDATE
TO "anon", "authenticated"
USING (true)
WITH CHECK ("use_new_rbac" IS TRUE);

DROP POLICY IF EXISTS "Allow update for auth (admin+)" ON public.orgs;
DROP POLICY IF EXISTS "Allow org settings update via RBAC" ON public.orgs;
CREATE POLICY "Allow org settings update via RBAC"
ON public.orgs
FOR UPDATE
TO authenticated
USING (
  public.rbac_check_permission_request(
    public.rbac_perm_org_update_settings(),
    id,
    NULL::character varying,
    NULL::bigint
  )
)
WITH CHECK (
  public.rbac_check_permission_request(
    public.rbac_perm_org_update_settings(),
    id,
    NULL::character varying,
    NULL::bigint
  )
  AND ((enforcing_2fa IS NOT TRUE) OR public.has_2fa_enabled())
);

CREATE OR REPLACE FUNCTION public.rbac_enable_for_org(p_org_id uuid, p_granted_by uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_migration_result jsonb;
BEGIN
  v_migration_result := public.rbac_migrate_org_users_to_bindings(p_org_id, p_granted_by);

  UPDATE public.orgs
  SET use_new_rbac = true
  WHERE id = p_org_id
    AND use_new_rbac IS DISTINCT FROM true;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'already_enabled',
    'org_id', p_org_id,
    'migration_result', v_migration_result,
    'rbac_enabled', true
  );
END;
$$;

ALTER FUNCTION public.rbac_enable_for_org(p_org_id uuid, p_granted_by uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rbac_enable_for_org(p_org_id uuid, p_granted_by uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rbac_enable_for_org(p_org_id uuid, p_granted_by uuid) TO service_role;
COMMENT ON FUNCTION public.rbac_enable_for_org(p_org_id uuid, p_granted_by uuid) IS
  'Compatibility helper retained for service-role callers. RBAC is always enabled; this function only backfills bindings and returns enabled.';

CREATE OR REPLACE FUNCTION public.rbac_rollback_org(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.orgs
  SET use_new_rbac = true
  WHERE id = p_org_id
    AND use_new_rbac IS DISTINCT FROM true;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'not_supported',
    'org_id', p_org_id,
    'message', 'RBAC rollback is disabled because RBAC is always enabled',
    'rbac_enabled', true
  );
END;
$$;

ALTER FUNCTION public.rbac_rollback_org(p_org_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rbac_rollback_org(p_org_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rbac_rollback_org(p_org_id uuid) TO service_role;
COMMENT ON FUNCTION public.rbac_rollback_org(p_org_id uuid) IS
  'Compatibility helper retained for service-role callers. It cannot disable RBAC or delete RBAC bindings.';
