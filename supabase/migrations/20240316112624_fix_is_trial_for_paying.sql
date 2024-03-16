CREATE OR REPLACE FUNCTION "public"."is_trial"("userid" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    user_stripe_id text;
BEGIN
  SELECT customer_id from users where id=userid INTO user_stripe_id;

  IF (
    SELECT EXISTS (
      SELECT 1
      from stripe_info
      where customer_id=user_stripe_id
      AND (is_good_plan = true AND status = 'succeeded') 
    )
  ) THEN 
    RETURN 0;
  END IF;

  RETURN (SELECT GREATEST((trial_at::date - (now())::date), 0) AS days
  from stripe_info
  where customer_id=user_stripe_id);
End;  
$$;