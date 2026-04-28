-- Temporary compatibility fix for the published CLI `app list` flow.
--
-- The currently published CLI still does legacy anonymous PostgREST auth checks
-- before issuing a direct `GET /rest/v1/apps` request with the `capgkey`
-- header. The `public.apps` SELECT policy for `anon` / `authenticated` is:
--
--   public.check_min_rights(
--     'read'::public.user_min_right,
--     public.get_identity_org_appid(
--       '{read,upload,write,all}'::public.key_mode[],
--       owner_org,
--       app_id
--     ),
--     owner_org,
--     app_id,
--     NULL::bigint
--   )
--
-- That policy makes each helper below part of the anonymous table read:
-- - public.get_apikey_header()
--   Extracts `capgkey` from `request.headers` so RLS helpers can see the API
--   key on an anonymous PostgREST request.
-- - public.is_apikey_expired(timestamp with time zone)
--   Called by `get_identity_org_appid()` and by the RBAC API-key branch inside
--   `check_min_rights()` to reject expired keys before identity or permission
--   checks continue.
-- - public.get_identity_org_appid(public.key_mode[], uuid, character varying)
--   Called directly by the `public.apps` SELECT policy to convert the
--   anonymous request plus `capgkey` into the API-key owner identity after
--   mode, org, and app-scope checks pass.
-- - public.check_min_rights(public.user_min_right, uuid, uuid, character
--   varying, bigint)
--   Called directly by the `public.apps` SELECT policy to enforce `read`
--   permission for that derived identity. On RBAC orgs it also re-reads the
--   API key to evaluate direct API-key principal grants and org/app
--   restrictions.
--
-- Until the CLI switches `app list` to the RBAC-aware wrappers, removing any
-- of these anon grants breaks the anonymous `public.apps` read even when the
-- key itself is valid.

GRANT EXECUTE ON FUNCTION public.get_apikey_header() TO anon;
GRANT EXECUTE ON FUNCTION public.is_apikey_expired(timestamp with time zone) TO anon;
GRANT EXECUTE ON FUNCTION public.get_identity_org_appid(public.key_mode[], uuid, character varying) TO anon;
GRANT EXECUTE ON FUNCTION public.check_min_rights(public.user_min_right, uuid, uuid, character varying, bigint) TO anon;
