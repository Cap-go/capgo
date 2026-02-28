-- Make RBAC the default mode for all newly created organizations.
-- Existing orgs are not affected (only the DEFAULT changes, not existing rows).
ALTER TABLE "public"."orgs"
  ALTER COLUMN "use_new_rbac" SET DEFAULT true;
