-- Migration: Normalize SSO provider domains to lowercase and remove citext dependency
-- This migration can be applied after SSO provider support is enabled.

-- Make sure existing data is persisted as lowercase text
ALTER TABLE public.sso_providers
ALTER COLUMN domain TYPE text USING lower(btrim(domain));

-- Enforce lowercase values for all future writes
ALTER TABLE public.sso_providers
DROP CONSTRAINT IF EXISTS sso_providers_domain_lowercase_check;

ALTER TABLE public.sso_providers
ADD CONSTRAINT sso_providers_domain_lowercase_check
CHECK (domain = lower(btrim(domain)));

-- Remove citext only after no longer needed by sso_providers.domain
DROP EXTENSION IF EXISTS "citext";

CREATE OR REPLACE FUNCTION public.normalize_sso_provider_domain()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.domain := lower(btrim(NEW.domain));
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.normalize_sso_provider_domain() OWNER TO "postgres";
REVOKE ALL ON FUNCTION public.normalize_sso_provider_domain() FROM PUBLIC;

DROP TRIGGER IF EXISTS normalize_sso_provider_domain_before_upsert ON public.sso_providers;
CREATE TRIGGER normalize_sso_provider_domain_before_upsert
BEFORE INSERT OR UPDATE OF domain
ON public.sso_providers
FOR EACH ROW
EXECUTE FUNCTION public.normalize_sso_provider_domain();

-- Keep SSO lookups deterministic for caller-supplied email domain values
CREATE OR REPLACE FUNCTION public.check_domain_sso(p_domain text)
RETURNS TABLE (
    has_sso boolean,
    provider_id text,
    org_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        true AS has_sso,
        sp.provider_id,
        sp.org_id
    FROM public.sso_providers AS sp
    JOIN public.orgs AS o ON o.id = sp.org_id
    WHERE sp."domain" = lower(btrim(p_domain))
      AND sp.status = 'active'
      AND o.sso_enabled = true
    LIMIT 1;
$$;

ALTER FUNCTION public.check_domain_sso(text) OWNER TO "postgres";
REVOKE ALL ON FUNCTION public.check_domain_sso(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_domain_sso(text) TO anon;
GRANT EXECUTE ON FUNCTION public.check_domain_sso(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_domain_sso(text) TO service_role;

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
  WHERE sp.domain = lower(btrim(p_domain))
    AND sp.status = 'active'
    AND o.sso_enabled = true
  LIMIT 1;
$$;

ALTER FUNCTION "public"."get_sso_enforcement_by_domain"(text) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."get_sso_enforcement_by_domain"(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."get_sso_enforcement_by_domain"(text) TO anon;
GRANT EXECUTE ON FUNCTION "public"."get_sso_enforcement_by_domain"(text) TO authenticated;
GRANT EXECUTE ON FUNCTION "public"."get_sso_enforcement_by_domain"(text) TO service_role;
