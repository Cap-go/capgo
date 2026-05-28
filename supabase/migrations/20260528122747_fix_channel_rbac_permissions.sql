-- Keep channel API key permissions compatible with old CLI builds while moving
-- authoritative channel mutations to RBAC-backed RLS and endpoint checks.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM public.roles
JOIN public.permissions ON permissions.key = public.rbac_perm_app_create_channel()
WHERE roles.name = public.rbac_role_app_developer()
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION "public"."normalize_public_channel_overlap"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NEW.public IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.public IS NOT DISTINCT FROM OLD.public
    AND NEW.ios IS NOT DISTINCT FROM OLD.ios
    AND NEW.android IS NOT DISTINCT FROM OLD.android
    AND NEW.electron IS NOT DISTINCT FROM OLD.electron
    AND NEW.app_id IS NOT DISTINCT FROM OLD.app_id
  THEN
    RETURN NEW;
  END IF;

  -- Row-level UPDATE triggers run after the target row is locked. Do not wait
  -- behind another same-app normalizer here; the partial unique indexes will
  -- reject the rare concurrent conflict instead of letting API calls deadlock.
  IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtext(NEW.app_id)) THEN
    RETURN NEW;
  END IF;

  WITH target AS (
    SELECT existing.id
    FROM public.channels AS existing
    WHERE existing.app_id = NEW.app_id
      AND existing.public = true
      AND existing.id IS DISTINCT FROM NEW.id
      AND (
        (NEW.ios = true AND existing.ios = true)
        OR (NEW.android = true AND existing.android = true)
        OR (NEW.electron = true AND existing.electron = true)
      )
    ORDER BY existing.id
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.channels AS existing
  SET public = false
  FROM target
  WHERE existing.id = target.id
    AND existing.public = true;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."normalize_public_channel_overlap"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."normalize_public_channel_overlap"() FROM PUBLIC;

DROP POLICY IF EXISTS "Allow insert for auth, api keys (write, all) (admin+)" ON public.channels;

CREATE POLICY "Allow insert for auth, api keys (create_channel)" ON public.channels
FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.apps
    WHERE apps.app_id = channels.app_id
      AND apps.owner_org = channels.owner_org
  )
  AND public.rbac_check_permission_request(
    public.rbac_perm_app_create_channel(),
    owner_org,
    app_id,
    NULL::bigint
  )
  AND (
    version IS NULL
    OR public.rbac_check_permission_request(
      public.rbac_perm_channel_promote_bundle(),
      owner_org,
      app_id,
      NULL::bigint
    )
  )
);

DROP POLICY IF EXISTS "Allow update for auth, api keys (write, all) (write+)" ON public.channels;

CREATE POLICY "Allow update for auth, api keys (channel write)"
ON public.channels
FOR UPDATE
TO anon, authenticated
USING (
  public.rbac_check_permission_request(
    public.rbac_perm_channel_update_settings(),
    owner_org,
    app_id,
    id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.apps
    WHERE apps.app_id = channels.app_id
      AND apps.owner_org = channels.owner_org
  )
  AND public.rbac_check_permission_request(
    public.rbac_perm_channel_update_settings(),
    owner_org,
    app_id,
    id
  )
);

DROP POLICY IF EXISTS "Allow delete for auth (admin+) (all apikey)" ON public.channels;

CREATE POLICY "Allow delete for auth, api keys (channel.delete)"
ON public.channels
FOR DELETE
TO anon, authenticated
USING (
  public.rbac_check_permission_request(
    public.rbac_perm_channel_delete(),
    owner_org,
    app_id,
    id
  )
);

