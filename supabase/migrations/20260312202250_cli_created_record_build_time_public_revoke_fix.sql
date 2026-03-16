-- Ensure record_build_time cannot be executed by SQL PUBLIC role.

REVOKE ALL ON FUNCTION public.record_build_time(
  uuid,
  uuid,
  character varying,
  character varying,
  bigint
) FROM public;
