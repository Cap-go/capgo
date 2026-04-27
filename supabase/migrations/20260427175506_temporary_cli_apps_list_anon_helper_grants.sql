-- Temporary compatibility fix for the published CLI `app list` flow.
--
-- The currently published CLI still does legacy anonymous PostgREST auth checks
-- before issuing a direct `GET /rest/v1/apps` request with the `capgkey`
-- header. The `apps` RLS path resolves API-key identity through the helper
-- functions below, so anonymous execute on them remains required until the CLI
-- repo switches `app list` to the RBAC-aware wrappers.

GRANT EXECUTE ON FUNCTION public.get_apikey_header() TO anon;
GRANT EXECUTE ON FUNCTION public.is_apikey_expired(timestamp with time zone) TO anon;
GRANT EXECUTE ON FUNCTION public.get_identity_org_appid(public.key_mode[], uuid, character varying) TO anon;
GRANT EXECUTE ON FUNCTION public.check_min_rights(public.user_min_right, uuid, uuid, character varying, bigint) TO anon;
