REVOKE EXECUTE ON FUNCTION public.count_all_plans_v2() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.count_all_plans_v2() FROM anon;
REVOKE EXECUTE ON FUNCTION public.count_all_plans_v2() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.count_all_plans_v2() TO postgres;