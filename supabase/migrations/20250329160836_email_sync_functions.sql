-- Find mismatched emails between auth and users tables without fixing them (for auditing)
CREATE OR REPLACE FUNCTION public.find_mismatched_emails()
  RETURNS TABLE(user_id uuid, auth_email text, users_email text)
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id,
    a.email AS auth_email,
    u.email AS users_email
  FROM 
    public.users u
  JOIN 
    auth.users a ON u.id = a.id
  WHERE 
    u.email <> a.email;
END;
$$;

-- Fix all accounts with mismatched emails by updating the users table to match auth table
CREATE OR REPLACE FUNCTION public.fix_mismatched_emails()
  RETURNS TABLE(user_id uuid, old_email text, new_email text)
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT 
      u.id,
      u.email AS old_email,
      a.email AS new_email
    FROM 
      public.users u
    JOIN 
      auth.users a ON u.id = a.id
    WHERE 
      u.email <> a.email
  LOOP
    -- Update the email in users table to match auth table
    UPDATE public.users
    SET email = r.new_email
    WHERE id = r.id;
    
    -- Return the fixed records
    user_id := r.id;
    old_email := r.old_email;
    new_email := r.new_email;
    RETURN NEXT;
  END LOOP;
  
  RETURN;
END;
$$;

-- Add a trigger to automatically sync email changes from auth to users table
-- This handles direct changes to auth.users that might bypass our edge function
CREATE OR REPLACE FUNCTION public.sync_auth_email_to_users()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
BEGIN
  -- Only proceed if the email has changed
  IF NEW.email <> OLD.email THEN
    UPDATE public.users
    SET email = NEW.email
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger on auth.users table
DROP TRIGGER IF EXISTS sync_email_on_auth_update ON auth.users;
CREATE TRIGGER sync_email_on_auth_update
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_auth_email_to_users();
