-- Keep encrypted-bundle enforcement consistent for both INSERT and direct
-- UPDATE paths. The function name is kept for compatibility with the existing
-- trigger.
CREATE OR REPLACE FUNCTION public.check_encrypted_bundle_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  org_id uuid;
  org_enforcing boolean;
  org_required_key varchar(21);
  bundle_is_encrypted boolean;
  bundle_key_id varchar(20);
BEGIN
  -- Derive org_id from app_id directly to avoid trigger ordering issues.
  -- The force_valid_owner_org_app_versions trigger runs after this one
  -- alphabetically, so NEW.owner_org may not be populated yet.
  IF NEW.owner_org IS NOT NULL THEN
    org_id := NEW.owner_org;
  ELSE
    SELECT apps.owner_org INTO org_id
    FROM public.apps
    WHERE apps.app_id = NEW.app_id;
  END IF;

  -- If org not found, allow the existing foreign-key/owner checks to fail.
  IF org_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT enforce_encrypted_bundles, required_encryption_key
  INTO org_enforcing, org_required_key
  FROM public.orgs
  WHERE id = org_id;

  IF org_enforcing IS NULL OR org_enforcing = false THEN
    RETURN NEW;
  END IF;

  bundle_is_encrypted := public.is_bundle_encrypted(NEW.session_key);
  bundle_key_id := NULLIF(btrim(NEW.key_id), '')::varchar(20);

  IF NOT bundle_is_encrypted THEN
    PERFORM public.pg_log('deny: ORG_REQUIRES_ENCRYPTED_BUNDLES_TRIGGER',
      jsonb_build_object(
        'org_id', org_id,
        'app_id', NEW.app_id,
        'version_name', NEW.name,
        'user_id', NEW.user_id,
        'reason', 'not_encrypted'
      ));
    RAISE EXCEPTION '%',
      'encryption_required: This organization requires all bundles to be '
      || 'encrypted. Please upload an encrypted bundle with a session_key.';
  END IF;

  IF org_required_key IS NOT NULL AND org_required_key <> '' THEN
    IF bundle_key_id IS NULL THEN
      PERFORM public.pg_log('deny: ORG_REQUIRES_SPECIFIC_ENCRYPTION_KEY_TRIGGER',
        jsonb_build_object(
          'org_id', org_id,
          'app_id', NEW.app_id,
          'version_name', NEW.name,
          'user_id', NEW.user_id,
          'required_key', org_required_key,
          'bundle_key_id', bundle_key_id,
          'reason', 'missing_key_id'
        ));
      RAISE EXCEPTION '%',
        'encryption_key_required: This organization requires bundles to be '
        || 'encrypted with a specific key. The uploaded bundle does not have '
        || 'a key_id.';
    END IF;

    -- key_id is 20 chars and required_encryption_key may be 20 or 21 chars.
    IF NOT (
      bundle_key_id = LEFT(org_required_key, 20)
      OR LEFT(bundle_key_id, LENGTH(org_required_key)) = org_required_key
    ) THEN
      PERFORM public.pg_log('deny: ORG_REQUIRES_SPECIFIC_ENCRYPTION_KEY_TRIGGER',
        jsonb_build_object(
          'org_id', org_id,
          'app_id', NEW.app_id,
          'version_name', NEW.name,
          'user_id', NEW.user_id,
          'required_key', org_required_key,
          'bundle_key_id', bundle_key_id,
          'reason', 'key_mismatch'
        ));
      RAISE EXCEPTION '%',
        'encryption_key_mismatch: This organization requires bundles to be '
        || 'encrypted with a specific key. The uploaded bundle was encrypted '
        || 'with a different key.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.check_encrypted_bundle_on_insert() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.check_encrypted_bundle_on_insert()
FROM public;
REVOKE ALL ON FUNCTION public.check_encrypted_bundle_on_insert() FROM anon;
REVOKE ALL ON FUNCTION public.check_encrypted_bundle_on_insert()
FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_encrypted_bundle_on_insert()
TO service_role;
