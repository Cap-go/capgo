ALTER TABLE stripe_info
ADD COLUMN mau_exceeded boolean DEFAULT false,
ADD COLUMN storage_exceeded boolean DEFAULT false,
ADD COLUMN bandwidth_exceeded boolean DEFAULT false;

-- Get functions by org_id
CREATE OR REPLACE FUNCTION is_mau_exceeded_by_org(org_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    SELECT mau_exceeded
    FROM stripe_info
    WHERE stripe_info.customer_id = (SELECT customer_id FROM orgs WHERE id = is_mau_exceeded_by_org.org_id);
$$;

CREATE OR REPLACE FUNCTION is_storage_exceeded_by_org(org_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    SELECT storage_exceeded
    FROM stripe_info
    WHERE stripe_info.customer_id = (SELECT customer_id FROM orgs WHERE id = is_storage_exceeded_by_org.org_id);
$$;

CREATE OR REPLACE FUNCTION is_bandwidth_exceeded_by_org(org_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    SELECT bandwidth_exceeded
    FROM stripe_info
    WHERE stripe_info.customer_id = (SELECT customer_id FROM orgs WHERE id = is_bandwidth_exceeded_by_org.org_id);
$$;

-- Set functions by org_id
CREATE OR REPLACE FUNCTION set_mau_exceeded_by_org(org_id uuid, disabled boolean) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE stripe_info
    SET mau_exceeded = disabled
    WHERE stripe_info.customer_id = (SELECT customer_id FROM orgs WHERE id = set_mau_exceeded_by_org.org_id);
$$;

CREATE OR REPLACE FUNCTION set_storage_exceeded_by_org(org_id uuid, disabled boolean) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE stripe_info
    SET storage_exceeded = disabled
    WHERE stripe_info.customer_id = (SELECT customer_id FROM orgs WHERE id = set_storage_exceeded_by_org.org_id);
$$;

CREATE OR REPLACE FUNCTION set_bandwidth_exceeded_by_org(org_id uuid, disabled boolean) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE stripe_info
    SET bandwidth_exceeded = disabled
    WHERE stripe_info.customer_id = (SELECT customer_id FROM orgs WHERE id = set_bandwidth_exceeded_by_org.org_id);
$$;

-- Grant permissions for new functions
GRANT ALL ON FUNCTION is_mau_exceeded_by_org(uuid) TO authenticated, service_role;
GRANT ALL ON FUNCTION is_storage_exceeded_by_org(uuid) TO authenticated, service_role;
GRANT ALL ON FUNCTION is_bandwidth_exceeded_by_org(uuid) TO authenticated, service_role;
GRANT ALL ON FUNCTION set_mau_exceeded_by_org(uuid, boolean) TO service_role;
GRANT ALL ON FUNCTION set_storage_exceeded_by_org(uuid, boolean) TO service_role;
GRANT ALL ON FUNCTION set_bandwidth_exceeded_by_org(uuid, boolean) TO service_role;


-- Create type for action enum
CREATE TYPE action_type AS ENUM ('mau', 'storage', 'bandwidth');

-- Function to check if specific action is allowed for org
CREATE OR REPLACE FUNCTION is_allowed_action_org_action(orgid uuid, actions action_type[]) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
Begin
    RETURN is_paying_and_good_plan_org_action(orgid, actions);
End;
$$;

-- Function to check if org has good plan or specific action is not exceeded
CREATE OR REPLACE FUNCTION is_paying_and_good_plan_org_action(orgid uuid, actions action_type[]) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    exceeded boolean := false;
    action action_type;
BEGIN
    -- Get exceeded status based on action type
    FOREACH action IN ARRAY actions LOOP
        CASE action
            WHEN 'mau' THEN
                SELECT mau_exceeded INTO exceeded FROM stripe_info 
                WHERE customer_id = (SELECT customer_id FROM orgs WHERE id = orgid);
            WHEN 'storage' THEN
                SELECT storage_exceeded INTO exceeded FROM stripe_info
                WHERE customer_id = (SELECT customer_id FROM orgs WHERE id = orgid);
            WHEN 'bandwidth' THEN
                SELECT bandwidth_exceeded INTO exceeded FROM stripe_info
                WHERE customer_id = (SELECT customer_id FROM orgs WHERE id = orgid);
        END CASE;

        IF exceeded THEN
            EXIT;
        END IF;
    END LOOP;

    RETURN (SELECT EXISTS (
        SELECT 1
        FROM stripe_info
        WHERE customer_id = (SELECT customer_id FROM orgs WHERE id = orgid)
        AND (
            (status = 'succeeded' AND is_good_plan = true)
            OR (subscription_id = 'free')
            OR (trial_at::date - (now())::date > 0)
            OR (is_good_plan = false AND exceeded = false) -- Allow if specific action is not exceeded
        )
    ));
End;
$$;
