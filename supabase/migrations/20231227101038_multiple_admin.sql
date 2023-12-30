CREATE OR REPLACE FUNCTION "public"."is_admin"("userid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  admin_ids_jsonb JSONB;
  is_admin_flag BOOLEAN;
BEGIN
  -- Fetch the JSONB string of admin user IDs from the vault
  SELECT decrypted_secret INTO admin_ids_jsonb FROM vault.decrypted_secrets WHERE name = 'admin_users';
  
  -- Check if the provided userid is within the JSONB array of admin user IDs
  is_admin_flag := (admin_ids_jsonb ? userid::text);
  
  RETURN is_admin_flag;
END;  
$$;
