CREATE TABLE IF NOT EXISTS "public"."org_id_tombstones" (
  "org_id" uuid NOT NULL,
  "deleted_at" timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE "public"."org_id_tombstones" OWNER TO "postgres";

ALTER TABLE ONLY "public"."org_id_tombstones"
  DROP CONSTRAINT IF EXISTS "org_id_tombstones_pkey";

ALTER TABLE ONLY "public"."org_id_tombstones"
  ADD CONSTRAINT "org_id_tombstones_pkey" PRIMARY KEY ("org_id");

COMMENT ON TABLE "public"."org_id_tombstones" IS 'Deleted organization ids that must never be reused while retained audit logs can reference them.';
COMMENT ON COLUMN "public"."org_id_tombstones"."org_id" IS 'Deleted organization id retained without foreign keys to prevent UUID reuse from exposing retained audit logs.';

ALTER TABLE "public"."org_id_tombstones" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."org_id_tombstones" FROM PUBLIC;
REVOKE ALL ON TABLE "public"."org_id_tombstones" FROM "anon";
REVOKE ALL ON TABLE "public"."org_id_tombstones" FROM "authenticated";
GRANT ALL ON TABLE "public"."org_id_tombstones" TO "service_role";

DROP POLICY IF EXISTS "Deny client select on org_id_tombstones" ON "public"."org_id_tombstones";
CREATE POLICY "Deny client select on org_id_tombstones"
ON "public"."org_id_tombstones"
AS RESTRICTIVE
FOR SELECT
TO "anon", "authenticated"
USING (false);

DROP POLICY IF EXISTS "Deny client insert on org_id_tombstones" ON "public"."org_id_tombstones";
CREATE POLICY "Deny client insert on org_id_tombstones"
ON "public"."org_id_tombstones"
AS RESTRICTIVE
FOR INSERT
TO "anon", "authenticated"
WITH CHECK (false);

DROP POLICY IF EXISTS "Deny client update on org_id_tombstones" ON "public"."org_id_tombstones";
CREATE POLICY "Deny client update on org_id_tombstones"
ON "public"."org_id_tombstones"
AS RESTRICTIVE
FOR UPDATE
TO "anon", "authenticated"
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "Deny client delete on org_id_tombstones" ON "public"."org_id_tombstones";
CREATE POLICY "Deny client delete on org_id_tombstones"
ON "public"."org_id_tombstones"
AS RESTRICTIVE
FOR DELETE
TO "anon", "authenticated"
USING (false);

INSERT INTO "public"."org_id_tombstones" ("org_id")
SELECT DISTINCT "audit_logs"."org_id"
FROM "public"."audit_logs" AS "audit_logs"
LEFT JOIN "public"."orgs" AS "orgs" ON "orgs"."id" = "audit_logs"."org_id"
WHERE "orgs"."id" IS NULL
ON CONFLICT ("org_id") DO NOTHING;

ALTER TABLE "public"."audit_logs"
  DROP CONSTRAINT IF EXISTS "audit_logs_org_id_fkey";

ALTER TABLE "public"."audit_logs"
  DROP CONSTRAINT IF EXISTS "audit_logs_user_id_fkey";

ALTER TABLE "public"."audit_logs"
  ADD COLUMN IF NOT EXISTS "actor_type" text NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS "actor_user_id" uuid,
  ADD COLUMN IF NOT EXISTS "actor_user_email" text,
  ADD COLUMN IF NOT EXISTS "actor_apikey_id" bigint,
  ADD COLUMN IF NOT EXISTS "actor_apikey_name" text;

ALTER TABLE "public"."audit_logs"
  DROP CONSTRAINT IF EXISTS "audit_logs_actor_type_check";

ALTER TABLE "public"."audit_logs"
  ADD CONSTRAINT "audit_logs_actor_type_check"
  CHECK ("actor_type" IN ('user', 'apikey', 'system', 'unknown'));

COMMENT ON COLUMN "public"."audit_logs"."user_id" IS 'Legacy actor user id. Kept without a foreign key so audit history survives user deletion.';
COMMENT ON COLUMN "public"."audit_logs"."org_id" IS 'Organization context for filtering. Kept without a foreign key so audit history survives organization deletion.';
COMMENT ON COLUMN "public"."audit_logs"."actor_type" IS 'Source of the action: user, apikey, system, or unknown for older rows that cannot be classified.';
COMMENT ON COLUMN "public"."audit_logs"."actor_user_id" IS 'Snapshot of the user id behind the action. No foreign key by design.';
COMMENT ON COLUMN "public"."audit_logs"."actor_user_email" IS 'Snapshot of the user email at audit time. No foreign key by design.';
COMMENT ON COLUMN "public"."audit_logs"."actor_apikey_id" IS 'Snapshot of the API key id used for the action. The API key secret is never stored here.';
COMMENT ON COLUMN "public"."audit_logs"."actor_apikey_name" IS 'Snapshot of the API key name at audit time.';

UPDATE "public"."audit_logs"
SET
  "actor_type" = 'unknown',
  "actor_user_id" = "user_id"
WHERE "actor_user_id" IS NULL
  AND "actor_apikey_id" IS NULL;

UPDATE "public"."audit_logs" AS "audit_logs"
SET "actor_user_email" = "users"."email"
FROM "public"."users" AS "users"
WHERE "audit_logs"."actor_user_id" = "users"."id"
  AND "audit_logs"."actor_user_email" IS NULL;

CREATE INDEX IF NOT EXISTS "idx_audit_logs_actor_type"
  ON "public"."audit_logs"("actor_type");

CREATE INDEX IF NOT EXISTS "idx_audit_logs_actor_apikey_id"
  ON "public"."audit_logs"("actor_apikey_id");

CREATE OR REPLACE FUNCTION "public"."prevent_org_id_reuse"() RETURNS "trigger"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."id" IS DISTINCT FROM OLD."id" THEN
      RAISE EXCEPTION 'org_id_update_forbidden'
        USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "public"."org_id_tombstones"
    WHERE "org_id" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'org_id_reuse_forbidden'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."prevent_org_id_reuse"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."prevent_org_id_reuse"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_org_id_reuse"() TO "service_role";

CREATE OR REPLACE FUNCTION "public"."lock_org_tombstone_guard"() RETURNS "trigger"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Serialize org id lifecycle changes so retained audit logs cannot become
  -- visible through a concurrent delete/recreate race on the same org UUID.
  LOCK TABLE "public"."org_id_tombstones" IN SHARE ROW EXCLUSIVE MODE;
  RETURN NULL;
END;
$$;

ALTER FUNCTION "public"."lock_org_tombstone_guard"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."lock_org_tombstone_guard"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."lock_org_tombstone_guard"() TO "service_role";

CREATE OR REPLACE FUNCTION "public"."tombstone_deleted_org_id"() RETURNS "trigger"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO "public"."org_id_tombstones" ("org_id", "deleted_at")
  VALUES (OLD."id", now())
  ON CONFLICT ("org_id") DO NOTHING;

  RETURN OLD;
END;
$$;

ALTER FUNCTION "public"."tombstone_deleted_org_id"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."tombstone_deleted_org_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tombstone_deleted_org_id"() TO "service_role";

DROP TRIGGER IF EXISTS "lock_org_tombstone_guard" ON "public"."orgs";
CREATE TRIGGER "lock_org_tombstone_guard"
  BEFORE INSERT OR DELETE OR UPDATE OF "id" ON "public"."orgs"
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."lock_org_tombstone_guard"();

DROP TRIGGER IF EXISTS "prevent_org_id_reuse" ON "public"."orgs";
CREATE TRIGGER "prevent_org_id_reuse"
  BEFORE INSERT OR UPDATE OF "id" ON "public"."orgs"
  FOR EACH ROW EXECUTE FUNCTION "public"."prevent_org_id_reuse"();

DROP TRIGGER IF EXISTS "tombstone_deleted_org_id" ON "public"."orgs";
CREATE TRIGGER "tombstone_deleted_org_id"
  BEFORE DELETE ON "public"."orgs"
  FOR EACH ROW EXECUTE FUNCTION "public"."tombstone_deleted_org_id"();

CREATE OR REPLACE FUNCTION "public"."audit_log_trigger"() RETURNS "trigger"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_record JSONB;
  v_new_record JSONB;
  v_changed_fields TEXT[];
  v_org_id UUID;
  v_record_id TEXT;
  v_user_id UUID;
  v_key TEXT;
  v_api_key_text TEXT;
  v_api_key public.apikeys%ROWTYPE;
  v_actor_type TEXT := 'system';
  v_actor_user_id UUID;
  v_actor_user_email TEXT;
  v_actor_apikey_id BIGINT;
  v_actor_apikey_name TEXT;
  v_stats_refresh_fields CONSTANT TEXT[] := ARRAY['stats_refresh_requested_at', 'stats_updated_at', 'updated_at'];
BEGIN
  SELECT auth.uid() INTO v_actor_user_id;

  IF v_actor_user_id IS NOT NULL THEN
    v_actor_type := 'user';
  ELSE
    SELECT public.get_apikey_header() INTO v_api_key_text;

    IF v_api_key_text IS NOT NULL THEN
      SELECT *
      INTO v_api_key
      FROM public.find_apikey_by_value(v_api_key_text)
      LIMIT 1;

      IF v_api_key.id IS NOT NULL AND NOT public.is_apikey_expired(v_api_key.expires_at) THEN
        v_actor_type := 'apikey';
        v_actor_user_id := v_api_key.user_id;
        v_actor_apikey_id := v_api_key.id;
        v_actor_apikey_name := v_api_key.name;
      END IF;
    END IF;
  END IF;

  IF v_actor_user_id IS NOT NULL THEN
    SELECT "email"
    INTO v_actor_user_email
    FROM "public"."users"
    WHERE "id" = v_actor_user_id;
  END IF;

  v_user_id := v_actor_user_id;

  -- Convert records to JSONB based on operation type
  IF TG_OP = 'DELETE' THEN
    v_old_record := pg_catalog.to_jsonb(OLD);
    v_new_record := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_old_record := NULL;
    v_new_record := pg_catalog.to_jsonb(NEW);
  ELSE -- UPDATE
    v_old_record := pg_catalog.to_jsonb(OLD);
    v_new_record := pg_catalog.to_jsonb(NEW);

    -- Calculate changed fields by comparing old and new values
    FOR v_key IN SELECT pg_catalog.jsonb_object_keys(v_new_record)
    LOOP
      IF v_old_record->v_key IS DISTINCT FROM v_new_record->v_key THEN
        v_changed_fields := pg_catalog.array_append(v_changed_fields, v_key);
      END IF;
    END LOOP;

    -- Dashboard chart refreshes only touch stats refresh state. The apps table
    -- also receives updated_at from its update trigger, so keep that out too.
    IF TG_TABLE_NAME = ANY(ARRAY['apps', 'orgs'])
      AND v_changed_fields && ARRAY['stats_refresh_requested_at', 'stats_updated_at']
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(v_changed_fields) AS changed_field(field_name)
        WHERE changed_field.field_name <> ALL(v_stats_refresh_fields)
      ) THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Get org_id and record_id based on table being modified
  CASE TG_TABLE_NAME
    WHEN 'orgs' THEN
      v_org_id := COALESCE(NEW.id, OLD.id);
      v_record_id := COALESCE(NEW.id, OLD.id)::TEXT;
    WHEN 'apps' THEN
      v_org_id := COALESCE(NEW.owner_org, OLD.owner_org);
      v_record_id := COALESCE(NEW.app_id, OLD.app_id)::TEXT;
    WHEN 'channels' THEN
      v_org_id := COALESCE(NEW.owner_org, OLD.owner_org);
      v_record_id := COALESCE(NEW.id, OLD.id)::TEXT;
    WHEN 'app_versions' THEN
      v_org_id := COALESCE(NEW.owner_org, OLD.owner_org);
      v_record_id := COALESCE(NEW.id, OLD.id)::TEXT;
    WHEN 'org_users' THEN
      v_org_id := COALESCE(NEW.org_id, OLD.org_id);
      v_record_id := COALESCE(NEW.id, OLD.id)::TEXT;
    ELSE
      -- Fallback for any other table (shouldn't happen with current triggers)
      v_org_id := NULL;
      v_record_id := NULL;
  END CASE;

  IF v_org_id IS NOT NULL THEN
    INSERT INTO "public"."audit_logs" (
      table_name, record_id, operation, user_id, org_id,
      old_record, new_record, changed_fields,
      actor_type, actor_user_id, actor_user_email, actor_apikey_id, actor_apikey_name
    ) VALUES (
      TG_TABLE_NAME, v_record_id, TG_OP, v_user_id, v_org_id,
      v_old_record, v_new_record, v_changed_fields,
      v_actor_type, v_actor_user_id, v_actor_user_email, v_actor_apikey_id, v_actor_apikey_name
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

ALTER FUNCTION "public"."audit_log_trigger"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."trigger_webhook_on_audit_log"() RETURNS "trigger"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Organization deletion cascades to webhooks in the same transaction. Do not
  -- enqueue an event that the asynchronous dispatcher can no longer deliver.
  IF NEW.table_name = 'orgs' AND NEW.operation = 'DELETE' THEN
    RETURN NEW;
  END IF;
  -- Queue the audit log event for webhook dispatch
  PERFORM pgmq.send(
    'webhook_dispatcher',
    jsonb_build_object(
      'function_name', 'webhook_dispatcher',
      'function_type', 'cloudflare',
      'payload', jsonb_build_object(
        'audit_log_id', NEW.id,
        'table_name', NEW.table_name,
        'operation', NEW.operation,
        'org_id', NEW.org_id,
        'record_id', NEW.record_id,
        'old_record', NEW.old_record,
        'new_record', NEW.new_record,
        'changed_fields', NEW.changed_fields,
        'user_id', NEW.user_id,
        'actor_type', NEW.actor_type,
        'actor_user_id', NEW.actor_user_id,
        'actor_user_email', NEW.actor_user_email,
        'actor_apikey_id', NEW.actor_apikey_id,
        'actor_apikey_name', NEW.actor_apikey_name,
        'created_at', NEW.created_at
      )
    )
  );
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trigger_webhook_on_audit_log"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."delete_accounts_marked_for_deletion"() RETURNS TABLE("deleted_count" integer, "deleted_user_ids" "uuid"[])
LANGUAGE "plpgsql" SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  account_record RECORD;
  org_record RECORD;
  deleted_users UUID[] := ARRAY[]::UUID[];
  total_deleted INTEGER := 0;
  other_super_admins_count INTEGER;
  replacement_owner_id UUID;
BEGIN
  -- Loop through all accounts marked for deletion where removal_date has passed
  FOR account_record IN
    SELECT "account_id", "removal_date", "removed_data"
    FROM "public"."to_delete_accounts"
    WHERE "removal_date" < NOW()
  LOOP
    BEGIN
      -- Process each org the user belongs to
      FOR org_record IN
        SELECT DISTINCT "org_id", "user_right"
        FROM "public"."org_users"
        WHERE "user_id" = account_record.account_id
      LOOP
        -- Reset replacement_owner_id for each org
        replacement_owner_id := NULL;

        -- Check if user is a super_admin in this org
        IF org_record.user_right = 'super_admin'::"public"."user_min_right" THEN
          -- Count other super_admins in this org (excluding the user being deleted)
          SELECT COUNT(*) INTO other_super_admins_count
          FROM "public"."org_users"
          WHERE "org_id" = org_record.org_id
            AND "user_id" != account_record.account_id
            AND "user_right" = 'super_admin'::"public"."user_min_right";

          IF other_super_admins_count = 0 THEN
            -- User is the last super_admin: DELETE all org resources
            RAISE NOTICE 'User % is last super_admin of org %. Deleting all org resources.',
              account_record.account_id, org_record.org_id;

          -- Delete deploy_history for this org
          DELETE FROM "public"."deploy_history" WHERE "owner_org" = org_record.org_id;

          -- Delete channel_devices for this org
          DELETE FROM "public"."channel_devices" WHERE "owner_org" = org_record.org_id;

          -- Delete channels for this org
          DELETE FROM "public"."channels" WHERE "owner_org" = org_record.org_id;

          -- Delete app_versions for this org
          DELETE FROM "public"."app_versions" WHERE "owner_org" = org_record.org_id;

          -- Delete apps for this org
          DELETE FROM "public"."apps" WHERE "owner_org" = org_record.org_id;

          -- Delete the org itself since user is last super_admin. Audit logs
          -- intentionally keep their org_id snapshot without a foreign key.
          DELETE FROM "public"."orgs" WHERE "id" = org_record.org_id;

            -- Skip ownership transfer since all resources are deleted
            CONTINUE;
          END IF;
        END IF;

        -- If we reach here, we need to transfer ownership (either non-super_admin or non-last super_admin)
        -- Find a super_admin to transfer ownership to
        SELECT "user_id" INTO replacement_owner_id
        FROM "public"."org_users"
        WHERE "org_id" = org_record.org_id
          AND "user_id" != account_record.account_id
          AND "user_right" = 'super_admin'::"public"."user_min_right"
        LIMIT 1;

        IF replacement_owner_id IS NOT NULL THEN
          RAISE NOTICE 'Transferring ownership from user % to user % in org %',
            account_record.account_id, replacement_owner_id, org_record.org_id;

          -- Transfer app ownership
          UPDATE "public"."apps"
          SET "user_id" = replacement_owner_id, "updated_at" = NOW()
          WHERE "user_id" = account_record.account_id AND "owner_org" = org_record.org_id;

          -- Transfer app_versions ownership
          UPDATE "public"."app_versions"
          SET "user_id" = replacement_owner_id, "updated_at" = NOW()
          WHERE "user_id" = account_record.account_id AND "owner_org" = org_record.org_id;

          -- Transfer channels ownership
          UPDATE "public"."channels"
          SET "created_by" = replacement_owner_id, "updated_at" = NOW()
          WHERE "created_by" = account_record.account_id AND "owner_org" = org_record.org_id;

          -- Transfer deploy_history ownership
          UPDATE "public"."deploy_history"
          SET "created_by" = replacement_owner_id, "updated_at" = NOW()
          WHERE "created_by" = account_record.account_id AND "owner_org" = org_record.org_id;

          -- Transfer org ownership if user created it
          UPDATE "public"."orgs"
          SET "created_by" = replacement_owner_id, "updated_at" = NOW()
          WHERE "id" = org_record.org_id AND "created_by" = account_record.account_id;
        ELSE
          RAISE WARNING 'No super_admin found to transfer ownership in org % for user %',
            org_record.org_id, account_record.account_id;
        END IF;
      END LOOP;

      -- Delete from public.users table
      DELETE FROM "public"."users" WHERE "id" = account_record.account_id;

      -- Delete from auth.users table
      DELETE FROM "auth"."users" WHERE "id" = account_record.account_id;

      -- Remove from to_delete_accounts table
      DELETE FROM "public"."to_delete_accounts" WHERE "account_id" = account_record.account_id;

      -- Track the deleted user
      deleted_users := "array_append"(deleted_users, account_record.account_id);
      total_deleted := total_deleted + 1;

      -- Log the deletion
      RAISE NOTICE 'Successfully deleted account: % (removal date: %)',
        account_record.account_id, account_record.removal_date;

    EXCEPTION
      WHEN OTHERS THEN
        -- Log the error but continue with other accounts
        RAISE WARNING 'Failed to delete account %: %', account_record.account_id, SQLERRM;
    END;
  END LOOP;

  -- Return results
  deleted_count := total_deleted;
  deleted_user_ids := deleted_users;
  RETURN NEXT;

  RAISE NOTICE 'Deletion process completed. Total accounts deleted: %', total_deleted;
END;
$$;

ALTER FUNCTION "public"."delete_accounts_marked_for_deletion"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."delete_accounts_marked_for_deletion"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."delete_accounts_marked_for_deletion"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."delete_accounts_marked_for_deletion"() FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."delete_accounts_marked_for_deletion"() TO "service_role";
