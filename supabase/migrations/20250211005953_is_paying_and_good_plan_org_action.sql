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
    SELECT 
        CASE 
            WHEN 'mau' = ANY(actions) AND mau_exceeded THEN true
            WHEN 'storage' = ANY(actions) AND storage_exceeded THEN true
            WHEN 'bandwidth' = ANY(actions) AND bandwidth_exceeded THEN true
            ELSE false
        END INTO exceeded
    FROM stripe_info
    WHERE customer_id = org_customer_id;

    -- Return final check
    RETURN EXISTS (
        SELECT 1
        FROM stripe_info
        WHERE customer_id = org_customer_id
        AND (
            trial_at::date > now()::date
            OR (status = 'succeeded' AND is_good_plan = true)
            OR (is_good_plan = false AND NOT exceeded)
        )
    );
END;
$$;
