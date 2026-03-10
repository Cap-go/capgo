BEGIN;

SELECT plan(2);

DO $$
DECLARE
  v_org_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.orgs (
    id,
    created_by,
    name,
    management_email,
    use_new_rbac
  )
  VALUES (
    v_org_id,
    tests.get_supabase_uid('test_user'),
    'RBAC apps returning test',
    'rbac-apps-returning@test.com',
    true
  );

  PERFORM set_config('test.apps_returning_rbac_org_id', v_org_id::text, false);
END $$;

SELECT tests.authenticate_as('test_user');

SELECT lives_ok(
    $sql$
    INSERT INTO public.apps (
      owner_org,
      app_id,
      icon_url,
      name,
      retention,
      default_upload_channel
    )
    VALUES (
      current_setting('test.apps_returning_rbac_org_id')::uuid,
      'com.rbac.insert.returning',
      '',
      'RBAC insert returning',
      2592000,
      'dev'
    )
    RETURNING app_id
  $sql$,
    'RBAC org super admin can create an app with INSERT ... RETURNING'
);

SELECT is(
    (
        SELECT count(*)
        FROM public.apps
        WHERE app_id = 'com.rbac.insert.returning'
    ),
    1::bigint,
    'Inserted RBAC app is visible in the same authenticated session'
);

SELECT tests.clear_authentication();

SELECT * FROM finish();

ROLLBACK;
