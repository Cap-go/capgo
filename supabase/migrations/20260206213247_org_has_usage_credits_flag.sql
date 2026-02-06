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

-- Keep the flag updated immediately when credits are granted/consumed/expired.
-- This makes seed inserts and runtime credit changes replica-safe without relying on scheduled refresh.
CREATE OR REPLACE FUNCTION "public"."sync_org_has_usage_credits_from_grants"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Transition tables are available because the trigger is FOR EACH STATEMENT.
  UPDATE "public"."orgs" AS o
  SET "has_usage_credits" = EXISTS (
    SELECT 1
    FROM "public"."usage_credit_grants" AS g
    WHERE g."org_id" = o."id"
      AND g."expires_at" >= NOW()
      AND (g."credits_total" - g."credits_consumed") > 0
  )
  WHERE o."id" IN (
    SELECT DISTINCT "org_id" FROM "new_grants"
    UNION
    SELECT DISTINCT "org_id" FROM "old_grants"
  );

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS "trg_sync_org_has_usage_credits" ON "public"."usage_credit_grants";
CREATE TRIGGER "trg_sync_org_has_usage_credits"
AFTER INSERT OR UPDATE OR DELETE ON "public"."usage_credit_grants"
REFERENCING NEW TABLE AS "new_grants" OLD TABLE AS "old_grants"
FOR EACH STATEMENT
EXECUTE FUNCTION "public"."sync_org_has_usage_credits_from_grants"();

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
