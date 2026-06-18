-- =====================================================
-- Make build_logs readable by app-scoped roles
-- =====================================================
-- build_requests already grants read via get_identity_org_appid (app-aware),
-- but build_logs only granted org-level read (get_identity_org_allowed). When
-- the original build-system RLS migration was written, build_logs had no app_id
-- column; it does now (FK build_logs_app_id_fkey + idx_build_logs_app_id_created_at).
--
-- As a result, app-scoped roles (e.g. app_reader / app_developer without
-- org-wide read) could see a build in the builds table but not its duration,
-- because the Build Duration column reads build_logs. Make the policy app-aware
-- to match build_requests.
--
-- This is ADDITIVE: the original org-level clause is kept (it still covers org
-- members and any logs whose app_id became NULL after the app was deleted via
-- ON DELETE SET NULL), OR'd with an app-aware clause mirroring build_requests.
-- It only widens read access; it never removes any.

DROP POLICY IF EXISTS "Allow org members to select build_logs" ON public.build_logs;

CREATE POLICY "Allow org members to select build_logs"
ON public.build_logs
FOR SELECT
TO authenticated, anon
USING (
    public.check_min_rights(
        'read'::public.user_min_right,
        public.get_identity_org_allowed(
            '{read,upload,write,all}'::public.key_mode [],
            org_id
        ),
        org_id,
        NULL::character varying,
        NULL::bigint
    )
    OR public.check_min_rights(
        'read'::public.user_min_right,
        public.get_identity_org_appid(
            '{read,upload,write,all}'::public.key_mode [],
            org_id,
            app_id
        ),
        org_id,
        app_id,
        NULL::bigint
    )
);
