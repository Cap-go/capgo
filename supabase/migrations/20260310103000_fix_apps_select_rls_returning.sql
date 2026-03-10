-- Fix apps SELECT RLS for INSERT ... RETURNING in RBAC mode.
--
-- Problem:
-- The existing SELECT policy only checks app-scoped read access via
-- get_identity_org_appid(..., app_id). During INSERT ... RETURNING, PostgreSQL
-- evaluates visibility in the same statement snapshot, so the just-inserted app
-- row is not yet resolvable through the self-lookup inside rbac_has_permission.
-- This makes direct SDK/PostgREST app creation fail with a generic RLS error for
-- RBAC org admins even though the INSERT policy itself allows the write.
--
-- Fix:
-- Keep a single SELECT policy, but choose the scope based on the current auth:
-- 1. JWT users and unrestricted API keys use org-scoped read access
-- 2. app-restricted API keys use app-scoped read access
--
-- The org-scoped branch avoids the self-reference problem for newly inserted
-- apps. The helper below prevents app-restricted API keys from taking that
-- branch, so limited_to_apps restrictions remain enforced.

CREATE OR REPLACE FUNCTION public.current_apikey_has_app_restrictions()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_api_key_text text;
  v_api_key public.apikeys%ROWTYPE;
BEGIN
  SELECT public.get_apikey_header() INTO v_api_key_text;

  IF v_api_key_text IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO v_api_key
  FROM public.find_apikey_by_value(v_api_key_text)
  LIMIT 1;

  IF v_api_key.id IS NULL THEN
    RETURN false;
  END IF;

  RETURN COALESCE(array_length(v_api_key.limited_to_apps, 1), 0) > 0;
END;
$$;

GRANT ALL ON FUNCTION public.current_apikey_has_app_restrictions() TO anon;
GRANT ALL ON FUNCTION public.current_apikey_has_app_restrictions() TO authenticated;
GRANT ALL ON FUNCTION public.current_apikey_has_app_restrictions() TO service_role;

DROP POLICY IF EXISTS "Allow for auth, api keys (read+)" ON public.apps;

CREATE POLICY "Allow for auth, api keys (read+)" ON public.apps
FOR SELECT
TO authenticated, anon
USING (
    (
        NOT public.current_apikey_has_app_restrictions()
        AND public.check_min_rights(
            'read'::public.user_min_right,
            public.get_identity_org_allowed(
                '{read,upload,write,all}'::public.key_mode [],
                owner_org
            ),
            owner_org,
            NULL::character varying,
            NULL::bigint
        )
    )
    OR (
        public.current_apikey_has_app_restrictions()
        AND public.check_min_rights(
            'read'::public.user_min_right,
            public.get_identity_org_appid(
                '{read,upload,write,all}'::public.key_mode [],
                owner_org,
                app_id
            ),
            owner_org,
            app_id,
            NULL::bigint
        )
    )
);
