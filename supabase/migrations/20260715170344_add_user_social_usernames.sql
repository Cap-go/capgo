ALTER TABLE "public"."users"
ADD COLUMN "discord_username" character varying(32),
ADD COLUMN "github_username" character varying(39);

COMMENT ON COLUMN "public"."users"."discord_username" IS 'Optional Discord username supplied by the user for future experience enrichment.';
COMMENT ON COLUMN "public"."users"."github_username" IS 'Optional GitHub username supplied by the user for future experience enrichment.';

-- Finish the RBAC-only baseline cleanup so database tests and new deployments do
-- not retain a trigger body that references the removed org_users.user_right column.
CREATE OR REPLACE FUNCTION "public"."generate_org_user_on_org_create"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  org_super_admin_role_id uuid;
BEGIN
  SELECT "id"
  INTO org_super_admin_role_id
  FROM "public"."roles"
  WHERE "name" = "public"."rbac_role_org_super_admin"()
  LIMIT 1;

  IF org_super_admin_role_id IS NOT NULL THEN
    INSERT INTO "public"."role_bindings" (
      "principal_type",
      "principal_id",
      "role_id",
      "scope_type",
      "org_id",
      "granted_by",
      "granted_at",
      "reason",
      "is_direct"
    ) VALUES (
      "public"."rbac_principal_user"(),
      NEW."created_by",
      org_super_admin_role_id,
      "public"."rbac_scope_org"(),
      NEW."id",
      NEW."created_by",
      pg_catalog.now(),
      'Auto-granted on org creation',
      true
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "public"."generate_org_user_on_org_create"() IS 'Creates the initial org super-admin role binding when an organization is created.';

REVOKE ALL ON FUNCTION "public"."get_org_apikeys"(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION "public"."get_org_apikeys"(uuid) TO authenticated;
