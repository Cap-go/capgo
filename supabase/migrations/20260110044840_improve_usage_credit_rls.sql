-- =============================================================================
-- Migration: Improve usage credit RLS policies
--
-- This migration updates the RLS policies for usage credit tables to use the
-- consistent pattern used across the codebase:
-- 1. Use check_min_rights() function with get_identity_org_allowed()
-- 2. Support both authenticated and anon roles (for API key support)
--
-- These tables only have org_id (no app_id) as credits are organization-level
-- resources, so we use get_identity_org_allowed() per AGENTS.md guidelines.
--
-- Tables affected:
-- - usage_credit_grants
-- - usage_credit_transactions
-- - usage_overage_events
-- - usage_credit_consumptions
-- =============================================================================

-- =====================================================
-- Update usage_credit_grants table policies
-- =====================================================

-- Drop existing policy
DROP POLICY IF EXISTS "Allow read for org admin" ON public.usage_credit_grants;

-- Recreate with consistent pattern using get_identity_org_allowed (no app_id on table)
CREATE POLICY "Allow org members to select usage_credit_grants"
ON public.usage_credit_grants
FOR SELECT
TO authenticated, anon
USING (
    public.check_min_rights(
        'admin'::public.user_min_right,
        public.get_identity_org_allowed(
            '{read,upload,write,all}'::public.key_mode[],
            org_id
        ),
        org_id,
        NULL::CHARACTER VARYING,
        NULL::BIGINT
    )
);

-- =====================================================
-- Update usage_credit_transactions table policies
-- =====================================================

-- Drop existing policy
DROP POLICY IF EXISTS "Allow read for org admin" ON public.usage_credit_transactions;

-- Recreate with consistent pattern using get_identity_org_allowed (no app_id on table)
CREATE POLICY "Allow org members to select usage_credit_transactions"
ON public.usage_credit_transactions
FOR SELECT
TO authenticated, anon
USING (
    public.check_min_rights(
        'admin'::public.user_min_right,
        public.get_identity_org_allowed(
            '{read,upload,write,all}'::public.key_mode[],
            org_id
        ),
        org_id,
        NULL::CHARACTER VARYING,
        NULL::BIGINT
    )
);

-- =====================================================
-- Update usage_overage_events table policies
-- =====================================================

-- Drop existing policy
DROP POLICY IF EXISTS "Allow read for org admin" ON public.usage_overage_events;

-- Recreate with consistent pattern using get_identity_org_allowed (no app_id on table)
CREATE POLICY "Allow org members to select usage_overage_events"
ON public.usage_overage_events
FOR SELECT
TO authenticated, anon
USING (
    public.check_min_rights(
        'admin'::public.user_min_right,
        public.get_identity_org_allowed(
            '{read,upload,write,all}'::public.key_mode[],
            org_id
        ),
        org_id,
        NULL::CHARACTER VARYING,
        NULL::BIGINT
    )
);

-- =====================================================
-- Update usage_credit_consumptions table policies
-- =====================================================

-- Drop existing policy
DROP POLICY IF EXISTS "Allow read for org admin" ON public.usage_credit_consumptions;

-- Recreate with consistent pattern using get_identity_org_allowed (no app_id on table)
CREATE POLICY "Allow org members to select usage_credit_consumptions"
ON public.usage_credit_consumptions
FOR SELECT
TO authenticated, anon
USING (
    public.check_min_rights(
        'admin'::public.user_min_right,
        public.get_identity_org_allowed(
            '{read,upload,write,all}'::public.key_mode[],
            org_id
        ),
        org_id,
        NULL::CHARACTER VARYING,
        NULL::BIGINT
    )
);
