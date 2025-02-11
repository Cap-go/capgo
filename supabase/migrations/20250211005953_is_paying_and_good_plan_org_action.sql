CREATE OR REPLACE FUNCTION is_paying_and_good_plan_org_action(orgid uuid, actions action_type[]) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM stripe_info
        WHERE customer_id = (SELECT customer_id FROM orgs WHERE id = orgid)
        AND (
            (trial_at::date > now()::date)
            OR (
                status = 'succeeded' 
                AND is_good_plan = true
                AND NOT (
                    ('mau' = ANY(actions) AND mau_exceeded)
                    OR ('storage' = ANY(actions) AND storage_exceeded)
                    OR ('bandwidth' = ANY(actions) AND bandwidth_exceeded)
                )
            )
        )
    );
End;
$$;
