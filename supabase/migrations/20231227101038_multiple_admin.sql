CREATE OR REPLACE FUNCTION "public"."is_admin"("userid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN ((select decrypted_secret from vault.decrypted_secrets where name = 'admin_user')::jsonb) ? userid;
End;  
$$;