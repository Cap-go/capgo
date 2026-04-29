-- Enable RBAC for all existing organizations
UPDATE "public"."orgs"
SET "use_new_rbac" = true
WHERE "use_new_rbac" = false;
