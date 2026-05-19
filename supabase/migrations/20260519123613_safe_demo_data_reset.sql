-- Make onboarding demo resets provenance-based. The reset path must only delete
-- rows that were explicitly created by demo seeding; app-wide cleanup is too
-- dangerous because real apps can stay in need_onboarding=true while already
-- containing production data.

DROP TRIGGER IF EXISTS "complete_onboarding_after_first_upload" ON "public"."app_versions";

DROP FUNCTION IF EXISTS "public"."complete_onboarding_after_first_upload"();

CREATE TABLE IF NOT EXISTS "public"."onboarding_demo_data" (
  "id" uuid DEFAULT "gen_random_uuid"() NOT NULL,
  "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  "app_id" character varying NOT NULL,
  "owner_org" uuid NOT NULL,
  "relation_name" text NOT NULL,
  "row_key" text NOT NULL,
  "seed_id" uuid NOT NULL,
  CONSTRAINT "onboarding_demo_data_relation_name_check" CHECK (
    "relation_name" = ANY (ARRAY[
      'app_versions'::text,
      'app_versions_meta'::text,
      'manifest'::text,
      'channels'::text,
      'channel_devices'::text,
      'deploy_history'::text,
      'devices'::text,
      'daily_mau'::text,
      'daily_bandwidth'::text,
      'daily_storage'::text,
      'daily_version'::text,
      'daily_build_time'::text,
      'build_requests'::text
    ])
  )
);

ALTER TABLE "public"."onboarding_demo_data" OWNER TO "postgres";

COMMENT ON TABLE "public"."onboarding_demo_data" IS 'Tracks rows created by onboarding demo seeding so demo resets can delete only demo-owned data.';
COMMENT ON COLUMN "public"."onboarding_demo_data"."row_key" IS 'Primary-row identifier as text. For date-keyed daily tables this is the date; for daily_version this is date|version_name.';

ALTER TABLE ONLY "public"."onboarding_demo_data"
  ADD CONSTRAINT "onboarding_demo_data_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."onboarding_demo_data"
  ADD CONSTRAINT "onboarding_demo_data_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("app_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."onboarding_demo_data"
  ADD CONSTRAINT "onboarding_demo_data_owner_org_fkey" FOREIGN KEY ("owner_org") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "onboarding_demo_data_app_relation_row_key_idx"
  ON "public"."onboarding_demo_data" USING "btree" ("app_id", "relation_name", "row_key");

CREATE INDEX IF NOT EXISTS "onboarding_demo_data_seed_id_idx"
  ON "public"."onboarding_demo_data" USING "btree" ("seed_id");

ALTER TABLE "public"."onboarding_demo_data" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny user access to onboarding demo data" ON "public"."onboarding_demo_data";

CREATE POLICY "Deny user access to onboarding demo data"
ON "public"."onboarding_demo_data"
AS RESTRICTIVE
FOR ALL
TO "anon", "authenticated"
USING (false)
WITH CHECK (false);

REVOKE ALL ON TABLE "public"."onboarding_demo_data" FROM PUBLIC;
REVOKE ALL ON TABLE "public"."onboarding_demo_data" FROM "anon";
REVOKE ALL ON TABLE "public"."onboarding_demo_data" FROM "authenticated";
GRANT ALL ON TABLE "public"."onboarding_demo_data" TO "service_role";

CREATE OR REPLACE FUNCTION "public"."track_onboarding_demo_data"(
  "p_app_id" text,
  "p_owner_org" uuid,
  "p_relation_name" text,
  "p_row_keys" text[],
  "p_seed_id" uuid
)
RETURNS void
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_app_id IS NULL OR btrim(p_app_id) = '' THEN
    RAISE EXCEPTION 'track_onboarding_demo_data: app_id is required';
  END IF;

  IF p_owner_org IS NULL THEN
    RAISE EXCEPTION 'track_onboarding_demo_data: owner_org is required';
  END IF;

  IF p_seed_id IS NULL THEN
    RAISE EXCEPTION 'track_onboarding_demo_data: seed_id is required';
  END IF;

  IF p_relation_name IS NULL OR NOT (
    p_relation_name = ANY (ARRAY[
      'app_versions'::text,
      'app_versions_meta'::text,
      'manifest'::text,
      'channels'::text,
      'channel_devices'::text,
      'deploy_history'::text,
      'devices'::text,
      'daily_mau'::text,
      'daily_bandwidth'::text,
      'daily_storage'::text,
      'daily_version'::text,
      'daily_build_time'::text,
      'build_requests'::text
    ])
  ) THEN
    RAISE EXCEPTION 'track_onboarding_demo_data: unsupported relation %', p_relation_name;
  END IF;

  INSERT INTO "public"."onboarding_demo_data" (
    "app_id",
    "owner_org",
    "relation_name",
    "row_key",
    "seed_id"
  )
  SELECT
    p_app_id,
    p_owner_org,
    p_relation_name,
    key_value,
    p_seed_id
  FROM "unnest"(p_row_keys) AS keys("key_value")
  WHERE "key_value" IS NOT NULL
    AND "btrim"("key_value") <> ''
  ON CONFLICT ("app_id", "relation_name", "row_key") DO UPDATE
  SET
    "owner_org" = EXCLUDED."owner_org",
    "seed_id" = EXCLUDED."seed_id",
    "created_at" = "now"();
