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
-- Keep a single SELECT policy, but allow either:
-- 1. org-scoped read access for JWT-authenticated users, or
-- 2. app-scoped read access for JWT users and API keys.
--
-- The org-scoped JWT branch avoids the self-reference problem for newly
-- inserted apps without bypassing limited_to_apps restrictions on API keys.
-- The app-scoped branch preserves access for principals that only hold
-- app-level roles and keeps limited_to_apps enforcement intact.

DROP POLICY IF EXISTS "Allow for auth, api keys (read+)" ON public.apps;

CREATE POLICY "Allow for auth, api keys (read+)" ON public.apps
FOR SELECT
TO authenticated, anon
USING (
    EXISTS (
        SELECT 1
        FROM (
            SELECT auth.uid() AS uid
        ) AS auth_user
        WHERE
            auth_user.uid IS NOT NULL
            AND public.check_min_rights(
                'read'::public.user_min_right,
                auth_user.uid,
                public.apps.owner_org,
                NULL::character varying,
                NULL::bigint
            )
    )
    OR
    public.check_min_rights(
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
);
