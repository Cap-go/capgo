CREATE OR REPLACE FUNCTION public.get_cycle_info_org("orgid" "uuid")
RETURNS TABLE (
    subscription_anchor_start timestamp with time zone,
    subscription_anchor_end timestamp with time zone
) AS $$
DECLARE
    customer_id_var text;
BEGIN
    SELECT customer_id INTO customer_id_var FROM orgs WHERE id = orgid;

    -- Get the stripe_info using the customer_id
    RETURN QUERY
    with cycle as (
      select stripe_info.subscription_anchor_end, stripe_info.subscription_anchor_start from stripe_info where customer_id=customer_id_var
    )
    select data.cycle_start as subscription_anchor_start, data.cycle_end as subscription_anchor_end
    from (
        select base.start as cycle_start, base.start + interval '1 month' as cycle_end from (
          select generate_series((select cycle.subscription_anchor_start from cycle), (select cycle.subscription_anchor_end from cycle), '1 month') as start
        ) as base limit 12
      ) as data
    where now() >= data.cycle_start and now() < data.cycle_end;
END;
$$ LANGUAGE plpgsql;
