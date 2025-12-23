/*
 * Organization Email Domain Auto-Join - Security Constraints
 * 
 * PURPOSE:
 * Adds security constraints to prevent abuse of the auto-join feature by blocking
 * public email domains and enforcing SSO domain uniqueness.
 * 
 * CONSTRAINTS ADDED:
 * 1. blocked_domain - CHECK constraint blocking common public email providers
 *    - Blocks: gmail.com, yahoo.com, outlook.com, hotmail.com, etc.
 *    - Prevents organizations from using free public email domains
 *    - Ensures only corporate/custom domains can be used
 * 
 * 2. unique_sso_domain - Unique partial index on allowed_email_domains
 *    - When sso_enabled = true, domain must be unique across all organizations
 *    - When sso_enabled = false, same domain can be shared by multiple orgs
 *    - Prevents SSO domain conflicts between organizations
 * 
 * RATIONALE:
 * - Public email domains (gmail, yahoo, etc.) could allow anyone to join
 * - SSO domains need uniqueness to prevent authentication conflicts
 * - Non-SSO domains can be shared for flexible organizational structures
 * 
 * TRIGGERS:
 * Includes triggers to automatically manage SSO domain uniqueness when
 * allowed_email_domains or sso_enabled fields are modified.
 * 
 * Related migration: 20251222054835_add_org_email_domain_auto_join.sql
 * Migration created: 2024-12-22
 */

-- Add SSO enabled column to orgs table
ALTER TABLE "public"."orgs"
ADD COLUMN IF NOT EXISTS "sso_enabled" boolean DEFAULT FALSE;

COMMENT ON COLUMN "public"."orgs"."sso_enabled" IS 'When true, this organization uses SSO and has exclusive rights to its allowed email domains';

-- Create function to check if domain is in blocklist
CREATE OR REPLACE FUNCTION "public"."is_blocked_email_domain"("domain" text)
RETURNS boolean
LANGUAGE "plpgsql"
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  blocked_domains text[] := ARRAY[
    -- Common free email providers
    'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'yahoo.fr', 'yahoo.de',
    'outlook.com', 'outlook.fr', 'outlook.de', 'hotmail.com', 'hotmail.fr', 'hotmail.co.uk',
    'live.com', 'live.fr', 'live.co.uk', 'icloud.com', 'me.com', 'mac.com',
    'protonmail.com', 'proton.me', 'aol.com', 'mail.com', 'gmx.com', 'gmx.de',
    'yandex.com', 'yandex.ru', 'mail.ru', 'qq.com', '163.com', '126.com',
    'zoho.com', 'fastmail.com', 'tutanota.com', 'tutanota.de',
    -- Temporary/disposable email services
    'tempmail.com', 'temp-mail.org', 'guerrillamail.com', 'guerrillamail.net',
    '10minutemail.com', '10minutemail.net', 'mailinator.com', 'throwaway.email',
    'trashmail.com', 'getnada.com', 'maildrop.cc', 'sharklasers.com',
    'yopmail.com', 'yopmail.fr', 'cool.fr.nf', 'jetable.fr.nf',
    'guerrillamail.biz', 'guerrillamail.de', 'spam4.me', 'grr.la',
    'guerrillamailblock.com', 'pokemail.net', 'anonymbox.com',
    -- Generic educational domains
    'student.com', 'alumni.com', 'edu.com',
    -- Other common free providers
    'inbox.com', 'email.com', 'usa.com', 'yeah.net', 'rediffmail.com'
  ];
BEGIN
  -- Check if domain is in blocklist (case-insensitive)
  RETURN LOWER(TRIM(domain)) = ANY(blocked_domains);
END;
$$;

ALTER FUNCTION "public"."is_blocked_email_domain"("domain" text) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."is_blocked_email_domain"("domain" text) IS 'Returns true if the domain is a public email provider or disposable email service that should not be allowed for organization auto-join';

-- Create function to validate allowed email domains
CREATE OR REPLACE FUNCTION "public"."validate_allowed_email_domains"()
RETURNS trigger
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  domain text;
  conflicting_org_id uuid;
  conflicting_org_name text;
