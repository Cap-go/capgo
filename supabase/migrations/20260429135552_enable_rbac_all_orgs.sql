-- Enable RBAC for all existing organizations.
-- Uses rbac_enable_for_org() to properly backfill role_bindings from org_users
-- before flipping the use_new_rbac flag.
--
-- Rollback (if critical issues are discovered):
--   UPDATE "public"."orgs" SET "use_new_rbac" = false WHERE "use_new_rbac" = true;
--   Note: role_bindings created by this migration will remain but become unused
--   when the flag is false. They do not need to be deleted for a safe rollback.
DO $$
DECLARE
  v_org_id uuid;
  v_result jsonb;
BEGIN
  FOR v_org_id IN
    SELECT id FROM "public"."orgs" WHERE "use_new_rbac" = false
  LOOP
    v_result := "public"."rbac_enable_for_org"(v_org_id, NULL);
  END LOOP;
END $$;
