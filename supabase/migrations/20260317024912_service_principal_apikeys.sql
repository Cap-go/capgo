-- Phase 1: Service-Principal Infrastructure for API Keys
--
-- The service-principal model treats each API key as its own "user" in the
-- auth system. Each API key (via its rbac_id) can have a corresponding
-- auth.users entry, enabling standard auth.uid()-based RLS to work for
-- API key authentication — identical to how it works for regular users.
--
-- Architecture (phased rollout):
--   Phase 1 (this migration): Schema + helper functions. No auth flow changes.
--   Phase 2 (middleware PR):  Edge function signs a JWT with sub=rbac_id for
--                             provisioned keys. auth.uid() returns rbac_id.
--   Phase 3 (RLS cleanup):   Simplify RLS policies to use auth.uid() once all
--                             orgs have service principals provisioned.
--
-- Key concept:
--   - apikeys.rbac_id IS the service principal UUID (stable, already exists)
--   - When provisioned: auth.users row exists with id = rbac_id
--   - Middleware can sign JWTs with sub = rbac_id for provisioned keys
--   - Service principals appear in org_users / role_bindings for authorization

-- ============================================================================
-- 1. Track provisioning state on each API key
-- ============================================================================

ALTER TABLE "public"."apikeys"
  ADD COLUMN IF NOT EXISTS "service_principal_provisioned" boolean DEFAULT false NOT NULL;

COMMENT ON COLUMN "public"."apikeys"."service_principal_provisioned" IS
  'When true, an auth.users entry exists with id=rbac_id for this API key. '
  'The middleware can then sign a JWT with sub=rbac_id, making auth.uid() '
  'return the service principal ID for standard RLS evaluation.';

-- ============================================================================
-- 2. get_service_principal_info() — retrieve key info needed for JWT signing
--    Called by edge function middleware when a capgkey header is detected.
-- ============================================================================

CREATE OR REPLACE FUNCTION "public"."get_service_principal_info"("p_apikey_value" "text")
RETURNS TABLE (
  "apikey_id"            bigint,
  "service_principal_id" "uuid",        -- rbac_id; used as auth.users id
  "owner_user_id"        "uuid",        -- human who owns this key
  "is_provisioned"       boolean,       -- auth.users entry exists
  "key_mode"             "public"."key_mode",
  "is_expired"           boolean,
  "limited_to_orgs"      "uuid"[],
  "limited_to_apps"      character varying[]
)
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ak.id                               AS apikey_id,
    ak.rbac_id                          AS service_principal_id,
    ak.user_id                          AS owner_user_id,
    ak.service_principal_provisioned    AS is_provisioned,
    ak.mode                             AS key_mode,
    "public"."is_apikey_expired"(ak.expires_at) AS is_expired,
    ak.limited_to_orgs,
    ak.limited_to_apps
  FROM "public"."find_apikey_by_value"(p_apikey_value) ak
  WHERE ak.id IS NOT NULL;
END;
$$;

ALTER FUNCTION "public"."get_service_principal_info"("p_apikey_value" "text") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."get_service_principal_info"("p_apikey_value" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_service_principal_info"("p_apikey_value" "text") TO "service_role";

COMMENT ON FUNCTION "public"."get_service_principal_info"("p_apikey_value" "text") IS
  'Returns service-principal metadata for a given API key value (plain or hashed). '
  'Used by edge function middleware to decide whether to sign a service-principal JWT '
  'and, if so, what UUID to use as the JWT subject (= rbac_id).';

-- ============================================================================
-- 3. mark_service_principal_provisioned() — called after auth.users is created
--    The edge function creates the auth.users entry using the admin client,
--    then calls this function to record the provisioned state.
-- ============================================================================

CREATE OR REPLACE FUNCTION "public"."mark_service_principal_provisioned"(
  "p_apikey_id" bigint,
  "p_rbac_id"   "uuid"
)
RETURNS void
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" = ''
AS $$
BEGIN
  UPDATE "public"."apikeys"
  SET service_principal_provisioned = true
  WHERE id     = p_apikey_id
    AND rbac_id = p_rbac_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'API key not found or rbac_id mismatch: apikey_id=%, rbac_id=%',
      p_apikey_id, p_rbac_id;
  END IF;
END;
$$;

ALTER FUNCTION "public"."mark_service_principal_provisioned"("p_apikey_id" bigint, "p_rbac_id" "uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."mark_service_principal_provisioned"("p_apikey_id" bigint, "p_rbac_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_service_principal_provisioned"("p_apikey_id" bigint, "p_rbac_id" "uuid") TO "service_role";

COMMENT ON FUNCTION "public"."mark_service_principal_provisioned"("p_apikey_id" bigint, "p_rbac_id" "uuid") IS
  'Marks an API key as having a provisioned service-principal auth.users entry. '
  'The rbac_id parameter acts as a guard to prevent accidental mis-marking. '
  'Only callable by service_role (edge functions with admin client).';
