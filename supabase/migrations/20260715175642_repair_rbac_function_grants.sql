-- The squashed baseline retained a dead pre-RBAC trigger function. The current
-- schema has no trigger or other dependency on it, and its body references
-- columns and types that no longer exist.
DROP FUNCTION IF EXISTS public.generate_org_user_on_org_create();
-- Keep the API-key listing RPC signed-in only. Reassert explicit grants so the
-- function cannot regain anonymous execution through default ACLs.
REVOKE ALL ON FUNCTION public.get_org_apikeys(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_org_apikeys(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_org_apikeys(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_apikeys(uuid) TO authenticated, service_role;

-- These helpers are public RPC entry points: anonymous callers authenticate
-- through the request API-key header, while each function performs its own RBAC
-- authorization before returning data.
REVOKE ALL ON FUNCTION public.check_org_members_2fa_enabled(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_org_members_2fa_enabled(uuid) FROM anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_org_members_2fa_enabled(uuid) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_org_perm_for_apikey_v2(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_org_perm_for_apikey_v2(text, text) FROM anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_org_perm_for_apikey_v2(text, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.check_org_members_password_policy(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_org_members_password_policy(uuid) FROM anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_org_members_password_policy(uuid) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_org_members(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_org_members(uuid) FROM anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_org_members(uuid) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_org_members_rbac(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_org_members_rbac(uuid) FROM anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_org_members_rbac(uuid) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.update_org_invite_role_rbac(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_org_invite_role_rbac(uuid, uuid, text) FROM anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_org_invite_role_rbac(uuid, uuid, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.update_tmp_invite_role_rbac(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_tmp_invite_role_rbac(uuid, text, text) FROM anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_tmp_invite_role_rbac(uuid, text, text) TO anon, authenticated, service_role;
