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
    WITH cycle_info AS (
        SELECT stripe_info.subscription_anchor_start, stripe_info.subscription_anchor_end 
        FROM stripe_info 
        WHERE customer_id = customer_id_var
    )
    SELECT 
        CASE 
            WHEN now() BETWEEN cycle_info.subscription_anchor_start AND cycle_info.subscription_anchor_end THEN cycle_info.subscription_anchor_start
            ELSE date_trunc('MONTH', now()) + (cycle_info.subscription_anchor_start - date_trunc('MONTH', cycle_info.subscription_anchor_start)) - INTERVAL '1 month'
        END,
        CASE 
            WHEN now() BETWEEN cycle_info.subscription_anchor_start AND cycle_info.subscription_anchor_end THEN cycle_info.subscription_anchor_end
            ELSE date_trunc('MONTH', now()) + (cycle_info.subscription_anchor_start - date_trunc('MONTH', cycle_info.subscription_anchor_start))
        END
    FROM cycle_info;
END;
$$ LANGUAGE plpgsql;
