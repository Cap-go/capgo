-- Remove app/channel/bundle permissions from org_member role
DO $$
DECLARE
  v_role_id uuid;
BEGIN
  SELECT id INTO v_role_id
  FROM public.roles
  WHERE name = public.rbac_role_org_member()
  LIMIT 1;

  IF v_role_id IS NULL THEN
    RAISE NOTICE 'org_member role not found, skipping permission cleanup';
    RETURN;
  END IF;

  DELETE FROM public.role_permissions rp
  USING public.permissions p
  WHERE rp.role_id = v_role_id
    AND rp.permission_id = p.id
    AND p.scope_type IN (
      public.rbac_scope_app(),
      public.rbac_scope_bundle(),
      public.rbac_scope_channel()
    );

  UPDATE public.roles
  SET description = 'Basic org member: org-only access'
  WHERE name = public.rbac_role_org_member();
END $$;
