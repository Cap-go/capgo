-- Move exposed SECURITY DEFINER RPC implementations into a private schema and replace them with SECURITY INVOKER wrappers.
CREATE SCHEMA IF NOT EXISTS capgo_private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA capgo_private FROM PUBLIC;
GRANT USAGE ON SCHEMA capgo_private TO "anon";
GRANT USAGE ON SCHEMA capgo_private TO "authenticated";
GRANT USAGE ON SCHEMA capgo_private TO "service_role";

ALTER FUNCTION public."accept_invitation_to_org"(org_id uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."accept_invitation_to_org"(org_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."accept_invitation_to_org"(org_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."accept_invitation_to_org"(org_id uuid) TO "service_role";
CREATE FUNCTION public."accept_invitation_to_org"(org_id uuid)
RETURNS character varying
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."accept_invitation_to_org"($1);
$$;
ALTER FUNCTION public."accept_invitation_to_org"(org_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."accept_invitation_to_org"(org_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."accept_invitation_to_org"(org_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."accept_invitation_to_org"(org_id uuid) TO "service_role";

ALTER FUNCTION public."audit_logs_allowed_orgs"() SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."audit_logs_allowed_orgs"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."audit_logs_allowed_orgs"() TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."audit_logs_allowed_orgs"() TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."audit_logs_allowed_orgs"() TO "service_role";
CREATE FUNCTION public."audit_logs_allowed_orgs"()
RETURNS uuid[]
LANGUAGE sql
STABLE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."audit_logs_allowed_orgs"();
$$;
ALTER FUNCTION public."audit_logs_allowed_orgs"() OWNER TO postgres;
REVOKE ALL ON FUNCTION public."audit_logs_allowed_orgs"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."audit_logs_allowed_orgs"() TO "anon";
GRANT EXECUTE ON FUNCTION public."audit_logs_allowed_orgs"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."audit_logs_allowed_orgs"() TO "service_role";

ALTER FUNCTION public."check_domain_sso"(p_domain text) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."check_domain_sso"(p_domain text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."check_domain_sso"(p_domain text) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."check_domain_sso"(p_domain text) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."check_domain_sso"(p_domain text) TO "service_role";
CREATE FUNCTION public."check_domain_sso"(p_domain text)
RETURNS TABLE(has_sso boolean, provider_id text, org_id uuid)
LANGUAGE sql
STABLE
PARALLEL UNSAFE
COST 100
ROWS 1000
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT t."has_sso", t."provider_id", t."org_id"
FROM capgo_private."check_domain_sso"($1) AS t;
$$;
ALTER FUNCTION public."check_domain_sso"(p_domain text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."check_domain_sso"(p_domain text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."check_domain_sso"(p_domain text) TO "anon";
GRANT EXECUTE ON FUNCTION public."check_domain_sso"(p_domain text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."check_domain_sso"(p_domain text) TO "service_role";

ALTER FUNCTION public."check_min_rights"(min_right user_min_right, user_id uuid, org_id uuid, app_id character varying, channel_id bigint) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."check_min_rights"(min_right user_min_right, user_id uuid, org_id uuid, app_id character varying, channel_id bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."check_min_rights"(min_right user_min_right, user_id uuid, org_id uuid, app_id character varying, channel_id bigint) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."check_min_rights"(min_right user_min_right, user_id uuid, org_id uuid, app_id character varying, channel_id bigint) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."check_min_rights"(min_right user_min_right, user_id uuid, org_id uuid, app_id character varying, channel_id bigint) TO "service_role";
CREATE FUNCTION public."check_min_rights"(min_right user_min_right, user_id uuid, org_id uuid, app_id character varying, channel_id bigint)
RETURNS boolean
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."check_min_rights"($1, $2, $3, $4, $5);
$$;
ALTER FUNCTION public."check_min_rights"(min_right user_min_right, user_id uuid, org_id uuid, app_id character varying, channel_id bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."check_min_rights"(min_right user_min_right, user_id uuid, org_id uuid, app_id character varying, channel_id bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."check_min_rights"(min_right user_min_right, user_id uuid, org_id uuid, app_id character varying, channel_id bigint) TO "anon";
GRANT EXECUTE ON FUNCTION public."check_min_rights"(min_right user_min_right, user_id uuid, org_id uuid, app_id character varying, channel_id bigint) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."check_min_rights"(min_right user_min_right, user_id uuid, org_id uuid, app_id character varying, channel_id bigint) TO "service_role";

ALTER FUNCTION public."check_min_rights_legacy"(min_right user_min_right, user_id uuid, org_id uuid, app_id character varying, channel_id bigint) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."check_min_rights_legacy"(min_right user_min_right, user_id uuid, org_id uuid, app_id character varying, channel_id bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."check_min_rights_legacy"(min_right user_min_right, user_id uuid, org_id uuid, app_id character varying, channel_id bigint) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."check_min_rights_legacy"(min_right user_min_right, user_id uuid, org_id uuid, app_id character varying, channel_id bigint) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."check_min_rights_legacy"(min_right user_min_right, user_id uuid, org_id uuid, app_id character varying, channel_id bigint) TO "service_role";
CREATE FUNCTION public."check_min_rights_legacy"(min_right user_min_right, user_id uuid, org_id uuid, app_id character varying, channel_id bigint)
RETURNS boolean
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."check_min_rights_legacy"($1, $2, $3, $4, $5);
$$;
ALTER FUNCTION public."check_min_rights_legacy"(min_right user_min_right, user_id uuid, org_id uuid, app_id character varying, channel_id bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."check_min_rights_legacy"(min_right user_min_right, user_id uuid, org_id uuid, app_id character varying, channel_id bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."check_min_rights_legacy"(min_right user_min_right, user_id uuid, org_id uuid, app_id character varying, channel_id bigint) TO "anon";
GRANT EXECUTE ON FUNCTION public."check_min_rights_legacy"(min_right user_min_right, user_id uuid, org_id uuid, app_id character varying, channel_id bigint) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."check_min_rights_legacy"(min_right user_min_right, user_id uuid, org_id uuid, app_id character varying, channel_id bigint) TO "service_role";

ALTER FUNCTION public."check_org_encrypted_bundle_enforcement"(org_id uuid, session_key text) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."check_org_encrypted_bundle_enforcement"(org_id uuid, session_key text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."check_org_encrypted_bundle_enforcement"(org_id uuid, session_key text) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."check_org_encrypted_bundle_enforcement"(org_id uuid, session_key text) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."check_org_encrypted_bundle_enforcement"(org_id uuid, session_key text) TO "service_role";
CREATE FUNCTION public."check_org_encrypted_bundle_enforcement"(org_id uuid, session_key text)
RETURNS boolean
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."check_org_encrypted_bundle_enforcement"($1, $2);
$$;
ALTER FUNCTION public."check_org_encrypted_bundle_enforcement"(org_id uuid, session_key text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."check_org_encrypted_bundle_enforcement"(org_id uuid, session_key text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."check_org_encrypted_bundle_enforcement"(org_id uuid, session_key text) TO "anon";
GRANT EXECUTE ON FUNCTION public."check_org_encrypted_bundle_enforcement"(org_id uuid, session_key text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."check_org_encrypted_bundle_enforcement"(org_id uuid, session_key text) TO "service_role";

ALTER FUNCTION public."check_org_members_2fa_enabled"(org_id uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."check_org_members_2fa_enabled"(org_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."check_org_members_2fa_enabled"(org_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."check_org_members_2fa_enabled"(org_id uuid) TO "service_role";
CREATE FUNCTION public."check_org_members_2fa_enabled"(org_id uuid)
RETURNS TABLE(user_id uuid, "2fa_enabled" boolean)
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
ROWS 1000
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT t."user_id", t."2fa_enabled"
FROM capgo_private."check_org_members_2fa_enabled"($1) AS t;
$$;
ALTER FUNCTION public."check_org_members_2fa_enabled"(org_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."check_org_members_2fa_enabled"(org_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."check_org_members_2fa_enabled"(org_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."check_org_members_2fa_enabled"(org_id uuid) TO "service_role";

ALTER FUNCTION public."check_org_members_password_policy"(org_id uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."check_org_members_password_policy"(org_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."check_org_members_password_policy"(org_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."check_org_members_password_policy"(org_id uuid) TO "service_role";
CREATE FUNCTION public."check_org_members_password_policy"(org_id uuid)
RETURNS TABLE(user_id uuid, email text, first_name text, last_name text, password_policy_compliant boolean)
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
ROWS 1000
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT t."user_id", t."email", t."first_name", t."last_name", t."password_policy_compliant"
FROM capgo_private."check_org_members_password_policy"($1) AS t;
$$;
ALTER FUNCTION public."check_org_members_password_policy"(org_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."check_org_members_password_policy"(org_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."check_org_members_password_policy"(org_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."check_org_members_password_policy"(org_id uuid) TO "service_role";

ALTER FUNCTION public."cli_check_permission"(apikey text, permission_key text, org_id uuid, app_id text, channel_id bigint) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."cli_check_permission"(apikey text, permission_key text, org_id uuid, app_id text, channel_id bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."cli_check_permission"(apikey text, permission_key text, org_id uuid, app_id text, channel_id bigint) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."cli_check_permission"(apikey text, permission_key text, org_id uuid, app_id text, channel_id bigint) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."cli_check_permission"(apikey text, permission_key text, org_id uuid, app_id text, channel_id bigint) TO "service_role";
CREATE FUNCTION public."cli_check_permission"(apikey text, permission_key text, org_id uuid DEFAULT NULL::uuid, app_id text DEFAULT NULL::text, channel_id bigint DEFAULT NULL::bigint)
RETURNS boolean
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."cli_check_permission"($1, $2, $3, $4, $5);
$$;
ALTER FUNCTION public."cli_check_permission"(apikey text, permission_key text, org_id uuid, app_id text, channel_id bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."cli_check_permission"(apikey text, permission_key text, org_id uuid, app_id text, channel_id bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."cli_check_permission"(apikey text, permission_key text, org_id uuid, app_id text, channel_id bigint) TO "anon";
GRANT EXECUTE ON FUNCTION public."cli_check_permission"(apikey text, permission_key text, org_id uuid, app_id text, channel_id bigint) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."cli_check_permission"(apikey text, permission_key text, org_id uuid, app_id text, channel_id bigint) TO "service_role";

ALTER FUNCTION public."count_non_compliant_bundles"(org_id uuid, required_key text) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."count_non_compliant_bundles"(org_id uuid, required_key text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."count_non_compliant_bundles"(org_id uuid, required_key text) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."count_non_compliant_bundles"(org_id uuid, required_key text) TO "service_role";
CREATE FUNCTION public."count_non_compliant_bundles"(org_id uuid, required_key text DEFAULT NULL::text)
RETURNS TABLE(non_encrypted_count bigint, wrong_key_count bigint, total_non_compliant bigint)
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
ROWS 1000
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT t."non_encrypted_count", t."wrong_key_count", t."total_non_compliant"
FROM capgo_private."count_non_compliant_bundles"($1, $2) AS t;
$$;
ALTER FUNCTION public."count_non_compliant_bundles"(org_id uuid, required_key text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."count_non_compliant_bundles"(org_id uuid, required_key text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."count_non_compliant_bundles"(org_id uuid, required_key text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."count_non_compliant_bundles"(org_id uuid, required_key text) TO "service_role";

ALTER FUNCTION public."delete_group_with_bindings"(group_id uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."delete_group_with_bindings"(group_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."delete_group_with_bindings"(group_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."delete_group_with_bindings"(group_id uuid) TO "service_role";
CREATE FUNCTION public."delete_group_with_bindings"(group_id uuid)
RETURNS void
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."delete_group_with_bindings"($1);
$$;
ALTER FUNCTION public."delete_group_with_bindings"(group_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."delete_group_with_bindings"(group_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."delete_group_with_bindings"(group_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."delete_group_with_bindings"(group_id uuid) TO "service_role";

ALTER FUNCTION public."delete_non_compliant_bundles"(org_id uuid, required_key text) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."delete_non_compliant_bundles"(org_id uuid, required_key text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."delete_non_compliant_bundles"(org_id uuid, required_key text) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."delete_non_compliant_bundles"(org_id uuid, required_key text) TO "service_role";
CREATE FUNCTION public."delete_non_compliant_bundles"(org_id uuid, required_key text DEFAULT NULL::text)
RETURNS bigint
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."delete_non_compliant_bundles"($1, $2);
$$;
ALTER FUNCTION public."delete_non_compliant_bundles"(org_id uuid, required_key text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."delete_non_compliant_bundles"(org_id uuid, required_key text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."delete_non_compliant_bundles"(org_id uuid, required_key text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."delete_non_compliant_bundles"(org_id uuid, required_key text) TO "service_role";

ALTER FUNCTION public."delete_org_member_role"(p_org_id uuid, p_user_id uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."delete_org_member_role"(p_org_id uuid, p_user_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."delete_org_member_role"(p_org_id uuid, p_user_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."delete_org_member_role"(p_org_id uuid, p_user_id uuid) TO "service_role";
CREATE FUNCTION public."delete_org_member_role"(p_org_id uuid, p_user_id uuid)
RETURNS text
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."delete_org_member_role"($1, $2);
$$;
ALTER FUNCTION public."delete_org_member_role"(p_org_id uuid, p_user_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."delete_org_member_role"(p_org_id uuid, p_user_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."delete_org_member_role"(p_org_id uuid, p_user_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."delete_org_member_role"(p_org_id uuid, p_user_id uuid) TO "service_role";

ALTER FUNCTION public."delete_user"() SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."delete_user"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."delete_user"() TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."delete_user"() TO "service_role";
CREATE FUNCTION public."delete_user"()
RETURNS void
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."delete_user"();
$$;
ALTER FUNCTION public."delete_user"() OWNER TO postgres;
REVOKE ALL ON FUNCTION public."delete_user"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."delete_user"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."delete_user"() TO "service_role";

ALTER FUNCTION public."exist_app_v2"(appid character varying) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."exist_app_v2"(appid character varying) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."exist_app_v2"(appid character varying) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."exist_app_v2"(appid character varying) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."exist_app_v2"(appid character varying) TO "service_role";
CREATE FUNCTION public."exist_app_v2"(appid character varying)
RETURNS boolean
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."exist_app_v2"($1);
$$;
ALTER FUNCTION public."exist_app_v2"(appid character varying) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."exist_app_v2"(appid character varying) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."exist_app_v2"(appid character varying) TO "anon";
GRANT EXECUTE ON FUNCTION public."exist_app_v2"(appid character varying) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."exist_app_v2"(appid character varying) TO "service_role";

ALTER FUNCTION public."find_best_plan_v3"(mau bigint, bandwidth double precision, storage double precision, build_time_unit bigint) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."find_best_plan_v3"(mau bigint, bandwidth double precision, storage double precision, build_time_unit bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."find_best_plan_v3"(mau bigint, bandwidth double precision, storage double precision, build_time_unit bigint) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."find_best_plan_v3"(mau bigint, bandwidth double precision, storage double precision, build_time_unit bigint) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."find_best_plan_v3"(mau bigint, bandwidth double precision, storage double precision, build_time_unit bigint) TO "service_role";
CREATE FUNCTION public."find_best_plan_v3"(mau bigint, bandwidth double precision, storage double precision, build_time_unit bigint DEFAULT 0)
RETURNS character varying
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."find_best_plan_v3"($1, $2, $3, $4);
$$;
ALTER FUNCTION public."find_best_plan_v3"(mau bigint, bandwidth double precision, storage double precision, build_time_unit bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."find_best_plan_v3"(mau bigint, bandwidth double precision, storage double precision, build_time_unit bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."find_best_plan_v3"(mau bigint, bandwidth double precision, storage double precision, build_time_unit bigint) TO "anon";
GRANT EXECUTE ON FUNCTION public."find_best_plan_v3"(mau bigint, bandwidth double precision, storage double precision, build_time_unit bigint) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."find_best_plan_v3"(mau bigint, bandwidth double precision, storage double precision, build_time_unit bigint) TO "service_role";

ALTER FUNCTION public."get_accessible_apps_for_apikey_v2"(apikey text) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."get_accessible_apps_for_apikey_v2"(apikey text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."get_accessible_apps_for_apikey_v2"(apikey text) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."get_accessible_apps_for_apikey_v2"(apikey text) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."get_accessible_apps_for_apikey_v2"(apikey text) TO "service_role";
CREATE FUNCTION public."get_accessible_apps_for_apikey_v2"(apikey text)
RETURNS SETOF apps
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
ROWS 1000
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT *
FROM capgo_private."get_accessible_apps_for_apikey_v2"($1);
$$;
ALTER FUNCTION public."get_accessible_apps_for_apikey_v2"(apikey text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."get_accessible_apps_for_apikey_v2"(apikey text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_accessible_apps_for_apikey_v2"(apikey text) TO "anon";
GRANT EXECUTE ON FUNCTION public."get_accessible_apps_for_apikey_v2"(apikey text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_accessible_apps_for_apikey_v2"(apikey text) TO "service_role";

ALTER FUNCTION public."get_account_removal_date"() SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."get_account_removal_date"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."get_account_removal_date"() TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."get_account_removal_date"() TO "service_role";
CREATE FUNCTION public."get_account_removal_date"()
RETURNS timestamp with time zone
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."get_account_removal_date"();
$$;
ALTER FUNCTION public."get_account_removal_date"() OWNER TO postgres;
REVOKE ALL ON FUNCTION public."get_account_removal_date"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_account_removal_date"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_account_removal_date"() TO "service_role";

ALTER FUNCTION public."get_app_access_rbac"(p_app_id uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."get_app_access_rbac"(p_app_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."get_app_access_rbac"(p_app_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."get_app_access_rbac"(p_app_id uuid) TO "service_role";
CREATE FUNCTION public."get_app_access_rbac"(p_app_id uuid)
RETURNS TABLE(id uuid, principal_type text, principal_id uuid, principal_name text, role_id uuid, role_name text, role_description text, granted_at timestamp with time zone, granted_by uuid, expires_at timestamp with time zone, reason text, is_direct boolean)
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
ROWS 1000
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT t."id", t."principal_type", t."principal_id", t."principal_name", t."role_id", t."role_name", t."role_description", t."granted_at", t."granted_by", t."expires_at", t."reason", t."is_direct"
FROM capgo_private."get_app_access_rbac"($1) AS t;
$$;
ALTER FUNCTION public."get_app_access_rbac"(p_app_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."get_app_access_rbac"(p_app_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_app_access_rbac"(p_app_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_app_access_rbac"(p_app_id uuid) TO "service_role";

ALTER FUNCTION public."get_app_metrics"(org_id uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."get_app_metrics"(org_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."get_app_metrics"(org_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."get_app_metrics"(org_id uuid) TO "service_role";
CREATE FUNCTION public."get_app_metrics"(org_id uuid)
RETURNS TABLE(app_id character varying, date date, mau bigint, storage bigint, bandwidth bigint, build_time_unit bigint, get bigint, fail bigint, install bigint, uninstall bigint)
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
ROWS 1000
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT t."app_id", t."date", t."mau", t."storage", t."bandwidth", t."build_time_unit", t."get", t."fail", t."install", t."uninstall"
FROM capgo_private."get_app_metrics"($1) AS t;
$$;
ALTER FUNCTION public."get_app_metrics"(org_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."get_app_metrics"(org_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_app_metrics"(org_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_app_metrics"(org_id uuid) TO "service_role";

ALTER FUNCTION public."get_app_metrics"(org_id uuid, start_date date, end_date date) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."get_app_metrics"(org_id uuid, start_date date, end_date date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."get_app_metrics"(org_id uuid, start_date date, end_date date) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."get_app_metrics"(org_id uuid, start_date date, end_date date) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."get_app_metrics"(org_id uuid, start_date date, end_date date) TO "service_role";
CREATE FUNCTION public."get_app_metrics"(org_id uuid, start_date date, end_date date)
RETURNS TABLE(app_id character varying, date date, mau bigint, storage bigint, bandwidth bigint, build_time_unit bigint, get bigint, fail bigint, install bigint, uninstall bigint)
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
ROWS 1000
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT t."app_id", t."date", t."mau", t."storage", t."bandwidth", t."build_time_unit", t."get", t."fail", t."install", t."uninstall"
FROM capgo_private."get_app_metrics"($1, $2, $3) AS t;
$$;
ALTER FUNCTION public."get_app_metrics"(org_id uuid, start_date date, end_date date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."get_app_metrics"(org_id uuid, start_date date, end_date date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_app_metrics"(org_id uuid, start_date date, end_date date) TO "anon";
GRANT EXECUTE ON FUNCTION public."get_app_metrics"(org_id uuid, start_date date, end_date date) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_app_metrics"(org_id uuid, start_date date, end_date date) TO "service_role";

ALTER FUNCTION public."get_app_metrics"(p_org_id uuid, p_app_id character varying, p_start_date date, p_end_date date) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."get_app_metrics"(p_org_id uuid, p_app_id character varying, p_start_date date, p_end_date date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."get_app_metrics"(p_org_id uuid, p_app_id character varying, p_start_date date, p_end_date date) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."get_app_metrics"(p_org_id uuid, p_app_id character varying, p_start_date date, p_end_date date) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."get_app_metrics"(p_org_id uuid, p_app_id character varying, p_start_date date, p_end_date date) TO "service_role";
CREATE FUNCTION public."get_app_metrics"(p_org_id uuid, p_app_id character varying, p_start_date date, p_end_date date)
RETURNS TABLE(app_id character varying, date date, mau bigint, storage bigint, bandwidth bigint, build_time_unit bigint, get bigint, fail bigint, install bigint, uninstall bigint)
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
ROWS 1000
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT t."app_id", t."date", t."mau", t."storage", t."bandwidth", t."build_time_unit", t."get", t."fail", t."install", t."uninstall"
FROM capgo_private."get_app_metrics"($1, $2, $3, $4) AS t;
$$;
ALTER FUNCTION public."get_app_metrics"(p_org_id uuid, p_app_id character varying, p_start_date date, p_end_date date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."get_app_metrics"(p_org_id uuid, p_app_id character varying, p_start_date date, p_end_date date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_app_metrics"(p_org_id uuid, p_app_id character varying, p_start_date date, p_end_date date) TO "anon";
GRANT EXECUTE ON FUNCTION public."get_app_metrics"(p_org_id uuid, p_app_id character varying, p_start_date date, p_end_date date) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_app_metrics"(p_org_id uuid, p_app_id character varying, p_start_date date, p_end_date date) TO "service_role";

ALTER FUNCTION public."get_app_versions"(appid character varying, name_version character varying, apikey text) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."get_app_versions"(appid character varying, name_version character varying, apikey text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."get_app_versions"(appid character varying, name_version character varying, apikey text) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."get_app_versions"(appid character varying, name_version character varying, apikey text) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."get_app_versions"(appid character varying, name_version character varying, apikey text) TO "service_role";
CREATE FUNCTION public."get_app_versions"(appid character varying, name_version character varying, apikey text)
RETURNS integer
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."get_app_versions"($1, $2, $3);
$$;
ALTER FUNCTION public."get_app_versions"(appid character varying, name_version character varying, apikey text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."get_app_versions"(appid character varying, name_version character varying, apikey text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_app_versions"(appid character varying, name_version character varying, apikey text) TO "anon";
GRANT EXECUTE ON FUNCTION public."get_app_versions"(appid character varying, name_version character varying, apikey text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_app_versions"(appid character varying, name_version character varying, apikey text) TO "service_role";

ALTER FUNCTION public."get_current_plan_max_org"(orgid uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."get_current_plan_max_org"(orgid uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."get_current_plan_max_org"(orgid uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."get_current_plan_max_org"(orgid uuid) TO "service_role";
CREATE FUNCTION public."get_current_plan_max_org"(orgid uuid)
RETURNS TABLE(mau bigint, bandwidth bigint, storage bigint, build_time_unit bigint)
LANGUAGE sql
STABLE
PARALLEL UNSAFE
COST 100
ROWS 1000
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT t."mau", t."bandwidth", t."storage", t."build_time_unit"
FROM capgo_private."get_current_plan_max_org"($1) AS t;
$$;
ALTER FUNCTION public."get_current_plan_max_org"(orgid uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."get_current_plan_max_org"(orgid uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_current_plan_max_org"(orgid uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_current_plan_max_org"(orgid uuid) TO "service_role";

ALTER FUNCTION public."get_current_plan_name_org"(orgid uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."get_current_plan_name_org"(orgid uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."get_current_plan_name_org"(orgid uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."get_current_plan_name_org"(orgid uuid) TO "service_role";
CREATE FUNCTION public."get_current_plan_name_org"(orgid uuid)
RETURNS character varying
LANGUAGE sql
STABLE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."get_current_plan_name_org"($1);
$$;
ALTER FUNCTION public."get_current_plan_name_org"(orgid uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."get_current_plan_name_org"(orgid uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_current_plan_name_org"(orgid uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_current_plan_name_org"(orgid uuid) TO "service_role";

ALTER FUNCTION public."get_cycle_info_org"(orgid uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."get_cycle_info_org"(orgid uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."get_cycle_info_org"(orgid uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."get_cycle_info_org"(orgid uuid) TO "service_role";
CREATE FUNCTION public."get_cycle_info_org"(orgid uuid)
RETURNS TABLE(subscription_anchor_start timestamp with time zone, subscription_anchor_end timestamp with time zone)
LANGUAGE sql
STABLE
PARALLEL UNSAFE
COST 100
ROWS 1000
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT t."subscription_anchor_start", t."subscription_anchor_end"
FROM capgo_private."get_cycle_info_org"($1) AS t;
$$;
ALTER FUNCTION public."get_cycle_info_org"(orgid uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."get_cycle_info_org"(orgid uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_cycle_info_org"(orgid uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_cycle_info_org"(orgid uuid) TO "service_role";

ALTER FUNCTION public."get_identity"() SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."get_identity"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."get_identity"() TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."get_identity"() TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."get_identity"() TO "service_role";
CREATE FUNCTION public."get_identity"()
RETURNS uuid
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."get_identity"();
$$;
ALTER FUNCTION public."get_identity"() OWNER TO postgres;
REVOKE ALL ON FUNCTION public."get_identity"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_identity"() TO "anon";
GRANT EXECUTE ON FUNCTION public."get_identity"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_identity"() TO "service_role";

ALTER FUNCTION public."get_identity"(keymode key_mode[]) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."get_identity"(keymode key_mode[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."get_identity"(keymode key_mode[]) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."get_identity"(keymode key_mode[]) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."get_identity"(keymode key_mode[]) TO "service_role";
CREATE FUNCTION public."get_identity"(keymode key_mode[])
RETURNS uuid
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."get_identity"($1);
$$;
ALTER FUNCTION public."get_identity"(keymode key_mode[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."get_identity"(keymode key_mode[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_identity"(keymode key_mode[]) TO "anon";
GRANT EXECUTE ON FUNCTION public."get_identity"(keymode key_mode[]) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_identity"(keymode key_mode[]) TO "service_role";

ALTER FUNCTION public."get_identity_org_allowed"(keymode key_mode[], org_id uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."get_identity_org_allowed"(keymode key_mode[], org_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."get_identity_org_allowed"(keymode key_mode[], org_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."get_identity_org_allowed"(keymode key_mode[], org_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."get_identity_org_allowed"(keymode key_mode[], org_id uuid) TO "service_role";
CREATE FUNCTION public."get_identity_org_allowed"(keymode key_mode[], org_id uuid)
RETURNS uuid
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."get_identity_org_allowed"($1, $2);
$$;
ALTER FUNCTION public."get_identity_org_allowed"(keymode key_mode[], org_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."get_identity_org_allowed"(keymode key_mode[], org_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_identity_org_allowed"(keymode key_mode[], org_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION public."get_identity_org_allowed"(keymode key_mode[], org_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_identity_org_allowed"(keymode key_mode[], org_id uuid) TO "service_role";

ALTER FUNCTION public."get_identity_org_allowed_apikey_only"(keymode key_mode[], org_id uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."get_identity_org_allowed_apikey_only"(keymode key_mode[], org_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."get_identity_org_allowed_apikey_only"(keymode key_mode[], org_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."get_identity_org_allowed_apikey_only"(keymode key_mode[], org_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."get_identity_org_allowed_apikey_only"(keymode key_mode[], org_id uuid) TO "service_role";
CREATE FUNCTION public."get_identity_org_allowed_apikey_only"(keymode key_mode[], org_id uuid)
RETURNS uuid
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."get_identity_org_allowed_apikey_only"($1, $2);
$$;
ALTER FUNCTION public."get_identity_org_allowed_apikey_only"(keymode key_mode[], org_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."get_identity_org_allowed_apikey_only"(keymode key_mode[], org_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_identity_org_allowed_apikey_only"(keymode key_mode[], org_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION public."get_identity_org_allowed_apikey_only"(keymode key_mode[], org_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_identity_org_allowed_apikey_only"(keymode key_mode[], org_id uuid) TO "service_role";

ALTER FUNCTION public."get_identity_org_appid"(keymode key_mode[], org_id uuid, app_id character varying) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."get_identity_org_appid"(keymode key_mode[], org_id uuid, app_id character varying) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."get_identity_org_appid"(keymode key_mode[], org_id uuid, app_id character varying) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."get_identity_org_appid"(keymode key_mode[], org_id uuid, app_id character varying) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."get_identity_org_appid"(keymode key_mode[], org_id uuid, app_id character varying) TO "service_role";
CREATE FUNCTION public."get_identity_org_appid"(keymode key_mode[], org_id uuid, app_id character varying)
RETURNS uuid
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."get_identity_org_appid"($1, $2, $3);
$$;
ALTER FUNCTION public."get_identity_org_appid"(keymode key_mode[], org_id uuid, app_id character varying) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."get_identity_org_appid"(keymode key_mode[], org_id uuid, app_id character varying) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_identity_org_appid"(keymode key_mode[], org_id uuid, app_id character varying) TO "anon";
GRANT EXECUTE ON FUNCTION public."get_identity_org_appid"(keymode key_mode[], org_id uuid, app_id character varying) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_identity_org_appid"(keymode key_mode[], org_id uuid, app_id character varying) TO "service_role";

ALTER FUNCTION public."get_invite_by_magic_lookup"(lookup text) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."get_invite_by_magic_lookup"(lookup text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."get_invite_by_magic_lookup"(lookup text) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."get_invite_by_magic_lookup"(lookup text) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."get_invite_by_magic_lookup"(lookup text) TO "service_role";
CREATE FUNCTION public."get_invite_by_magic_lookup"(lookup text)
RETURNS TABLE(org_name text, org_logo text, role text)
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
ROWS 1000
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT t."org_name", t."org_logo", t."role"
FROM capgo_private."get_invite_by_magic_lookup"($1) AS t;
$$;
ALTER FUNCTION public."get_invite_by_magic_lookup"(lookup text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."get_invite_by_magic_lookup"(lookup text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_invite_by_magic_lookup"(lookup text) TO "anon";
GRANT EXECUTE ON FUNCTION public."get_invite_by_magic_lookup"(lookup text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_invite_by_magic_lookup"(lookup text) TO "service_role";

ALTER FUNCTION public."get_org_apikeys"(p_org_id uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."get_org_apikeys"(p_org_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."get_org_apikeys"(p_org_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."get_org_apikeys"(p_org_id uuid) TO "service_role";
CREATE FUNCTION public."get_org_apikeys"(p_org_id uuid)
RETURNS TABLE(id bigint, rbac_id uuid, name text, mode key_mode, limited_to_orgs uuid[], limited_to_apps character varying[], user_id uuid, owner_email character varying, created_at timestamp with time zone, expires_at timestamp with time zone)
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
ROWS 1000
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT t."id", t."rbac_id", t."name", t."mode", t."limited_to_orgs", t."limited_to_apps", t."user_id", t."owner_email", t."created_at", t."expires_at"
FROM capgo_private."get_org_apikeys"($1) AS t;
$$;
ALTER FUNCTION public."get_org_apikeys"(p_org_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."get_org_apikeys"(p_org_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_org_apikeys"(p_org_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_org_apikeys"(p_org_id uuid) TO "service_role";

ALTER FUNCTION public."get_org_members"(guild_id uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."get_org_members"(guild_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."get_org_members"(guild_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."get_org_members"(guild_id uuid) TO "service_role";
CREATE FUNCTION public."get_org_members"(guild_id uuid)
RETURNS TABLE(aid bigint, uid uuid, email character varying, image_url character varying, role user_min_right, is_tmp boolean)
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
ROWS 1000
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT t."aid", t."uid", t."email", t."image_url", t."role", t."is_tmp"
FROM capgo_private."get_org_members"($1) AS t;
$$;
ALTER FUNCTION public."get_org_members"(guild_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."get_org_members"(guild_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_org_members"(guild_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_org_members"(guild_id uuid) TO "service_role";

ALTER FUNCTION public."get_org_members"(user_id uuid, guild_id uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."get_org_members"(user_id uuid, guild_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."get_org_members"(user_id uuid, guild_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."get_org_members"(user_id uuid, guild_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."get_org_members"(user_id uuid, guild_id uuid) TO "service_role";
CREATE FUNCTION public."get_org_members"(user_id uuid, guild_id uuid)
RETURNS TABLE(aid bigint, uid uuid, email character varying, image_url character varying, role user_min_right, is_tmp boolean)
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
ROWS 1000
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT t."aid", t."uid", t."email", t."image_url", t."role", t."is_tmp"
FROM capgo_private."get_org_members"($1, $2) AS t;
$$;
ALTER FUNCTION public."get_org_members"(user_id uuid, guild_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."get_org_members"(user_id uuid, guild_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_org_members"(user_id uuid, guild_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION public."get_org_members"(user_id uuid, guild_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_org_members"(user_id uuid, guild_id uuid) TO "service_role";

ALTER FUNCTION public."get_org_members_rbac"(p_org_id uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."get_org_members_rbac"(p_org_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."get_org_members_rbac"(p_org_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."get_org_members_rbac"(p_org_id uuid) TO "service_role";
CREATE FUNCTION public."get_org_members_rbac"(p_org_id uuid)
RETURNS TABLE(user_id uuid, email character varying, image_url character varying, role_name text, role_id uuid, binding_id uuid, granted_at timestamp with time zone, is_invite boolean, is_tmp boolean, org_user_id bigint)
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
ROWS 1000
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT t."user_id", t."email", t."image_url", t."role_name", t."role_id", t."binding_id", t."granted_at", t."is_invite", t."is_tmp", t."org_user_id"
FROM capgo_private."get_org_members_rbac"($1) AS t;
$$;
ALTER FUNCTION public."get_org_members_rbac"(p_org_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."get_org_members_rbac"(p_org_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_org_members_rbac"(p_org_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_org_members_rbac"(p_org_id uuid) TO "service_role";

ALTER FUNCTION public."get_org_owner_id"(apikey text, app_id text) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."get_org_owner_id"(apikey text, app_id text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."get_org_owner_id"(apikey text, app_id text) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."get_org_owner_id"(apikey text, app_id text) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."get_org_owner_id"(apikey text, app_id text) TO "service_role";
CREATE FUNCTION public."get_org_owner_id"(apikey text, app_id text)
RETURNS uuid
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."get_org_owner_id"($1, $2);
$$;
ALTER FUNCTION public."get_org_owner_id"(apikey text, app_id text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."get_org_owner_id"(apikey text, app_id text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_org_owner_id"(apikey text, app_id text) TO "anon";
GRANT EXECUTE ON FUNCTION public."get_org_owner_id"(apikey text, app_id text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_org_owner_id"(apikey text, app_id text) TO "service_role";

ALTER FUNCTION public."get_org_perm_for_apikey"(apikey text, app_id text) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."get_org_perm_for_apikey"(apikey text, app_id text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."get_org_perm_for_apikey"(apikey text, app_id text) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."get_org_perm_for_apikey"(apikey text, app_id text) TO "service_role";
CREATE FUNCTION public."get_org_perm_for_apikey"(apikey text, app_id text)
RETURNS text
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."get_org_perm_for_apikey"($1, $2);
$$;
ALTER FUNCTION public."get_org_perm_for_apikey"(apikey text, app_id text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."get_org_perm_for_apikey"(apikey text, app_id text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_org_perm_for_apikey"(apikey text, app_id text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_org_perm_for_apikey"(apikey text, app_id text) TO "service_role";

ALTER FUNCTION public."get_org_user_access_rbac"(p_user_id uuid, p_org_id uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."get_org_user_access_rbac"(p_user_id uuid, p_org_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."get_org_user_access_rbac"(p_user_id uuid, p_org_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."get_org_user_access_rbac"(p_user_id uuid, p_org_id uuid) TO "service_role";
CREATE FUNCTION public."get_org_user_access_rbac"(p_user_id uuid, p_org_id uuid)
RETURNS TABLE(id uuid, principal_type text, principal_id uuid, role_id uuid, role_name text, role_description text, scope_type text, org_id uuid, app_id uuid, channel_id uuid, granted_at timestamp with time zone, granted_by uuid, expires_at timestamp with time zone, reason text, is_direct boolean, principal_name text, user_email text, group_name text)
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
ROWS 1000
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT t."id", t."principal_type", t."principal_id", t."role_id", t."role_name", t."role_description", t."scope_type", t."org_id", t."app_id", t."channel_id", t."granted_at", t."granted_by", t."expires_at", t."reason", t."is_direct", t."principal_name", t."user_email", t."group_name"
FROM capgo_private."get_org_user_access_rbac"($1, $2) AS t;
$$;
ALTER FUNCTION public."get_org_user_access_rbac"(p_user_id uuid, p_org_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."get_org_user_access_rbac"(p_user_id uuid, p_org_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_org_user_access_rbac"(p_user_id uuid, p_org_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_org_user_access_rbac"(p_user_id uuid, p_org_id uuid) TO "service_role";

ALTER FUNCTION public."get_organization_cli_warnings"(orgid uuid, cli_version text) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."get_organization_cli_warnings"(orgid uuid, cli_version text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."get_organization_cli_warnings"(orgid uuid, cli_version text) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."get_organization_cli_warnings"(orgid uuid, cli_version text) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."get_organization_cli_warnings"(orgid uuid, cli_version text) TO "service_role";
CREATE FUNCTION public."get_organization_cli_warnings"(orgid uuid, cli_version text)
RETURNS jsonb[]
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."get_organization_cli_warnings"($1, $2);
$$;
ALTER FUNCTION public."get_organization_cli_warnings"(orgid uuid, cli_version text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."get_organization_cli_warnings"(orgid uuid, cli_version text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_organization_cli_warnings"(orgid uuid, cli_version text) TO "anon";
GRANT EXECUTE ON FUNCTION public."get_organization_cli_warnings"(orgid uuid, cli_version text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_organization_cli_warnings"(orgid uuid, cli_version text) TO "service_role";

ALTER FUNCTION public."get_orgs_v6"() SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."get_orgs_v6"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."get_orgs_v6"() TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."get_orgs_v6"() TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."get_orgs_v6"() TO "service_role";
CREATE FUNCTION public."get_orgs_v6"()
RETURNS TABLE(gid uuid, created_by uuid, logo text, name text, role character varying, paying boolean, trial_left integer, can_use_more boolean, is_canceled boolean, app_count bigint, subscription_start timestamp with time zone, subscription_end timestamp with time zone, management_email text, is_yearly boolean, stats_updated_at timestamp without time zone, next_stats_update_at timestamp with time zone, credit_available numeric, credit_total numeric, credit_next_expiration timestamp with time zone, require_apikey_expiration boolean, max_apikey_expiration_days integer)
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
ROWS 1000
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT t."gid", t."created_by", t."logo", t."name", t."role", t."paying", t."trial_left", t."can_use_more", t."is_canceled", t."app_count", t."subscription_start", t."subscription_end", t."management_email", t."is_yearly", t."stats_updated_at", t."next_stats_update_at", t."credit_available", t."credit_total", t."credit_next_expiration", t."require_apikey_expiration", t."max_apikey_expiration_days"
FROM capgo_private."get_orgs_v6"() AS t;
$$;
ALTER FUNCTION public."get_orgs_v6"() OWNER TO postgres;
REVOKE ALL ON FUNCTION public."get_orgs_v6"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_orgs_v6"() TO "anon";
GRANT EXECUTE ON FUNCTION public."get_orgs_v6"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_orgs_v6"() TO "service_role";

ALTER FUNCTION public."get_orgs_v7"() SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."get_orgs_v7"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."get_orgs_v7"() TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."get_orgs_v7"() TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."get_orgs_v7"() TO "service_role";
CREATE FUNCTION public."get_orgs_v7"()
RETURNS TABLE(gid uuid, created_by uuid, created_at timestamp with time zone, logo text, website text, name text, role character varying, paying boolean, trial_left integer, can_use_more boolean, is_canceled boolean, app_count bigint, subscription_start timestamp with time zone, subscription_end timestamp with time zone, management_email text, is_yearly boolean, stats_updated_at timestamp without time zone, stats_refresh_requested_at timestamp without time zone, next_stats_update_at timestamp with time zone, credit_available numeric, credit_total numeric, credit_next_expiration timestamp with time zone, enforcing_2fa boolean, "2fa_has_access" boolean, enforce_hashed_api_keys boolean, password_policy_config jsonb, password_has_access boolean, require_apikey_expiration boolean, max_apikey_expiration_days integer, enforce_encrypted_bundles boolean, required_encryption_key character varying, use_new_rbac boolean, sso_enabled boolean)
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
ROWS 1000
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT t."gid", t."created_by", t."created_at", t."logo", t."website", t."name", t."role", t."paying", t."trial_left", t."can_use_more", t."is_canceled", t."app_count", t."subscription_start", t."subscription_end", t."management_email", t."is_yearly", t."stats_updated_at", t."stats_refresh_requested_at", t."next_stats_update_at", t."credit_available", t."credit_total", t."credit_next_expiration", t."enforcing_2fa", t."2fa_has_access", t."enforce_hashed_api_keys", t."password_policy_config", t."password_has_access", t."require_apikey_expiration", t."max_apikey_expiration_days", t."enforce_encrypted_bundles", t."required_encryption_key", t."use_new_rbac", t."sso_enabled"
FROM capgo_private."get_orgs_v7"() AS t;
$$;
ALTER FUNCTION public."get_orgs_v7"() OWNER TO postgres;
REVOKE ALL ON FUNCTION public."get_orgs_v7"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_orgs_v7"() TO "anon";
GRANT EXECUTE ON FUNCTION public."get_orgs_v7"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_orgs_v7"() TO "service_role";

ALTER FUNCTION public."get_plan_usage_percent_detailed"(orgid uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."get_plan_usage_percent_detailed"(orgid uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."get_plan_usage_percent_detailed"(orgid uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."get_plan_usage_percent_detailed"(orgid uuid) TO "service_role";
CREATE FUNCTION public."get_plan_usage_percent_detailed"(orgid uuid)
RETURNS TABLE(total_percent double precision, mau_percent double precision, bandwidth_percent double precision, storage_percent double precision, build_time_percent double precision)
LANGUAGE sql
STABLE
PARALLEL UNSAFE
COST 100
ROWS 1000
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT t."total_percent", t."mau_percent", t."bandwidth_percent", t."storage_percent", t."build_time_percent"
FROM capgo_private."get_plan_usage_percent_detailed"($1) AS t;
$$;
ALTER FUNCTION public."get_plan_usage_percent_detailed"(orgid uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."get_plan_usage_percent_detailed"(orgid uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_plan_usage_percent_detailed"(orgid uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_plan_usage_percent_detailed"(orgid uuid) TO "service_role";

ALTER FUNCTION public."get_plan_usage_percent_detailed"(orgid uuid, cycle_start date, cycle_end date) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."get_plan_usage_percent_detailed"(orgid uuid, cycle_start date, cycle_end date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."get_plan_usage_percent_detailed"(orgid uuid, cycle_start date, cycle_end date) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."get_plan_usage_percent_detailed"(orgid uuid, cycle_start date, cycle_end date) TO "service_role";
CREATE FUNCTION public."get_plan_usage_percent_detailed"(orgid uuid, cycle_start date, cycle_end date)
RETURNS TABLE(total_percent double precision, mau_percent double precision, bandwidth_percent double precision, storage_percent double precision, build_time_percent double precision)
LANGUAGE sql
STABLE
PARALLEL UNSAFE
COST 100
ROWS 1000
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT t."total_percent", t."mau_percent", t."bandwidth_percent", t."storage_percent", t."build_time_percent"
FROM capgo_private."get_plan_usage_percent_detailed"($1, $2, $3) AS t;
$$;
ALTER FUNCTION public."get_plan_usage_percent_detailed"(orgid uuid, cycle_start date, cycle_end date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."get_plan_usage_percent_detailed"(orgid uuid, cycle_start date, cycle_end date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_plan_usage_percent_detailed"(orgid uuid, cycle_start date, cycle_end date) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_plan_usage_percent_detailed"(orgid uuid, cycle_start date, cycle_end date) TO "service_role";

ALTER FUNCTION public."get_sso_enforcement_by_domain"(p_domain text) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."get_sso_enforcement_by_domain"(p_domain text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."get_sso_enforcement_by_domain"(p_domain text) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."get_sso_enforcement_by_domain"(p_domain text) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."get_sso_enforcement_by_domain"(p_domain text) TO "service_role";
CREATE FUNCTION public."get_sso_enforcement_by_domain"(p_domain text)
RETURNS TABLE(org_id uuid, enforce_sso boolean)
LANGUAGE sql
STABLE
PARALLEL UNSAFE
COST 100
ROWS 1000
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT t."org_id", t."enforce_sso"
FROM capgo_private."get_sso_enforcement_by_domain"($1) AS t;
$$;
ALTER FUNCTION public."get_sso_enforcement_by_domain"(p_domain text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."get_sso_enforcement_by_domain"(p_domain text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_sso_enforcement_by_domain"(p_domain text) TO "anon";
GRANT EXECUTE ON FUNCTION public."get_sso_enforcement_by_domain"(p_domain text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_sso_enforcement_by_domain"(p_domain text) TO "service_role";

ALTER FUNCTION public."get_total_app_storage_size_orgs"(org_id uuid, app_id character varying) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."get_total_app_storage_size_orgs"(org_id uuid, app_id character varying) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."get_total_app_storage_size_orgs"(org_id uuid, app_id character varying) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."get_total_app_storage_size_orgs"(org_id uuid, app_id character varying) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."get_total_app_storage_size_orgs"(org_id uuid, app_id character varying) TO "service_role";
CREATE FUNCTION public."get_total_app_storage_size_orgs"(org_id uuid, app_id character varying)
RETURNS double precision
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."get_total_app_storage_size_orgs"($1, $2);
$$;
ALTER FUNCTION public."get_total_app_storage_size_orgs"(org_id uuid, app_id character varying) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."get_total_app_storage_size_orgs"(org_id uuid, app_id character varying) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_total_app_storage_size_orgs"(org_id uuid, app_id character varying) TO "anon";
GRANT EXECUTE ON FUNCTION public."get_total_app_storage_size_orgs"(org_id uuid, app_id character varying) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_total_app_storage_size_orgs"(org_id uuid, app_id character varying) TO "service_role";

ALTER FUNCTION public."get_total_metrics"() SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."get_total_metrics"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."get_total_metrics"() TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."get_total_metrics"() TO "service_role";
CREATE FUNCTION public."get_total_metrics"()
RETURNS TABLE(mau bigint, storage bigint, bandwidth bigint, build_time_unit bigint, get bigint, fail bigint, install bigint, uninstall bigint)
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
ROWS 1000
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT t."mau", t."storage", t."bandwidth", t."build_time_unit", t."get", t."fail", t."install", t."uninstall"
FROM capgo_private."get_total_metrics"() AS t;
$$;
ALTER FUNCTION public."get_total_metrics"() OWNER TO postgres;
REVOKE ALL ON FUNCTION public."get_total_metrics"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_total_metrics"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_total_metrics"() TO "service_role";

ALTER FUNCTION public."get_total_storage_size_org"(org_id uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."get_total_storage_size_org"(org_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."get_total_storage_size_org"(org_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."get_total_storage_size_org"(org_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."get_total_storage_size_org"(org_id uuid) TO "service_role";
CREATE FUNCTION public."get_total_storage_size_org"(org_id uuid)
RETURNS double precision
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."get_total_storage_size_org"($1);
$$;
ALTER FUNCTION public."get_total_storage_size_org"(org_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."get_total_storage_size_org"(org_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_total_storage_size_org"(org_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION public."get_total_storage_size_org"(org_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_total_storage_size_org"(org_id uuid) TO "service_role";

ALTER FUNCTION public."get_user_id"(apikey text) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."get_user_id"(apikey text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."get_user_id"(apikey text) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."get_user_id"(apikey text) TO "service_role";
CREATE FUNCTION public."get_user_id"(apikey text)
RETURNS uuid
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."get_user_id"($1);
$$;
ALTER FUNCTION public."get_user_id"(apikey text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."get_user_id"(apikey text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_user_id"(apikey text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_user_id"(apikey text) TO "service_role";

ALTER FUNCTION public."get_user_id"(apikey text, app_id text) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."get_user_id"(apikey text, app_id text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."get_user_id"(apikey text, app_id text) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."get_user_id"(apikey text, app_id text) TO "service_role";
CREATE FUNCTION public."get_user_id"(apikey text, app_id text)
RETURNS uuid
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."get_user_id"($1, $2);
$$;
ALTER FUNCTION public."get_user_id"(apikey text, app_id text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."get_user_id"(apikey text, app_id text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_user_id"(apikey text, app_id text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_user_id"(apikey text, app_id text) TO "service_role";

ALTER FUNCTION public."get_user_main_org_id"(user_id uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."get_user_main_org_id"(user_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."get_user_main_org_id"(user_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."get_user_main_org_id"(user_id uuid) TO "service_role";
CREATE FUNCTION public."get_user_main_org_id"(user_id uuid)
RETURNS uuid
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."get_user_main_org_id"($1);
$$;
ALTER FUNCTION public."get_user_main_org_id"(user_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."get_user_main_org_id"(user_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_user_main_org_id"(user_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_user_main_org_id"(user_id uuid) TO "service_role";

ALTER FUNCTION public."get_user_main_org_id_by_app_id"(app_id text) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."get_user_main_org_id_by_app_id"(app_id text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."get_user_main_org_id_by_app_id"(app_id text) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."get_user_main_org_id_by_app_id"(app_id text) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."get_user_main_org_id_by_app_id"(app_id text) TO "service_role";
CREATE FUNCTION public."get_user_main_org_id_by_app_id"(app_id text)
RETURNS uuid
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."get_user_main_org_id_by_app_id"($1);
$$;
ALTER FUNCTION public."get_user_main_org_id_by_app_id"(app_id text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."get_user_main_org_id_by_app_id"(app_id text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_user_main_org_id_by_app_id"(app_id text) TO "anon";
GRANT EXECUTE ON FUNCTION public."get_user_main_org_id_by_app_id"(app_id text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_user_main_org_id_by_app_id"(app_id text) TO "service_role";

ALTER FUNCTION public."get_user_org_ids"() SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."get_user_org_ids"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."get_user_org_ids"() TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."get_user_org_ids"() TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."get_user_org_ids"() TO "service_role";
CREATE FUNCTION public."get_user_org_ids"()
RETURNS TABLE(org_id uuid)
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
ROWS 1000
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT t."org_id"
FROM capgo_private."get_user_org_ids"() AS t;
$$;
ALTER FUNCTION public."get_user_org_ids"() OWNER TO postgres;
REVOKE ALL ON FUNCTION public."get_user_org_ids"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_user_org_ids"() TO "anon";
GRANT EXECUTE ON FUNCTION public."get_user_org_ids"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_user_org_ids"() TO "service_role";

ALTER FUNCTION public."has_2fa_enabled"() SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."has_2fa_enabled"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."has_2fa_enabled"() TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."has_2fa_enabled"() TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."has_2fa_enabled"() TO "service_role";
CREATE FUNCTION public."has_2fa_enabled"()
RETURNS boolean
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."has_2fa_enabled"();
$$;
ALTER FUNCTION public."has_2fa_enabled"() OWNER TO postgres;
REVOKE ALL ON FUNCTION public."has_2fa_enabled"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."has_2fa_enabled"() TO "anon";
GRANT EXECUTE ON FUNCTION public."has_2fa_enabled"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."has_2fa_enabled"() TO "service_role";

ALTER FUNCTION public."has_app_right"(appid character varying, "right" user_min_right) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."has_app_right"(appid character varying, "right" user_min_right) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."has_app_right"(appid character varying, "right" user_min_right) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."has_app_right"(appid character varying, "right" user_min_right) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."has_app_right"(appid character varying, "right" user_min_right) TO "service_role";
CREATE FUNCTION public."has_app_right"(appid character varying, "right" user_min_right)
RETURNS boolean
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."has_app_right"($1, $2);
$$;
ALTER FUNCTION public."has_app_right"(appid character varying, "right" user_min_right) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."has_app_right"(appid character varying, "right" user_min_right) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."has_app_right"(appid character varying, "right" user_min_right) TO "anon";
GRANT EXECUTE ON FUNCTION public."has_app_right"(appid character varying, "right" user_min_right) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."has_app_right"(appid character varying, "right" user_min_right) TO "service_role";

ALTER FUNCTION public."has_app_right_apikey"(appid character varying, "right" user_min_right, userid uuid, apikey text) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."has_app_right_apikey"(appid character varying, "right" user_min_right, userid uuid, apikey text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."has_app_right_apikey"(appid character varying, "right" user_min_right, userid uuid, apikey text) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."has_app_right_apikey"(appid character varying, "right" user_min_right, userid uuid, apikey text) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."has_app_right_apikey"(appid character varying, "right" user_min_right, userid uuid, apikey text) TO "service_role";
CREATE FUNCTION public."has_app_right_apikey"(appid character varying, "right" user_min_right, userid uuid, apikey text)
RETURNS boolean
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."has_app_right_apikey"($1, $2, $3, $4);
$$;
ALTER FUNCTION public."has_app_right_apikey"(appid character varying, "right" user_min_right, userid uuid, apikey text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."has_app_right_apikey"(appid character varying, "right" user_min_right, userid uuid, apikey text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."has_app_right_apikey"(appid character varying, "right" user_min_right, userid uuid, apikey text) TO "anon";
GRANT EXECUTE ON FUNCTION public."has_app_right_apikey"(appid character varying, "right" user_min_right, userid uuid, apikey text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."has_app_right_apikey"(appid character varying, "right" user_min_right, userid uuid, apikey text) TO "service_role";

ALTER FUNCTION public."has_app_right_userid"(appid character varying, "right" user_min_right, userid uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."has_app_right_userid"(appid character varying, "right" user_min_right, userid uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."has_app_right_userid"(appid character varying, "right" user_min_right, userid uuid) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."has_app_right_userid"(appid character varying, "right" user_min_right, userid uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."has_app_right_userid"(appid character varying, "right" user_min_right, userid uuid) TO "service_role";
CREATE FUNCTION public."has_app_right_userid"(appid character varying, "right" user_min_right, userid uuid)
RETURNS boolean
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."has_app_right_userid"($1, $2, $3);
$$;
ALTER FUNCTION public."has_app_right_userid"(appid character varying, "right" user_min_right, userid uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."has_app_right_userid"(appid character varying, "right" user_min_right, userid uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."has_app_right_userid"(appid character varying, "right" user_min_right, userid uuid) TO "anon";
GRANT EXECUTE ON FUNCTION public."has_app_right_userid"(appid character varying, "right" user_min_right, userid uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."has_app_right_userid"(appid character varying, "right" user_min_right, userid uuid) TO "service_role";

ALTER FUNCTION public."invite_user_to_org"(email character varying, org_id uuid, invite_type user_min_right) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."invite_user_to_org"(email character varying, org_id uuid, invite_type user_min_right) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."invite_user_to_org"(email character varying, org_id uuid, invite_type user_min_right) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."invite_user_to_org"(email character varying, org_id uuid, invite_type user_min_right) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."invite_user_to_org"(email character varying, org_id uuid, invite_type user_min_right) TO "service_role";
CREATE FUNCTION public."invite_user_to_org"(email character varying, org_id uuid, invite_type user_min_right)
RETURNS character varying
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."invite_user_to_org"($1, $2, $3);
$$;
ALTER FUNCTION public."invite_user_to_org"(email character varying, org_id uuid, invite_type user_min_right) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."invite_user_to_org"(email character varying, org_id uuid, invite_type user_min_right) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."invite_user_to_org"(email character varying, org_id uuid, invite_type user_min_right) TO "anon";
GRANT EXECUTE ON FUNCTION public."invite_user_to_org"(email character varying, org_id uuid, invite_type user_min_right) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."invite_user_to_org"(email character varying, org_id uuid, invite_type user_min_right) TO "service_role";

ALTER FUNCTION public."invite_user_to_org_rbac"(email character varying, org_id uuid, role_name text) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."invite_user_to_org_rbac"(email character varying, org_id uuid, role_name text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."invite_user_to_org_rbac"(email character varying, org_id uuid, role_name text) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."invite_user_to_org_rbac"(email character varying, org_id uuid, role_name text) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."invite_user_to_org_rbac"(email character varying, org_id uuid, role_name text) TO "service_role";
CREATE FUNCTION public."invite_user_to_org_rbac"(email character varying, org_id uuid, role_name text)
RETURNS character varying
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."invite_user_to_org_rbac"($1, $2, $3);
$$;
ALTER FUNCTION public."invite_user_to_org_rbac"(email character varying, org_id uuid, role_name text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."invite_user_to_org_rbac"(email character varying, org_id uuid, role_name text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."invite_user_to_org_rbac"(email character varying, org_id uuid, role_name text) TO "anon";
GRANT EXECUTE ON FUNCTION public."invite_user_to_org_rbac"(email character varying, org_id uuid, role_name text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."invite_user_to_org_rbac"(email character varying, org_id uuid, role_name text) TO "service_role";

ALTER FUNCTION public."is_account_disabled"(user_id uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."is_account_disabled"(user_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."is_account_disabled"(user_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."is_account_disabled"(user_id uuid) TO "service_role";
CREATE FUNCTION public."is_account_disabled"(user_id uuid)
RETURNS boolean
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."is_account_disabled"($1);
$$;
ALTER FUNCTION public."is_account_disabled"(user_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."is_account_disabled"(user_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."is_account_disabled"(user_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."is_account_disabled"(user_id uuid) TO "service_role";

ALTER FUNCTION public."is_allowed_action_org"(orgid uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."is_allowed_action_org"(orgid uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."is_allowed_action_org"(orgid uuid) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."is_allowed_action_org"(orgid uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."is_allowed_action_org"(orgid uuid) TO "service_role";
CREATE FUNCTION public."is_allowed_action_org"(orgid uuid)
RETURNS boolean
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."is_allowed_action_org"($1);
$$;
ALTER FUNCTION public."is_allowed_action_org"(orgid uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."is_allowed_action_org"(orgid uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."is_allowed_action_org"(orgid uuid) TO "anon";
GRANT EXECUTE ON FUNCTION public."is_allowed_action_org"(orgid uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."is_allowed_action_org"(orgid uuid) TO "service_role";

ALTER FUNCTION public."is_allowed_action_org_action"(orgid uuid, actions action_type[]) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."is_allowed_action_org_action"(orgid uuid, actions action_type[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."is_allowed_action_org_action"(orgid uuid, actions action_type[]) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."is_allowed_action_org_action"(orgid uuid, actions action_type[]) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."is_allowed_action_org_action"(orgid uuid, actions action_type[]) TO "service_role";
CREATE FUNCTION public."is_allowed_action_org_action"(orgid uuid, actions action_type[])
RETURNS boolean
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."is_allowed_action_org_action"($1, $2);
$$;
ALTER FUNCTION public."is_allowed_action_org_action"(orgid uuid, actions action_type[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."is_allowed_action_org_action"(orgid uuid, actions action_type[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."is_allowed_action_org_action"(orgid uuid, actions action_type[]) TO "anon";
GRANT EXECUTE ON FUNCTION public."is_allowed_action_org_action"(orgid uuid, actions action_type[]) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."is_allowed_action_org_action"(orgid uuid, actions action_type[]) TO "service_role";

ALTER FUNCTION public."is_allowed_capgkey"(apikey text, keymode key_mode[]) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."is_allowed_capgkey"(apikey text, keymode key_mode[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."is_allowed_capgkey"(apikey text, keymode key_mode[]) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."is_allowed_capgkey"(apikey text, keymode key_mode[]) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."is_allowed_capgkey"(apikey text, keymode key_mode[]) TO "service_role";
CREATE FUNCTION public."is_allowed_capgkey"(apikey text, keymode key_mode[])
RETURNS boolean
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."is_allowed_capgkey"($1, $2);
$$;
ALTER FUNCTION public."is_allowed_capgkey"(apikey text, keymode key_mode[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."is_allowed_capgkey"(apikey text, keymode key_mode[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."is_allowed_capgkey"(apikey text, keymode key_mode[]) TO "anon";
GRANT EXECUTE ON FUNCTION public."is_allowed_capgkey"(apikey text, keymode key_mode[]) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."is_allowed_capgkey"(apikey text, keymode key_mode[]) TO "service_role";

ALTER FUNCTION public."is_allowed_capgkey"(apikey text, keymode key_mode[], app_id character varying) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."is_allowed_capgkey"(apikey text, keymode key_mode[], app_id character varying) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."is_allowed_capgkey"(apikey text, keymode key_mode[], app_id character varying) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."is_allowed_capgkey"(apikey text, keymode key_mode[], app_id character varying) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."is_allowed_capgkey"(apikey text, keymode key_mode[], app_id character varying) TO "service_role";
CREATE FUNCTION public."is_allowed_capgkey"(apikey text, keymode key_mode[], app_id character varying)
RETURNS boolean
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."is_allowed_capgkey"($1, $2, $3);
$$;
ALTER FUNCTION public."is_allowed_capgkey"(apikey text, keymode key_mode[], app_id character varying) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."is_allowed_capgkey"(apikey text, keymode key_mode[], app_id character varying) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."is_allowed_capgkey"(apikey text, keymode key_mode[], app_id character varying) TO "anon";
GRANT EXECUTE ON FUNCTION public."is_allowed_capgkey"(apikey text, keymode key_mode[], app_id character varying) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."is_allowed_capgkey"(apikey text, keymode key_mode[], app_id character varying) TO "service_role";

ALTER FUNCTION public."is_app_owner"(apikey text, appid character varying) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."is_app_owner"(apikey text, appid character varying) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."is_app_owner"(apikey text, appid character varying) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."is_app_owner"(apikey text, appid character varying) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."is_app_owner"(apikey text, appid character varying) TO "service_role";
CREATE FUNCTION public."is_app_owner"(apikey text, appid character varying)
RETURNS boolean
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."is_app_owner"($1, $2);
$$;
ALTER FUNCTION public."is_app_owner"(apikey text, appid character varying) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."is_app_owner"(apikey text, appid character varying) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."is_app_owner"(apikey text, appid character varying) TO "anon";
GRANT EXECUTE ON FUNCTION public."is_app_owner"(apikey text, appid character varying) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."is_app_owner"(apikey text, appid character varying) TO "service_role";

ALTER FUNCTION public."is_app_owner"(userid uuid, appid character varying) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."is_app_owner"(userid uuid, appid character varying) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."is_app_owner"(userid uuid, appid character varying) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."is_app_owner"(userid uuid, appid character varying) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."is_app_owner"(userid uuid, appid character varying) TO "service_role";
CREATE FUNCTION public."is_app_owner"(userid uuid, appid character varying)
RETURNS boolean
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."is_app_owner"($1, $2);
$$;
ALTER FUNCTION public."is_app_owner"(userid uuid, appid character varying) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."is_app_owner"(userid uuid, appid character varying) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."is_app_owner"(userid uuid, appid character varying) TO "anon";
GRANT EXECUTE ON FUNCTION public."is_app_owner"(userid uuid, appid character varying) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."is_app_owner"(userid uuid, appid character varying) TO "service_role";

ALTER FUNCTION public."is_canceled_org"(orgid uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."is_canceled_org"(orgid uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."is_canceled_org"(orgid uuid) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."is_canceled_org"(orgid uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."is_canceled_org"(orgid uuid) TO "service_role";
CREATE FUNCTION public."is_canceled_org"(orgid uuid)
RETURNS boolean
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."is_canceled_org"($1);
$$;
ALTER FUNCTION public."is_canceled_org"(orgid uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."is_canceled_org"(orgid uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."is_canceled_org"(orgid uuid) TO "anon";
GRANT EXECUTE ON FUNCTION public."is_canceled_org"(orgid uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."is_canceled_org"(orgid uuid) TO "service_role";

ALTER FUNCTION public."is_good_plan_v5_org"(orgid uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."is_good_plan_v5_org"(orgid uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."is_good_plan_v5_org"(orgid uuid) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."is_good_plan_v5_org"(orgid uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."is_good_plan_v5_org"(orgid uuid) TO "service_role";
CREATE FUNCTION public."is_good_plan_v5_org"(orgid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."is_good_plan_v5_org"($1);
$$;
ALTER FUNCTION public."is_good_plan_v5_org"(orgid uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."is_good_plan_v5_org"(orgid uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."is_good_plan_v5_org"(orgid uuid) TO "anon";
GRANT EXECUTE ON FUNCTION public."is_good_plan_v5_org"(orgid uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."is_good_plan_v5_org"(orgid uuid) TO "service_role";

ALTER FUNCTION public."is_member_of_org"(user_id uuid, org_id uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."is_member_of_org"(user_id uuid, org_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."is_member_of_org"(user_id uuid, org_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."is_member_of_org"(user_id uuid, org_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."is_member_of_org"(user_id uuid, org_id uuid) TO "service_role";
CREATE FUNCTION public."is_member_of_org"(user_id uuid, org_id uuid)
RETURNS boolean
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."is_member_of_org"($1, $2);
$$;
ALTER FUNCTION public."is_member_of_org"(user_id uuid, org_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."is_member_of_org"(user_id uuid, org_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."is_member_of_org"(user_id uuid, org_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION public."is_member_of_org"(user_id uuid, org_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."is_member_of_org"(user_id uuid, org_id uuid) TO "service_role";

ALTER FUNCTION public."is_not_deleted"(email_check character varying) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."is_not_deleted"(email_check character varying) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."is_not_deleted"(email_check character varying) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."is_not_deleted"(email_check character varying) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."is_not_deleted"(email_check character varying) TO "service_role";
CREATE FUNCTION public."is_not_deleted"(email_check character varying)
RETURNS boolean
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."is_not_deleted"($1);
$$;
ALTER FUNCTION public."is_not_deleted"(email_check character varying) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."is_not_deleted"(email_check character varying) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."is_not_deleted"(email_check character varying) TO "anon";
GRANT EXECUTE ON FUNCTION public."is_not_deleted"(email_check character varying) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."is_not_deleted"(email_check character varying) TO "service_role";

ALTER FUNCTION public."is_onboarded_org"(orgid uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."is_onboarded_org"(orgid uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."is_onboarded_org"(orgid uuid) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."is_onboarded_org"(orgid uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."is_onboarded_org"(orgid uuid) TO "service_role";
CREATE FUNCTION public."is_onboarded_org"(orgid uuid)
RETURNS boolean
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."is_onboarded_org"($1);
$$;
ALTER FUNCTION public."is_onboarded_org"(orgid uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."is_onboarded_org"(orgid uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."is_onboarded_org"(orgid uuid) TO "anon";
GRANT EXECUTE ON FUNCTION public."is_onboarded_org"(orgid uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."is_onboarded_org"(orgid uuid) TO "service_role";

ALTER FUNCTION public."is_onboarding_needed_org"(orgid uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."is_onboarding_needed_org"(orgid uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."is_onboarding_needed_org"(orgid uuid) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."is_onboarding_needed_org"(orgid uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."is_onboarding_needed_org"(orgid uuid) TO "service_role";
CREATE FUNCTION public."is_onboarding_needed_org"(orgid uuid)
RETURNS boolean
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."is_onboarding_needed_org"($1);
$$;
ALTER FUNCTION public."is_onboarding_needed_org"(orgid uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."is_onboarding_needed_org"(orgid uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."is_onboarding_needed_org"(orgid uuid) TO "anon";
GRANT EXECUTE ON FUNCTION public."is_onboarding_needed_org"(orgid uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."is_onboarding_needed_org"(orgid uuid) TO "service_role";

ALTER FUNCTION public."is_org_yearly"(orgid uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."is_org_yearly"(orgid uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."is_org_yearly"(orgid uuid) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."is_org_yearly"(orgid uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."is_org_yearly"(orgid uuid) TO "service_role";
CREATE FUNCTION public."is_org_yearly"(orgid uuid)
RETURNS boolean
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."is_org_yearly"($1);
$$;
ALTER FUNCTION public."is_org_yearly"(orgid uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."is_org_yearly"(orgid uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."is_org_yearly"(orgid uuid) TO "anon";
GRANT EXECUTE ON FUNCTION public."is_org_yearly"(orgid uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."is_org_yearly"(orgid uuid) TO "service_role";

ALTER FUNCTION public."is_paying_and_good_plan_org"(orgid uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."is_paying_and_good_plan_org"(orgid uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."is_paying_and_good_plan_org"(orgid uuid) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."is_paying_and_good_plan_org"(orgid uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."is_paying_and_good_plan_org"(orgid uuid) TO "service_role";
CREATE FUNCTION public."is_paying_and_good_plan_org"(orgid uuid)
RETURNS boolean
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."is_paying_and_good_plan_org"($1);
$$;
ALTER FUNCTION public."is_paying_and_good_plan_org"(orgid uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."is_paying_and_good_plan_org"(orgid uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."is_paying_and_good_plan_org"(orgid uuid) TO "anon";
GRANT EXECUTE ON FUNCTION public."is_paying_and_good_plan_org"(orgid uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."is_paying_and_good_plan_org"(orgid uuid) TO "service_role";

ALTER FUNCTION public."is_paying_and_good_plan_org_action"(orgid uuid, actions action_type[]) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."is_paying_and_good_plan_org_action"(orgid uuid, actions action_type[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."is_paying_and_good_plan_org_action"(orgid uuid, actions action_type[]) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."is_paying_and_good_plan_org_action"(orgid uuid, actions action_type[]) TO "service_role";
CREATE FUNCTION public."is_paying_and_good_plan_org_action"(orgid uuid, actions action_type[])
RETURNS boolean
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."is_paying_and_good_plan_org_action"($1, $2);
$$;
ALTER FUNCTION public."is_paying_and_good_plan_org_action"(orgid uuid, actions action_type[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."is_paying_and_good_plan_org_action"(orgid uuid, actions action_type[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."is_paying_and_good_plan_org_action"(orgid uuid, actions action_type[]) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."is_paying_and_good_plan_org_action"(orgid uuid, actions action_type[]) TO "service_role";

ALTER FUNCTION public."is_paying_org"(orgid uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."is_paying_org"(orgid uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."is_paying_org"(orgid uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."is_paying_org"(orgid uuid) TO "service_role";
CREATE FUNCTION public."is_paying_org"(orgid uuid)
RETURNS boolean
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."is_paying_org"($1);
$$;
ALTER FUNCTION public."is_paying_org"(orgid uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."is_paying_org"(orgid uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."is_paying_org"(orgid uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."is_paying_org"(orgid uuid) TO "service_role";

ALTER FUNCTION public."is_platform_admin"() SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."is_platform_admin"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."is_platform_admin"() TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."is_platform_admin"() TO "service_role";
CREATE FUNCTION public."is_platform_admin"()
RETURNS boolean
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."is_platform_admin"();
$$;
ALTER FUNCTION public."is_platform_admin"() OWNER TO postgres;
REVOKE ALL ON FUNCTION public."is_platform_admin"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."is_platform_admin"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."is_platform_admin"() TO "service_role";

ALTER FUNCTION public."is_trial_org"(orgid uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."is_trial_org"(orgid uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."is_trial_org"(orgid uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."is_trial_org"(orgid uuid) TO "service_role";
CREATE FUNCTION public."is_trial_org"(orgid uuid)
RETURNS integer
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."is_trial_org"($1);
$$;
ALTER FUNCTION public."is_trial_org"(orgid uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."is_trial_org"(orgid uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."is_trial_org"(orgid uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."is_trial_org"(orgid uuid) TO "service_role";

ALTER FUNCTION public."is_user_app_admin"(p_user_id uuid, p_app_id uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."is_user_app_admin"(p_user_id uuid, p_app_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."is_user_app_admin"(p_user_id uuid, p_app_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."is_user_app_admin"(p_user_id uuid, p_app_id uuid) TO "service_role";
CREATE FUNCTION public."is_user_app_admin"(p_user_id uuid, p_app_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."is_user_app_admin"($1, $2);
$$;
ALTER FUNCTION public."is_user_app_admin"(p_user_id uuid, p_app_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."is_user_app_admin"(p_user_id uuid, p_app_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."is_user_app_admin"(p_user_id uuid, p_app_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."is_user_app_admin"(p_user_id uuid, p_app_id uuid) TO "service_role";

ALTER FUNCTION public."is_user_org_admin"(p_user_id uuid, p_org_id uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."is_user_org_admin"(p_user_id uuid, p_org_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."is_user_org_admin"(p_user_id uuid, p_org_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."is_user_org_admin"(p_user_id uuid, p_org_id uuid) TO "service_role";
CREATE FUNCTION public."is_user_org_admin"(p_user_id uuid, p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."is_user_org_admin"($1, $2);
$$;
ALTER FUNCTION public."is_user_org_admin"(p_user_id uuid, p_org_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."is_user_org_admin"(p_user_id uuid, p_org_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."is_user_org_admin"(p_user_id uuid, p_org_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."is_user_org_admin"(p_user_id uuid, p_org_id uuid) TO "service_role";

ALTER FUNCTION public."modify_permissions_tmp"(email text, org_id uuid, new_role user_min_right) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."modify_permissions_tmp"(email text, org_id uuid, new_role user_min_right) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."modify_permissions_tmp"(email text, org_id uuid, new_role user_min_right) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."modify_permissions_tmp"(email text, org_id uuid, new_role user_min_right) TO "service_role";
CREATE FUNCTION public."modify_permissions_tmp"(email text, org_id uuid, new_role user_min_right)
RETURNS character varying
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."modify_permissions_tmp"($1, $2, $3);
$$;
ALTER FUNCTION public."modify_permissions_tmp"(email text, org_id uuid, new_role user_min_right) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."modify_permissions_tmp"(email text, org_id uuid, new_role user_min_right) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."modify_permissions_tmp"(email text, org_id uuid, new_role user_min_right) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."modify_permissions_tmp"(email text, org_id uuid, new_role user_min_right) TO "service_role";

ALTER FUNCTION public."rbac_check_permission"(p_permission_key text, p_org_id uuid, p_app_id character varying, p_channel_id bigint) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."rbac_check_permission"(p_permission_key text, p_org_id uuid, p_app_id character varying, p_channel_id bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."rbac_check_permission"(p_permission_key text, p_org_id uuid, p_app_id character varying, p_channel_id bigint) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."rbac_check_permission"(p_permission_key text, p_org_id uuid, p_app_id character varying, p_channel_id bigint) TO "service_role";
CREATE FUNCTION public."rbac_check_permission"(p_permission_key text, p_org_id uuid DEFAULT NULL::uuid, p_app_id character varying DEFAULT NULL::character varying, p_channel_id bigint DEFAULT NULL::bigint)
RETURNS boolean
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."rbac_check_permission"($1, $2, $3, $4);
$$;
ALTER FUNCTION public."rbac_check_permission"(p_permission_key text, p_org_id uuid, p_app_id character varying, p_channel_id bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."rbac_check_permission"(p_permission_key text, p_org_id uuid, p_app_id character varying, p_channel_id bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."rbac_check_permission"(p_permission_key text, p_org_id uuid, p_app_id character varying, p_channel_id bigint) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."rbac_check_permission"(p_permission_key text, p_org_id uuid, p_app_id character varying, p_channel_id bigint) TO "service_role";

ALTER FUNCTION public."rbac_check_permission_direct"(p_permission_key text, p_user_id uuid, p_org_id uuid, p_app_id character varying, p_channel_id bigint, p_apikey text) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."rbac_check_permission_direct"(p_permission_key text, p_user_id uuid, p_org_id uuid, p_app_id character varying, p_channel_id bigint, p_apikey text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."rbac_check_permission_direct"(p_permission_key text, p_user_id uuid, p_org_id uuid, p_app_id character varying, p_channel_id bigint, p_apikey text) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."rbac_check_permission_direct"(p_permission_key text, p_user_id uuid, p_org_id uuid, p_app_id character varying, p_channel_id bigint, p_apikey text) TO "service_role";
CREATE FUNCTION public."rbac_check_permission_direct"(p_permission_key text, p_user_id uuid, p_org_id uuid, p_app_id character varying, p_channel_id bigint, p_apikey text DEFAULT NULL::text)
RETURNS boolean
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."rbac_check_permission_direct"($1, $2, $3, $4, $5, $6);
$$;
ALTER FUNCTION public."rbac_check_permission_direct"(p_permission_key text, p_user_id uuid, p_org_id uuid, p_app_id character varying, p_channel_id bigint, p_apikey text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."rbac_check_permission_direct"(p_permission_key text, p_user_id uuid, p_org_id uuid, p_app_id character varying, p_channel_id bigint, p_apikey text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."rbac_check_permission_direct"(p_permission_key text, p_user_id uuid, p_org_id uuid, p_app_id character varying, p_channel_id bigint, p_apikey text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."rbac_check_permission_direct"(p_permission_key text, p_user_id uuid, p_org_id uuid, p_app_id character varying, p_channel_id bigint, p_apikey text) TO "service_role";

ALTER FUNCTION public."rbac_check_permission_direct_no_password_policy"(p_permission_key text, p_user_id uuid, p_org_id uuid, p_app_id character varying, p_channel_id bigint, p_apikey text) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."rbac_check_permission_direct_no_password_policy"(p_permission_key text, p_user_id uuid, p_org_id uuid, p_app_id character varying, p_channel_id bigint, p_apikey text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."rbac_check_permission_direct_no_password_policy"(p_permission_key text, p_user_id uuid, p_org_id uuid, p_app_id character varying, p_channel_id bigint, p_apikey text) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."rbac_check_permission_direct_no_password_policy"(p_permission_key text, p_user_id uuid, p_org_id uuid, p_app_id character varying, p_channel_id bigint, p_apikey text) TO "service_role";
CREATE FUNCTION public."rbac_check_permission_direct_no_password_policy"(p_permission_key text, p_user_id uuid, p_org_id uuid, p_app_id character varying, p_channel_id bigint, p_apikey text DEFAULT NULL::text)
RETURNS boolean
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."rbac_check_permission_direct_no_password_policy"($1, $2, $3, $4, $5, $6);
$$;
ALTER FUNCTION public."rbac_check_permission_direct_no_password_policy"(p_permission_key text, p_user_id uuid, p_org_id uuid, p_app_id character varying, p_channel_id bigint, p_apikey text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."rbac_check_permission_direct_no_password_policy"(p_permission_key text, p_user_id uuid, p_org_id uuid, p_app_id character varying, p_channel_id bigint, p_apikey text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."rbac_check_permission_direct_no_password_policy"(p_permission_key text, p_user_id uuid, p_org_id uuid, p_app_id character varying, p_channel_id bigint, p_apikey text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."rbac_check_permission_direct_no_password_policy"(p_permission_key text, p_user_id uuid, p_org_id uuid, p_app_id character varying, p_channel_id bigint, p_apikey text) TO "service_role";

ALTER FUNCTION public."rbac_check_permission_no_password_policy"(p_permission_key text, p_org_id uuid, p_app_id character varying, p_channel_id bigint) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."rbac_check_permission_no_password_policy"(p_permission_key text, p_org_id uuid, p_app_id character varying, p_channel_id bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."rbac_check_permission_no_password_policy"(p_permission_key text, p_org_id uuid, p_app_id character varying, p_channel_id bigint) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."rbac_check_permission_no_password_policy"(p_permission_key text, p_org_id uuid, p_app_id character varying, p_channel_id bigint) TO "service_role";
CREATE FUNCTION public."rbac_check_permission_no_password_policy"(p_permission_key text, p_org_id uuid DEFAULT NULL::uuid, p_app_id character varying DEFAULT NULL::character varying, p_channel_id bigint DEFAULT NULL::bigint)
RETURNS boolean
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."rbac_check_permission_no_password_policy"($1, $2, $3, $4);
$$;
ALTER FUNCTION public."rbac_check_permission_no_password_policy"(p_permission_key text, p_org_id uuid, p_app_id character varying, p_channel_id bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."rbac_check_permission_no_password_policy"(p_permission_key text, p_org_id uuid, p_app_id character varying, p_channel_id bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."rbac_check_permission_no_password_policy"(p_permission_key text, p_org_id uuid, p_app_id character varying, p_channel_id bigint) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."rbac_check_permission_no_password_policy"(p_permission_key text, p_org_id uuid, p_app_id character varying, p_channel_id bigint) TO "service_role";

ALTER FUNCTION public."rbac_check_permission_request"(p_permission_key text, p_org_id uuid, p_app_id character varying, p_channel_id bigint) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."rbac_check_permission_request"(p_permission_key text, p_org_id uuid, p_app_id character varying, p_channel_id bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."rbac_check_permission_request"(p_permission_key text, p_org_id uuid, p_app_id character varying, p_channel_id bigint) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."rbac_check_permission_request"(p_permission_key text, p_org_id uuid, p_app_id character varying, p_channel_id bigint) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."rbac_check_permission_request"(p_permission_key text, p_org_id uuid, p_app_id character varying, p_channel_id bigint) TO "service_role";
CREATE FUNCTION public."rbac_check_permission_request"(p_permission_key text, p_org_id uuid DEFAULT NULL::uuid, p_app_id character varying DEFAULT NULL::character varying, p_channel_id bigint DEFAULT NULL::bigint)
RETURNS boolean
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."rbac_check_permission_request"($1, $2, $3, $4);
$$;
ALTER FUNCTION public."rbac_check_permission_request"(p_permission_key text, p_org_id uuid, p_app_id character varying, p_channel_id bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."rbac_check_permission_request"(p_permission_key text, p_org_id uuid, p_app_id character varying, p_channel_id bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."rbac_check_permission_request"(p_permission_key text, p_org_id uuid, p_app_id character varying, p_channel_id bigint) TO "anon";
GRANT EXECUTE ON FUNCTION public."rbac_check_permission_request"(p_permission_key text, p_org_id uuid, p_app_id character varying, p_channel_id bigint) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."rbac_check_permission_request"(p_permission_key text, p_org_id uuid, p_app_id character varying, p_channel_id bigint) TO "service_role";

ALTER FUNCTION public."reject_access_due_to_2fa_for_app"(app_id character varying) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."reject_access_due_to_2fa_for_app"(app_id character varying) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."reject_access_due_to_2fa_for_app"(app_id character varying) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."reject_access_due_to_2fa_for_app"(app_id character varying) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."reject_access_due_to_2fa_for_app"(app_id character varying) TO "service_role";
CREATE FUNCTION public."reject_access_due_to_2fa_for_app"(app_id character varying)
RETURNS boolean
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."reject_access_due_to_2fa_for_app"($1);
$$;
ALTER FUNCTION public."reject_access_due_to_2fa_for_app"(app_id character varying) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."reject_access_due_to_2fa_for_app"(app_id character varying) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."reject_access_due_to_2fa_for_app"(app_id character varying) TO "anon";
GRANT EXECUTE ON FUNCTION public."reject_access_due_to_2fa_for_app"(app_id character varying) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."reject_access_due_to_2fa_for_app"(app_id character varying) TO "service_role";

ALTER FUNCTION public."reject_access_due_to_2fa_for_org"(org_id uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."reject_access_due_to_2fa_for_org"(org_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."reject_access_due_to_2fa_for_org"(org_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."reject_access_due_to_2fa_for_org"(org_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."reject_access_due_to_2fa_for_org"(org_id uuid) TO "service_role";
CREATE FUNCTION public."reject_access_due_to_2fa_for_org"(org_id uuid)
RETURNS boolean
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."reject_access_due_to_2fa_for_org"($1);
$$;
ALTER FUNCTION public."reject_access_due_to_2fa_for_org"(org_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."reject_access_due_to_2fa_for_org"(org_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."reject_access_due_to_2fa_for_org"(org_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION public."reject_access_due_to_2fa_for_org"(org_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."reject_access_due_to_2fa_for_org"(org_id uuid) TO "service_role";

ALTER FUNCTION public."request_app_chart_refresh"(app_id character varying) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."request_app_chart_refresh"(app_id character varying) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."request_app_chart_refresh"(app_id character varying) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."request_app_chart_refresh"(app_id character varying) TO "service_role";
CREATE FUNCTION public."request_app_chart_refresh"(app_id character varying)
RETURNS TABLE(requested_at timestamp without time zone, queued_app_ids character varying[], queued_count integer, skipped_count integer)
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
ROWS 1000
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT t."requested_at", t."queued_app_ids", t."queued_count", t."skipped_count"
FROM capgo_private."request_app_chart_refresh"($1) AS t;
$$;
ALTER FUNCTION public."request_app_chart_refresh"(app_id character varying) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."request_app_chart_refresh"(app_id character varying) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."request_app_chart_refresh"(app_id character varying) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."request_app_chart_refresh"(app_id character varying) TO "service_role";

ALTER FUNCTION public."request_org_chart_refresh"(org_id uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."request_org_chart_refresh"(org_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."request_org_chart_refresh"(org_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."request_org_chart_refresh"(org_id uuid) TO "service_role";
CREATE FUNCTION public."request_org_chart_refresh"(org_id uuid)
RETURNS TABLE(requested_at timestamp without time zone, queued_app_ids character varying[], queued_count integer, skipped_count integer)
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
ROWS 1000
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT t."requested_at", t."queued_app_ids", t."queued_count", t."skipped_count"
FROM capgo_private."request_org_chart_refresh"($1) AS t;
$$;
ALTER FUNCTION public."request_org_chart_refresh"(org_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."request_org_chart_refresh"(org_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."request_org_chart_refresh"(org_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."request_org_chart_refresh"(org_id uuid) TO "service_role";

ALTER FUNCTION public."rescind_invitation"(email text, org_id uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."rescind_invitation"(email text, org_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."rescind_invitation"(email text, org_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."rescind_invitation"(email text, org_id uuid) TO "service_role";
CREATE FUNCTION public."rescind_invitation"(email text, org_id uuid)
RETURNS character varying
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."rescind_invitation"($1, $2);
$$;
ALTER FUNCTION public."rescind_invitation"(email text, org_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."rescind_invitation"(email text, org_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."rescind_invitation"(email text, org_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."rescind_invitation"(email text, org_id uuid) TO "service_role";

ALTER FUNCTION public."transfer_app"(p_app_id character varying, p_new_org_id uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."transfer_app"(p_app_id character varying, p_new_org_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."transfer_app"(p_app_id character varying, p_new_org_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."transfer_app"(p_app_id character varying, p_new_org_id uuid) TO "service_role";
CREATE FUNCTION public."transfer_app"(p_app_id character varying, p_new_org_id uuid)
RETURNS void
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."transfer_app"($1, $2);
$$;
ALTER FUNCTION public."transfer_app"(p_app_id character varying, p_new_org_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."transfer_app"(p_app_id character varying, p_new_org_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."transfer_app"(p_app_id character varying, p_new_org_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."transfer_app"(p_app_id character varying, p_new_org_id uuid) TO "service_role";

ALTER FUNCTION public."update_org_invite_role_rbac"(p_org_id uuid, p_user_id uuid, p_new_role_name text) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."update_org_invite_role_rbac"(p_org_id uuid, p_user_id uuid, p_new_role_name text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."update_org_invite_role_rbac"(p_org_id uuid, p_user_id uuid, p_new_role_name text) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."update_org_invite_role_rbac"(p_org_id uuid, p_user_id uuid, p_new_role_name text) TO "service_role";
CREATE FUNCTION public."update_org_invite_role_rbac"(p_org_id uuid, p_user_id uuid, p_new_role_name text)
RETURNS text
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."update_org_invite_role_rbac"($1, $2, $3);
$$;
ALTER FUNCTION public."update_org_invite_role_rbac"(p_org_id uuid, p_user_id uuid, p_new_role_name text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."update_org_invite_role_rbac"(p_org_id uuid, p_user_id uuid, p_new_role_name text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."update_org_invite_role_rbac"(p_org_id uuid, p_user_id uuid, p_new_role_name text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."update_org_invite_role_rbac"(p_org_id uuid, p_user_id uuid, p_new_role_name text) TO "service_role";

ALTER FUNCTION public."update_org_member_role"(p_org_id uuid, p_user_id uuid, p_new_role_name text) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."update_org_member_role"(p_org_id uuid, p_user_id uuid, p_new_role_name text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."update_org_member_role"(p_org_id uuid, p_user_id uuid, p_new_role_name text) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."update_org_member_role"(p_org_id uuid, p_user_id uuid, p_new_role_name text) TO "service_role";
CREATE FUNCTION public."update_org_member_role"(p_org_id uuid, p_user_id uuid, p_new_role_name text)
RETURNS text
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."update_org_member_role"($1, $2, $3);
$$;
ALTER FUNCTION public."update_org_member_role"(p_org_id uuid, p_user_id uuid, p_new_role_name text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."update_org_member_role"(p_org_id uuid, p_user_id uuid, p_new_role_name text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."update_org_member_role"(p_org_id uuid, p_user_id uuid, p_new_role_name text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."update_org_member_role"(p_org_id uuid, p_user_id uuid, p_new_role_name text) TO "service_role";

ALTER FUNCTION public."update_tmp_invite_role_rbac"(p_org_id uuid, p_email text, p_new_role_name text) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."update_tmp_invite_role_rbac"(p_org_id uuid, p_email text, p_new_role_name text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."update_tmp_invite_role_rbac"(p_org_id uuid, p_email text, p_new_role_name text) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."update_tmp_invite_role_rbac"(p_org_id uuid, p_email text, p_new_role_name text) TO "service_role";
CREATE FUNCTION public."update_tmp_invite_role_rbac"(p_org_id uuid, p_email text, p_new_role_name text)
RETURNS text
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."update_tmp_invite_role_rbac"($1, $2, $3);
$$;
ALTER FUNCTION public."update_tmp_invite_role_rbac"(p_org_id uuid, p_email text, p_new_role_name text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."update_tmp_invite_role_rbac"(p_org_id uuid, p_email text, p_new_role_name text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."update_tmp_invite_role_rbac"(p_org_id uuid, p_email text, p_new_role_name text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."update_tmp_invite_role_rbac"(p_org_id uuid, p_email text, p_new_role_name text) TO "service_role";

ALTER FUNCTION public."user_has_app_update_user_roles"(p_user_id uuid, p_app_id uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."user_has_app_update_user_roles"(p_user_id uuid, p_app_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."user_has_app_update_user_roles"(p_user_id uuid, p_app_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."user_has_app_update_user_roles"(p_user_id uuid, p_app_id uuid) TO "service_role";
CREATE FUNCTION public."user_has_app_update_user_roles"(p_user_id uuid, p_app_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."user_has_app_update_user_roles"($1, $2);
$$;
ALTER FUNCTION public."user_has_app_update_user_roles"(p_user_id uuid, p_app_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."user_has_app_update_user_roles"(p_user_id uuid, p_app_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."user_has_app_update_user_roles"(p_user_id uuid, p_app_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."user_has_app_update_user_roles"(p_user_id uuid, p_app_id uuid) TO "service_role";

ALTER FUNCTION public."user_has_role_in_app"(p_user_id uuid, p_app_id uuid) SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."user_has_role_in_app"(p_user_id uuid, p_app_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."user_has_role_in_app"(p_user_id uuid, p_app_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."user_has_role_in_app"(p_user_id uuid, p_app_id uuid) TO "service_role";
CREATE FUNCTION public."user_has_role_in_app"(p_user_id uuid, p_app_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."user_has_role_in_app"($1, $2);
$$;
ALTER FUNCTION public."user_has_role_in_app"(p_user_id uuid, p_app_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public."user_has_role_in_app"(p_user_id uuid, p_app_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."user_has_role_in_app"(p_user_id uuid, p_app_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."user_has_role_in_app"(p_user_id uuid, p_app_id uuid) TO "service_role";

ALTER FUNCTION public."verify_mfa"() SET SCHEMA capgo_private;
REVOKE ALL ON FUNCTION capgo_private."verify_mfa"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capgo_private."verify_mfa"() TO "anon";
GRANT EXECUTE ON FUNCTION capgo_private."verify_mfa"() TO "authenticated";
GRANT EXECUTE ON FUNCTION capgo_private."verify_mfa"() TO "service_role";
CREATE FUNCTION public."verify_mfa"()
RETURNS boolean
LANGUAGE sql
VOLATILE
PARALLEL UNSAFE
COST 100
SECURITY INVOKER
SET search_path = ''
AS $$
SELECT capgo_private."verify_mfa"();
$$;
ALTER FUNCTION public."verify_mfa"() OWNER TO postgres;
REVOKE ALL ON FUNCTION public."verify_mfa"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."verify_mfa"() TO "anon";
GRANT EXECUTE ON FUNCTION public."verify_mfa"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."verify_mfa"() TO "service_role";

