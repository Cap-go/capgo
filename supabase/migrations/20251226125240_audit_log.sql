-- Audit Log Table for tracking CRUD operations
-- Tables tracked: orgs, apps, channels, app_versions, org_users

-- Create the audit_logs table
CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
  "id" BIGSERIAL PRIMARY KEY,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "table_name" TEXT NOT NULL,
  "record_id" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "user_id" UUID,
  "org_id" UUID NOT NULL,
  "old_record" JSONB,
  "new_record" JSONB,
  "changed_fields" TEXT[]
);

-- Add comments
COMMENT ON TABLE "public"."audit_logs" IS 'Audit log for tracking changes to orgs, apps, channels, app_versions, and org_users tables';
COMMENT ON COLUMN "public"."audit_logs"."table_name" IS 'Name of the table that was modified (orgs, apps, channels, app_versions, org_users)';
COMMENT ON COLUMN "public"."audit_logs"."record_id" IS 'Primary key of the affected record';
COMMENT ON COLUMN "public"."audit_logs"."operation" IS 'Type of operation: INSERT, UPDATE, or DELETE';
COMMENT ON COLUMN "public"."audit_logs"."user_id" IS 'User who made the change (from auth.uid() or API key)';
COMMENT ON COLUMN "public"."audit_logs"."org_id" IS 'Organization context for filtering';
COMMENT ON COLUMN "public"."audit_logs"."old_record" IS 'Previous state of the record (null for INSERT)';
COMMENT ON COLUMN "public"."audit_logs"."new_record" IS 'New state of the record (null for DELETE)';
COMMENT ON COLUMN "public"."audit_logs"."changed_fields" IS 'Array of field names that changed (for UPDATE operations)';

-- Add foreign key constraints for referential integrity
ALTER TABLE "public"."audit_logs"
  ADD CONSTRAINT audit_logs_org_id_fkey
  FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id")
  ON DELETE CASCADE;

ALTER TABLE "public"."audit_logs"
  ADD CONSTRAINT audit_logs_user_id_fkey
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE SET NULL;

-- Create indexes for efficient querying
CREATE INDEX idx_audit_logs_org_id ON "public"."audit_logs"("org_id");
CREATE INDEX idx_audit_logs_table_name ON "public"."audit_logs"("table_name");
CREATE INDEX idx_audit_logs_user_id ON "public"."audit_logs"("user_id");
CREATE INDEX idx_audit_logs_created_at ON "public"."audit_logs"("created_at" DESC);
CREATE INDEX idx_audit_logs_org_created ON "public"."audit_logs"("org_id", "created_at" DESC);
CREATE INDEX idx_audit_logs_operation ON "public"."audit_logs"("operation");

-- Create the audit trigger function
CREATE OR REPLACE FUNCTION "public"."audit_log_trigger"()
RETURNS TRIGGER
LANGUAGE plpgsql
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
  v_org_exists BOOLEAN;
BEGIN
  -- Skip audit logging for org DELETE operations
  -- When an org is deleted, we can't insert into audit_logs because the org_id
  -- foreign key would reference a non-existent org
  IF TG_TABLE_NAME = 'orgs' AND TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  -- Get current user from auth context or API key
  -- Uses get_identity() to support both JWT auth and API key authentication
  v_user_id := public.get_identity();

  -- Skip audit logging if no user is identified
  -- We only want to log actions performed by authenticated users
  IF v_user_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Convert records to JSONB based on operation type
  IF TG_OP = 'DELETE' THEN
    v_old_record := to_jsonb(OLD);
    v_new_record := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_old_record := NULL;
    v_new_record := to_jsonb(NEW);
  ELSE -- UPDATE
    v_old_record := to_jsonb(OLD);
    v_new_record := to_jsonb(NEW);

    -- Calculate changed fields by comparing old and new values
    FOR v_key IN SELECT jsonb_object_keys(v_new_record)
    LOOP
      IF v_old_record->v_key IS DISTINCT FROM v_new_record->v_key THEN
        v_changed_fields := array_append(v_changed_fields, v_key);
      END IF;
    END LOOP;
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

  -- Only insert if we have a valid org_id and the org still exists
  -- This handles edge cases where related tables are deleted after the org
  IF v_org_id IS NOT NULL THEN
    -- Check if the org still exists (important for DELETE operations on child tables)
    SELECT EXISTS(SELECT 1 FROM public.orgs WHERE id = v_org_id) INTO v_org_exists;

    IF v_org_exists THEN
      INSERT INTO "public"."audit_logs" (
        table_name, record_id, operation, user_id, org_id,
        old_record, new_record, changed_fields
      ) VALUES (
        TG_TABLE_NAME, v_record_id, TG_OP, v_user_id, v_org_id,
        v_old_record, v_new_record, v_changed_fields
      );
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach triggers to tracked tables

