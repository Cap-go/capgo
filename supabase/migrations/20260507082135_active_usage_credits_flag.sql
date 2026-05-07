BEGIN;

COMMENT ON COLUMN public.orgs.has_usage_credits
IS 'True only with positive, unexpired usage credits.';

CREATE OR REPLACE FUNCTION public.refresh_orgs_has_usage_credits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  WITH credit_state AS (
    SELECT
      o."id",
      COALESCE(g."has_usage_credits", false) AS "has_usage_credits"
    FROM "public"."orgs" AS o
    LEFT JOIN (
      SELECT
        grant_rows."org_id",
        bool_or(
          grant_rows."expires_at" >= now()
          AND grant_rows."credits_consumed" < grant_rows."credits_total"
        ) AS "has_usage_credits"
      FROM "public"."usage_credit_grants" AS grant_rows
      GROUP BY grant_rows."org_id"
    ) AS g ON g."org_id" = o."id"
  )
  UPDATE "public"."orgs" AS o
  SET "has_usage_credits" = credit_state."has_usage_credits"
  FROM credit_state
  WHERE o."id" = credit_state."id"
    AND o."has_usage_credits" IS DISTINCT FROM credit_state."has_usage_credits";
END;
$$;

ALTER FUNCTION public.refresh_orgs_has_usage_credits() OWNER TO "postgres";

REVOKE ALL ON FUNCTION public.refresh_orgs_has_usage_credits() FROM public;
GRANT EXECUTE
ON FUNCTION public.refresh_orgs_has_usage_credits()
TO service_role;

CREATE OR REPLACE FUNCTION public.sync_org_has_usage_credits_from_grants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  FOR v_org_id IN
    SELECT DISTINCT affected."org_id"
    FROM (VALUES (NEW."org_id"), (OLD."org_id")) AS affected("org_id")
    WHERE affected."org_id" IS NOT NULL
  LOOP
    UPDATE "public"."orgs" AS o
    SET "has_usage_credits" = credit_state."has_usage_credits"
    FROM (
      SELECT EXISTS (
        SELECT 1
        FROM "public"."usage_credit_grants" AS g
        WHERE g."org_id" = v_org_id
          AND g."expires_at" >= now()
          AND g."credits_consumed" < g."credits_total"
      ) AS "has_usage_credits"
    ) AS credit_state
    WHERE o."id" = v_org_id
      AND o."has_usage_credits" IS DISTINCT FROM credit_state."has_usage_credits";
  END LOOP;

  RETURN NULL;
END;
$$;

ALTER FUNCTION public.sync_org_has_usage_credits_from_grants()
OWNER TO "postgres";

REVOKE ALL
ON FUNCTION public.sync_org_has_usage_credits_from_grants()
FROM public;
GRANT EXECUTE
ON FUNCTION public.sync_org_has_usage_credits_from_grants()
TO service_role;

SELECT public.refresh_orgs_has_usage_credits();

UPDATE public.cron_tasks
SET
    description = 'Refresh active credit flag for replica plugin gates'
WHERE name = 'refresh_org_usage_credits_flag';

COMMIT;
