CREATE OR REPLACE FUNCTION "public"."transfer_app"("p_app_id" character varying, "p_new_org_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_old_org_id uuid;
    v_user_id uuid;
    v_last_transfer jsonb;
    v_last_transfer_date timestamp;
BEGIN
  SELECT owner_org, transfer_history[array_length(transfer_history, 1)]
  INTO v_old_org_id, v_last_transfer
  FROM public.apps
  WHERE app_id = p_app_id;

  IF v_old_org_id IS NULL THEN
      RAISE EXCEPTION 'App % not found', p_app_id;
  END IF;

  v_user_id := (SELECT auth.uid());

  IF NOT public.rbac_check_permission(public.rbac_perm_app_transfer(), v_old_org_id, p_app_id, NULL::bigint) THEN
    PERFORM public.pg_log('deny: TRANSFER_OLD_ORG_RIGHTS', jsonb_build_object('app_id', p_app_id, 'old_org_id', v_old_org_id, 'new_org_id', p_new_org_id, 'uid', v_user_id));
    RAISE EXCEPTION 'You are not authorized to transfer this app. (No transfer permission on the source organization)';
  END IF;

  IF NOT public.rbac_check_permission(public.rbac_perm_app_transfer(), p_new_org_id, NULL::character varying, NULL::bigint) THEN
    PERFORM public.pg_log('deny: TRANSFER_NEW_ORG_RIGHTS', jsonb_build_object('app_id', p_app_id, 'old_org_id', v_old_org_id, 'new_org_id', p_new_org_id, 'uid', v_user_id));
    RAISE EXCEPTION 'You are not authorized to transfer this app. (No transfer permission on the destination organization)';
  END IF;

  IF v_last_transfer IS NOT NULL THEN
    v_last_transfer_date := (v_last_transfer->>'transferred_at')::timestamp;
    IF v_last_transfer_date + interval '32 days' > now() THEN
      RAISE EXCEPTION 'Cannot transfer app. Must wait at least 32 days between transfers. Last transfer was on %', v_last_transfer_date;
    END IF;
  END IF;

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

  UPDATE public.app_versions
  SET owner_org = p_new_org_id
  WHERE app_id = p_app_id;

  UPDATE public.app_versions_meta
  SET owner_org = p_new_org_id
  WHERE app_id = p_app_id;

  UPDATE public.channel_devices
  SET owner_org = p_new_org_id
  WHERE app_id = p_app_id;

  UPDATE public.channels
  SET owner_org = p_new_org_id
  WHERE app_id = p_app_id;

  UPDATE public.devices
  SET owner_org = p_new_org_id
  WHERE app_id = p_app_id;

  UPDATE public.devices_override
  SET owner_org = p_new_org_id
  WHERE app_id = p_app_id;

  UPDATE public.daily_bandwidth
  SET owner_org = p_new_org_id
  WHERE app_id = p_app_id;

  UPDATE public.daily_mau
  SET owner_org = p_new_org_id
  WHERE app_id = p_app_id;

  UPDATE public.daily_storage
  SET owner_org = p_new_org_id
  WHERE app_id = p_app_id;

  UPDATE public.daily_version
  SET owner_org = p_new_org_id
  WHERE app_id = p_app_id;

END;
$$;

COMMENT ON FUNCTION "public"."transfer_app"("p_app_id" character varying, "p_new_org_id" "uuid") IS 'Transfers an app and all its related data to a new organization. Requires app.transfer permission on both source and destination organizations.';
