-- Restore service-role access for admin/server credit top-ups.
-- This was inadvertently revoked in 20260104120000_revoke_process_function_queue_public_access.sql.
GRANT EXECUTE ON FUNCTION public.top_up_usage_credits(
  uuid,
  numeric,
  timestamptz,
  text,
  jsonb,
  text
) TO service_role;
