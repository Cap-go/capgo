-- Prevent direct PostgREST downgrades of encrypted bundles after insert.
DROP TRIGGER IF EXISTS enforce_encrypted_bundle_trigger ON public.app_versions;

CREATE TRIGGER enforce_encrypted_bundle_trigger
  BEFORE INSERT OR UPDATE OF session_key, key_id, app_id, owner_org ON public.app_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.check_encrypted_bundle_on_insert();
