CREATE OR REPLACE FUNCTION "public"."get_orgs_v3"("userid" "uuid") RETURNS TABLE(gid uuid, created_by uuid, logo text, name text, role varchar, paying boolean, trial_left integer, can_use_more boolean, is_canceled boolean)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  return query select 
  o.id as gid, 
  o.created_by, 
  o.logo, 
  o.name, 
  org_users.user_right::varchar, 
  is_paying(o.created_by) as paying, 
  is_trial(o.created_by) as trial_left, 
  is_allowed_action_user(o.created_by) as can_use_more,
  is_canceled(o.created_by) as is_canceled
  from orgs as o
  join org_users on org_users.user_id=get_orgs_v3.userid
  where o.created_by != get_orgs_v3.userid
  union all
  select o.id as gid, 
  o.created_by, 
  o.logo, 
  o.name, 'owner' as "role", 
  is_paying(o.created_by), 
  is_trial(o.created_by) as trial_left, 
  is_allowed_action_user(o.created_by) as can_use_more,
  is_canceled(o.created_by) as is_canceled
  from orgs as o
  where o.created_by = get_orgs_v3.userid;
END;  
$$;