-- Add the missing reset_app_data function that's causing test failures
CREATE OR REPLACE FUNCTION public.reset_app_data(p_app_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Delete data from tables in reverse order of dependencies
  DELETE FROM deploy_history WHERE app_id = p_app_id;
  DELETE FROM device_app_versions WHERE app_id = p_app_id;
  DELETE FROM device_channels WHERE app_id = p_app_id;
  DELETE FROM channels WHERE app_id = p_app_id;
  DELETE FROM app_versions WHERE app_id = p_app_id;
  DELETE FROM app_users WHERE app_id = p_app_id;
  DELETE FROM apps WHERE id = p_app_id;
END;
$function$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.reset_app_data(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_app_data(text) TO service_role;

-- Add comment for documentation
COMMENT ON FUNCTION public.reset_app_data(text) IS 'Deletes all data related to a specific app ID, used primarily for testing';
