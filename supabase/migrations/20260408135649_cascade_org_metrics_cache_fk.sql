-- Fix organization deletion failing due to FK constraint from org_metrics_cache.
-- The org_metrics_cache table holds derived/cached metrics keyed by org_id.
-- When an org is deleted, its cached metrics should be removed automatically,
-- matching the ON DELETE CASCADE behavior used by every other FK into public.orgs.

ALTER TABLE "public"."org_metrics_cache"
    DROP CONSTRAINT IF EXISTS "org_metrics_cache_org_id_fkey";

ALTER TABLE "public"."org_metrics_cache"
    ADD CONSTRAINT "org_metrics_cache_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;
