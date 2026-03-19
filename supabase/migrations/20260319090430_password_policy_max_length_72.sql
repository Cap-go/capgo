-- Align organization password policy limits with Supabase Auth's bcrypt-backed max password length.
-- Supabase Auth rejects passwords longer than 72 characters, so policy min_length must never exceed 72.

UPDATE "public"."orgs"
SET "password_policy_config" = jsonb_set(
  "password_policy_config",
  '{min_length}',
  to_jsonb(72),
  false
)
WHERE "password_policy_config" IS NOT NULL
  AND jsonb_typeof("password_policy_config") = 'object'
  AND ("password_policy_config" ? 'min_length')
  AND jsonb_typeof("password_policy_config"->'min_length') = 'number'
  AND ("password_policy_config"->>'min_length')::integer > 72;

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
        AND ("password_policy_config"->>'min_length')::integer BETWEEN 6 AND 72
      )
    )
  )
);

DROP POLICY IF EXISTS "Allow update for auth (admin+)" ON "public"."orgs";

CREATE POLICY "Allow update for auth (admin+)" ON "public"."orgs"
FOR UPDATE
TO "authenticated",
"anon"
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
          AND ("password_policy_config"->>'min_length')::integer BETWEEN 6 AND 72
        )
      )
    )
  )
);
