-- Align organization password policy limits with Supabase Auth's bcrypt-backed max password length.
-- Supabase Auth rejects passwords longer than 72 characters, so policy min_length must never exceed 72.

WITH "normalized_password_policy_min_lengths" AS (
  SELECT
    "id",
    LEAST(
      72::numeric,
      GREATEST(
        6::numeric,
        CEIL(
          CASE
            WHEN jsonb_typeof("password_policy_config"->'min_length') = 'number'
              THEN ("password_policy_config"->>'min_length')::numeric
            WHEN jsonb_typeof("password_policy_config"->'min_length') = 'string'
              AND btrim("password_policy_config"->>'min_length') ~ '^-?\d+(\.\d+)?$'
              THEN (btrim("password_policy_config"->>'min_length'))::numeric
            ELSE 6::numeric
          END
        )
      )
    )::integer AS "normalized_min_length"
  FROM "public"."orgs"
  WHERE "password_policy_config" IS NOT NULL
    AND jsonb_typeof("password_policy_config") = 'object'
    AND ("password_policy_config" ? 'min_length')
)
UPDATE "public"."orgs" AS "orgs"
SET "password_policy_config" = jsonb_set(
  "orgs"."password_policy_config",
  '{min_length}',
  to_jsonb("normalized_password_policy_min_lengths"."normalized_min_length"),
  false
)
FROM "normalized_password_policy_min_lengths"
WHERE "orgs"."id" = "normalized_password_policy_min_lengths"."id"
  AND (
    jsonb_typeof("orgs"."password_policy_config"->'min_length') <> 'number'
    OR ("orgs"."password_policy_config"->>'min_length') IS DISTINCT FROM "normalized_password_policy_min_lengths"."normalized_min_length"::text
  );

ALTER TABLE "public"."orgs"
DROP CONSTRAINT IF EXISTS "orgs_password_policy_config_min_length_check";

ALTER TABLE "public"."orgs"
ADD CONSTRAINT "orgs_password_policy_config_min_length_check"
CHECK (
  "password_policy_config" IS NULL
  OR (
    jsonb_typeof("password_policy_config") = 'object'
    AND (
      NOT ("password_policy_config" ? 'min_length')
      OR (
        jsonb_typeof("password_policy_config"->'min_length') = 'number'
        AND ("password_policy_config"->>'min_length')::numeric = trunc(("password_policy_config"->>'min_length')::numeric)
        AND ("password_policy_config"->>'min_length')::numeric BETWEEN 6::numeric AND 72::numeric
      )
    )
  )
);

DROP POLICY IF EXISTS "Allow update for auth (admin+)" ON "public"."orgs";

CREATE POLICY "Allow update for auth (admin+)" ON "public"."orgs"
FOR UPDATE
TO "authenticated", "anon"
USING (
  "public"."check_min_rights"(
    'admin'::"public"."user_min_right",
    "public"."get_identity_org_allowed"('{all,write}'::"public"."key_mode"[], "id"),
    "id",
    NULL::character varying,
    NULL::bigint
  )
)
WITH CHECK (
  "public"."check_min_rights"(
    'admin'::"public"."user_min_right",
    "public"."get_identity_org_allowed"('{all,write}'::"public"."key_mode"[], "id"),
    "id",
    NULL::character varying,
    NULL::bigint
  )
  AND (
    "enforcing_2fa" IS NOT TRUE
    OR "public"."has_2fa_enabled"()
  )
  AND (
    "password_policy_config" IS NULL
    OR (
      jsonb_typeof("password_policy_config") = 'object'
      AND (
        NOT ("password_policy_config" ? 'min_length')
        OR (
          jsonb_typeof("password_policy_config"->'min_length') = 'number'
          AND ("password_policy_config"->>'min_length')::numeric = trunc(("password_policy_config"->>'min_length')::numeric)
          AND ("password_policy_config"->>'min_length')::numeric BETWEEN 6::numeric AND 72::numeric
        )
      )
    )
  )
);
