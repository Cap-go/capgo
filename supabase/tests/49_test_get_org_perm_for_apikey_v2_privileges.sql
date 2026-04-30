BEGIN;

SELECT plan(2);

SELECT
  is(
    has_function_privilege(
      'authenticated'::name,
      'public.get_org_perm_for_apikey_v2(text, text)'::regprocedure,
      'EXECUTE'
    ),
    false,
    'authenticated role has no execute privilege on get_org_perm_for_apikey_v2'
  );

SELECT
  is(
    has_function_privilege(
      'service_role'::name,
      'public.get_org_perm_for_apikey_v2(text, text)'::regprocedure,
      'EXECUTE'
    ),
    true,
    'service_role retains execute privilege on get_org_perm_for_apikey_v2'
  );

SELECT * FROM finish();

ROLLBACK;
