CREATE OR REPLACE FUNCTION public.enforce_channel_version_promotion_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request_role text := auth.role();
BEGIN
  IF NEW.version IS NOT DISTINCT FROM OLD.version THEN
    RETURN NEW;
  END IF;

  IF v_request_role IS DISTINCT FROM 'anon' AND v_request_role IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NOT public.rbac_check_permission_request(
    public.rbac_perm_channel_promote_bundle(),
    NEW.owner_org,
    NEW.app_id,
    NEW.id
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED_CHANNEL_PROMOTE_BUNDLE'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.enforce_channel_version_promotion_permission() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enforce_channel_version_promotion_permission() FROM PUBLIC;

DROP TRIGGER IF EXISTS enforce_channel_version_promotion_permission ON public.channels;
CREATE TRIGGER enforce_channel_version_promotion_permission
BEFORE UPDATE OF version ON public.channels
FOR EACH ROW
EXECUTE FUNCTION public.enforce_channel_version_promotion_permission();
