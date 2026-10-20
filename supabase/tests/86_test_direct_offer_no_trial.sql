-- Direct-offer (paid ads) signups get no free trial on their org.
BEGIN;

SELECT plan(6);

SELECT tests.authenticate_as_service_role();
SELECT tests.create_supabase_user('direct_offer_creator', 'direct-offer-creator@test.local', NULL, '{"offer": "direct"}'::jsonb);
SELECT tests.create_supabase_user('standard_trial_creator', 'standard-trial-creator@test.local');
SELECT tests.create_supabase_user('other_offer_creator', 'other-offer-creator@test.local', NULL, '{"offer": "Direct "}'::jsonb);

INSERT INTO public.users (id, email, created_at, updated_at)
VALUES
  (tests.get_supabase_uid('direct_offer_creator'), 'direct-offer-creator@test.local', NOW(), NOW()),
  (tests.get_supabase_uid('standard_trial_creator'), 'standard-trial-creator@test.local', NOW(), NOW()),
  (tests.get_supabase_uid('other_offer_creator'), 'other-offer-creator@test.local', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.orgs (id, created_by, name, management_email)
VALUES
  ('86000000-0000-4000-8000-000000000001', tests.get_supabase_uid('direct_offer_creator'), 'Direct offer org', 'direct-offer-creator@test.local'),
  ('86000000-0000-4000-8000-000000000002', tests.get_supabase_uid('standard_trial_creator'), 'Standard trial org', 'standard-trial-creator@test.local'),
  ('86000000-0000-4000-8000-000000000003', tests.get_supabase_uid('other_offer_creator'), 'Other offer org', 'other-offer-creator@test.local');

SELECT is(
  (SELECT customer_id FROM public.orgs WHERE id = '86000000-0000-4000-8000-000000000001'),
  'pending_86000000-0000-4000-8000-000000000001',
  'direct offer org gets a pending stripe_info row'
);

SELECT ok(
  (
    SELECT si.trial_at BETWEEN NOW() - INTERVAL '1 minute' AND NOW() + INTERVAL '1 minute'
    FROM public.orgs o
    JOIN public.stripe_info si ON si.customer_id = o.customer_id
    WHERE o.id = '86000000-0000-4000-8000-000000000001'
  ),
  'creator with offer=direct gets trial_at = now (no trial)'
);

SELECT ok(
  (
    SELECT NOT (si.trial_at::date > CURRENT_DATE)
    FROM public.orgs o
    JOIN public.stripe_info si ON si.customer_id = o.customer_id
    WHERE o.id = '86000000-0000-4000-8000-000000000001'
  ),
  'direct offer org is not inside a trial window'
);

SELECT ok(
  (
    SELECT si.trial_at BETWEEN NOW() + INTERVAL '15 days' - INTERVAL '1 minute' AND NOW() + INTERVAL '15 days' + INTERVAL '1 minute'
    FROM public.orgs o
    JOIN public.stripe_info si ON si.customer_id = o.customer_id
    WHERE o.id = '86000000-0000-4000-8000-000000000002'
  ),
  'creator without offer keeps the 15-day trial'
);

SELECT ok(
  (
    SELECT si.trial_at BETWEEN NOW() + INTERVAL '15 days' - INTERVAL '1 minute' AND NOW() + INTERVAL '15 days' + INTERVAL '1 minute'
    FROM public.orgs o
    JOIN public.stripe_info si ON si.customer_id = o.customer_id
    WHERE o.id = '86000000-0000-4000-8000-000000000003'
  ),
  'only the literal offer value direct removes the trial'
);

SELECT ok(
  (
    SELECT si.trial_at::date > CURRENT_DATE
    FROM public.orgs o
    JOIN public.stripe_info si ON si.customer_id = o.customer_id
    WHERE o.id = '86000000-0000-4000-8000-000000000002'
  ),
  'standard org is inside its trial window'
);

SELECT * FROM finish();

ROLLBACK;
