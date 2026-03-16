CREATE OR REPLACE FUNCTION "public"."get_sso_enforcement_by_domain"("p_domain" text)
RETURNS TABLE("org_id" uuid, "enforce_sso" boolean)
LANGUAGE "sql"
STABLE
SECURITY DEFINER
SET "search_path" TO ''
AS $$
  SELECT
    sp.org_id,
    sp.enforce_sso
  FROM "public"."sso_providers" sp
  JOIN "public"."orgs" o ON o.id = sp.org_id
  WHERE sp.domain = p_domain
    AND sp.status = 'active'
    AND o.sso_enabled = true
  LIMIT 1;
$$;

GRANT ALL ON FUNCTION "public"."get_sso_enforcement_by_domain"(text) TO "anon";
GRANT ALL ON FUNCTION "public"."get_sso_enforcement_by_domain"(text) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_sso_enforcement_by_domain"(text) TO "service_role";
