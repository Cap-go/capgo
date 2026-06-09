BEGIN;

SELECT plan(1);

CREATE OR REPLACE FUNCTION my_tests() RETURNS SETOF TEXT AS $$
DECLARE
  before_trial_count bigint;
  after_trial_count bigint;
  solo_product_id character varying;
  solo_price_id character varying;
BEGIN
  SELECT stripe_id, price_m_id
  INTO solo_product_id, solo_price_id
  FROM public.plans
  WHERE name = 'Solo'
  LIMIT 1;

  DELETE FROM public.stripe_info
  WHERE customer_id IN (
    'cus_count_all_plans_created_trial',
    'cus_count_all_plans_updated_trial',
    'cus_count_all_plans_paid_future_trial'
  );

  SELECT COALESCE(MAX(count), 0)
  INTO before_trial_count
  FROM public.count_all_plans_v2()
  WHERE plan_name = 'Trial';

  INSERT INTO public.stripe_info (
    customer_id,
    status,
    product_id,
    price_id,
    trial_at,
    is_good_plan,
    subscription_anchor_start,
    subscription_anchor_end
  )
  VALUES
    (
      'cus_count_all_plans_created_trial',
      'created'::public.stripe_status,
      solo_product_id,
      solo_price_id,
      NOW() + interval '7 days',
      false,
      NOW(),
      NOW() + interval '1 month'
    ),
    (
      'cus_count_all_plans_updated_trial',
      'updated'::public.stripe_status,
      solo_product_id,
      solo_price_id,
      NOW() + interval '7 days',
      false,
      NOW(),
      NOW() + interval '1 month'
    ),
    (
      'cus_count_all_plans_paid_future_trial',
      'succeeded'::public.stripe_status,
      solo_product_id,
      solo_price_id,
      NOW() + interval '7 days',
      true,
      NOW(),
      NOW() + interval '1 month'
    );

  SELECT COALESCE(MAX(count), 0)
  INTO after_trial_count
  FROM public.count_all_plans_v2()
  WHERE plan_name = 'Trial';

  RETURN NEXT is(
    after_trial_count,
    before_trial_count + 2,
    'count_all_plans_v2 counts active non-succeeded trials and excludes succeeded subscriptions'
  );
END;
$$ LANGUAGE plpgsql;

SELECT my_tests();

SELECT * -- noqa: AM04
FROM finish();

ROLLBACK;
