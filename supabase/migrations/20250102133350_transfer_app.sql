-- Add transfer_history column to apps table
ALTER TABLE public.apps ADD COLUMN IF NOT EXISTS transfer_history jsonb[] DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.transfer_app(
    p_app_id character varying,
    p_new_org_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_org_id uuid;
    v_user_id uuid;
    v_last_transfer jsonb;
    v_last_transfer_date timestamp;
BEGIN
  -- Get the current owner_org
  SELECT owner_org, transfer_history[array_length(transfer_history, 1)]
  INTO v_old_org_id, v_last_transfer
  FROM public.apps
  WHERE app_id = p_app_id;

  -- Check if app exists
  IF v_old_org_id IS NULL THEN
      RAISE EXCEPTION 'App % not found', p_app_id;
  END IF;

  -- Get the current user ID
  v_user_id := (select auth.uid());

if NOT (check_min_rights('super_admin'::user_min_right, v_user_id, v_old_org_id, NULL::character varying, NULL::bigint)) THEN
  RAISE EXCEPTION 'You are not authorized to transfer this app. (You don''t have super_admin rights on the old organization)';
END IF;

if NOT (check_min_rights('super_admin'::user_min_right, v_user_id, p_new_org_id, NULL::character varying, NULL::bigint)) THEN
  RAISE EXCEPTION 'You are not authorized to transfer this app. (You don''t have super_admin rights on the new organization)';
END IF;

  -- Check if enough time has passed since last transfer
  IF v_last_transfer IS NOT NULL THEN
    v_last_transfer_date := (v_last_transfer->>'transferred_at')::timestamp;
    IF v_last_transfer_date + interval '32 days' > now() THEN
      RAISE EXCEPTION 'Cannot transfer app. Must wait at least 32 days between transfers. Last transfer was on %', v_last_transfer_date;
    END IF;
  END IF;

  -- Update the app's owner_org and user_id
  UPDATE public.apps
  SET 
      owner_org = p_new_org_id,
      updated_at = now(),
      transfer_history = COALESCE(transfer_history, '{}') || jsonb_build_object(
          'transferred_at', now(),
          'transferred_from', v_old_org_id,
          'transferred_to', p_new_org_id,
          'initiated_by', v_user_id
      )::jsonb
  WHERE app_id = p_app_id;

  -- Update app_versions owner_org
  UPDATE public.app_versions
  SET owner_org = p_new_org_id
  WHERE app_id = p_app_id;

  -- Update app_versions_meta owner_org
  UPDATE public.app_versions_meta
  SET owner_org = p_new_org_id
  WHERE app_id = p_app_id;

  -- Update channel_devices owner_org
  UPDATE public.channel_devices
  SET owner_org = p_new_org_id
  WHERE app_id = p_app_id;

  -- Update channels owner_org
  UPDATE public.channels
  SET owner_org = p_new_org_id
  WHERE app_id = p_app_id;

  -- Update notifications owner_org
  UPDATE public.notifications
  SET owner_org = p_new_org_id
  WHERE owner_org = v_old_org_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.transfer_app(character varying, uuid) TO authenticated;

-- Revoke update on owner_org from authenticated users to enforce using the function
revoke update (owner_org) on table public.apps from authenticated, anon;
revoke update (transfer_history) on table public.apps from authenticated, anon;

COMMENT ON FUNCTION public.transfer_app IS 'Transfers an app and all its related data to a new organization. Requires the caller to have appropriate permissions on both organizations.';

-- Drop the guard_r2_path trigger and function
DROP TRIGGER IF EXISTS zzz_guard_r2_path ON public.app_versions;
DROP FUNCTION IF EXISTS public.guard_r2_path();