CREATE OR REPLACE FUNCTION "public"."get_org_perm_for_apikey"("apikey" "text", "app_id" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
<<get_org_perm_for_apikey>>
DECLARE
  apikey_user_id uuid;
  org_id uuid;
BEGIN
  SELECT user_id INTO apikey_user_id
  FROM public.find_apikey_by_value(apikey)
  LIMIT 1;

  IF apikey_user_id IS NULL THEN
    PERFORM public.pg_log('deny: INVALID_APIKEY', jsonb_build_object('app_id', get_org_perm_for_apikey.app_id));
    RETURN 'INVALID_APIKEY';
  END IF;

  SELECT owner_org INTO org_id
  FROM public.apps
  WHERE apps.app_id = get_org_perm_for_apikey.app_id
  LIMIT 1;

  IF org_id IS NULL THEN
    PERFORM public.pg_log('deny: NO_APP', jsonb_build_object('app_id', get_org_perm_for_apikey.app_id));
    RETURN 'NO_APP';
  END IF;

  IF public.rbac_check_permission_direct(public.rbac_perm_app_transfer(), apikey_user_id, org_id, get_org_perm_for_apikey.app_id, NULL::bigint, apikey) THEN
    RETURN 'perm_owner';
  END IF;

  -- Old CLI builds ask this coarse helper for admin before channel create/set/delete
  -- because they cannot pass an action name. Return admin for channel-mutating RBAC
  -- permissions so old CLI reaches the authoritative RLS/endpoint checks below.
  IF public.rbac_check_permission_direct(public.rbac_perm_app_update_user_roles(), apikey_user_id, org_id, get_org_perm_for_apikey.app_id, NULL::bigint, apikey)
    OR public.rbac_check_permission_direct(public.rbac_perm_channel_delete(), apikey_user_id, org_id, get_org_perm_for_apikey.app_id, NULL::bigint, apikey)
    OR public.rbac_check_permission_direct(public.rbac_perm_app_create_channel(), apikey_user_id, org_id, get_org_perm_for_apikey.app_id, NULL::bigint, apikey)
    OR public.rbac_check_permission_direct(public.rbac_perm_channel_update_settings(), apikey_user_id, org_id, get_org_perm_for_apikey.app_id, NULL::bigint, apikey)
  THEN
    RETURN 'perm_admin';
  END IF;

  IF public.rbac_check_permission_direct(public.rbac_perm_app_update_settings(), apikey_user_id, org_id, get_org_perm_for_apikey.app_id, NULL::bigint, apikey)
  THEN
    RETURN 'perm_write';
  END IF;

  IF public.rbac_check_permission_direct(public.rbac_perm_app_upload_bundle(), apikey_user_id, org_id, get_org_perm_for_apikey.app_id, NULL::bigint, apikey) THEN
    RETURN 'perm_upload';
  END IF;

  IF public.rbac_check_permission_direct(public.rbac_perm_app_read(), apikey_user_id, org_id, get_org_perm_for_apikey.app_id, NULL::bigint, apikey) THEN
    RETURN 'perm_read';
  END IF;

  PERFORM public.pg_log('deny: perm_none', jsonb_build_object('org_id', org_id, 'apikey_user_id', apikey_user_id));
  RETURN 'perm_none';
END;
$$;

ALTER FUNCTION "public"."get_org_perm_for_apikey"("apikey" "text", "app_id" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_org_perm_for_apikey_v2"("apikey" "text", "app_id" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
BEGIN
  SELECT user_id INTO v_user_id
  FROM public.find_apikey_by_value(get_org_perm_for_apikey_v2.apikey)
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN 'INVALID_APIKEY';
  END IF;

  SELECT owner_org INTO v_org_id
  FROM public.apps
  WHERE public.apps.app_id = get_org_perm_for_apikey_v2.app_id
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RETURN 'NO_APP';
  END IF;

  IF public.rbac_check_permission_direct(
    public.rbac_perm_app_transfer(), v_user_id, v_org_id, get_org_perm_for_apikey_v2.app_id::varchar, NULL,
    get_org_perm_for_apikey_v2.apikey
  ) THEN
    RETURN 'perm_owner';
  END IF;

  IF public.rbac_check_permission_direct(
    public.rbac_perm_app_update_user_roles(), v_user_id, v_org_id, get_org_perm_for_apikey_v2.app_id::varchar, NULL,
    get_org_perm_for_apikey_v2.apikey
  )
    OR public.rbac_check_permission_direct(
      public.rbac_perm_channel_delete(), v_user_id, v_org_id, get_org_perm_for_apikey_v2.app_id::varchar, NULL,
      get_org_perm_for_apikey_v2.apikey
    )
  THEN
    RETURN 'perm_admin';
  END IF;

  IF public.rbac_check_permission_direct(
    public.rbac_perm_app_update_settings(), v_user_id, v_org_id, get_org_perm_for_apikey_v2.app_id::varchar, NULL,
    get_org_perm_for_apikey_v2.apikey
  )
    OR public.rbac_check_permission_direct(
      public.rbac_perm_app_create_channel(), v_user_id, v_org_id, get_org_perm_for_apikey_v2.app_id::varchar, NULL,
      get_org_perm_for_apikey_v2.apikey
    )
    OR public.rbac_check_permission_direct(
      public.rbac_perm_channel_update_settings(), v_user_id, v_org_id, get_org_perm_for_apikey_v2.app_id::varchar, NULL,
      get_org_perm_for_apikey_v2.apikey
    )
  THEN
    RETURN 'perm_write';
  END IF;

  IF public.rbac_check_permission_direct(
    public.rbac_perm_app_upload_bundle(), v_user_id, v_org_id, get_org_perm_for_apikey_v2.app_id::varchar, NULL,
    get_org_perm_for_apikey_v2.apikey
  ) THEN
    RETURN 'perm_upload';
  END IF;

  IF public.rbac_check_permission_direct(
    public.rbac_perm_app_read(), v_user_id, v_org_id, get_org_perm_for_apikey_v2.app_id::varchar, NULL,
    get_org_perm_for_apikey_v2.apikey
  ) THEN
    RETURN 'perm_read';
  END IF;

  RETURN 'perm_none';
END;
$$;

ALTER FUNCTION "public"."get_org_perm_for_apikey_v2"("apikey" "text", "app_id" "text") OWNER TO "postgres";

-- RBAC is now always enabled. Keep compatibility RPC names/shapes but remove the
-- per-org rollout column and any runtime dependency on it.
CREATE OR REPLACE FUNCTION "public"."rbac_is_enabled_for_org"("p_org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
BEGIN
  PERFORM p_org_id;
  RETURN true;
END;
$$;

ALTER FUNCTION "public"."rbac_is_enabled_for_org"("p_org_id" "uuid") OWNER TO "postgres";
COMMENT ON FUNCTION "public"."rbac_is_enabled_for_org"("p_org_id" "uuid") IS 'Compatibility helper retained for old callers. RBAC is always enabled.';

CREATE OR REPLACE FUNCTION "public"."rbac_enable_for_org"("p_org_id" "uuid", "p_granted_by" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_migration_result jsonb;
BEGIN
  v_migration_result := public.rbac_migrate_org_users_to_bindings(p_org_id, p_granted_by);

  RETURN jsonb_build_object(
    'status', 'already_enabled',
    'org_id', p_org_id,
    'migration_result', v_migration_result,
    'rbac_enabled', true
  );
END;
$$;

ALTER FUNCTION "public"."rbac_enable_for_org"("p_org_id" "uuid", "p_granted_by" "uuid") OWNER TO "postgres";
COMMENT ON FUNCTION "public"."rbac_enable_for_org"("p_org_id" "uuid", "p_granted_by" "uuid") IS 'Compatibility RPC. RBAC is always enabled; this only resyncs legacy org_users bindings.';

CREATE OR REPLACE FUNCTION "public"."rbac_rollback_org"("p_org_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN jsonb_build_object(
    'status', 'success',
    'org_id', p_org_id,
    'rbac_enabled', true,
    'rollback_performed', false,
    'message', 'RBAC is always enabled and cannot be rolled back'
  );
END;
$$;

ALTER FUNCTION "public"."rbac_rollback_org"("p_org_id" "uuid") OWNER TO "postgres";
COMMENT ON FUNCTION "public"."rbac_rollback_org"("p_org_id" "uuid") IS 'Compatibility RPC. RBAC rollback is a no-op because RBAC is always enabled.';

CREATE OR REPLACE FUNCTION "public"."resync_org_user_role_bindings"(
  "p_user_id" "uuid",
  "p_org_id" "uuid"
) RETURNS void
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO ''
AS $$
DECLARE
  v_org_user "public"."org_users"%ROWTYPE;
  role_name_to_bind text;
  role_id_to_bind uuid;
  org_member_role_id uuid;
  app_role_name text;
  app_role_id uuid;
  v_app RECORD;
  v_app_uuid uuid;
  v_channel_uuid uuid;
  v_granted_by uuid;
  v_sync_reason text := 'Synced from org_users';
BEGIN
  DELETE FROM "public"."role_bindings" rb
  WHERE rb."principal_type" = "public"."rbac_principal_user"()
    AND rb."principal_id" = p_user_id
    AND rb."org_id" = p_org_id
    AND rb."reason" IN (
      'Synced from org_users',
      'Updated from org_users',
      'Migrated from org_users (legacy)'
    )
    AND NOT (
      rb."scope_type" = "public"."rbac_scope_org"()
      AND EXISTS (
        SELECT 1
        FROM "public"."roles" r
        WHERE r."id" = rb."role_id"
          AND r."name" = "public"."rbac_role_org_super_admin"()
      )
      AND EXISTS (
        SELECT 1
        FROM "public"."org_users" ou
        WHERE ou."user_id" = p_user_id
          AND ou."org_id" = p_org_id
          AND ou."app_id" IS NULL
          AND ou."channel_id" IS NULL
          AND ou."rbac_role_name" IS NULL
          AND ou."user_right" = "public"."rbac_right_super_admin"()
      )
    );

  FOR v_org_user IN
    SELECT *
    FROM "public"."org_users"
    WHERE "user_id" = p_user_id
      AND "org_id" = p_org_id
      AND "rbac_role_name" IS NULL
  LOOP
    v_granted_by := COALESCE("auth"."uid"(), v_org_user.user_id);

    IF v_org_user.app_id IS NULL AND v_org_user.channel_id IS NULL THEN
      IF v_org_user.user_right IN ("public"."rbac_right_super_admin"(), "public"."rbac_right_admin"()) THEN
        CASE v_org_user.user_right
          WHEN "public"."rbac_right_super_admin"() THEN role_name_to_bind := "public"."rbac_role_org_super_admin"();
          WHEN "public"."rbac_right_admin"() THEN role_name_to_bind := "public"."rbac_role_org_admin"();
        END CASE;

        SELECT id INTO role_id_to_bind
        FROM "public"."roles"
        WHERE "name" = role_name_to_bind
        LIMIT 1;

        IF role_id_to_bind IS NOT NULL THEN
          INSERT INTO "public"."role_bindings" (
            "principal_type", "principal_id", "role_id", "scope_type", "org_id",
            "granted_by", "granted_at", "reason", "is_direct"
          ) VALUES (
            "public"."rbac_principal_user"(), v_org_user.user_id, role_id_to_bind, "public"."rbac_scope_org"(), v_org_user.org_id,
            v_granted_by, now(), v_sync_reason, true
          ) ON CONFLICT DO NOTHING;
        END IF;
      ELSIF v_org_user.user_right IN ("public"."rbac_right_read"(), "public"."rbac_right_upload"(), "public"."rbac_right_write"()) THEN
        SELECT id INTO org_member_role_id
        FROM "public"."roles"
        WHERE "name" = "public"."rbac_role_org_member"()
        LIMIT 1;

        IF org_member_role_id IS NOT NULL THEN
          INSERT INTO "public"."role_bindings" (
            "principal_type", "principal_id", "role_id", "scope_type", "org_id",
            "granted_by", "granted_at", "reason", "is_direct"
          ) VALUES (
            "public"."rbac_principal_user"(), v_org_user.user_id, org_member_role_id, "public"."rbac_scope_org"(), v_org_user.org_id,
            v_granted_by, now(), v_sync_reason, true
          ) ON CONFLICT DO NOTHING;
        END IF;

        CASE v_org_user.user_right
          WHEN "public"."rbac_right_read"() THEN app_role_name := "public"."rbac_role_app_reader"();
          WHEN "public"."rbac_right_upload"() THEN app_role_name := "public"."rbac_role_app_uploader"();
          WHEN "public"."rbac_right_write"() THEN app_role_name := "public"."rbac_role_app_developer"();
        END CASE;

        SELECT id INTO app_role_id
        FROM "public"."roles"
        WHERE "name" = app_role_name
        LIMIT 1;

        IF app_role_id IS NOT NULL THEN
          FOR v_app IN
            SELECT id
            FROM "public"."apps"
            WHERE "owner_org" = v_org_user.org_id
          LOOP
            INSERT INTO "public"."role_bindings" (
              "principal_type", "principal_id", "role_id", "scope_type", "org_id", "app_id",
              "granted_by", "granted_at", "reason", "is_direct"
            ) VALUES (
              "public"."rbac_principal_user"(), v_org_user.user_id, app_role_id, "public"."rbac_scope_app"(), v_org_user.org_id, v_app.id,
              v_granted_by, now(), v_sync_reason, true
            ) ON CONFLICT DO NOTHING;
          END LOOP;
        END IF;
      END IF;
    ELSIF v_org_user.app_id IS NOT NULL AND v_org_user.channel_id IS NULL THEN
      CASE v_org_user.user_right
        WHEN "public"."rbac_right_super_admin"() THEN role_name_to_bind := "public"."rbac_role_app_admin"();
        WHEN "public"."rbac_right_admin"() THEN role_name_to_bind := "public"."rbac_role_app_admin"();
        WHEN "public"."rbac_right_write"() THEN role_name_to_bind := "public"."rbac_role_app_developer"();
        WHEN "public"."rbac_right_upload"() THEN role_name_to_bind := "public"."rbac_role_app_uploader"();
        WHEN "public"."rbac_right_read"() THEN role_name_to_bind := "public"."rbac_role_app_reader"();
        ELSE role_name_to_bind := "public"."rbac_role_app_reader"();
      END CASE;

      SELECT id INTO role_id_to_bind
      FROM "public"."roles"
      WHERE "name" = role_name_to_bind
      LIMIT 1;

      SELECT id INTO v_app_uuid
      FROM "public"."apps"
      WHERE "app_id" = v_org_user.app_id
      LIMIT 1;

      IF role_id_to_bind IS NOT NULL AND v_app_uuid IS NOT NULL THEN
        INSERT INTO "public"."role_bindings" (
          "principal_type", "principal_id", "role_id", "scope_type", "org_id", "app_id",
          "granted_by", "granted_at", "reason", "is_direct"
        ) VALUES (
          "public"."rbac_principal_user"(), v_org_user.user_id, role_id_to_bind, "public"."rbac_scope_app"(), v_org_user.org_id, v_app_uuid,
          v_granted_by, now(), v_sync_reason, true
        ) ON CONFLICT DO NOTHING;
      END IF;
    ELSIF v_org_user.app_id IS NOT NULL AND v_org_user.channel_id IS NOT NULL THEN
      CASE v_org_user.user_right
        WHEN "public"."rbac_right_super_admin"() THEN role_name_to_bind := "public"."rbac_role_channel_admin"();
        WHEN "public"."rbac_right_admin"() THEN role_name_to_bind := "public"."rbac_role_channel_admin"();
        WHEN "public"."rbac_right_write"() THEN role_name_to_bind := 'channel_developer';
        WHEN "public"."rbac_right_upload"() THEN role_name_to_bind := 'channel_uploader';
        WHEN "public"."rbac_right_read"() THEN role_name_to_bind := "public"."rbac_role_channel_reader"();
        ELSE role_name_to_bind := "public"."rbac_role_channel_reader"();
      END CASE;

      SELECT id INTO role_id_to_bind
      FROM "public"."roles"
      WHERE "name" = role_name_to_bind
      LIMIT 1;

      SELECT id INTO v_app_uuid
      FROM "public"."apps"
      WHERE "app_id" = v_org_user.app_id
      LIMIT 1;

      SELECT "rbac_id" INTO v_channel_uuid
      FROM "public"."channels"
      WHERE "id" = v_org_user.channel_id
      LIMIT 1;

      IF role_id_to_bind IS NOT NULL AND v_app_uuid IS NOT NULL AND v_channel_uuid IS NOT NULL THEN
        INSERT INTO "public"."role_bindings" (
          "principal_type", "principal_id", "role_id", "scope_type", "org_id", "app_id", "channel_id",
          "granted_by", "granted_at", "reason", "is_direct"
        ) VALUES (
          "public"."rbac_principal_user"(), v_org_user.user_id, role_id_to_bind, "public"."rbac_scope_channel"(), v_org_user.org_id, v_app_uuid, v_channel_uuid,
          v_granted_by, now(), v_sync_reason, true
        ) ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END LOOP;
END;
$$;

ALTER FUNCTION "public"."resync_org_user_role_bindings"("p_user_id" "uuid", "p_org_id" "uuid") OWNER TO "postgres";
COMMENT ON FUNCTION "public"."resync_org_user_role_bindings"("p_user_id" "uuid", "p_org_id" "uuid") IS 'Compatibility sync from legacy org_users rows into RBAC role_bindings. RBAC invite rows are ignored.';

CREATE OR REPLACE FUNCTION "public"."sync_org_user_role_binding_on_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NEW.rbac_role_name IS NOT NULL OR OLD.rbac_role_name IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.user_right IS DISTINCT FROM NEW.user_right THEN
    PERFORM "public"."resync_org_user_role_bindings"(NEW.user_id, NEW.org_id);
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."sync_org_user_role_binding_on_update"() OWNER TO "postgres";
COMMENT ON FUNCTION "public"."sync_org_user_role_binding_on_update"() IS 'Updates role_bindings when legacy org_users.user_right changes. RBAC invite rows are ignored.';

CREATE OR REPLACE FUNCTION "public"."sync_org_user_to_role_binding"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NEW.rbac_role_name IS NOT NULL THEN
    RETURN NEW;
  END IF;

  PERFORM "public"."resync_org_user_role_bindings"(NEW.user_id, NEW.org_id);
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."sync_org_user_to_role_binding"() OWNER TO "postgres";
COMMENT ON FUNCTION "public"."sync_org_user_to_role_binding"() IS 'Creates role_bindings when legacy org_users rows are inserted. RBAC invite rows are ignored.';

DROP POLICY IF EXISTS "Allow admin to select webhooks" ON "public"."webhooks";
DROP POLICY IF EXISTS "Allow admin to insert webhooks" ON "public"."webhooks";
DROP POLICY IF EXISTS "Allow admin to update webhooks" ON "public"."webhooks";
DROP POLICY IF EXISTS "Allow admin to delete webhooks" ON "public"."webhooks";
DROP POLICY IF EXISTS "Allow org members to select webhook_deliveries" ON "public"."webhook_deliveries";
DROP POLICY IF EXISTS "Allow admin to insert webhook_deliveries" ON "public"."webhook_deliveries";
DROP POLICY IF EXISTS "Allow admin to update webhook_deliveries" ON "public"."webhook_deliveries";

ALTER TABLE "public"."orgs"
  DROP COLUMN IF EXISTS "use_new_rbac";
