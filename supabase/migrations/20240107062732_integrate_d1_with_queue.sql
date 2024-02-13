CREATE OR REPLACE FUNCTION public.post_replication_sql(sql_query text) 
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $BODY$
<<declared>>
DECLARE 
  request_id bigint;
  body jsonb;
BEGIN 
  declared.body := jsonb_build_object(
    'sql',
    sql_query
  );
  SELECT INTO request_id net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'd1_http_url'),
    headers := jsonb_build_object(
      'Content-Type',
      'application/json',
      'Authorization',
      (select format('Bearer %s', (select decrypted_secret from vault.decrypted_secrets where name = 'd1_cf_apikey')))
    ),
    body := declared.body,
    timeout_milliseconds := 15000
   );

   INSERT INTO job_queue (job_type, payload, status, function_type, function_name, request_id) VALUES ('TRIGGER', body::text, 'requested'::"public"."queue_job_status", 'D1', 'D1', declared.request_id);
END;
$BODY$;

CREATE OR REPLACE FUNCTION public.post_replication_sql(sql_query text, params text[]) 
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $BODY$
<<declared>>
DECLARE 
  request_id bigint;
  body jsonb;
BEGIN 
  declared.body := jsonb_build_object(
    'sql',
    sql_query,
    'params',
    params
  );
  SELECT INTO request_id net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'd1_http_url'),
    headers := jsonb_build_object(
      'Content-Type',
      'application/json',
      'Authorization',
      (select format('Bearer %s', (select decrypted_secret from vault.decrypted_secrets where name = 'd1_cf_apikey')))
    ),
    body := declared.body,
    timeout_milliseconds := 15000
   );

   INSERT INTO job_queue (job_type, payload, status, function_type, function_name, request_id) VALUES ('TRIGGER', body::text, 'requested'::"public"."queue_job_status", 'D1', 'D1', declared.request_id);
END;
$BODY$;


-- Minor change over org_system.sql. this versions adds the "d1" case to the if statement
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
  -- Determine the URL based on the function_type
  IF function_type = 'external' THEN
    url := get_external_function_url() || function_name;
    headers := jsonb_build_object(
      'Content-Type',
      'application/json',
      'apisecret',
      get_apikey()
    );
  ELSIF function_type = 'D1' THEN
    headers := jsonb_build_object(
      'Content-Type',
      'application/json',
      'Authorization',
      (select format('Bearer %s', (select decrypted_secret from vault.decrypted_secrets where name = 'd1_cf_apikey')))
    );
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'd1_http_url');
  ELSE
    url := get_db_url() || '/functions/v1/' || function_name;
    headers := jsonb_build_object(
      'Content-Type',
      'application/json',
      'apisecret',
      get_apikey()
    );
  END IF;

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
