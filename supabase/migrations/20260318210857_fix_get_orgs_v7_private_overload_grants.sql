-- Security hardening for get_orgs_v7(userid)
-- The parameterized overload accepts arbitrary user IDs, so it must not be callable
-- via anon/authenticated roles directly.

REVOKE ALL ON FUNCTION public.get_orgs_v7(userid uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_orgs_v7(userid uuid) FROM ANON;
REVOKE ALL ON FUNCTION public.get_orgs_v7(userid uuid) FROM AUTHENTICATED;
GRANT EXECUTE ON FUNCTION public.get_orgs_v7(userid uuid) TO POSTGRES;
GRANT EXECUTE ON FUNCTION public.get_orgs_v7(userid uuid) TO SERVICE_ROLE;
