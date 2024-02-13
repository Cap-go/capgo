DROP FUNCTION public.http_post_helper(function_name text, function_type text, body jsonb);

CREATE OR REPLACE FUNCTION public.http_post_helper(function_name text, function_type text, body jsonb) 
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $BODY$
DECLARE 
  request_id text;
  url text;
BEGIN 
  -- Determine the URL based on the function_type
  IF function_type = 'external' THEN
    url := get_external_function_url() || function_name;
  ELSE
    url := get_db_url() || '/functions/v1/triggers/' || function_name;
  END IF;

  -- Make an async HTTP POST request using pg_net
  SELECT INTO request_id net.http_post(
    url := url,
    headers := jsonb_build_object(
      'Content-Type',
      'application/json',
      'apisecret',
      get_apikey()
    ),
    body := body,
    timeout_milliseconds := 15000
  );
END;
$BODY$;

DROP FUNCTION public.get_total_app_storage_size(userid uuid, app_id character varying);
DROP FUNCTION public.get_total_app_storage_size(app_id character varying);

CREATE OR REPLACE FUNCTION public.get_total_app_storage_size(userid uuid, appid character varying)
RETURNS double precision
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    total_size double precision := 0;
BEGIN
    SELECT COALESCE(SUM(app_versions_meta.size), 0) INTO total_size
    FROM app_versions
    INNER JOIN app_versions_meta ON app_versions.id = app_versions_meta.id
    WHERE app_versions.user_id = userid
    AND app_versions.app_id = appid
    AND app_versions.deleted = false;

    RETURN total_size;
END;  
$$;

CREATE OR REPLACE FUNCTION public.get_total_app_storage_size(appid character varying)
RETURNS double precision
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN get_total_app_storage_size(auth.uid(), appid);
END;  
$$;
