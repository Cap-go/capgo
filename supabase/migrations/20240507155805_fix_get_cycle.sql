CREATE OR REPLACE FUNCTION public.get_cycle_info_org("orgid" "uuid")
RETURNS TABLE (
    subscription_anchor_start timestamp with time zone,
    subscription_anchor_end timestamp with time zone
) AS $$
DECLARE
    customer_id_var text;
    stripe_info_row stripe_info%ROWTYPE;
    anchor_day int;
    start_date timestamp with time zone;
    end_date timestamp with time zone;
BEGIN
    SELECT customer_id INTO customer_id_var FROM orgs WHERE id = orgid;

    -- Get the stripe_info using the customer_id
    SELECT * INTO stripe_info_row FROM stripe_info WHERE customer_id = customer_id_var;

    -- Extract the day of the month from subscription_anchor_start, default to 1 if null
    anchor_day := COALESCE(EXTRACT(DAY FROM stripe_info_row.subscription_anchor_start), 1);

    -- Determine the start date based on the anchor day and current date
    IF anchor_day > EXTRACT(DAY FROM now()) THEN
        start_date := date_trunc('MONTH', now() - INTERVAL '1 MONTH') + (anchor_day - 1) * INTERVAL '0 DAY';
    ELSE
        start_date := date_trunc('MONTH', now()) + (anchor_day - 1) * INTERVAL '1 DAY';
    END IF;

    -- Calculate the end date
    end_date := start_date + INTERVAL '1 MONTH';

    RETURN QUERY
    SELECT start_date, end_date;
END;
$$ LANGUAGE plpgsql;
