CREATE OR REPLACE FUNCTION "public"."delete_user"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_user_id uuid;
    v_user_email text;
    v_user_orgs uuid[];
    v_org_record uuid;
BEGIN
    -- Get the current user ID and email
    v_user_id := (select auth.uid());
    v_user_email := (select auth.email());
    
    -- Store email in deleted_account table for future reference BEFORE deleting the user
    -- This ensures the email is stored even if the user deletion cascades
    INSERT INTO deleted_account (email) VALUES (encode(digest(v_user_email, 'sha256'), 'hex'));
    
    -- Get all organizations where the user is the only super_admin
    SELECT array_agg(org_id) INTO v_user_orgs
    FROM org_users
    WHERE org_users.user_id = v_user_id AND user_right = 'super_admin'
    AND org_id NOT IN (
        SELECT org_id 
        FROM org_users AS ou2
        WHERE ou2.user_right = 'super_admin' 
        AND ou2.user_id != v_user_id
    );
    
    -- Delete organizations where the user is the only super_admin
    IF v_user_orgs IS NOT NULL THEN
        FOREACH v_org_record IN ARRAY v_user_orgs
        LOOP
            -- Delete the organization
            DELETE FROM orgs WHERE id = v_org_record;
        END LOOP;
    END IF;
    
    -- Delete the user from auth.users (this will cascade to other tables)
    DELETE FROM auth.users WHERE id = v_user_id;
END;
$$;
