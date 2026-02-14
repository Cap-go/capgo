-- Restore EXECUTE permission on top_up_usage_credits for service_role.
--
-- Migration 20260104120000
-- (revoke_process_function_queue_public_access) revoked
-- EXECUTE from ALL roles on this function, including service_role. This was an
-- oversight — the same migration correctly preserved service_role access for
-- other billing functions
-- (apply_usage_overage, set_*_exceeded_by_org) with the
-- comment "Do not revoke from service_role as it is used in billing
-- operations",
-- but missed top_up_usage_credits.
--
-- top_up_usage_credits is called via supabaseAdmin (service_role) from:
--   1. supabase/functions/_backend/triggers/stripe_event.ts (line ~197)
--      — Stripe checkout.session.completed webhook handler
--   2. supabase/functions/_backend/private/admin_credits.ts (line ~107)
--      — Admin credit grant endpoint
--
-- It is also called via supabaseAdmin (service_role) from:
--   3. supabase/functions/_backend/private/credits.ts (line ~450)
--      — Frontend complete-top-up endpoint (auth enforced in app code)
--
-- Without this fix, all three callers fail with:
--   42501: permission denied for function top_up_usage_credits

GRANT EXECUTE ON FUNCTION public.top_up_usage_credits(
    p_org_id uuid,
    "p_amount" numeric,
    "p_expires_at" timestamp with time zone,
    p_source text,
    p_source_ref jsonb,
    p_notes text
) TO service_role;
