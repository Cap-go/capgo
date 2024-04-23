CREATE OR REPLACE FUNCTION public.get_cloudflare_function_url() RETURNS TEXT LANGUAGE SQL AS $$
    SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cf_function_url';
$$ SECURITY DEFINER STABLE PARALLEL SAFE;

CREATE OR REPLACE FUNCTION public.get_netlify_function_url() RETURNS TEXT LANGUAGE SQL AS $$
    SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='netlify_function_url';
$$ SECURITY DEFINER STABLE PARALLEL SAFE;

CREATE OR REPLACE FUNCTION public.http_post_helper(function_name text, function_type text, body jsonb) 
RETURNS bigint 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $BODY$
<<declared>>
DECLARE 
  request_id text;
  headers jsonb;
  url text;
BEGIN 
  headers := jsonb_build_object(
    'Content-Type',
    'application/json',
    'apisecret',
    get_apikey()
  );
  -- Determine the URL based on the function_type
  CASE function_type
  WHEN 'netlify' THEN
    url := get_netlify_function_url() || function_name;
  WHEN 'cloudflare' THEN
    url := get_cloudflare_function_url() || function_name;
  ELSE
    url := get_db_url() || '/functions/v1/triggers/' || function_name;
  END CASE;

  -- Make an async HTTP POST request using pg_net
  SELECT INTO request_id net.http_post(
    url := declared.url,
    headers := declared.headers,
    body := body,
    timeout_milliseconds := 15000
  );
  return request_id;
END;
$BODY$;
