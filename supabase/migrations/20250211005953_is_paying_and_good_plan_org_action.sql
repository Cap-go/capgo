CREATE OR REPLACE FUNCTION is_paying_and_good_plan_org_action(orgid uuid, actions action_type[]) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    org_customer_id text;
    exceeded boolean := false;
BEGIN
    -- Get customer_id once
    SELECT o.customer_id INTO org_customer_id
    FROM orgs o WHERE o.id = orgid;

    -- Check if any action is exceeded
    SELECT EXISTS (
        SELECT 1 FROM stripe_info
        WHERE customer_id = org_customer_id
        AND (
            ('mau' = ANY(actions) AND mau_exceeded)
            OR ('storage' = ANY(actions) AND storage_exceeded)
            OR ('bandwidth' = ANY(actions) AND bandwidth_exceeded)
        )
    ) INTO exceeded;

    -- Return final check
    RETURN EXISTS (
        SELECT 1
        FROM stripe_info
        WHERE customer_id = org_customer_id
        AND (
            trial_at::date - (now())::date > 0
            OR (status = 'succeeded' AND NOT exceeded)
        )
    );
END;
$$;
