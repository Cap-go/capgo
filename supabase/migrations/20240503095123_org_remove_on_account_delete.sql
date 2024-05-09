CREATE OR REPLACE FUNCTION "public"."check_if_org_can_exist"() RETURNS trigger
   LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  delete from orgs
  where
  (
      (
      select
          count(*)
      from
          org_users
      where
          org_users.user_right = 'super_admin'
          AND org_users.user_id != OLD.user_id
          AND org_users.org_id=orgs.id
      ) = 0
  ) 
  AND orgs.id=OLD.org_id;

  RETURN OLD;
END;$$;

CREATE TRIGGER check_if_org_can_exist_org_users
   AFTER DELETE ON "public"."org_users" FOR EACH ROW
   EXECUTE PROCEDURE "public"."check_if_org_can_exist"();

CREATE TRIGGER on_organization_delete
AFTER DELETE ON public.orgs 
FOR EACH ROW 
EXECUTE FUNCTION public.trigger_http_queue_post_to_function('on_organization_delete');