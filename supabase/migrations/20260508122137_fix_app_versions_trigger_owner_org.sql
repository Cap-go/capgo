-- Fix app_versions BEFORE INSERT trigger returning NULL for owner_org.
--
-- The trigger auto_owner_org_by_app_id calls get_user_main_org_id_by_app_id,
-- which since migration 20260203150000 includes auth checks intended to prevent
-- anonymous lookups. In a PostgREST trigger context (session_user = 'authenticator',
-- auth.uid() = NULL, auth.role() = 'anon'), those checks can fail even for
-- legitimately authorized inserts, causing owner_org to be set to NULL and
-- violating the NOT NULL constraint (error code 23502).
--
-- The RLS INSERT policy already verified the caller's rights before the trigger
-- fires, so re-checking auth inside the trigger is redundant and harmful.
-- Replace the call with a minimal SECURITY DEFINER helper that simply resolves
-- owner_org from the apps table without any auth logic.

CREATE OR REPLACE FUNCTION "public"."get_owner_org_by_app_id_internal"("p_app_id" "text")
RETURNS "uuid"
LANGUAGE "sql" SECURITY DEFINER STABLE
SET "search_path" TO ''
AS $$
  SELECT owner_org FROM public.apps WHERE apps.app_id = p_app_id LIMIT 1;
$$;

ALTER FUNCTION "public"."get_owner_org_by_app_id_internal"("p_app_id" "text") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."get_owner_org_by_app_id_internal"("p_app_id" "text") FROM PUBLIC;

COMMENT ON FUNCTION "public"."get_owner_org_by_app_id_internal"("p_app_id" "text") IS
'Internal helper for the auto_owner_org_by_app_id trigger only. Resolves the owning org for an app without performing auth checks — the trigger fires after RLS has already validated the caller.';

-- The trigger runs as SECURITY DEFINER (owner = postgres) so it can call
-- get_owner_org_by_app_id_internal without granting EXECUTE to anon/authenticated.
CREATE OR REPLACE FUNCTION "public"."auto_owner_org_by_app_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
AS $$
BEGIN
  IF NEW."app_id" IS DISTINCT FROM OLD."app_id" AND OLD."app_id" IS DISTINCT FROM NULL THEN
    RAISE EXCEPTION 'changing the app_id is not allowed';
  END IF;

  NEW.owner_org = public.get_owner_org_by_app_id_internal(NEW."app_id");

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."auto_owner_org_by_app_id"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."auto_owner_org_by_app_id"() FROM PUBLIC;
