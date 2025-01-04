DROP TRIGGER IF EXISTS prevent_steal_org ON "public"."orgs";
DROP FUNCTION IF EXISTS prevent_steal_org();

DROP TRIGGER IF EXISTS force_valid_user_id_apps ON public.apps;
DROP FUNCTION IF EXISTS force_valid_user_id_apps();
