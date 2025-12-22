/*
 * Organization Email Domain Auto-Join Feature
 * 
 * PURPOSE:
 * Allows organizations to automatically enroll new members when they sign up or log in
 * with an email address from a pre-configured domain (e.g., @company.com).
 * 
 * COMPONENTS CREATED:
 * 1. Column: orgs.allowed_email_domains - Stores array of allowed domains per org
 * 2. Function: extract_email_domain() - Extracts domain from email address
 * 3. Function: find_orgs_by_email_domain() - Finds orgs matching a user's email domain
 * 4. Function: auto_join_user_to_orgs_by_email() - Adds user to matching orgs
 * 5. Trigger: auto_join_user_to_orgs_on_create - Executes on new user signup
 * 6. Index: idx_orgs_allowed_email_domains - GIN index for efficient domain lookups
 * 7. Constraint: org_users_user_org_unique - Prevents duplicate memberships
 * 
 * WORKFLOW:
 * 1. Admin configures allowed domain(s) for their organization
 * 2. New user signs up with matching email domain
 * 3. Database trigger automatically adds user to matching orgs with 'read' permission
 * 4. For existing users, login hook calls auto_join function
 * 
 * SECURITY:
 * - Public email domains blocked via CHECK constraint (added in subsequent migration)
 * - SSO domain uniqueness enforced (added in subsequent migration)
 * - Users added with lowest permission level (read-only)
 * - Admin/super_admin required to configure domains
 * 
 * PERFORMANCE:
 * - GIN index on allowed_email_domains for fast domain matching
 * - Composite index on org_users for permission checks (added in subsequent migration)
 * 
 * Migration created: 2024-12-22
 */

-- Add allowed_email_domains column to orgs table for domain-based auto-join
ALTER TABLE "public"."orgs"
ADD COLUMN IF NOT EXISTS "allowed_email_domains" text[] DEFAULT '{}';

COMMENT ON COLUMN "public"."orgs"."allowed_email_domains" IS 'List of email domains (e.g., example.com) that are allowed to auto-join this organization';

-- Create function to extract domain from email
CREATE OR REPLACE FUNCTION "public"."extract_email_domain"("email" text) 
RETURNS text 
LANGUAGE "plpgsql"
SET search_path = ''
AS $$
BEGIN
  -- Extract domain from email (everything after @)
  RETURN LOWER(TRIM(SPLIT_PART(email, '@', 2)));
END;
$$;

ALTER FUNCTION "public"."extract_email_domain"("email" text) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."extract_email_domain"("email" text) IS 'Extracts the domain portion from an email address (everything after @)';

-- Create function to find orgs that allow a specific email domain
CREATE OR REPLACE FUNCTION "public"."find_orgs_by_email_domain"("user_email" text)
RETURNS TABLE (
  "org_id" uuid,
  "org_name" text
)
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  email_domain text;
BEGIN
  -- Extract domain from user email
  email_domain := public.extract_email_domain(user_email);
  
  -- Return orgs that have this domain in their allowed list
  RETURN QUERY
  SELECT 
    orgs.id AS org_id,
    orgs.name AS org_name
  FROM public.orgs
  WHERE email_domain = ANY(orgs.allowed_email_domains)
  AND email_domain != '';  -- Ensure we have a valid domain
END;
$$;

ALTER FUNCTION "public"."find_orgs_by_email_domain"("user_email" text) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."find_orgs_by_email_domain"("user_email" text) IS 'Finds all organizations that allow auto-join for the domain of the given email address';

-- Create function to auto-add user to orgs based on email domain
CREATE OR REPLACE FUNCTION "public"."auto_join_user_to_orgs_by_email"("p_user_id" uuid, "p_email" text)
RETURNS integer
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  matching_org RECORD;
  added_count integer := 0;
BEGIN
  -- Loop through all matching orgs
  FOR matching_org IN 
    SELECT org_id, org_name FROM public.find_orgs_by_email_domain(p_email)
  LOOP
    -- Check if user is not already a member
    IF NOT EXISTS (
      SELECT 1 FROM public.org_users
      WHERE user_id = p_user_id 
      AND org_id = matching_org.org_id
    ) THEN
      -- Add user to org with 'read' permission
      INSERT INTO public.org_users (user_id, org_id, user_right)
      VALUES (p_user_id, matching_org.org_id, 'read'::"public"."user_min_right")
      ON CONFLICT DO NOTHING;
      
      added_count := added_count + 1;
    END IF;
  END LOOP;
  
  RETURN added_count;
END;
$$;

ALTER FUNCTION "public"."auto_join_user_to_orgs_by_email"("p_user_id" uuid, "p_email" text) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."auto_join_user_to_orgs_by_email"("p_user_id" uuid, "p_email" text) IS 'Automatically adds a user to all organizations that allow their email domain. Returns the number of organizations joined.';

-- Create trigger function to auto-join user on creation
CREATE OR REPLACE FUNCTION "public"."trigger_auto_join_user_on_create"()
RETURNS trigger
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Auto-join user to orgs based on email domain
  PERFORM public.auto_join_user_to_orgs_by_email(NEW.id, NEW.email);
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."trigger_auto_join_user_on_create"() OWNER TO "postgres";

-- Create trigger on users table to auto-join on signup
-- This trigger should run AFTER generate_org_on_user_create to ensure user has their personal org first
CREATE OR REPLACE TRIGGER "auto_join_user_to_orgs_on_create"
AFTER INSERT ON "public"."users"
FOR EACH ROW
EXECUTE FUNCTION "public"."trigger_auto_join_user_on_create"();

-- Ensure this trigger runs after the org creation trigger
-- PostgreSQL triggers execute in alphabetical order by default
-- "auto_join_user_to_orgs_on_create" comes after "generate_org_on_user_create" alphabetically

COMMENT ON TRIGGER "auto_join_user_to_orgs_on_create" ON "public"."users" IS 'Automatically adds new users to organizations that allow their email domain';

-- Create index for efficient domain lookups
CREATE INDEX IF NOT EXISTS "idx_orgs_allowed_email_domains" 
ON "public"."orgs" USING GIN ("allowed_email_domains");

COMMENT ON INDEX "public"."idx_orgs_allowed_email_domains" IS 'GIN index for efficient lookups of organizations by allowed email domains';

-- Add unique constraint to org_users to prevent duplicate memberships
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'org_users_user_org_unique'
    ) THEN
        ALTER TABLE "public"."org_users"
        ADD CONSTRAINT "org_users_user_org_unique" UNIQUE ("user_id", "org_id");
    END IF;
END $$;

COMMENT ON CONSTRAINT "org_users_user_org_unique" ON "public"."org_users" IS 'Ensures a user cannot be added to the same organization multiple times';


