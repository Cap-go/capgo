-- Daily bundle upload format adoption (ZIP only / delta only / both).
--
-- Deleting a bundle runs manifest cleanup, which removes its manifest rows and
-- resets app_versions.manifest_count to 0 (r2_path is kept). Soft-deleted
-- versions are purged after 90 days. A nightly count from app_versions can
-- therefore not tell whether a deleted bundle was ever uploaded with a delta
-- manifest. delta_manifest_uploaded records that fact once and never resets.

ALTER TABLE public.app_versions
  ADD COLUMN IF NOT EXISTS delta_manifest_uploaded boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.app_versions.delta_manifest_uploaded IS 'Sticky: true once the version ever had manifest entries (manifest_count > 0), i.e. it was uploaded with a delta manifest. Derived by trigger; never reset by deletion cleanup.';

-- Derive the flag server-side so it can only go false -> true. Client-supplied
-- values are ignored. Cheap: no table access, fires only on INSERT and on
-- updates that touch manifest_count or the flag itself.
CREATE OR REPLACE FUNCTION public.set_app_version_delta_manifest_uploaded()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.delta_manifest_uploaded := OLD.delta_manifest_uploaded OR COALESCE(NEW.manifest_count, 0) > 0;
  ELSE
    NEW.delta_manifest_uploaded := COALESCE(NEW.manifest_count, 0) > 0;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.set_app_version_delta_manifest_uploaded() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_app_version_delta_manifest_uploaded() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_app_version_delta_manifest_uploaded() FROM anon;
REVOKE ALL ON FUNCTION public.set_app_version_delta_manifest_uploaded() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_app_version_delta_manifest_uploaded() TO service_role;

DROP TRIGGER IF EXISTS set_app_version_delta_manifest_uploaded ON public.app_versions;
CREATE TRIGGER set_app_version_delta_manifest_uploaded
  BEFORE INSERT OR UPDATE OF manifest_count, delta_manifest_uploaded ON public.app_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_app_version_delta_manifest_uploaded();

-- Backfill versions that still have manifest entries. Versions whose manifest
-- was already cleaned up cannot be recovered; daily snapshots start from new
-- uploads. User triggers are disabled only for this statement inside the
-- migration transaction: the flag is statistics-only, and per-row triggers
-- would otherwise enqueue an on_version_update job, write an audit log, and
-- bump updated_at for every backfilled row. The column ADD above already holds
-- an ACCESS EXCLUSIVE lock, so no concurrent write can skip a trigger.
ALTER TABLE public.app_versions DISABLE TRIGGER USER;

UPDATE public.app_versions
SET delta_manifest_uploaded = true
WHERE manifest_count > 0
  AND delta_manifest_uploaded = false;

ALTER TABLE public.app_versions ENABLE TRIGGER USER;

-- Daily snapshot of bundle upload formats for versions created on the UTC
-- snapshot day (deleted versions included). NULL = not tracked yet.
ALTER TABLE public.global_stats
  ADD COLUMN IF NOT EXISTS bundles_day_zip_only integer,
  ADD COLUMN IF NOT EXISTS bundles_day_delta_only integer,
  ADD COLUMN IF NOT EXISTS bundles_day_both integer;

COMMENT ON COLUMN public.global_stats.bundles_day_zip_only IS 'Bundles (app_versions, deleted included) created during the UTC snapshot day with a ZIP (r2_path) and no delta manifest. NULL = not tracked yet.';
COMMENT ON COLUMN public.global_stats.bundles_day_delta_only IS 'Bundles (app_versions, deleted included) created during the UTC snapshot day with a delta manifest and no ZIP (r2_path IS NULL). NULL = not tracked yet.';
COMMENT ON COLUMN public.global_stats.bundles_day_both IS 'Bundles (app_versions, deleted included) created during the UTC snapshot day with both a ZIP (r2_path) and a delta manifest. NULL = not tracked yet.';

-- Keep the sticky flag out of audit logs: it flips together with
-- manifest_count, which is already treated as storage bookkeeping.
CREATE OR REPLACE FUNCTION "public"."audit_log_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_old_record jsonb;
  v_new_record jsonb;
  v_changed_fields text[];
  v_org_id uuid;
  v_record_id text;
  v_user_id uuid;
  v_key text;
  v_api_key_text text;
  v_api_key public.apikeys%ROWTYPE;
  v_actor_type text := 'system';
  v_actor_user_id uuid;
  v_actor_user_email text;
  v_actor_apikey_id bigint;
  v_actor_apikey_name text;
  v_stats_refresh_fields constant text[] := ARRAY['stats_refresh_requested_at', 'stats_updated_at', 'updated_at'];
  v_background_counter_fields constant text[] := ARRAY['channel_device_count', 'manifest_bundle_count', 'updated_at'];
  v_onboarding_progress_fields constant text[] := ARRAY['onboarding', 'updated_at'];
  v_fat_app_version_fields constant text[] := ARRAY['manifest', 'native_packages'];