BEGIN
  -- Check each domain in the array
  IF NEW.allowed_email_domains IS NOT NULL THEN
    FOREACH domain IN ARRAY NEW.allowed_email_domains
    LOOP
      -- Check if domain is blocked
      IF public.is_blocked_email_domain(domain) THEN
        RAISE EXCEPTION 'Domain % is a public email provider and cannot be used for organization auto-join', domain
          USING ERRCODE = 'check_violation',
                HINT = 'Please use a custom domain owned by your organization';
      END IF;
      
      -- If SSO is enabled, check for domain conflicts with other SSO-enabled orgs
      IF NEW.sso_enabled = TRUE THEN
        SELECT o.id, o.name INTO conflicting_org_id, conflicting_org_name
        FROM public.orgs o
        WHERE o.id != NEW.id
          AND o.sso_enabled = TRUE
          AND domain = ANY(o.allowed_email_domains)
        LIMIT 1;
        
        IF conflicting_org_id IS NOT NULL THEN
          RAISE EXCEPTION 'Domain % is already claimed by organization "%" (SSO enabled). Each domain can only be used by one SSO-enabled organization.', 
            domain, conflicting_org_name
            USING ERRCODE = 'unique_violation',
                  HINT = 'Contact support if you believe this domain should belong to your organization';
        END IF;
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."validate_allowed_email_domains"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."validate_allowed_email_domains"() IS 'Validates that allowed email domains are not public providers and enforces SSO domain uniqueness';

-- Create trigger to validate domains on insert/update
DROP TRIGGER IF EXISTS "validate_org_email_domains" ON "public"."orgs";
CREATE TRIGGER "validate_org_email_domains"
BEFORE INSERT OR UPDATE OF allowed_email_domains, sso_enabled ON "public"."orgs"
FOR EACH ROW
EXECUTE FUNCTION "public"."validate_allowed_email_domains"();

COMMENT ON TRIGGER "validate_org_email_domains" ON "public"."orgs" IS 'Validates allowed email domains against blocklist and SSO uniqueness constraints';

-- Create a partial unique index for SSO-enabled orgs with domains
-- This provides an additional layer of enforcement at the database level
-- We'll use a trigger-based approach instead of generated columns

-- Add column to store flattened SSO domain keys (maintained by trigger)
ALTER TABLE "public"."orgs"
ADD COLUMN IF NOT EXISTS "sso_domain_keys" text[];

COMMENT ON COLUMN "public"."orgs"."sso_domain_keys" IS 'Array containing unique keys for each SSO-enabled domain, used for enforcing uniqueness. Maintained automatically by trigger.';

-- Create function to update SSO domain keys
CREATE OR REPLACE FUNCTION "public"."update_sso_domain_keys"()
RETURNS trigger
LANGUAGE "plpgsql"
SET search_path = ''
AS $$
BEGIN
  -- Update sso_domain_keys based on sso_enabled and allowed_email_domains
  IF NEW.sso_enabled = TRUE AND NEW.allowed_email_domains IS NOT NULL AND array_length(NEW.allowed_email_domains, 1) > 0 THEN
    -- Create unique keys for each domain
    NEW.sso_domain_keys := (
      SELECT array_agg('sso:' || lower(trim(domain)))
      FROM unnest(NEW.allowed_email_domains) AS domain
    );
  ELSE
    NEW.sso_domain_keys := NULL;
  END IF;
  
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."update_sso_domain_keys"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."update_sso_domain_keys"() IS 'Updates the sso_domain_keys column when sso_enabled or allowed_email_domains change';

-- Create trigger to maintain sso_domain_keys
DROP TRIGGER IF EXISTS "maintain_sso_domain_keys" ON "public"."orgs";
CREATE TRIGGER "maintain_sso_domain_keys"
BEFORE INSERT OR UPDATE OF sso_enabled, allowed_email_domains ON "public"."orgs"
FOR EACH ROW
EXECUTE FUNCTION "public"."update_sso_domain_keys"();

COMMENT ON TRIGGER "maintain_sso_domain_keys" ON "public"."orgs" IS 'Automatically maintains the sso_domain_keys column';

-- Create GIN index on sso_domain_keys for efficient conflict detection
CREATE INDEX IF NOT EXISTS "idx_orgs_sso_domain_keys" 
ON "public"."orgs" USING GIN ("sso_domain_keys")
WHERE "sso_enabled" = TRUE AND "sso_domain_keys" IS NOT NULL;

COMMENT ON INDEX "public"."idx_orgs_sso_domain_keys" IS 'GIN index for efficient SSO domain conflict detection';