-- Orgs audit trigger
CREATE TRIGGER audit_orgs_trigger
  AFTER INSERT OR UPDATE OR DELETE ON "public"."orgs"
  FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();

-- Channels audit trigger
CREATE TRIGGER audit_channels_trigger
  AFTER INSERT OR UPDATE OR DELETE ON "public"."channels"
  FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();

-- App versions audit trigger
CREATE TRIGGER audit_app_versions_trigger
  AFTER INSERT OR UPDATE OR DELETE ON "public"."app_versions"
  FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();

-- Org users audit trigger
CREATE TRIGGER audit_org_users_trigger
  AFTER INSERT OR UPDATE OR DELETE ON "public"."org_users"
  FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();

-- Apps audit trigger
CREATE TRIGGER audit_apps_trigger
  AFTER INSERT OR UPDATE OR DELETE ON "public"."apps"
  FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();

-- Enable Row Level Security
ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Only super_admins can view audit logs for their organizations
CREATE POLICY "Allow select for auth, api keys (super_admin+)" ON "public"."audit_logs" FOR
SELECT
  TO "authenticated",
  "anon" USING (
    "public"."check_min_rights" (
      'super_admin'::"public"."user_min_right",
      "public"."get_identity_org_allowed" (
        '{read,upload,write,all}'::"public"."key_mode" [],
        "org_id"
      ),
      "org_id",
      NULL::character varying,
      NULL::bigint
    )
  );

-- No INSERT/UPDATE/DELETE policies - only triggers can write to this table

-- Cleanup function for 90-day retention
CREATE OR REPLACE FUNCTION "public"."cleanup_old_audit_logs"()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM "public"."audit_logs"
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$;

-- Update delete_accounts_marked_for_deletion to transfer audit_logs ownership
-- This ensures audit log entries are transferred to another super_admin instead of being orphaned
CREATE OR REPLACE FUNCTION "public"."delete_accounts_marked_for_deletion" ()
RETURNS TABLE (deleted_count INTEGER, deleted_user_ids UUID[])
LANGUAGE "plpgsql"
SECURITY DEFINER
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

          -- Delete the org itself since user is last super_admin
          -- Note: audit_logs will be cascade deleted with the org
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

          -- Transfer audit_logs ownership
          UPDATE "public"."audit_logs"
          SET "user_id" = replacement_owner_id
          WHERE "user_id" = account_record.account_id AND "org_id" = org_record.org_id;
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

-- Ensure permissions remain the same (only service_role and postgres can execute)
REVOKE ALL ON FUNCTION "public"."delete_accounts_marked_for_deletion" () FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."delete_accounts_marked_for_deletion" () FROM anon;
REVOKE ALL ON FUNCTION "public"."delete_accounts_marked_for_deletion" () FROM authenticated;

GRANT EXECUTE ON FUNCTION "public"."delete_accounts_marked_for_deletion" () TO postgres;
GRANT EXECUTE ON FUNCTION "public"."delete_accounts_marked_for_deletion" () TO service_role;

-- Update process_all_cron_tasks to include audit log cleanup at 3 AM UTC
-- Per AGENTS.md, we don't create new cron jobs but add to the existing consolidated function
CREATE OR REPLACE FUNCTION public.process_all_cron_tasks () RETURNS void LANGUAGE plpgsql
SET
  search_path = '' AS $$
DECLARE
  current_hour int;
  current_minute int;
  current_second int;
