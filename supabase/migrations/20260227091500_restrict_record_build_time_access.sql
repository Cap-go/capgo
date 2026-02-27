-- Security hardening for record_build_time
-- This RPC performs billing-sensitive inserts/updates to public.build_logs and must not be callable
-- with anonymous or general authenticated roles.

REVOKE ALL ON FUNCTION public.record_build_time(
  p_org_id uuid,
  p_user_id uuid,
  p_build_id character varying,
  p_platform character varying,
  p_build_time_unit bigint
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.record_build_time(
  p_org_id uuid,
  p_user_id uuid,
  p_build_id character varying,
  p_platform character varying,
  p_build_time_unit bigint
) FROM "anon";

REVOKE ALL ON FUNCTION public.record_build_time(
  p_org_id uuid,
  p_user_id uuid,
  p_build_id character varying,
  p_platform character varying,
  p_build_time_unit bigint
) FROM "authenticated";

GRANT EXECUTE ON FUNCTION public.record_build_time(
  p_org_id uuid,
  p_user_id uuid,
  p_build_id character varying,
  p_platform character varying,
  p_build_time_unit bigint
) TO "service_role";
