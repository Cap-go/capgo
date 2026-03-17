-- Prevent direct PostgREST downgrades of encrypted bundles after insert.
DROP TRIGGER IF EXISTS enforce_encrypted_bundle_trigger ON public.app_versions;

CREATE TRIGGER enforce_encrypted_bundle_trigger
  -- app_id changes are already blocked and owner_org is auto-derived from app_id.
  -- Limit UPDATE enforcement to encryption fields so regular metadata updates keep working.
  BEFORE INSERT OR UPDATE OF session_key, key_id ON public.app_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.check_encrypted_bundle_on_insert();
