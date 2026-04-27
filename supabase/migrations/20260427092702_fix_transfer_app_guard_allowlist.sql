CREATE OR REPLACE FUNCTION public.guard_owner_org_reassignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.owner_org IS DISTINCT FROM OLD.owner_org
    AND current_setting('capgo.allow_owner_org_transfer', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'owner_org must be changed through public.transfer_app()';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.guard_owner_org_reassignment() OWNER TO "postgres";

DROP TRIGGER IF EXISTS guard_owner_org_reassignment_apps ON public.apps;
CREATE TRIGGER guard_owner_org_reassignment_apps
BEFORE UPDATE OF owner_org ON public.apps
FOR EACH ROW
EXECUTE FUNCTION public.guard_owner_org_reassignment();

DROP TRIGGER IF EXISTS guard_owner_org_reassignment_app_versions ON public.app_versions;
CREATE TRIGGER guard_owner_org_reassignment_app_versions
BEFORE UPDATE OF owner_org ON public.app_versions
FOR EACH ROW
EXECUTE FUNCTION public.guard_owner_org_reassignment();

DROP TRIGGER IF EXISTS guard_owner_org_reassignment_app_versions_meta ON public.app_versions_meta;
CREATE TRIGGER guard_owner_org_reassignment_app_versions_meta
BEFORE UPDATE OF owner_org ON public.app_versions_meta
FOR EACH ROW
EXECUTE FUNCTION public.guard_owner_org_reassignment();

DROP TRIGGER IF EXISTS guard_owner_org_reassignment_channel_devices ON public.channel_devices;
CREATE TRIGGER guard_owner_org_reassignment_channel_devices
BEFORE UPDATE OF owner_org ON public.channel_devices
FOR EACH ROW
EXECUTE FUNCTION public.guard_owner_org_reassignment();

DROP TRIGGER IF EXISTS guard_owner_org_reassignment_channels ON public.channels;
CREATE TRIGGER guard_owner_org_reassignment_channels
BEFORE UPDATE OF owner_org ON public.channels
FOR EACH ROW
EXECUTE FUNCTION public.guard_owner_org_reassignment();

CREATE OR REPLACE FUNCTION public.transfer_app(
    p_app_id character varying,
    p_new_org_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_old_org_id uuid;
    v_user_id uuid;
    v_last_transfer jsonb;
    v_last_transfer_date timestamp;
    v_transfer_error constant text := 'Unable to process transfer request.';
    v_app_id_key constant text := 'app_id';
    v_old_org_id_key constant text := 'old_org_id';
    v_new_org_id_key constant text := 'new_org_id';
    v_uid_key constant text := 'uid';
BEGIN
  SELECT owner_org, transfer_history[array_length(transfer_history, 1)]
  INTO v_old_org_id, v_last_transfer
  FROM public.apps
  WHERE app_id = p_app_id;

  IF v_old_org_id IS NULL THEN
    RAISE EXCEPTION '%', v_transfer_error;
  END IF;

  v_user_id := (SELECT auth.uid());

  IF v_user_id IS NULL THEN
    PERFORM public.pg_log(
      'deny: TRANSFER_NO_AUTH',
      jsonb_build_object(v_app_id_key, p_app_id, v_new_org_id_key, p_new_org_id)
    );
    RAISE EXCEPTION '%', v_transfer_error;
  END IF;

  IF NOT public.rbac_check_permission(
      public.rbac_perm_app_transfer(),
      v_old_org_id,
      p_app_id,
      NULL::bigint
  ) THEN
    PERFORM public.pg_log(
      'deny: TRANSFER_OLD_ORG_RIGHTS',
      jsonb_build_object(
        v_app_id_key, p_app_id,
        v_old_org_id_key, v_old_org_id,
        v_new_org_id_key, p_new_org_id,
        v_uid_key, v_user_id
      )
    );
    RAISE EXCEPTION '%', v_transfer_error;
  END IF;

  IF NOT public.rbac_check_permission(
      public.rbac_perm_app_transfer(),
      p_new_org_id,
      NULL::character varying,
      NULL::bigint
  ) THEN
    PERFORM public.pg_log(
      'deny: TRANSFER_NEW_ORG_RIGHTS',
      jsonb_build_object(
        v_app_id_key, p_app_id,
        v_old_org_id_key, v_old_org_id,
        v_new_org_id_key, p_new_org_id,
        v_uid_key, v_user_id
      )
    );
    RAISE EXCEPTION '%', v_transfer_error;
  END IF;

  IF v_last_transfer IS NOT NULL THEN
    v_last_transfer_date := (v_last_transfer->>'transferred_at')::timestamp;
    IF v_last_transfer_date + interval '32 days' > now() THEN
      RAISE EXCEPTION
          'Cannot transfer app. Must wait at least 32 days '
          'between transfers. Last transfer was on %',
          v_last_transfer_date;
    END IF;
  END IF;

  BEGIN
    -- Allow the guarded owner_org cascade only inside the approved transfer path.
    PERFORM set_config('capgo.allow_owner_org_transfer', 'true', true);

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

    UPDATE public.deploy_history
    SET owner_org = p_new_org_id
    WHERE app_id = p_app_id;

    PERFORM set_config('capgo.allow_owner_org_transfer', 'false', true);
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM set_config('capgo.allow_owner_org_transfer', 'false', true);
      RAISE;
  END;

END;
$$;

ALTER FUNCTION public.transfer_app(
    p_app_id character varying,
    p_new_org_id uuid
) OWNER TO "postgres";
