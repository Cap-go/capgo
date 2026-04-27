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
    v_transfer_request_error constant text := 'Unable to process transfer request.';
BEGIN
  SELECT owner_org, transfer_history[pg_catalog.array_length(transfer_history, 1)]
  INTO v_old_org_id, v_last_transfer
  FROM public.apps
  WHERE app_id = p_app_id
  FOR UPDATE;

  IF v_old_org_id IS NULL THEN
    RAISE EXCEPTION '%', v_transfer_request_error;
  END IF;

  v_user_id := (SELECT auth.uid());

  IF v_user_id IS NULL THEN
    PERFORM public.pg_log(
      'deny: TRANSFER_NO_AUTH',
      pg_catalog.jsonb_build_object('app_id', p_app_id, 'new_org_id', p_new_org_id)
    );
    RAISE EXCEPTION '%', v_transfer_request_error;
  END IF;

  IF v_old_org_id = p_new_org_id THEN
    PERFORM public.pg_log(
      'deny: TRANSFER_SAME_ORG',
      pg_catalog.jsonb_build_object(
        'app_id', p_app_id,
        'old_org_id', v_old_org_id,
        'new_org_id', p_new_org_id,
        'uid', v_user_id
      )
    );
    RAISE EXCEPTION '%', v_transfer_request_error;
  END IF;

  IF NOT public.rbac_check_permission(
      public.rbac_perm_app_transfer(),
      v_old_org_id,
      p_app_id,
      NULL::bigint
  ) THEN
    PERFORM public.pg_log(
      'deny: TRANSFER_OLD_ORG_RIGHTS',
      pg_catalog.jsonb_build_object(
        'app_id', p_app_id,
        'old_org_id', v_old_org_id,
        'new_org_id', p_new_org_id,
        'uid', v_user_id
      )
    );
    RAISE EXCEPTION '%', v_transfer_request_error;
  END IF;

  IF NOT public.rbac_check_permission(
      public.rbac_perm_app_transfer(),
      p_new_org_id,
      NULL::character varying,
      NULL::bigint
  ) THEN
    PERFORM public.pg_log(
      'deny: TRANSFER_NEW_ORG_RIGHTS',
      pg_catalog.jsonb_build_object(
        'app_id', p_app_id,
        'old_org_id', v_old_org_id,
        'new_org_id', p_new_org_id,
        'uid', v_user_id
      )
    );
    RAISE EXCEPTION '%', v_transfer_request_error;
  END IF;

  IF v_last_transfer IS NOT NULL THEN
    v_last_transfer_date := (v_last_transfer->>'transferred_at')::timestamp;
    IF v_last_transfer_date + interval '32 days' > pg_catalog.now() THEN
      RAISE EXCEPTION
          'Cannot transfer app. Must wait at least 32 days '
          'between transfers. Last transfer was on %',
          v_last_transfer_date;
    END IF;
  END IF;

  UPDATE public.apps
  SET
      owner_org = p_new_org_id,
      updated_at = pg_catalog.now(),
      transfer_history = (
          CASE
            WHEN transfer_history IS NULL THEN '{}'::jsonb[]
            ELSE transfer_history
          END
      ) || pg_catalog.jsonb_build_object(
          'transferred_at', pg_catalog.now(),
          'transferred_from', v_old_org_id,
          'transferred_to', p_new_org_id,
          'initiated_by', v_user_id
      )
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

END;
$$;

ALTER FUNCTION public.transfer_app(
    p_app_id character varying,
    p_new_org_id uuid
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.transfer_app(
    p_app_id character varying,
    p_new_org_id uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transfer_app(
    p_app_id character varying,
    p_new_org_id uuid
) FROM anon;
REVOKE ALL ON FUNCTION public.transfer_app(
    p_app_id character varying,
    p_new_org_id uuid
) FROM authenticated;
REVOKE ALL ON FUNCTION public.transfer_app(
    p_app_id character varying,
    p_new_org_id uuid
) FROM service_role;
GRANT EXECUTE ON FUNCTION public.transfer_app(
    p_app_id character varying,
    p_new_org_id uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_app(
    p_app_id character varying,
    p_new_org_id uuid
) TO service_role;

COMMENT ON FUNCTION public.transfer_app(
    p_app_id character varying,
    p_new_org_id uuid
) IS 'Transfers an app and all its related data to a new '
'organization. Requires app.transfer permission on both '
'source and destination organizations.';

-- Repair stale deploy_history ownership left behind by previous app transfers.
UPDATE public.deploy_history AS deploy_history
SET owner_org = apps.owner_org
FROM public.apps AS apps
WHERE apps.app_id = deploy_history.app_id
  AND deploy_history.owner_org IS DISTINCT FROM apps.owner_org;
