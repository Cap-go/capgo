CREATE OR REPLACE FUNCTION public.enforce_apikey_expiration_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  scoped_org RECORD;
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.expires_at IS NOT DISTINCT FROM OLD.expires_at
    AND NEW.limited_to_orgs IS NOT DISTINCT FROM OLD.limited_to_orgs
    AND NEW.limited_to_apps IS NOT DISTINCT FROM OLD.limited_to_apps THEN
    RETURN NEW;
  END IF;

  FOR scoped_org IN
    WITH scope_orgs AS (
      SELECT unnest(COALESCE(NEW.limited_to_orgs, '{}'::uuid[])) AS org_id
      UNION
      SELECT public.apps.owner_org
      FROM public.apps
      WHERE public.apps.app_id = ANY(COALESCE(NEW.limited_to_apps, '{}'::text[]))
    )
    SELECT
      public.orgs.id,
      public.orgs.require_apikey_expiration,
      public.orgs.max_apikey_expiration_days
    FROM public.orgs
    JOIN scope_orgs ON scope_orgs.org_id = public.orgs.id
  LOOP
    IF scoped_org.require_apikey_expiration AND NEW.expires_at IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'expiration_required',
        DETAIL = 'This organization requires API keys to have an expiration date';
    END IF;

    IF scoped_org.max_apikey_expiration_days IS NOT NULL
      AND NEW.expires_at IS NOT NULL
      AND NEW.expires_at > clock_timestamp()
        + make_interval(days => scoped_org.max_apikey_expiration_days) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'expiration_exceeds_max',
        DETAIL = format(
          'API key expiration cannot exceed %s days for this organization',
          scoped_org.max_apikey_expiration_days
        );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.enforce_apikey_expiration_policy() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.enforce_apikey_expiration_policy() FROM public;

DROP TRIGGER IF EXISTS apikeys_enforce_expiration_policy ON public.apikeys;

CREATE TRIGGER apikeys_enforce_expiration_policy
BEFORE INSERT OR UPDATE ON public.apikeys
FOR EACH ROW
EXECUTE FUNCTION public.enforce_apikey_expiration_policy();
