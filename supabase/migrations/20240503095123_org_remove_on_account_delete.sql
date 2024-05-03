CREATE OR REPLACE FUNCTION "public"."check_if_users_orgs_can_exist"() RETURNS trigger
   LANGUAGE plpgsql AS $$
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
          org_users.org_id = orgs.id
          AND org_users.user_right = 'super_admin'
          AND org_users.user_id != get_identity()
      ) = 0
  );

  RETURN OLD;
END;$$;

CREATE TRIGGER check_if_users_orgs_can_exist_on_account_delete
   BEFORE DELETE ON "public"."users" FOR EACH ROW
   EXECUTE PROCEDURE "public"."check_if_users_orgs_can_exist"();

CREATE TRIGGER on_organization_delete
AFTER DELETE ON public.orgs 
FOR EACH ROW 
EXECUTE FUNCTION public.trigger_http_queue_post_to_function('on_organization_delete');