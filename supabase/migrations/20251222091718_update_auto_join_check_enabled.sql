/*
 * Organization Email Domain Auto-Join - Enable/Disable Flag
 * 
 * PURPOSE:
 * Updates the auto-join logic to respect the sso_enabled flag, allowing organizations
 * to toggle auto-join functionality on/off without removing configured domains.
 * 
 * CHANGES MADE:
 * - Updates find_orgs_by_email_domain() to only return orgs where sso_enabled = true
 * - This ensures auto-join only happens for organizations that have explicitly enabled it
 * 
 * USE CASES:
 * 1. Organization wants to temporarily pause auto-join enrollment
 * 2. Testing domain configuration before enabling
 * 3. Maintaining domain config while restricting new auto-joins
 * 4. Compliance/security requirement to disable feature temporarily
 * 
 * BEHAVIOR:
 * - When sso_enabled=false: Existing members remain, no new auto-joins
 * - When sso_enabled=true: New signups/logins with matching domain are auto-joined
 * - Database function checks this flag before returning matching organizations
 * 
 * INTEGRATION:
 * - Used by auto_join_user_to_orgs_by_email() function during signup/login
 * - Enforced in unique_sso_domain constraint (only enabled orgs checked)
 * - Displayed in frontend auto-join configuration UI
 * 
 * Related migrations:
 * - 20251222054835_add_org_email_domain_auto_join.sql (base feature)
 * - 20251222073507_add_domain_security_constraints.sql (adds sso_enabled column)
 * 
 * Migration created: 2024-12-22
 */

-- Update find_orgs_by_email_domain to only return orgs with sso_enabled = true
-- We need to drop and recreate to modify the function body and fix the return type
DROP FUNCTION IF EXISTS "public"."find_orgs_by_email_domain"(text);

CREATE OR REPLACE FUNCTION "public"."find_orgs_by_email_domain"("user_email" text)
RETURNS TABLE("org_id" uuid, "org_name" text)
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  email_domain text;
BEGIN
  -- Extract domain from email (everything after @)
  email_domain := lower(split_part(user_email, '@', 2));
  
  -- Return all orgs that have this domain in allowed_email_domains AND sso_enabled = true
  RETURN QUERY
  SELECT 
    orgs.id AS org_id,
    orgs.name AS org_name
  FROM public.orgs
  WHERE email_domain = ANY(orgs.allowed_email_domains)
  AND email_domain != ''  -- Ensure we have a valid domain
  AND orgs.sso_enabled = TRUE;  -- Only include orgs with auto-join enabled
END;
$$;

ALTER FUNCTION "public"."find_orgs_by_email_domain"("user_email" text) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."find_orgs_by_email_domain"("user_email" text) IS 'Finds all organizations that allow auto-join for the domain of the given email address and have auto-join enabled (sso_enabled = true)';