BEGIN
  SELECT auth.uid() INTO v_actor_user_id;

  IF v_actor_user_id IS NOT NULL THEN
    v_actor_type := 'user';
  ELSE
    SELECT public.get_apikey_header() INTO v_api_key_text;

    IF v_api_key_text IS NOT NULL THEN
      SELECT *
      INTO v_api_key
      FROM public.find_apikey_by_value(v_api_key_text)
      LIMIT 1;

      IF v_api_key.id IS NOT NULL
        AND NOT public.is_apikey_expired(v_api_key.expires_at)
        AND (
          public.is_allowed_capgkey(v_api_key_text, '{upload}'::text[])
          OR public.is_allowed_capgkey(v_api_key_text, '{write}'::text[])
          OR public.is_allowed_capgkey(v_api_key_text, '{all}'::text[])
        ) THEN
        v_actor_type := 'apikey';
        v_actor_user_id := v_api_key.user_id;
        v_actor_apikey_id := v_api_key.id;
        v_actor_apikey_name := v_api_key.name;
      END IF;
    END IF;
  END IF;

  IF v_actor_user_id IS NOT NULL THEN
    SELECT users.email
    INTO v_actor_user_email
    FROM public.users AS users
    WHERE users.id = v_actor_user_id;
  END IF;

  v_user_id := v_actor_user_id;

  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'app_versions' THEN
    v_old_record := pg_catalog.to_jsonb(OLD);
    v_new_record := pg_catalog.to_jsonb(NEW);
    IF (
      v_old_record
        - 'manifest'
        - 'updated_at'
        - 'manifest_count'
        - 'delta_manifest_uploaded'
        - 'storage_provider'
        - 'r2_path'
    ) IS NOT DISTINCT FROM (
      v_new_record
        - 'manifest'
        - 'updated_at'
        - 'manifest_count'
        - 'delta_manifest_uploaded'
        - 'storage_provider'
        - 'r2_path'
    ) THEN
      RETURN NEW;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_old_record := pg_catalog.to_jsonb(OLD);
    v_new_record := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_old_record := NULL;
    v_new_record := pg_catalog.to_jsonb(NEW);
  ELSE
    v_old_record := pg_catalog.to_jsonb(OLD);
    v_new_record := pg_catalog.to_jsonb(NEW);

    FOR v_key IN SELECT pg_catalog.jsonb_object_keys(v_new_record)
    LOOP
      IF v_old_record->v_key IS DISTINCT FROM v_new_record->v_key THEN
        v_changed_fields := pg_catalog.array_append(v_changed_fields, v_key);
      END IF;
    END LOOP;

    IF v_changed_fields IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(v_changed_fields) AS changed_field(field_name)
        WHERE changed_field.field_name IS DISTINCT FROM 'updated_at'
      ) THEN
      RETURN NEW;
    END IF;

    IF TG_TABLE_NAME = ANY(ARRAY['apps', 'orgs'])
      AND v_changed_fields && ARRAY['stats_refresh_requested_at', 'stats_updated_at']
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(v_changed_fields) AS changed_field(field_name)
        WHERE changed_field.field_name <> ALL(v_stats_refresh_fields)
      ) THEN
      RETURN NEW;
    END IF;

    IF v_actor_type = 'system'
      AND TG_TABLE_NAME = 'apps'
      AND v_changed_fields && ARRAY['channel_device_count', 'manifest_bundle_count']
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(v_changed_fields) AS changed_field(field_name)
        WHERE changed_field.field_name <> ALL(v_background_counter_fields)
      ) THEN
      RETURN NEW;
    END IF;

    IF TG_TABLE_NAME = 'apps'
      AND v_changed_fields && ARRAY['onboarding']
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(v_changed_fields) AS changed_field(field_name)
        WHERE changed_field.field_name <> ALL(v_onboarding_progress_fields)
      ) THEN
      RETURN NEW;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'app_versions' THEN
    IF v_old_record IS NOT NULL THEN
      v_old_record := v_old_record - v_fat_app_version_fields;
    END IF;
    IF v_new_record IS NOT NULL THEN
      v_new_record := v_new_record - v_fat_app_version_fields;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    CASE TG_TABLE_NAME
      WHEN 'orgs' THEN
        v_org_id := OLD.id;
        v_record_id := OLD.id::text;
      WHEN 'apps' THEN
        v_org_id := OLD.owner_org;
        v_record_id := OLD.app_id::text;
      WHEN 'channels' THEN
        v_org_id := OLD.owner_org;
        v_record_id := OLD.id::text;
      WHEN 'app_versions' THEN
        v_org_id := OLD.owner_org;
        v_record_id := OLD.id::text;
      WHEN 'org_users' THEN
        v_org_id := OLD.org_id;
        v_record_id := OLD.id::text;
      ELSE
        v_org_id := NULL;
        v_record_id := NULL;
    END CASE;
  ELSE
    CASE TG_TABLE_NAME
      WHEN 'orgs' THEN
        v_org_id := NEW.id;
        v_record_id := NEW.id::text;
      WHEN 'apps' THEN
        v_org_id := NEW.owner_org;
        v_record_id := NEW.app_id::text;
      WHEN 'channels' THEN
        v_org_id := NEW.owner_org;
        v_record_id := NEW.id::text;
      WHEN 'app_versions' THEN
        v_org_id := NEW.owner_org;
        v_record_id := NEW.id::text;
      WHEN 'org_users' THEN
        v_org_id := NEW.org_id;
        v_record_id := NEW.id::text;
      ELSE
        v_org_id := NULL;
        v_record_id := NULL;
    END CASE;
  END IF;

  IF v_org_id IS NOT NULL THEN
    INSERT INTO public.audit_logs (
      table_name,
      record_id,
      operation,
      user_id,
      org_id,
      old_record,
      new_record,
      changed_fields,
      actor_type,
      actor_user_id,
      actor_user_email,
      actor_apikey_id,
      actor_apikey_name
    ) VALUES (
      TG_TABLE_NAME,
      v_record_id,
      TG_OP,
      v_user_id,
      v_org_id,
      v_old_record,
      v_new_record,
      v_changed_fields,
      v_actor_type,
      v_actor_user_id,
      v_actor_user_email,
      v_actor_apikey_id,
      v_actor_apikey_name
    );
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;
