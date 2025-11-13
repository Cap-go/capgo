-- Migration: Transfer ownership of apps, app_versions, and deploy_history before user deletion
-- Logic:
-- 1. For each user being deleted, get all their orgs
-- 2. For each org, check if they are the last super_admin
-- 3. If last super_admin: DELETE all org resources (apps, app_versions, deploy_history, channels)
-- 4. If NOT last super_admin: TRANSFER ownership to another super_admin in the org

-- Update the delete_accounts_marked_for_deletion function to handle ownership properly
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

          -- Delete channels for this org
          DELETE FROM "public"."channels" WHERE "owner_org" = org_record.org_id;

          -- Delete app_versions for this org
          DELETE FROM "public"."app_versions" WHERE "owner_org" = org_record.org_id;

          -- Delete apps for this org
          DELETE FROM "public"."apps" WHERE "owner_org" = org_record.org_id;

          -- Delete the org itself since user is last super_admin
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

-- Ensure permissions remain the same (only service_role and postgres can execute)
REVOKE ALL ON FUNCTION "public"."delete_accounts_marked_for_deletion" () FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."delete_accounts_marked_for_deletion" () FROM anon;
REVOKE ALL ON FUNCTION "public"."delete_accounts_marked_for_deletion" () FROM authenticated;

GRANT EXECUTE ON FUNCTION "public"."delete_accounts_marked_for_deletion" () TO postgres;
GRANT EXECUTE ON FUNCTION "public"."delete_accounts_marked_for_deletion" () TO service_role;
