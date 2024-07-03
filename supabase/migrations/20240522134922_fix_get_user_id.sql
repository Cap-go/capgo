CREATE OR REPLACE FUNCTION "public"."get_user_id"("apikey" "text", "app_id" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Declare  
 real_user_id uuid;
Begin
  SELECT get_user_id(apikey) into real_user_id;

  RETURN real_user_id;
End;  
$$;