
CREATE OR REPLACE FUNCTION fix_mismatched_emails()
RETURNS TABLE (
  user_id uuid,
  auth_email text,
  user_email text,
  fixed boolean
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  auth_user RECORD;
  user_record RECORD;
  fix_count INTEGER := 0;
BEGIN
  FOR auth_user IN 
    SELECT id, email FROM auth.users
  LOOP
    SELECT * INTO user_record 
    FROM users 
    WHERE id = auth_user.id;
    
    IF user_record.id IS NOT NULL AND user_record.email != auth_user.email THEN
      UPDATE users 
      SET email = auth_user.email 
      WHERE id = auth_user.id;
      
      user_id := auth_user.id;
      auth_email := auth_user.email;
      user_email := user_record.email;
      fixed := TRUE;
      
      fix_count := fix_count + 1;
      RETURN NEXT;
    END IF;
  END LOOP;
  
  IF fix_count = 0 THEN
    user_id := NULL;
    auth_email := NULL;
    user_email := NULL;
    fixed := FALSE;
    RETURN NEXT;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION check_mismatched_emails()
RETURNS TABLE (
  user_id uuid,
  auth_email text,
  user_email text
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    au.id, 
    au.email, 
    u.email
  FROM 
    auth.users au
  JOIN 
    users u ON au.id = u.id
  WHERE 
    au.email != u.email;
END;
$$;

COMMENT ON FUNCTION fix_mismatched_emails() IS 
'Finds and fixes accounts where the email in the auth table does not match the email in the users table. 
This can happen when a user changes their email and confirms it, but the users table is not updated.
Returns information about fixed records.';

COMMENT ON FUNCTION check_mismatched_emails() IS 
'Checks for accounts where the email in the auth table does not match the email in the users table.
Returns information about mismatched records without fixing them.';
