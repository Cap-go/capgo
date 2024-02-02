DROP FUNCTION public.is_allowed_action(apikey text, appid character varying);

-- CREATE OR REPLACE FUNCTION public.is_allowed_action(apikey text, appid character varying)
--  RETURNS boolean
--  LANGUAGE plpgsql
--  SECURITY DEFINER
-- AS $function$
-- Begin
--   RETURN is_app_owner(get_user_id(apikey), appid);
-- End;
-- $function$
