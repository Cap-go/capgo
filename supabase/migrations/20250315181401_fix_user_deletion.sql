CREATE OR REPLACE FUNCTION "public"."delete_user"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    user_id uuid;
    user_email text;
    user_orgs uuid[];
    org_record uuid;
BEGIN
    -- Get the current user ID and email
    user_id := (select auth.uid());
    user_email := (select auth.email());
    
    -- Get all organizations where the user is the only super_admin
    SELECT array_agg(org_id) INTO user_orgs
    FROM org_users
    WHERE org_users.user_id = user_id AND user_right = 'super_admin'
    AND org_id NOT IN (
        SELECT org_id 
        FROM org_users 
        WHERE user_right = 'super_admin' 
        AND org_users.user_id != user_id
    );
    
    -- Delete organizations where the user is the only super_admin
    IF user_orgs IS NOT NULL THEN
        FOREACH org_record IN ARRAY user_orgs
        LOOP
            -- Delete the organization
            DELETE FROM orgs WHERE id = org_record;
        END LOOP;
    END IF;
    
    -- Store email in deleted_account table for future reference
    INSERT INTO deleted_account (email) VALUES (encode(digest(user_email, 'sha256'), 'hex'));
    
    -- Delete the user from auth.users (this will cascade to other tables)
    DELETE FROM auth.users WHERE id = user_id;
END;
$$;
