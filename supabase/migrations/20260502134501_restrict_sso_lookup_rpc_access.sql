ALTER FUNCTION public.check_domain_sso(p_domain text) OWNER TO POSTGRES;
REVOKE ALL ON FUNCTION public.check_domain_sso(p_domain text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_domain_sso(p_domain text) FROM ANON;
REVOKE ALL ON FUNCTION public.check_domain_sso(p_domain text)
FROM AUTHENTICATED;
GRANT EXECUTE
ON FUNCTION public.check_domain_sso(p_domain text)
TO SERVICE_ROLE;
COMMENT ON FUNCTION public.check_domain_sso(p_domain text)
IS 'Service-role-only lookup; returns internal SSO identifiers.';

ALTER FUNCTION public.get_sso_enforcement_by_domain(p_domain text)
OWNER TO POSTGRES;
REVOKE ALL ON FUNCTION public.get_sso_enforcement_by_domain(p_domain text)
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_sso_enforcement_by_domain(p_domain text)
FROM ANON;
REVOKE ALL ON FUNCTION public.get_sso_enforcement_by_domain(p_domain text)
FROM AUTHENTICATED;
GRANT EXECUTE
ON FUNCTION public.get_sso_enforcement_by_domain(p_domain text)
TO SERVICE_ROLE;
COMMENT ON FUNCTION public.get_sso_enforcement_by_domain(p_domain text)
IS 'Service-role-only lookup; returns internal SSO enforcement identifiers.';
