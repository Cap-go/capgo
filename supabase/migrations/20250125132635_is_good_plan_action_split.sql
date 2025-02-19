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
GRANT ALL ON FUNCTION set_mau_exceeded_by_org(uuid, boolean) TO authenticated, service_role;
GRANT ALL ON FUNCTION set_storage_exceeded_by_org(uuid, boolean) TO authenticated, service_role;
GRANT ALL ON FUNCTION set_bandwidth_exceeded_by_org(uuid, boolean) TO authenticated, service_role;


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
