BEGIN;

-- Read replicas (PlanetScale subscriptions) replicate table data but not views/functions.
-- The plugin read-path must not query usage_credit_* relations on replicas, so we store
-- a replicated boolean on orgs indicating whether the org uses the credits system.

ALTER TABLE "public"."orgs"
ADD COLUMN IF NOT EXISTS "has_usage_credits" boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN "public"."orgs"."has_usage_credits"
IS 'Replicated flag: true when the org uses usage credits (top-up billing). Must be replica-safe for plugin endpoints.';

-- Backfill immediately on primary DB.
UPDATE "public"."orgs" AS o
SET "has_usage_credits" = EXISTS (
  SELECT 1
  FROM "public"."usage_credit_grants" AS g
  WHERE g."org_id" = o."id"
)
WHERE o."has_usage_credits" IS DISTINCT FROM EXISTS (
  SELECT 1
  FROM "public"."usage_credit_grants" AS g
  WHERE g."org_id" = o."id"
);

-- Ensure orgs without any grants are false (and avoid needless writes).
UPDATE "public"."orgs" AS o
SET "has_usage_credits" = false
WHERE NOT EXISTS (
  SELECT 1
  FROM "public"."usage_credit_grants" AS g
  WHERE g."org_id" = o."id"
)
AND o."has_usage_credits" IS DISTINCT FROM false;

CREATE OR REPLACE FUNCTION "public"."refresh_orgs_has_usage_credits"()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Update orgs that have at least one grant (credits mode enabled).
  UPDATE "public"."orgs" AS o
  SET "has_usage_credits" = true
  WHERE EXISTS (
    SELECT 1
    FROM "public"."usage_credit_grants" AS g
    WHERE g."org_id" = o."id"
  )
  AND o."has_usage_credits" IS DISTINCT FROM true;

  -- Orgs without any grants should be false (fallback for edge cases).
  UPDATE "public"."orgs" AS o
  SET "has_usage_credits" = false
  WHERE NOT EXISTS (
    SELECT 1
    FROM "public"."usage_credit_grants" AS g
    WHERE g."org_id" = o."id"
  )
  AND o."has_usage_credits" IS DISTINCT FROM false;
END;
$$;

ALTER FUNCTION "public"."refresh_orgs_has_usage_credits"() OWNER TO "postgres";

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
  -- Keep it simple: usage_credit_grants writes are low-frequency and this must work
  -- on all Postgres versions. Row-level trigger avoids transition table limitations.
  UPDATE "public"."orgs" AS o
  SET "has_usage_credits" = EXISTS (
    SELECT 1
    FROM "public"."usage_credit_grants" AS g
    WHERE g."org_id" = COALESCE(NEW."org_id", OLD."org_id")
  )
  WHERE o."id" = COALESCE(NEW."org_id", OLD."org_id")
    AND o."has_usage_credits" IS DISTINCT FROM EXISTS (
      SELECT 1
      FROM "public"."usage_credit_grants" AS g
      WHERE g."org_id" = COALESCE(NEW."org_id", OLD."org_id")
    );

  RETURN NULL;
END;
$$;

ALTER FUNCTION "public"."sync_org_has_usage_credits_from_grants"() OWNER TO "postgres";

DROP TRIGGER IF EXISTS "trg_sync_org_has_usage_credits" ON "public"."usage_credit_grants";
CREATE TRIGGER "trg_sync_org_has_usage_credits"
AFTER INSERT OR UPDATE OR DELETE ON "public"."usage_credit_grants"
FOR EACH ROW
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
  'Refresh orgs.has_usage_credits from usage credit grants (replicated flag for read replicas)',
  'function',
  'public.refresh_orgs_has_usage_credits()',
  3,
  0,
  30
)
ON CONFLICT ("name") DO UPDATE
SET
  "description" = EXCLUDED."description",
  "task_type" = EXCLUDED."task_type",
  "target" = EXCLUDED."target",
  "run_at_hour" = EXCLUDED."run_at_hour",
  "run_at_minute" = EXCLUDED."run_at_minute",
  "run_at_second" = EXCLUDED."run_at_second";

COMMIT;
