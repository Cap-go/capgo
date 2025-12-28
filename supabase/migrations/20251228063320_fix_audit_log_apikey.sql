-- Fix audit_log_trigger to properly identify users authenticated via API keys
-- Previously, the trigger called get_identity() without parameters, which only checks auth.uid()
-- This meant API key users (CLI, API) were not logged because get_identity() returned NULL
-- Now we call get_identity with key_mode parameter to also check for API key authentication

CREATE OR REPLACE FUNCTION "public"."audit_log_trigger"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_record JSONB;
  v_new_record JSONB;
  v_changed_fields TEXT[];
  v_org_id UUID;
  v_record_id TEXT;
  v_user_id UUID;
  v_key TEXT;
  v_org_exists BOOLEAN;
BEGIN
  -- Skip audit logging for org DELETE operations
  -- When an org is deleted, we can't insert into audit_logs because the org_id
  -- foreign key would reference a non-existent org
  IF TG_TABLE_NAME = 'orgs' AND TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  -- Get current user from auth context or API key
  -- Uses get_identity() WITH key_mode parameter to support both JWT auth and API key authentication
  -- This is the fix: previously called get_identity() without parameters which only checked auth.uid()
  v_user_id := public.get_identity('{read,upload,write,all}'::public.key_mode[]);

  -- Skip audit logging if no user is identified
  -- We only want to log actions performed by authenticated users
  IF v_user_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Convert records to JSONB based on operation type
  IF TG_OP = 'DELETE' THEN
    v_old_record := to_jsonb(OLD);
    v_new_record := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_old_record := NULL;
    v_new_record := to_jsonb(NEW);
  ELSE -- UPDATE
    v_old_record := to_jsonb(OLD);
    v_new_record := to_jsonb(NEW);

    -- Calculate changed fields by comparing old and new values
    FOR v_key IN SELECT jsonb_object_keys(v_new_record)
    LOOP
      IF v_old_record->v_key IS DISTINCT FROM v_new_record->v_key THEN
        v_changed_fields := array_append(v_changed_fields, v_key);
      END IF;
    END LOOP;
  END IF;

  -- Get org_id and record_id based on table being modified
  CASE TG_TABLE_NAME
    WHEN 'orgs' THEN
      v_org_id := COALESCE(NEW.id, OLD.id);
      v_record_id := COALESCE(NEW.id, OLD.id)::TEXT;
    WHEN 'apps' THEN
      v_org_id := COALESCE(NEW.owner_org, OLD.owner_org);
      v_record_id := COALESCE(NEW.app_id, OLD.app_id)::TEXT;
    WHEN 'channels' THEN
      v_org_id := COALESCE(NEW.owner_org, OLD.owner_org);
      v_record_id := COALESCE(NEW.id, OLD.id)::TEXT;
    WHEN 'app_versions' THEN
      v_org_id := COALESCE(NEW.owner_org, OLD.owner_org);
      v_record_id := COALESCE(NEW.id, OLD.id)::TEXT;
    WHEN 'org_users' THEN
      v_org_id := COALESCE(NEW.org_id, OLD.org_id);
      v_record_id := COALESCE(NEW.id, OLD.id)::TEXT;
    ELSE
      -- Fallback for any other table (shouldn't happen with current triggers)
      v_org_id := NULL;
      v_record_id := NULL;
  END CASE;

  -- Only insert if we have a valid org_id and the org still exists
  -- This handles edge cases where related tables are deleted after the org
  IF v_org_id IS NOT NULL THEN
    -- Check if the org still exists (important for DELETE operations on child tables)
    SELECT EXISTS(SELECT 1 FROM public.orgs WHERE id = v_org_id) INTO v_org_exists;

    IF v_org_exists THEN
      INSERT INTO "public"."audit_logs" (
        table_name, record_id, operation, user_id, org_id,
        old_record, new_record, changed_fields
      ) VALUES (
        TG_TABLE_NAME, v_record_id, TG_OP, v_user_id, v_org_id,
        v_old_record, v_new_record, v_changed_fields
      );
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;
