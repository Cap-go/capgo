-- Restrict RBAC migration/rollback RPCs to service_role only.
-- These helpers are operational/admin functions and must not be callable by
-- regular authenticated users through PostgREST.

REVOKE ALL
ON FUNCTION public.rbac_migrate_org_users_to_bindings(uuid, uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.rbac_migrate_org_users_to_bindings(uuid, uuid)
FROM anon; -- noqa: CP02

REVOKE ALL
ON FUNCTION public.rbac_migrate_org_users_to_bindings(uuid, uuid)
FROM authenticated; -- noqa: CP02

GRANT EXECUTE
ON FUNCTION public.rbac_migrate_org_users_to_bindings(uuid, uuid)
TO service_role; -- noqa: CP02

REVOKE ALL
ON FUNCTION public.rbac_enable_for_org(uuid, uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.rbac_enable_for_org(uuid, uuid)
FROM anon; -- noqa: CP02

REVOKE ALL
ON FUNCTION public.rbac_enable_for_org(uuid, uuid)
FROM authenticated; -- noqa: CP02

GRANT EXECUTE
ON FUNCTION public.rbac_enable_for_org(uuid, uuid)
TO service_role; -- noqa: CP02

REVOKE ALL
ON FUNCTION public.rbac_rollback_org(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.rbac_rollback_org(uuid)
FROM anon; -- noqa: CP02

REVOKE ALL
ON FUNCTION public.rbac_rollback_org(uuid)
FROM authenticated; -- noqa: CP02

GRANT EXECUTE
ON FUNCTION public.rbac_rollback_org(uuid)
TO service_role; -- noqa: CP02
