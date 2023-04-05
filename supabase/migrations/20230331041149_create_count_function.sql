CREATE OR REPLACE FUNCTION public.count_all_onboarded()
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
Begin
  RETURN (SELECT COUNT(DISTINCT user_id) FROM apps);
End;  
$function$;


CREATE OR REPLACE FUNCTION public.count_all_plans()
 RETURNS TABLE(product_id character varying, count int8)
 LANGUAGE plpgsql
AS $function$
Begin
  RETURN QUERY (SELECT stripe_info.product_id, COUNT(*) AS count
    FROM stripe_info
    GROUP BY stripe_info.product_id);
End;  
$function$;

CREATE OR REPLACE FUNCTION public.count_all_paying()
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
Begin
  RETURN (SELECT COUNT(*) FROM stripe_info WHERE status = 'succeeded');
End;  
$function$;

CREATE OR REPLACE FUNCTION public.count_all_need_upgrade()
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
Begin
  RETURN (SELECT COUNT(*) FROM stripe_info WHERE is_good_plan = false AND status = 'succeeded');
End;  
$function$;

CREATE OR REPLACE FUNCTION public.count_all_trial()
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
Begin
  RETURN (SELECT COUNT(*) FROM stripe_info WHERE trial_at > NOW());
End;  
$function$;