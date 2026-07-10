-- Restore channel creation for RBAC app developers without widening direct channel mutations.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM public.roles
JOIN public.permissions ON permissions.key = public.rbac_perm_app_create_channel()
WHERE roles.name = public.rbac_role_app_developer()
ON CONFLICT DO NOTHING;

DROP POLICY IF EXISTS "Allow insert for auth, api keys (write, all) (admin+)" ON public.channels;

CREATE POLICY "Allow insert for auth, api keys (create_channel)" ON public.channels
FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.apps
    WHERE apps.app_id = channels.app_id
      AND apps.owner_org = channels.owner_org
  )
  AND public.rbac_check_permission_request(
    public.rbac_perm_app_create_channel(),
    owner_org,
    app_id,
    NULL::bigint
  )
  AND (
    version IS NULL
    OR public.rbac_check_permission_request(
      public.rbac_perm_channel_promote_bundle(),
      owner_org,
      app_id,
      NULL::bigint
    )
  )
);
