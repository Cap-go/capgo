-- Keep onboarding-needed checks false for missing org IDs to avoid org existence disclosure.
CREATE OR REPLACE FUNCTION "public"."is_onboarding_needed_org"("orgid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" = ''
    AS $$
BEGIN
  RETURN (
    EXISTS (
      SELECT 1 FROM public.orgs
      WHERE id = is_onboarding_needed_org.orgid
    )
    AND
    NOT public.is_onboarded_org(is_onboarding_needed_org.orgid)
    AND public.is_trial_org(is_onboarding_needed_org.orgid) = 0
  );
END;
$$;