END;
$$;

ALTER FUNCTION "public"."track_onboarding_demo_data"(text, uuid, text, text[], uuid) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."track_onboarding_demo_data"(text, uuid, text, text[], uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."track_onboarding_demo_data"(text, uuid, text, text[], uuid) FROM "anon";
REVOKE ALL ON FUNCTION "public"."track_onboarding_demo_data"(text, uuid, text, text[], uuid) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."track_onboarding_demo_data"(text, uuid, text, text[], uuid) TO "service_role";

CREATE OR REPLACE FUNCTION "public"."refresh_app_rollups_after_demo_reset"("p_app_uuid" uuid, "p_app_id" text, "p_owner_org" uuid)
RETURNS void
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_last_version text;
  v_manifest_bundle_count bigint := 0;
  v_channel_device_count bigint := 0;
BEGIN
  SELECT "name"
  INTO v_last_version
  FROM "public"."app_versions"
  WHERE "app_id" = p_app_id
    AND "deleted" IS FALSE
  ORDER BY "created_at" DESC, "id" DESC
  LIMIT 1;

  SELECT COUNT(*)::bigint
  INTO v_manifest_bundle_count
  FROM "public"."app_versions"
  WHERE "app_id" = p_app_id
    AND "deleted" IS FALSE
    AND COALESCE("manifest_count", 0) > 0;

  SELECT COUNT(*)::bigint
  INTO v_channel_device_count
  FROM "public"."channel_devices"
  WHERE "app_id" = p_app_id;

  UPDATE "public"."apps"
  SET
    "last_version" = v_last_version,
    "manifest_bundle_count" = v_manifest_bundle_count,
    "channel_device_count" = v_channel_device_count
  WHERE "id" = p_app_uuid;

  IF p_owner_org IS NOT NULL THEN
    DELETE FROM "public"."app_metrics_cache"
    WHERE "org_id" = p_owner_org;
  END IF;
END;
$$;

ALTER FUNCTION "public"."refresh_app_rollups_after_demo_reset"(uuid, text, uuid) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."refresh_app_rollups_after_demo_reset"(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."refresh_app_rollups_after_demo_reset"(uuid, text, uuid) FROM "anon";
REVOKE ALL ON FUNCTION "public"."refresh_app_rollups_after_demo_reset"(uuid, text, uuid) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."refresh_app_rollups_after_demo_reset"(uuid, text, uuid) TO "service_role";

CREATE OR REPLACE FUNCTION "public"."reset_onboarding_demo_app_data"("p_app_uuid" uuid)
RETURNS void
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_app_id text;
  v_owner_org uuid;
BEGIN
  SELECT "app_id", "owner_org"
  INTO v_app_id, v_owner_org
  FROM "public"."apps"
  WHERE "id" = p_app_uuid;

  IF v_app_id IS NULL THEN
    RETURN;
  END IF;

  -- Refuse to delete tracked parents when any untracked child row points at
  -- them. Without these guards, ON DELETE CASCADE could remove real data that
  -- a user attached to a demo-created version or channel.
  IF EXISTS (
    WITH tracked_versions AS (
      SELECT "row_key"::bigint AS "id"
      FROM "public"."onboarding_demo_data"
      WHERE "app_id" = v_app_id
        AND "relation_name" = 'app_versions'
    )
    SELECT 1
    FROM "public"."channels" c
    INNER JOIN tracked_versions tv ON tv."id" = c."version"
    WHERE NOT EXISTS (
      SELECT 1
      FROM "public"."onboarding_demo_data" odd
      WHERE odd."app_id" = v_app_id
        AND odd."relation_name" = 'channels'
        AND odd."row_key" = c."id"::text
    )
  ) THEN
    RAISE EXCEPTION 'reset_onboarding_demo_app_data: refusing to cascade from demo versions into untracked channels for app %', v_app_id;
  END IF;

  IF EXISTS (
    WITH tracked_versions AS (
      SELECT "row_key"::bigint AS "id"
      FROM "public"."onboarding_demo_data"
      WHERE "app_id" = v_app_id
        AND "relation_name" = 'app_versions'
    )
    SELECT 1
    FROM "public"."deploy_history" dh
    INNER JOIN tracked_versions tv ON tv."id" = dh."version_id"
    WHERE NOT EXISTS (
      SELECT 1
      FROM "public"."onboarding_demo_data" odd
      WHERE odd."app_id" = v_app_id
        AND odd."relation_name" = 'deploy_history'
        AND odd."row_key" = dh."id"::text
    )
  ) THEN
    RAISE EXCEPTION 'reset_onboarding_demo_app_data: refusing to cascade from demo versions into untracked deploy history for app %', v_app_id;
  END IF;

  IF EXISTS (
    WITH tracked_versions AS (
      SELECT "row_key"::bigint AS "id"
      FROM "public"."onboarding_demo_data"
      WHERE "app_id" = v_app_id
        AND "relation_name" = 'app_versions'
    )
    SELECT 1
    FROM "public"."manifest" m
    INNER JOIN tracked_versions tv ON tv."id" = m."app_version_id"
    WHERE NOT EXISTS (
      SELECT 1
      FROM "public"."onboarding_demo_data" odd
      WHERE odd."app_id" = v_app_id
        AND odd."relation_name" = 'manifest'
        AND odd."row_key" = m."id"::text
    )
  ) THEN
    RAISE EXCEPTION 'reset_onboarding_demo_app_data: refusing to cascade from demo versions into untracked manifest rows for app %', v_app_id;
  END IF;

  IF EXISTS (
    WITH tracked_versions AS (
      SELECT "row_key"::bigint AS "id"
      FROM "public"."onboarding_demo_data"
      WHERE "app_id" = v_app_id
        AND "relation_name" = 'app_versions'
    )
    SELECT 1
    FROM "public"."app_versions_meta" avm
    INNER JOIN tracked_versions tv ON tv."id" = avm."id"
    WHERE NOT EXISTS (
      SELECT 1
      FROM "public"."onboarding_demo_data" odd
      WHERE odd."app_id" = v_app_id
        AND odd."relation_name" = 'app_versions_meta'
        AND odd."row_key" = avm."id"::text
    )
  ) THEN
    RAISE EXCEPTION 'reset_onboarding_demo_app_data: refusing to cascade from demo versions into untracked version metadata for app %', v_app_id;
  END IF;

  IF EXISTS (
    WITH tracked_versions AS (
      SELECT "row_key"::bigint AS "id"
      FROM "public"."onboarding_demo_data"
      WHERE "app_id" = v_app_id
        AND "relation_name" = 'app_versions'
    )
    SELECT 1
    FROM "public"."permissions" p
    INNER JOIN tracked_versions tv ON tv."id" = p."bundle_id"
  ) OR EXISTS (
    WITH tracked_versions AS (
      SELECT "row_key"::bigint AS "id"
      FROM "public"."onboarding_demo_data"
      WHERE "app_id" = v_app_id
        AND "relation_name" = 'app_versions'
    )
    SELECT 1
    FROM "public"."role_bindings" rb
    INNER JOIN tracked_versions tv ON tv."id" = rb."bundle_id"
  ) THEN
    RAISE EXCEPTION 'reset_onboarding_demo_app_data: refusing to cascade from demo versions into RBAC rows for app %', v_app_id;
  END IF;

  IF EXISTS (
    WITH tracked_channels AS (
      SELECT "row_key"::bigint AS "id"
      FROM "public"."onboarding_demo_data"
      WHERE "app_id" = v_app_id
        AND "relation_name" = 'channels'
    )
    SELECT 1
    FROM "public"."deploy_history" dh
    INNER JOIN tracked_channels tc ON tc."id" = dh."channel_id"
    WHERE NOT EXISTS (
      SELECT 1
      FROM "public"."onboarding_demo_data" odd
      WHERE odd."app_id" = v_app_id
        AND odd."relation_name" = 'deploy_history'
        AND odd."row_key" = dh."id"::text
    )
  ) THEN
    RAISE EXCEPTION 'reset_onboarding_demo_app_data: refusing to cascade from demo channels into untracked deploy history for app %', v_app_id;
  END IF;

  IF EXISTS (
    WITH tracked_channels AS (
      SELECT "row_key"::bigint AS "id"
      FROM "public"."onboarding_demo_data"
      WHERE "app_id" = v_app_id
        AND "relation_name" = 'channels'
    )
    SELECT 1
    FROM "public"."channel_devices" cd
    INNER JOIN tracked_channels tc ON tc."id" = cd."channel_id"
    WHERE NOT EXISTS (
      SELECT 1
      FROM "public"."onboarding_demo_data" odd
      WHERE odd."app_id" = v_app_id
        AND odd."relation_name" = 'channel_devices'
        AND odd."row_key" = cd."id"::text
    )
  ) THEN
    RAISE EXCEPTION 'reset_onboarding_demo_app_data: refusing to delete demo channels with untracked channel devices for app %', v_app_id;
  END IF;

  IF EXISTS (
    WITH tracked_channels AS (
      SELECT c."id", c."rbac_id"
      FROM "public"."channels" c
      INNER JOIN "public"."onboarding_demo_data" odd
        ON odd."app_id" = v_app_id
        AND odd."relation_name" = 'channels'
        AND odd."row_key" = c."id"::text
    )
    SELECT 1
    FROM "public"."channel_permission_overrides" cpo
    INNER JOIN tracked_channels tc ON tc."id" = cpo."channel_id"
  ) OR EXISTS (
    WITH tracked_channels AS (
      SELECT c."id", c."rbac_id"
      FROM "public"."channels" c
      INNER JOIN "public"."onboarding_demo_data" odd
        ON odd."app_id" = v_app_id
        AND odd."relation_name" = 'channels'
        AND odd."row_key" = c."id"::text
    )
    SELECT 1
    FROM "public"."org_users" ou
    INNER JOIN tracked_channels tc ON tc."id" = ou."channel_id"
  ) OR EXISTS (
    WITH tracked_channels AS (
      SELECT c."id", c."rbac_id"
      FROM "public"."channels" c
      INNER JOIN "public"."onboarding_demo_data" odd
        ON odd."app_id" = v_app_id
        AND odd."relation_name" = 'channels'
        AND odd."row_key" = c."id"::text
    )
    SELECT 1
    FROM "public"."role_bindings" rb
    INNER JOIN tracked_channels tc ON tc."rbac_id" = rb."channel_id"
  ) THEN
    RAISE EXCEPTION 'reset_onboarding_demo_app_data: refusing to cascade from demo channels into access-control rows for app %', v_app_id;
  END IF;

  DELETE FROM "public"."channel_devices" cd
  USING "public"."onboarding_demo_data" odd
  WHERE odd."app_id" = v_app_id
    AND odd."relation_name" = 'channel_devices'
    AND odd."row_key" = cd."id"::text;

  DELETE FROM "public"."deploy_history" dh
  USING "public"."onboarding_demo_data" odd
  WHERE odd."app_id" = v_app_id
    AND odd."relation_name" = 'deploy_history'
    AND odd."row_key" = dh."id"::text;

  DELETE FROM "public"."manifest" m
  USING "public"."onboarding_demo_data" odd
  WHERE odd."app_id" = v_app_id
    AND odd."relation_name" = 'manifest'
    AND odd."row_key" = m."id"::text;

  DELETE FROM "public"."build_requests" br
  USING "public"."onboarding_demo_data" odd
  WHERE odd."app_id" = v_app_id
    AND odd."relation_name" = 'build_requests'
    AND odd."row_key" = br."id"::text;

  DELETE FROM "public"."daily_version" dv
  USING "public"."onboarding_demo_data" odd
  WHERE odd."app_id" = v_app_id
    AND odd."relation_name" = 'daily_version'
    AND dv."app_id" = v_app_id
    AND dv."date" = "split_part"(odd."row_key", '|', 1)::date
    AND dv."version_name" = "substr"(odd."row_key", "strpos"(odd."row_key", '|') + 1);

  DELETE FROM "public"."daily_mau" dm
  USING "public"."onboarding_demo_data" odd
  WHERE odd."app_id" = v_app_id
    AND odd."relation_name" = 'daily_mau'
    AND dm."app_id" = v_app_id
    AND dm."date" = odd."row_key"::date;

  DELETE FROM "public"."daily_bandwidth" db
  USING "public"."onboarding_demo_data" odd
  WHERE odd."app_id" = v_app_id
    AND odd."relation_name" = 'daily_bandwidth'
    AND db."app_id" = v_app_id
    AND db."date" = odd."row_key"::date;

  DELETE FROM "public"."daily_storage" ds
  USING "public"."onboarding_demo_data" odd
  WHERE odd."app_id" = v_app_id
    AND odd."relation_name" = 'daily_storage'
    AND ds."app_id" = v_app_id
    AND ds."date" = odd."row_key"::date;

  DELETE FROM "public"."daily_build_time" dbt
  USING "public"."onboarding_demo_data" odd
  WHERE odd."app_id" = v_app_id
    AND odd."relation_name" = 'daily_build_time'
    AND dbt."app_id" = v_app_id
    AND dbt."date" = odd."row_key"::date;

  DELETE FROM "public"."devices" d
  USING "public"."onboarding_demo_data" odd
  WHERE odd."app_id" = v_app_id
    AND odd."relation_name" = 'devices'
    AND odd."row_key" = d."id"::text;

  DELETE FROM "public"."channels" c
  USING "public"."onboarding_demo_data" odd
  WHERE odd."app_id" = v_app_id
    AND odd."relation_name" = 'channels'
    AND odd."row_key" = c."id"::text;

  DELETE FROM "public"."app_versions_meta" avm
  USING "public"."onboarding_demo_data" odd
  WHERE odd."app_id" = v_app_id
    AND odd."relation_name" = 'app_versions_meta'
    AND odd."row_key" = avm."id"::text;

  DELETE FROM "public"."app_versions" av
  USING "public"."onboarding_demo_data" odd
  WHERE odd."app_id" = v_app_id
    AND odd."relation_name" = 'app_versions'
    AND odd."row_key" = av."id"::text;

  DELETE FROM "public"."onboarding_demo_data"
  WHERE "app_id" = v_app_id;

  PERFORM "public"."refresh_app_rollups_after_demo_reset"(p_app_uuid, v_app_id, v_owner_org);
END;
$$;

ALTER FUNCTION "public"."reset_onboarding_demo_app_data"(uuid) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."reset_onboarding_demo_app_data"(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."reset_onboarding_demo_app_data"(uuid) FROM "anon";
REVOKE ALL ON FUNCTION "public"."reset_onboarding_demo_app_data"(uuid) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."reset_onboarding_demo_app_data"(uuid) TO "service_role";

CREATE OR REPLACE FUNCTION "public"."clear_onboarding_app_data"("p_app_uuid" "uuid", "p_preserve_app_version_id" bigint)
RETURNS void
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- This legacy helper used to delete broad app data. Keep the name for older
  -- callers, but make it provenance-based so completing/resetting onboarding
  -- can never wipe untracked production rows.
  PERFORM p_preserve_app_version_id;
  PERFORM "public"."reset_onboarding_demo_app_data"(p_app_uuid);
END;
$$;

ALTER FUNCTION "public"."clear_onboarding_app_data"("p_app_uuid" "uuid", "p_preserve_app_version_id" bigint) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."clear_onboarding_app_data"("p_app_uuid" "uuid", "p_preserve_app_version_id" bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."clear_onboarding_app_data"("p_app_uuid" "uuid", "p_preserve_app_version_id" bigint) FROM "anon";
REVOKE ALL ON FUNCTION "public"."clear_onboarding_app_data"("p_app_uuid" "uuid", "p_preserve_app_version_id" bigint) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."clear_onboarding_app_data"("p_app_uuid" "uuid", "p_preserve_app_version_id" bigint) TO "service_role";

CREATE OR REPLACE FUNCTION "public"."clear_onboarding_app_data"("p_app_uuid" "uuid")
RETURNS void
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM "public"."reset_onboarding_demo_app_data"(p_app_uuid);
END;
$$;

ALTER FUNCTION "public"."clear_onboarding_app_data"("p_app_uuid" "uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."clear_onboarding_app_data"("p_app_uuid" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."clear_onboarding_app_data"("p_app_uuid" "uuid") FROM "anon";
REVOKE ALL ON FUNCTION "public"."clear_onboarding_app_data"("p_app_uuid" "uuid") FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."clear_onboarding_app_data"("p_app_uuid" "uuid") TO "service_role";
