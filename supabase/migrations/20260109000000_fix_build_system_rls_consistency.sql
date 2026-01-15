-- =============================================================================
-- Migration: Fix build system RLS policies for consistency
--
-- This migration updates the RLS policies for build_requests, build_logs, and
-- daily_build_time tables to use the consistent pattern used across the codebase:
-- 1. Use check_min_rights() function instead of direct EXISTS queries
-- 2. Use get_identity_org_appid() when app_id is available (preferred)
-- 3. Use get_identity_org_allowed() only when app_id is not available (fallback)
-- 4. Support both authenticated and anon roles (for API key support)
--
-- This matches the pattern used in apps, channels, app_versions, etc.
-- =============================================================================

-- =====================================================
-- Update build_requests table policies
-- =====================================================

-- Drop existing policy
DROP POLICY IF EXISTS "Users read own org build requests" ON public.build_requests;

-- Recreate with consistent pattern using get_identity_org_appid (has app_id)
CREATE POLICY "Allow org members to select build_requests"
ON public.build_requests
FOR SELECT
TO authenticated, anon
USING (
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

-- =====================================================
-- Update build_logs table policies
-- =====================================================

-- Drop existing policy
DROP POLICY IF EXISTS "Users read own or org admin builds" ON public.build_logs;

-- Recreate with consistent pattern using get_identity_org_allowed (no app_id available)
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
);

-- =====================================================
-- Update daily_build_time table policies
-- =====================================================

-- Drop existing policy
DROP POLICY IF EXISTS "Users read own org build time" ON public.daily_build_time;

-- Recreate with consistent pattern using get_identity_org_appid (has app_id)
-- Joins through apps table to get owner_org
CREATE POLICY "Allow org members to select daily_build_time"
ON public.daily_build_time
FOR SELECT
TO authenticated, anon
USING (
    EXISTS (
        SELECT 1
        FROM public.apps
        WHERE
            apps.app_id = daily_build_time.app_id
            AND public.check_min_rights(
                'read'::public.user_min_right,
                public.get_identity_org_appid(
                    '{read,upload,write,all}'::public.key_mode [],
                    apps.owner_org,
                    apps.app_id
                ),
                apps.owner_org,
                apps.app_id,
                NULL::bigint
            )
    )
);
