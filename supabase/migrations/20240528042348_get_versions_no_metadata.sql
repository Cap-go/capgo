CREATE OR REPLACE FUNCTION "public"."get_versions_with_no_metadata"() RETURNS setof app_versions 
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT app_versions.* FROM app_versions
  LEFT JOIN app_versions_meta ON app_versions_meta.id=app_versions.id
  where coalesce(app_versions_meta.size, 0) = 0 
  AND app_versions.deleted=false;
END;
$$;

-- TODO: perms