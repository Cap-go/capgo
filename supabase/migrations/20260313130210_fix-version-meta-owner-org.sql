-- ============================================================================
-- Avoid transient null owner_org on app_versions_meta metadata upserts.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.auto_owner_org_by_app_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_owner_org uuid;
BEGIN
  IF NEW.app_id IS DISTINCT FROM OLD.app_id
    AND OLD.app_id IS DISTINCT FROM NULL THEN
    RAISE EXCEPTION 'changing the app_id is not allowed';
  END IF;

  SELECT av.owner_org
  INTO v_owner_org
  FROM public.app_versions AS av
  WHERE av.id = NEW.id
  LIMIT 1;

  NEW.owner_org = COALESCE(
    public.get_user_main_org_id_by_app_id(NEW.app_id),
    NEW.owner_org,
    OLD.owner_org,
    v_owner_org,
    (SELECT a.owner_org FROM public.apps AS a WHERE a.app_id = NEW.app_id LIMIT 1)
  );

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.auto_owner_org_by_app_id() OWNER TO postgres;
