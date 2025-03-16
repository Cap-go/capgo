-- Create a function to ensure the deleted_account table exists
CREATE OR REPLACE FUNCTION "public"."create_deleted_account_table_if_not_exists"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- Create the deleted_account table if it doesn't exist
    CREATE TABLE IF NOT EXISTS deleted_account (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text NOT NULL,
        created_at timestamptz DEFAULT now()
    );
END;
$$;

-- Optimize the delete_user function for better performance
CREATE OR REPLACE FUNCTION "public"."delete_user"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_user_id uuid;
    v_user_email text;
    v_user_orgs uuid[];
BEGIN
    -- Get the current user ID and email with a single query
    SELECT auth.uid(), auth.email() INTO v_user_id, v_user_email;
    
    -- Ensure the deleted_account table exists
    PERFORM create_deleted_account_table_if_not_exists();
    
    -- Store email in deleted_account table for future reference BEFORE deleting the user
    -- This ensures the email is stored even if the user deletion cascades
    INSERT INTO deleted_account (email) VALUES (encode(digest(v_user_email, 'sha256'), 'hex'));
    
    -- Get all organizations where the user is the only super_admin with a more efficient query
    -- Use a CTE (Common Table Expression) for better performance
    WITH sole_admin_orgs AS (
        SELECT org_id 
        FROM org_users
        WHERE user_id = v_user_id 
        AND user_right = 'super_admin'
        AND org_id NOT IN (
            SELECT org_id 
            FROM org_users
            WHERE user_right = 'super_admin' 
            AND user_id != v_user_id
        )
    )
    SELECT array_agg(org_id) INTO v_user_orgs FROM sole_admin_orgs;
    
    -- Delete organizations where the user is the only super_admin
    -- Use a single DELETE statement instead of a loop for better performance
    IF v_user_orgs IS NOT NULL THEN
        DELETE FROM orgs WHERE id = ANY(v_user_orgs);
    END IF;
    
    -- Delete the user from auth.users (this will cascade to other tables)
    DELETE FROM auth.users WHERE id = v_user_id;
END;
$$;

-- Create a function to get organizations where user is the sole admin
CREATE OR REPLACE FUNCTION "public"."get_sole_admin_orgs"(user_id uuid) 
RETURNS uuid[] 
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
    v_user_orgs uuid[];
BEGIN
    WITH sole_admin_orgs AS (
        SELECT org_id 
        FROM org_users
        WHERE user_id = $1
        AND user_right = 'super_admin'
        AND org_id NOT IN (
            SELECT org_id 
            FROM org_users
            WHERE user_right = 'super_admin' 
            AND user_id != $1
        )
    )
    SELECT array_agg(org_id) INTO v_user_orgs FROM sole_admin_orgs;
    
    RETURN v_user_orgs;
END;
$$;

-- Create a function to record performance metrics
CREATE OR REPLACE FUNCTION "public"."record_performance_metric"(
    p_metric_name text,
    p_value numeric,
    p_tags jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Create the performance_metrics table if it doesn't exist
    CREATE TABLE IF NOT EXISTS performance_metrics (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        metric_name text NOT NULL,
        value numeric NOT NULL,
        tags jsonb DEFAULT '{}'::jsonb,
        timestamp timestamptz DEFAULT now()
    );
    
    -- Insert the metric
    INSERT INTO performance_metrics (metric_name, value, tags, timestamp)
    VALUES (p_metric_name, p_value, p_tags, now());
END;
$$;

-- Create a table for the deletion queue
CREATE TABLE IF NOT EXISTS "public"."deletion_queue" (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    user_email text NOT NULL,
    customer_id text,
    status text NOT NULL DEFAULT 'pending',
    created_at timestamptz DEFAULT now(),
    processed_at timestamptz,
    error text,
    retry_count int DEFAULT 0
);

-- Create a function to queue a user for deletion
CREATE OR REPLACE FUNCTION "public"."queue_user_deletion"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_user_id uuid;
    v_user_email text;
    v_customer_id text;
    v_queue_id uuid;
BEGIN
    -- Get the current user ID and email
    SELECT auth.uid(), auth.email() INTO v_user_id, v_user_email;
    
    -- Get customer ID if exists
    SELECT customer_id INTO v_customer_id FROM users WHERE id = v_user_id;
    
    -- Add to deletion queue
    INSERT INTO deletion_queue (user_id, user_email, customer_id)
    VALUES (v_user_id, v_user_email, v_customer_id)
    RETURNING id INTO v_queue_id;
    
    -- Return success
    RETURN jsonb_build_object(
        'success', true,
        'queue_id', v_queue_id
    );
END;
$$;