BEGIN
  -- Get current time components in UTC
  current_hour := EXTRACT(HOUR FROM now());
  current_minute := EXTRACT(MINUTE FROM now());
  current_second := EXTRACT(SECOND FROM now());

  -- Every 10 seconds: High-frequency queues (at :00, :10, :20, :30, :40, :50)
  IF current_second % 10 = 0 THEN
    -- Process high-frequency queues with default batch size (950)
    BEGIN
      PERFORM public.process_function_queue(ARRAY['on_channel_update', 'on_user_create', 'on_user_update', 'on_version_delete', 'on_version_update', 'on_app_delete', 'on_organization_create', 'on_user_delete', 'on_app_create']);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_function_queue (high-frequency) failed: %', SQLERRM;
    END;

    -- Process channel device counts with batch size 1000
    BEGIN
      PERFORM public.process_channel_device_counts_queue(1000);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_channel_device_counts_queue failed: %', SQLERRM;
    END;

  END IF;

  -- Every minute (at :00 seconds): Per-minute tasks
  IF current_second = 0 THEN
    BEGIN
      PERFORM public.delete_accounts_marked_for_deletion();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'delete_accounts_marked_for_deletion failed: %', SQLERRM;
    END;

    -- Process with batch size 10
    BEGIN
      PERFORM public.process_function_queue(ARRAY['cron_sync_sub', 'cron_stat_app'], 10);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_function_queue (per-minute) failed: %', SQLERRM;
    END;

    -- on_manifest_create uses default batch size
    BEGIN
      PERFORM public.process_function_queue(ARRAY['on_manifest_create']);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_function_queue (manifest_create) failed: %', SQLERRM;
    END;
  END IF;

  -- Every 5 minutes (at :00 seconds): Org stats with batch size 10
  IF current_minute % 5 = 0 AND current_second = 0 THEN
    BEGIN
      PERFORM public.process_function_queue(ARRAY['cron_stat_org'], 10);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_function_queue (cron_stat_org) failed: %', SQLERRM;
    END;
  END IF;

  -- Every hour (at :00:00): Hourly cleanup
  IF current_minute = 0 AND current_second = 0 THEN
    BEGIN
      PERFORM public.cleanup_frequent_job_details();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'cleanup_frequent_job_details failed: %', SQLERRM;
    END;
  END IF;

  -- Every 2 hours (at :00:00): Low-frequency queues with default batch size
  IF current_hour % 2 = 0 AND current_minute = 0 AND current_second = 0 THEN
    BEGIN
      PERFORM public.process_function_queue(ARRAY['admin_stats', 'cron_email', 'on_version_create', 'on_organization_delete', 'on_deploy_history_create', 'cron_clear_versions']);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_function_queue (low-frequency) failed: %', SQLERRM;
    END;
  END IF;

  -- Every 6 hours (at :00:00): Stats jobs
  IF current_hour % 6 = 0 AND current_minute = 0 AND current_second = 0 THEN
    BEGIN
      PERFORM public.process_cron_stats_jobs();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_cron_stats_jobs failed: %', SQLERRM;
    END;
  END IF;

  -- Daily at 00:00:00 - Midnight tasks
  IF current_hour = 0 AND current_minute = 0 AND current_second = 0 THEN
    BEGIN
      PERFORM public.cleanup_queue_messages();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'cleanup_queue_messages failed: %', SQLERRM;
    END;

    BEGIN
      PERFORM public.delete_old_deleted_apps();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'delete_old_deleted_apps failed: %', SQLERRM;
    END;

    BEGIN
      PERFORM public.remove_old_jobs();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'remove_old_jobs failed: %', SQLERRM;
    END;
  END IF;

  -- Daily at 00:40:00 - Old app version retention
  IF current_hour = 0 AND current_minute = 40 AND current_second = 0 THEN
    BEGIN
      PERFORM public.update_app_versions_retention();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'update_app_versions_retention failed: %', SQLERRM;
    END;
  END IF;

  -- Daily at 01:01:00 - Admin stats creation
  IF current_hour = 1 AND current_minute = 1 AND current_second = 0 THEN
    BEGIN
      PERFORM public.process_admin_stats();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_admin_stats failed: %', SQLERRM;
    END;
  END IF;

  -- Daily at 03:00:00 - Free trial, credits, and audit log cleanup
  IF current_hour = 3 AND current_minute = 0 AND current_second = 0 THEN
    BEGIN
      PERFORM public.process_free_trial_expired();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_free_trial_expired failed: %', SQLERRM;
    END;

    BEGIN
      PERFORM public.expire_usage_credits();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'expire_usage_credits failed: %', SQLERRM;
    END;

    -- Cleanup old audit logs (90-day retention)
    BEGIN
      PERFORM public.cleanup_old_audit_logs();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'cleanup_old_audit_logs failed: %', SQLERRM;
    END;
  END IF;

  -- Daily at 04:00:00 - Sync sub scheduler
  IF current_hour = 4 AND current_minute = 0 AND current_second = 0 THEN
    BEGIN
      PERFORM public.process_cron_sync_sub_jobs();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'process_cron_sync_sub_jobs failed: %', SQLERRM;
    END;
  END IF;

  -- Daily at 12:00:00 - Noon tasks
  IF current_hour = 12 AND current_minute = 0 AND current_second = 0 THEN
    BEGIN
      DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days';
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'cleanup job_run_details failed: %', SQLERRM;
    END;

    -- Weekly stats email (every Saturday at noon)
    IF EXTRACT(DOW FROM now()) = 6 THEN
      BEGIN
        PERFORM public.process_stats_email_weekly();
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'process_stats_email_weekly failed: %', SQLERRM;
      END;
    END IF;

    -- Monthly stats email (1st of month at noon)
    IF EXTRACT(DAY FROM now()) = 1 THEN
      BEGIN
        PERFORM public.process_stats_email_monthly();
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'process_stats_email_monthly failed: %', SQLERRM;
      END;
    END IF;

    -- Production deploy/install stats email (1st of month at noon)
    IF EXTRACT(DAY FROM now()) = 1 THEN
      BEGIN
        PERFORM public.process_production_deploy_install_stats_email();
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'process_production_deploy_install_stats_email failed: %', SQLERRM;
      END;
    END IF;
  END IF;
END;
$$;
