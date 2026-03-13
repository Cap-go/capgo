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
  DELETE FROM "public"."role_bindings"
  WHERE "principal_type" = "public"."rbac_principal_user"()
    AND "principal_id" = p_user_id
    AND "org_id" = p_org_id
    AND "reason" IN (
      'Synced from org_users',
      'Updated from org_users',
      'Migrated from org_users (legacy)'
    );

  FOR v_org_user IN
    SELECT *
    FROM "public"."org_users"
    WHERE "user_id" = p_user_id
      AND "org_id" = p_org_id
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

CREATE OR REPLACE FUNCTION "public"."sync_org_user_role_binding_on_delete"()
RETURNS "trigger"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO ''
AS $$
BEGIN
  PERFORM "public"."resync_org_user_role_bindings"(OLD.user_id, OLD.org_id);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS "sync_org_user_role_binding_on_delete" ON "public"."org_users";
CREATE TRIGGER "sync_org_user_role_binding_on_delete"
AFTER DELETE ON "public"."org_users"
FOR EACH ROW
EXECUTE FUNCTION "public"."sync_org_user_role_binding_on_delete"();
