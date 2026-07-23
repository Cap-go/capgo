BEGIN;

SELECT plan(3);

SELECT diag(coalesce((
  SELECT with_check
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname = 'Allow user or apikey to insert they own folder in images'
), '<NULL>'));

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Allow user or apikey to insert they own folder in images'
  ),
  'images insert policy exists'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Allow user or apikey to insert they own folder in images'
      -- Baseline buggy form: foldername((apps.name)::text) / foldername(("apps"."name")::text)
      AND with_check NOT LIKE '%foldername((apps.name%'
      AND with_check NOT LIKE '%foldername(("apps"."name"%'
      AND with_check NOT LIKE '%foldername"(("apps"."name"%'
      AND with_check LIKE '%rbac_perm_org_create_app%'
  ),
  'images insert policy uses storage object path and org.create_app for new app icons'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Allow user or apikey to update they own folder in images'
      AND (qual LIKE '%need_onboarding%' OR with_check LIKE '%need_onboarding%')
      AND (qual LIKE '%rbac_perm_org_create_app%' OR with_check LIKE '%rbac_perm_org_create_app%')
  ),
  'images update policy allows org.create_app for missing or pending onboarding app icons'
);

SELECT * FROM finish(); -- noqa: AM04

ROLLBACK;
