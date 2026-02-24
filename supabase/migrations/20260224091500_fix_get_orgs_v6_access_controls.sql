-- Security hardening for get_orgs_v6(user_id)
-- The parameterized overload accepts arbitrary user IDs, so it must not be callable
-- via anon/authenticated roles directly.

REVOKE ALL ON FUNCTION public.get_orgs_v6(userid uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_orgs_v6(userid uuid) FROM "anon";
REVOKE ALL ON FUNCTION public.get_orgs_v6(userid uuid) FROM "authenticated";
GRANT EXECUTE ON FUNCTION public.get_orgs_v6(userid uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION public.get_orgs_v6(userid uuid) TO "service_role";
