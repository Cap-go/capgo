BEGIN;

-- Read replicas (PlanetScale subscriptions) replicate table data but not views/functions.
-- The plugin read-path must not query usage_credit_* relations on replicas, so we store
-- a replicated boolean on orgs indicating whether the org currently has usable credits.

ALTER TABLE "public"."orgs"
ADD COLUMN IF NOT EXISTS "has_usage_credits" boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN "public"."orgs"."has_usage_credits"
IS 'Replicated flag: true when the org has available (unexpired, unconsumed) usage credits. Used by read-replica queries.';

-- Backfill immediately on primary DB.
UPDATE "public"."orgs" AS o
SET "has_usage_credits" = (COALESCE(b."available_credits", 0) > 0)
FROM "public"."usage_credit_balances" AS b
WHERE b."org_id" = o."id";

-- Ensure orgs without a balance row are false (and avoid needless writes).
UPDATE "public"."orgs" AS o
SET "has_usage_credits" = false
WHERE NOT EXISTS (
  SELECT 1
  FROM "public"."usage_credit_balances" AS b
  WHERE b."org_id" = o."id"
)
AND o."has_usage_credits" IS DISTINCT FROM false;

CREATE OR REPLACE FUNCTION "public"."refresh_orgs_has_usage_credits"()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Update orgs that have a row in the balances view.
  UPDATE "public"."orgs" AS o
  SET "has_usage_credits" = (COALESCE(b."available_credits", 0) > 0)
  FROM "public"."usage_credit_balances" AS b
  WHERE b."org_id" = o."id";

  -- Orgs without any grants should be false.
  UPDATE "public"."orgs" AS o
  SET "has_usage_credits" = false
  WHERE NOT EXISTS (
    SELECT 1
    FROM "public"."usage_credit_balances" AS b
    WHERE b."org_id" = o."id"
  )
  AND o."has_usage_credits" IS DISTINCT FROM false;
END;
$$;

REVOKE ALL ON FUNCTION "public"."refresh_orgs_has_usage_credits"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."refresh_orgs_has_usage_credits"() TO "service_role";

-- Run daily after credits expiry (03:00:30 UTC) so replicas get a stable replicated flag.
INSERT INTO "public"."cron_tasks" (
  "name",
  "description",
  "task_type",
  "target",
  "run_at_hour",
  "run_at_minute",
  "run_at_second"
)
VALUES (
  'refresh_org_usage_credits_flag',
  'Refresh orgs.has_usage_credits from usage credit balances (replicated flag for read replicas)',
  'function',
  'public.refresh_orgs_has_usage_credits()',
  3,
  0,
  30
)
ON CONFLICT ("name") DO NOTHING;

COMMIT;
