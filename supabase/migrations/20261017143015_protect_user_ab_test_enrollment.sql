-- Experiment state and existing signup provenance are backend-managed.
-- This trigger performs constant work on the single row being written, with no
-- table lookups, RPC calls or changes to profile/onboarding editing permissions.
CREATE OR REPLACE FUNCTION public.protect_users_ab_test_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_key text;
  v_previous jsonb := '{}'::jsonb;
  v_claim_role text := COALESCE(
    NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
BEGIN
  -- JWT and SET ROLE checks also cover user-facing SECURITY DEFINER wrappers,
  -- whose current_user becomes the function owner. Direct backend writes have
  -- neither an authenticated/anon database role nor user request claims.
  IF current_user IN ('authenticated', 'anon')
    OR pg_catalog.current_setting('role', true) IN ('authenticated', 'anon')
    OR v_claim_role IN ('authenticated', 'anon') THEN
    IF TG_OP = 'UPDATE' THEN
      v_previous := COALESCE(OLD.onboarding, '{}'::jsonb);
      NEW.created_at := OLD.created_at;
      NEW.created_via_invite := OLD.created_via_invite;
    ELSE
      NEW.created_at := pg_catalog.now();
      -- Normal self-signups create their profile through the client. Invitation
      -- profiles are inserted by the backend, which may set this flag to true.
      NEW.created_via_invite := false;
    END IF;

    NEW.onboarding := COALESCE(NEW.onboarding, '{}'::jsonb)
      - ARRAY['abtests', 'abtests_enrolled', 'abtests_bento_sync'];
    FOREACH v_key IN ARRAY ARRAY['abtests', 'abtests_enrolled', 'abtests_bento_sync'] LOOP
      IF v_previous ? v_key THEN
        NEW.onboarding := pg_catalog.jsonb_set(NEW.onboarding, ARRAY[v_key], v_previous -> v_key, true);
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.protect_users_ab_test_state() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.protect_users_ab_test_state() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_users_ab_test_state() TO service_role;

CREATE TRIGGER protect_users_ab_test_state
BEFORE INSERT OR UPDATE OF onboarding, created_at, created_via_invite ON public.users
FOR EACH ROW EXECUTE FUNCTION public.protect_users_ab_test_state();
