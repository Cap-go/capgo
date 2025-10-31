-- Create to_delete_accounts table
CREATE TABLE public.to_delete_accounts (
  id SERIAL PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  removed_data JSONB,
  removal_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure only one pending delete per account and efficient scheduling
CREATE UNIQUE INDEX IF NOT EXISTS to_delete_accounts_account_id_key ON public.to_delete_accounts (account_id);

CREATE INDEX IF NOT EXISTS to_delete_accounts_removal_date_idx ON public.to_delete_accounts (removal_date);

-- Enable Row Level Security
ALTER TABLE public.to_delete_accounts ENABLE ROW LEVEL SECURITY;

-- Create RLS policy that denies access to all users
-- Only service_role or bypassing RLS can access this table
CREATE POLICY "Deny all access" ON public.to_delete_accounts FOR ALL USING (false)
WITH
  CHECK (false);

-- Grant permissions to service_role for system operations
GRANT ALL ON TABLE public.to_delete_accounts TO service_role;

GRANT ALL ON SEQUENCE public.to_delete_accounts_id_seq TO service_role;

-- Function to check if an account is disabled (marked for deletion)
CREATE OR REPLACE FUNCTION public.is_account_disabled (user_id UUID) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = public AS $$
BEGIN
    -- Check if the user_id exists in the to_delete_accounts table
    RETURN EXISTS (
        SELECT 1 
        FROM public.to_delete_accounts 
        WHERE account_id = user_id
    );
END;
$$;

-- Function to get the removal date for a disabled account
CREATE OR REPLACE FUNCTION public.get_account_removal_date (user_id UUID) RETURNS TIMESTAMPTZ LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = public AS $$
DECLARE
    removal_date TIMESTAMPTZ;
BEGIN
    -- Get the removal_date for the user_id
    SELECT to_delete_accounts.removal_date INTO removal_date
    FROM public.to_delete_accounts 
    WHERE account_id = user_id;
    
    -- Throw exception if account is not in the table
    IF removal_date IS NULL THEN
        RAISE EXCEPTION 'Account with ID % is not marked for deletion', user_id;
    END IF;
    
    RETURN removal_date;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."delete_user" () RETURNS "void" LANGUAGE "plpgsql"
SET
  search_path = '' SECURITY DEFINER AS $$
DECLARE
  user_id_fn uuid;
  user_email text;
BEGIN
  -- Get the current user ID and email
  SELECT "auth"."uid"() INTO user_id_fn;
  SELECT "email" INTO user_email FROM "auth"."users" WHERE "id" = user_id_fn;
  
  -- Trigger the queue-based deletion process
  -- This cancels the subscriptions of the user's organizations
  PERFORM "pgmq"."send"(
    'on_user_delete'::text,
    "jsonb_build_object"(
      'user_id', user_id_fn,
      'email', user_email
    )
  );
  
  -- Mark the user for deletion
  INSERT INTO "public"."to_delete_accounts" (
    "account_id", 
    "removal_date", 
    "removed_data"
  ) VALUES 
  (
    user_id_fn, 
    NOW() + INTERVAL '30 days', 
    "jsonb_build_object"('email', user_email, 'apikeys', (SELECT "jsonb_agg"("to_jsonb"(a.*)) FROM "public"."apikeys" a WHERE a."user_id" = user_id_fn))
  );

  -- Delete the API keys
  DELETE FROM "public"."apikeys" WHERE "public"."apikeys"."user_id" = user_id_fn;
END;
$$;

-- Function to permanently delete accounts that have passed their removal_date
-- This function can only be called by PostgreSQL/cron jobs, not by users
CREATE OR REPLACE FUNCTION "public"."delete_accounts_marked_for_deletion" () RETURNS TABLE (deleted_count INTEGER, deleted_user_ids UUID[]) LANGUAGE "plpgsql" SECURITY DEFINER AS $$
DECLARE
  account_record RECORD;
  deleted_users UUID[] := '{}';
  total_deleted INTEGER := 0;
BEGIN
  -- Loop through all accounts marked for deletion where removal_date has passed
  FOR account_record IN 
    SELECT "account_id", "removal_date", "removed_data"
    FROM "public"."to_delete_accounts" 
    WHERE "removal_date" < NOW()
  LOOP
    BEGIN
      -- A: Delete from public.users table
      DELETE FROM "public"."users" WHERE "id" = account_record.account_id;
      
      -- B: Delete from auth.users table
      DELETE FROM "auth"."users" WHERE "id" = account_record.account_id;
      
      -- C: Remove from to_delete_accounts table
      DELETE FROM "public"."to_delete_accounts" WHERE "account_id" = account_record.account_id;
      
      -- Track the deleted user
      deleted_users := "array_append"(deleted_users, account_record.account_id);
      total_deleted := total_deleted + 1;
      
      -- Log the deletion (optional)
      RAISE NOTICE 'Successfully deleted account: % (removal date: %)', 
        account_record.account_id, account_record.removal_date;
        
    EXCEPTION
      WHEN OTHERS THEN
        -- Log the error but continue with other accounts
        RAISE WARNING 'Failed to delete account %: %', account_record.account_id, SQLERRM;
    END;
  END LOOP;
  
  -- Return results
  deleted_count := total_deleted;
  deleted_user_ids := deleted_users;
  RETURN NEXT;
  
  RAISE NOTICE 'Deletion process completed. Total accounts deleted: %', total_deleted;
END;
$$;

-- Revoke all permissions from public (no one can execute by default)
-- Revoke all permissions from public (default), anon, and authenticated users
REVOKE ALL ON FUNCTION "public"."delete_accounts_marked_for_deletion" ()
FROM
  PUBLIC;

REVOKE ALL ON FUNCTION "public"."delete_accounts_marked_for_deletion" ()
FROM
  anon;

REVOKE ALL ON FUNCTION "public"."delete_accounts_marked_for_deletion" ()
FROM
  authenticated;

-- Grant execution permission only to postgres superuser and service_role
GRANT
EXECUTE ON FUNCTION "public"."delete_accounts_marked_for_deletion" () TO postgres;

GRANT
EXECUTE ON FUNCTION "public"."delete_accounts_marked_for_deletion" () TO service_role;

-- Create a cron job to run the account deletion function every minute
-- This will process and permanently delete accounts that have passed their removal_date
SELECT
  "cron"."schedule" (
    'delete-expired-accounts', -- job name
    '* * * * *', -- cron expression (every minute)
    'SELECT "public"."delete_accounts_marked_for_deletion"();' -- SQL command
  );
