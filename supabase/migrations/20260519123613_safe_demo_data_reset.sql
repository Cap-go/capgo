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
      'build_requests'::text
    ])
  )
);

ALTER TABLE "public"."onboarding_demo_data" OWNER TO "postgres";

COMMENT ON TABLE "public"."onboarding_demo_data" IS 'Tracks rows created by onboarding demo seeding so demo resets can delete only demo-owned data.';
COMMENT ON COLUMN "public"."onboarding_demo_data"."row_key" IS 'Primary-row identifier as text. Only exact rows created or confidently fingerprinted by onboarding demo seeding are tracked.';

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

CREATE OR REPLACE FUNCTION "public"."claim_legacy_onboarding_demo_data"("p_app_uuid" uuid)
RETURNS void
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_app_id text;
  v_owner_org uuid;
  v_can_claim_full_seed boolean := false;
BEGIN
  SELECT "app_id", "owner_org"
  INTO v_app_id, v_owner_org
  FROM "public"."apps"
  WHERE "id" = p_app_uuid
    AND "need_onboarding" IS TRUE;

  IF v_app_id IS NULL THEN
    RETURN;
  END IF;

  -- Legacy demo rows created before this provenance table had no durable owner
  -- marker. Only claim rows with hard demo storage/build markers. Names alone
  -- are not enough because customers can create normal 1.0.0/production rows.
  INSERT INTO "public"."onboarding_demo_data" (
    "app_id",
    "owner_org",
    "relation_name",
    "row_key",
    "seed_id"
  )
  SELECT
    v_app_id,
    v_owner_org,
    'manifest',
    m."id"::text,
    p_app_uuid
  FROM "public"."manifest" m
  INNER JOIN "public"."app_versions" av
    ON av."id" = m."app_version_id"
  WHERE av."app_id" = v_app_id
    AND m."s3_path" LIKE ('demo/' || v_app_id || '/%')
  ON CONFLICT ("app_id", "relation_name", "row_key") DO UPDATE
  SET
    "owner_org" = EXCLUDED."owner_org",
    "seed_id" = EXCLUDED."seed_id",
    "created_at" = "now"();

  INSERT INTO "public"."onboarding_demo_data" (
    "app_id",
    "owner_org",
    "relation_name",
    "row_key",
    "seed_id"
  )
  SELECT
    v_app_id,
    v_owner_org,
    'build_requests',
    br."id"::text,
    p_app_uuid
  FROM "public"."build_requests" br
  WHERE br."app_id" = v_app_id
    AND br."upload_session_key" LIKE 'demo-session-%'
    AND br."upload_path" LIKE ('builds/' || v_app_id || '/%')
    AND br."upload_url" LIKE ('https://demo-builds.example.com/' || v_app_id || '/%')
    AND COALESCE(br."build_config"->>'bundleId', '') = v_app_id
    AND (
      br."builder_job_id" LIKE 'demo-job-%'
      OR br."builder_job_id" IS NULL
    )
  ON CONFLICT ("app_id", "relation_name", "row_key") DO UPDATE
  SET
    "owner_org" = EXCLUDED."owner_org",
    "seed_id" = EXCLUDED."seed_id",
    "created_at" = "now"();

  SELECT
    EXISTS (
      SELECT 1
      FROM "public"."manifest" m
      INNER JOIN "public"."app_versions" av
        ON av."id" = m."app_version_id"
      WHERE av."app_id" = v_app_id
        AND m."s3_path" LIKE ('demo/' || v_app_id || '/%')
    )
    AND EXISTS (
      SELECT 1
      FROM "public"."build_requests" br
      WHERE br."app_id" = v_app_id
        AND br."upload_session_key" LIKE 'demo-session-%'
        AND br."upload_url" LIKE ('https://demo-builds.example.com/' || v_app_id || '/%')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "public"."app_versions" av
      WHERE av."app_id" = v_app_id
        AND av."name" NOT IN ('unknown', 'builtin', '1.0.0', '1.0.1', '1.1.0', '1.1.1', '1.2.0')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "public"."manifest" m
      INNER JOIN "public"."app_versions" av
        ON av."id" = m."app_version_id"
      WHERE av."app_id" = v_app_id
        AND m."s3_path" NOT LIKE ('demo/' || v_app_id || '/%')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "public"."channels" c
      INNER JOIN "public"."app_versions" av
        ON av."id" = c."version"
      WHERE c."app_id" = v_app_id
        AND NOT (
          c."disable_auto_update_under_native" IS TRUE
          AND c."disable_auto_update" = 'major'::"public"."disable_update"
          AND c."ios" IS TRUE
          AND c."android" IS TRUE
          AND c."electron" IS TRUE
          AND c."allow_emulator" IS TRUE
          AND c."allow_device" IS TRUE
          AND c."allow_prod" IS TRUE
          AND (
            (
              c."name" = 'production'
              AND c."public" IS TRUE
              AND c."allow_device_self_set" IS FALSE
              AND c."allow_dev" IS FALSE
              AND av."name" = '1.1.1'
            )
            OR (
              c."name" = 'development'
              AND c."public" IS FALSE
              AND c."allow_device_self_set" IS FALSE
              AND c."allow_dev" IS TRUE
              AND av."name" = '1.2.0'
            )
            OR (
              c."name" = 'pr-123'
              AND c."public" IS FALSE
              AND c."allow_device_self_set" IS TRUE
              AND c."allow_dev" IS TRUE
              AND av."name" = '1.2.0'
            )
          )
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "public"."channel_devices" cd
      WHERE cd."app_id" = v_app_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "public"."devices" d
      WHERE d."app_id" = v_app_id
        AND NOT (
          d."plugin_version" = '6.0.0'
          AND d."version_name" = '1.1.1'
          AND COALESCE(d."version_build", '') = '1'
          AND d."platform" IN ('ios'::"public"."platform_os", 'android'::"public"."platform_os")
          AND COALESCE(d."os_version", '') IN ('17.0', '14')
          AND COALESCE(d."is_prod", false) IS TRUE
          AND COALESCE(d."is_emulator", true) IS FALSE
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "public"."build_requests" br
      WHERE br."app_id" = v_app_id
        AND NOT (
          br."upload_session_key" LIKE 'demo-session-%'
          AND br."upload_path" LIKE ('builds/' || v_app_id || '/%')
          AND br."upload_url" LIKE ('https://demo-builds.example.com/' || v_app_id || '/%')
          AND COALESCE(br."build_config"->>'bundleId', '') = v_app_id
          AND (
            br."builder_job_id" LIKE 'demo-job-%'
            OR br."builder_job_id" IS NULL
          )
        )
    )
    AND NOT EXISTS (
      WITH expected_deploys AS (
        SELECT *
        FROM (VALUES
          ('production'::text, '1.0.0'::text),
          ('development'::text, '1.0.1'::text),
          ('production'::text, '1.0.1'::text),
          ('development'::text, '1.1.0'::text),
          ('production'::text, '1.1.0'::text),
          ('development'::text, '1.1.1'::text),
          ('production'::text, '1.1.1'::text),
          ('pr-123'::text, '1.2.0'::text),
          ('development'::text, '1.2.0'::text)
        ) AS expected("channel_name", "version_name")
      )
      SELECT 1
      FROM "public"."deploy_history" dh
      INNER JOIN "public"."channels" c
        ON c."id" = dh."channel_id"
      INNER JOIN "public"."app_versions" av
        ON av."id" = dh."version_id"
      WHERE dh."app_id" = v_app_id
        AND NOT EXISTS (
          SELECT 1
          FROM expected_deploys expected
          WHERE expected."channel_name" = c."name"
            AND expected."version_name" = av."name"
        )
    )
  INTO v_can_claim_full_seed;

  IF NOT v_can_claim_full_seed THEN
    RETURN;
  END IF;

  INSERT INTO "public"."onboarding_demo_data" (
    "app_id",
    "owner_org",
    "relation_name",
    "row_key",
    "seed_id"
  )
  SELECT
    v_app_id,
    v_owner_org,
    'app_versions',
    av."id"::text,
    p_app_uuid
  FROM "public"."app_versions" av
  WHERE av."app_id" = v_app_id
    AND av."name" IN ('1.0.0', '1.0.1', '1.1.0', '1.1.1', '1.2.0')
  ON CONFLICT ("app_id", "relation_name", "row_key") DO UPDATE
  SET
    "owner_org" = EXCLUDED."owner_org",
    "seed_id" = EXCLUDED."seed_id",
    "created_at" = "now"();

  INSERT INTO "public"."onboarding_demo_data" (
    "app_id",
    "owner_org",
    "relation_name",
    "row_key",
    "seed_id"
  )
  SELECT
    v_app_id,
    v_owner_org,
    'app_versions_meta',
    avm."id"::text,
    p_app_uuid
  FROM "public"."app_versions_meta" avm
  INNER JOIN "public"."app_versions" av
    ON av."id" = avm."id"
  WHERE av."app_id" = v_app_id
    AND av."name" IN ('1.0.0', '1.0.1', '1.1.0', '1.1.1', '1.2.0')
  ON CONFLICT ("app_id", "relation_name", "row_key") DO UPDATE
  SET
    "owner_org" = EXCLUDED."owner_org",
    "seed_id" = EXCLUDED."seed_id",
    "created_at" = "now"();

  INSERT INTO "public"."onboarding_demo_data" (
    "app_id",
    "owner_org",
    "relation_name",
    "row_key",
    "seed_id"
  )
  SELECT
    v_app_id,
    v_owner_org,
    'channels',
    c."id"::text,
    p_app_uuid
  FROM "public"."channels" c
  WHERE c."app_id" = v_app_id
    AND c."name" IN ('production', 'development', 'pr-123')
  ON CONFLICT ("app_id", "relation_name", "row_key") DO UPDATE
  SET
    "owner_org" = EXCLUDED."owner_org",
    "seed_id" = EXCLUDED."seed_id",
    "created_at" = "now"();

  INSERT INTO "public"."onboarding_demo_data" (
    "app_id",
    "owner_org",
    "relation_name",
    "row_key",
    "seed_id"
  )
  SELECT
    v_app_id,
    v_owner_org,
    'deploy_history',
    dh."id"::text,
    p_app_uuid
  FROM "public"."deploy_history" dh
  WHERE dh."app_id" = v_app_id
  ON CONFLICT ("app_id", "relation_name", "row_key") DO UPDATE
  SET
    "owner_org" = EXCLUDED."owner_org",
    "seed_id" = EXCLUDED."seed_id",
    "created_at" = "now"();

  INSERT INTO "public"."onboarding_demo_data" (
    "app_id",
    "owner_org",
    "relation_name",
    "row_key",
    "seed_id"
  )
  SELECT
    v_app_id,
    v_owner_org,
    'devices',
    d."id"::text,
    p_app_uuid
  FROM "public"."devices" d
  WHERE d."app_id" = v_app_id
  ON CONFLICT ("app_id", "relation_name", "row_key") DO UPDATE
  SET
    "owner_org" = EXCLUDED."owner_org",
    "seed_id" = EXCLUDED."seed_id",
    "created_at" = "now"();
END;
$$;

ALTER FUNCTION "public"."claim_legacy_onboarding_demo_data"(uuid) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."claim_legacy_onboarding_demo_data"(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."claim_legacy_onboarding_demo_data"(uuid) FROM "anon";
REVOKE ALL ON FUNCTION "public"."claim_legacy_onboarding_demo_data"(uuid) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."claim_legacy_onboarding_demo_data"(uuid) TO "service_role";

DO $$
DECLARE
  v_app_uuid uuid;
BEGIN
  FOR v_app_uuid IN
    SELECT "id"
    FROM "public"."apps"
    WHERE "need_onboarding" IS TRUE
  LOOP
    PERFORM "public"."claim_legacy_onboarding_demo_data"(v_app_uuid);
  END LOOP;
END;
$$;

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

  PERFORM "public"."claim_legacy_onboarding_demo_data"(p_app_uuid);

  -- unknown/builtin are system placeholders maintained by app creation. They
  -- are allowed in demo-shaped legacy apps, but must never be demo-owned rows.
  DELETE FROM "public"."onboarding_demo_data" odd
  USING "public"."app_versions" av
  WHERE odd."app_id" = v_app_id
    AND odd."relation_name" IN ('app_versions', 'app_versions_meta')
    AND odd."row_key" = av."id"::text
    AND av."app_id" = v_app_id
    AND av."name" IN ('unknown', 'builtin');

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
    WITH tracked_versions AS (
      SELECT "row_key"::bigint AS "id"
      FROM "public"."onboarding_demo_data"
      WHERE "app_id" = v_app_id
        AND "relation_name" = 'app_versions'
    )
    SELECT 1
    FROM "public"."version_meta" vm
    INNER JOIN tracked_versions tv ON tv."id" = vm."version_id"
    WHERE vm."app_id" = v_app_id
  ) THEN
    RAISE EXCEPTION 'reset_onboarding_demo_app_data: refusing to delete demo versions with non-nullable version metrics for app %', v_app_id;
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

  UPDATE "public"."devices" d
  SET "version" = NULL
  WHERE d."app_id" = v_app_id
    AND EXISTS (
      SELECT 1
      FROM "public"."onboarding_demo_data" odd
      WHERE odd."app_id" = v_app_id
        AND odd."relation_name" = 'app_versions'
        AND odd."row_key" = d."version"::text
    );

  UPDATE "public"."daily_version" dv
  SET "version_id" = NULL
  WHERE dv."app_id" = v_app_id
    AND EXISTS (
      SELECT 1
      FROM "public"."onboarding_demo_data" odd
      WHERE odd."app_id" = v_app_id
        AND odd."relation_name" = 'app_versions'
        AND odd."row_key" = dv."version_id"::text
    );

  UPDATE "public"."version_usage" vu
  SET "version_id" = NULL
  WHERE vu."app_id" = v_app_id
    AND EXISTS (
      SELECT 1
      FROM "public"."onboarding_demo_data" odd
      WHERE odd."app_id" = v_app_id
        AND odd."relation_name" = 'app_versions'
        AND odd."row_key" = vu."version_id"::text
    );

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
