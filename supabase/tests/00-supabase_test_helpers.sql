-- This is Supabase Test Helpers V0.0.6 https://github.com/usebasejump/supabase-test-helpers/tree/main
-- We embed it our code (Manual mode in they doc) to prevent network issue with DBDEV
-- There is 2 changes in it:
-- 1. We removed the first line who was preventing the extension to be create in sql files
-- 2. We added fake test at the end to make the test runner not complain about no tests found in this file

-- We want to store all of this in the tests schema to keep it
-- separate from any application data
CREATE SCHEMA IF NOT EXISTS tests;

--- Create a specific schema for override functions so we don't have to worry about
--- anything else be adding to the tests schema
CREATE SCHEMA IF NOT EXISTS test_overrides;

-- anon, authenticated, and service_role should have access to tests schema
GRANT USAGE ON SCHEMA tests TO anon, authenticated, service_role;
-- Don't allow public to execute any functions in the tests schema
ALTER DEFAULT PRIVILEGES IN SCHEMA tests REVOKE EXECUTE ON FUNCTIONS FROM public;
-- Grant execute to anon, authenticated, and service_role for testing purposes
ALTER DEFAULT PRIVILEGES IN SCHEMA tests GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

-- anon, authenticated, and service_role should have access to test_overrides schema
GRANT USAGE ON SCHEMA test_overrides TO anon, authenticated, service_role;
-- Don't allow public to execute any functions in the test_overrides schema
ALTER DEFAULT PRIVILEGES IN SCHEMA test_overrides REVOKE EXECUTE ON FUNCTIONS FROM public;
-- Grant execute to anon, authenticated, and service_role for testing purposes
ALTER DEFAULT PRIVILEGES IN SCHEMA test_overrides GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

/**
    * ### tests.create_supabase_user(identifier text, email text, phone text)
    *
    * Creates a new user in the `auth.users` table.
    * You can recall a user's info by using `tests.get_supabase_user(identifier text)`.
    *
    * Parameters:
    * - `identifier` - A unique identifier for the user. We recommend you keep it memorable like "test_owner" or "test_member"
    * - `email` - (Optional) The email address of the user
    * - `phone` - (Optional) The phone number of the user
    * - `metadata` - (Optional) Additional metadata to be added to the user
    *
    * Returns:
    * - `user_id` - The UUID of the user in the `auth.users` table
    *
    * Example:
    * ```sql
    *   SELECT tests.create_supabase_user('test_owner');
    *   SELECT tests.create_supabase_user('test_member', 'member@test.com', '555-555-5555');
    *   SELECT tests.create_supabase_user('test_member', 'member@test.com', '555-555-5555', '{"key": "value"}'::jsonb);
    * ```
 */
CREATE OR REPLACE FUNCTION tests.create_supabase_user(identifier text, email text default null, phone text default null, metadata jsonb default null)
RETURNS uuid
    SECURITY DEFINER
    SET search_path = auth, pg_temp
AS $$
DECLARE
    user_id uuid;
BEGIN

    -- create the user
    user_id := extensions.uuid_generate_v4();
    INSERT INTO auth.users (id, email, phone, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
    VALUES (user_id, coalesce(email, concat(user_id, '@test.com')), phone, jsonb_build_object('test_identifier', identifier) || coalesce(metadata, '{}'::jsonb), '{}'::jsonb, now(), now())
    RETURNING id INTO user_id;

    RETURN user_id;
END;
$$ LANGUAGE plpgsql;


/**
    * ### tests.get_supabase_user(identifier text)
    *
    * Returns the user info for a user created with `tests.create_supabase_user`.
    *
    * Parameters:
    * - `identifier` - The unique identifier for the user
    *
    * Returns:
    * - `user_id` - The UUID of the user in the `auth.users` table
    *
    * Example:
    * ```sql
    *   SELECT posts where posts.user_id = tests.get_supabase_user('test_owner') -> 'id';
    * ```
*/
CREATE OR REPLACE FUNCTION tests.get_supabase_user(identifier text)
RETURNS json
SECURITY DEFINER
SET search_path = auth, pg_temp
AS $$
    DECLARE
        supabase_user json;
    BEGIN
        SELECT json_build_object(
        'id', id,
        'email', email,
        'phone', phone,
        'raw_user_meta_data', raw_user_meta_data,
        'raw_app_meta_data', raw_app_meta_data
        ) into supabase_user
        FROM auth.users
        WHERE raw_user_meta_data ->> 'test_identifier' = identifier limit 1;
        
        if supabase_user is null OR supabase_user -> 'id' IS NULL then
            RAISE EXCEPTION 'User with identifier % not found', identifier;
        end if;
        RETURN supabase_user;
    END;
$$ LANGUAGE plpgsql;

/**
    * ### tests.get_supabase_uid(identifier text)
    *
    * Returns the user UUID for a user created with `tests.create_supabase_user`.
    *
    * Parameters:
    * - `identifier` - The unique identifier for the user
    *
    * Returns:
    * - `user_id` - The UUID of the user in the `auth.users` table
    *
    * Example:
    * ```sql
    *   SELECT posts where posts.user_id = tests.get_supabase_uid('test_owner') -> 'id';
    * ```
 */
CREATE OR REPLACE FUNCTION tests.get_supabase_uid(identifier text)
    RETURNS uuid
    SECURITY DEFINER
    SET search_path = auth, pg_temp
AS $$
DECLARE
    supabase_user uuid;
BEGIN
    SELECT id into supabase_user FROM auth.users WHERE raw_user_meta_data ->> 'test_identifier' = identifier limit 1;
    if supabase_user is null then
        RAISE EXCEPTION 'User with identifier % not found', identifier;
    end if;
    RETURN supabase_user;
END;
$$ LANGUAGE plpgsql;

/**
    * ### tests.authenticate_as(identifier text)
    *   Authenticates as a user created with `tests.create_supabase_user`.
    *
    * Parameters:
    * - `identifier` - The unique identifier for the user
    *
    * Returns:
    * - `void`
    *
    * Example:
    * ```sql
    *   SELECT tests.create_supabase_user('test_owner');
    *   SELECT tests.authenticate_as('test_owner');
    * ```
 */
CREATE OR REPLACE FUNCTION tests.authenticate_as (identifier text)
    RETURNS void
    AS $$
        DECLARE
                user_data json;
                original_auth_data text;
        BEGIN
            -- store the request.jwt.claims in a variable in case we need it
            original_auth_data := current_setting('request.jwt.claims', true);
            user_data := tests.get_supabase_user(identifier);

            if user_data is null OR user_data ->> 'id' IS NULL then
                RAISE EXCEPTION 'User with identifier % not found', identifier;
            end if;


            perform set_config('role', 'authenticated', true);
            perform set_config('request.jwt.claims', json_build_object(
                'sub', user_data ->> 'id', 
                'email', user_data ->> 'email', 
                'phone', user_data ->> 'phone', 
                'user_metadata', user_data -> 'raw_user_meta_data', 
                'app_metadata', user_data -> 'raw_app_meta_data'
            )::text, true);

        EXCEPTION
            -- revert back to original auth data
            WHEN OTHERS THEN
                set local role authenticated;
                set local "request.jwt.claims" to original_auth_data;
                RAISE;
        END
    $$ LANGUAGE plpgsql;

/**
    * ### tests.authenticate_as_service_role()
    *   Clears authentication object and sets role to service_role.
    *
    * Returns:
    * - `void`
    *
    * Example:
    * ```sql
    *   SELECT tests.authenticate_as_service_role();
    * ```
 */
CREATE OR REPLACE FUNCTION tests.authenticate_as_service_role ()
    RETURNS void
    AS $$
        BEGIN
            perform set_config('role', 'service_role', true);
            perform set_config('request.jwt.claims', null, true);
        END
    $$ LANGUAGE plpgsql;


/**
    * ### tests.clear_authentication()
    *   Clears out the authentication and sets role to anon
    *
    * Returns:
    * - `void`
    *
    * Example:
    * ```sql
    *   SELECT tests.create_supabase_user('test_owner');
    *   SELECT tests.authenticate_as('test_owner');
    *   SELECT tests.clear_authentication();
    * ```
 */
CREATE OR REPLACE FUNCTION tests.clear_authentication()
    RETURNS void AS $$
BEGIN
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', null, true);
END
$$ LANGUAGE plpgsql;

/**
* ### tests.rls_enabled(testing_schema text)
* pgTAP function to check if RLS is enabled on all tables in a provided schema
*
* Parameters:
* - schema_name text - The name of the schema to check
*
* Example:
* ```sql
*   BEGIN;
*       select plan(1);
*       select tests.rls_enabled('public');
*       SELECT * FROM finish();
*   ROLLBACK;
* ```
*/
CREATE OR REPLACE FUNCTION tests.rls_enabled (testing_schema text)
RETURNS text AS $$
    select is(
        (select
           	count(pc.relname)::integer
           from pg_class pc
           join pg_namespace pn on pn.oid = pc.relnamespace and pn.nspname = rls_enabled.testing_schema
           join pg_type pt on pt.oid = pc.reltype
           where relrowsecurity = FALSE)
        ,
        0,
        'All tables in the' || testing_schema || ' schema should have row level security enabled');
$$ LANGUAGE sql;

/**
* ### tests.rls_enabled(testing_schema text, testing_table text)
* pgTAP function to check if RLS is enabled on a specific table
*
* Parameters:
* - schema_name text - The name of the schema to check
* - testing_table text - The name of the table to check
*
* Example:
* ```sql
*    BEGIN;
*        select plan(1);
*        select tests.rls_enabled('public', 'accounts');
*        SELECT * FROM finish();
*    ROLLBACK;
* ```
*/
CREATE OR REPLACE FUNCTION tests.rls_enabled (testing_schema text, testing_table text)
RETURNS TEXT AS $$
    select is(
        (select
           	count(*)::integer
           from pg_class pc
           join pg_namespace pn on pn.oid = pc.relnamespace and pn.nspname = rls_enabled.testing_schema and pc.relname = rls_enabled.testing_table
           join pg_type pt on pt.oid = pc.reltype
           where relrowsecurity = TRUE),
        1,
        testing_table || 'table in the' || testing_schema || ' schema should have row level security enabled'
    );
$$ LANGUAGE sql;

--
--  Generated now() function used to replace pg_catalog.now() for the purpose
--  of freezing time in tests. This should not be used directly.
--
CREATE OR REPLACE FUNCTION test_overrides.now()
    RETURNS timestamp with time zone
AS $$
BEGIN


    -- check if a frozen time is set
    IF nullif(current_setting('tests.frozen_time'), '') IS NOT NULL THEN
        RETURN current_setting('tests.frozen_time')::timestamptz;
    END IF;

    RETURN pg_catalog.now();
END
$$ LANGUAGE plpgsql;


/**
    * ### tests.freeze_time(frozen_time timestamp with time zone)
    *
    * Overwrites the current time from now() to the provided time.
    *
    * Works out of the box for any normal usage of now(), if you have a function that sets its own search path, such as security definers, then you will need to alter the function to set the search path to include test_overrides BEFORE pg_catalog. 
    * **ONLY do this inside of a pgtap test transaction.**
    * Example: 
    *
    * ```sql
    * ALTER FUNCTION auth.your_function() SET search_path = test_overrides, public, pg_temp, pg_catalog;
    * ```
    * View a test example in 05-frozen-time.sql: https://github.com/usebasejump/supabase-test-helpers/blob/main/supabase/tests/05-frozen-time.sql
    *
    * Parameters:
    * - `frozen_time` - The time to freeze to. Supports timestamp with time zone, without time zone, date or any other value that can be coerced into a timestamp with time zone.
    *
    * Returns:
    * - void
    *
    * Example:
    * ```sql
    *   SELECT tests.freeze_time('2020-01-01 00:00:00');
    * ```
 */

CREATE OR REPLACE FUNCTION tests.freeze_time(frozen_time timestamp with time zone)
    RETURNS void
AS $$
BEGIN

    -- Add test_overrides to search path if needed
    IF current_setting('search_path') NOT LIKE 'test_overrides,%' THEN
        -- store search path for later
        PERFORM set_config('tests.original_search_path', current_setting('search_path'), true);
        
        -- add tests schema to start of search path
        PERFORM set_config('search_path', 'test_overrides,' || current_setting('tests.original_search_path') || ',pg_catalog', true);
    END IF;

    -- create an overwriting now function
    PERFORM set_config('tests.frozen_time', frozen_time::text, true);

END
$$ LANGUAGE plpgsql;

/**
    * ### tests.unfreeze_time()
    *
    * Unfreezes the time and restores the original now() function.
    *
    * Returns:
    * - void
    *
    * Example:
    * ```sql
    *   SELECT tests.unfreeze_time();
    * ```
 */

CREATE OR REPLACE FUNCTION tests.unfreeze_time()
    RETURNS void
AS $$
BEGIN
    -- restore the original now function
    PERFORM set_config('tests.frozen_time', null, true);
    -- restore the original search path
    PERFORM set_config('search_path', current_setting('tests.original_search_path'), true);
END
$$ LANGUAGE plpgsql;


-- we have to run some tests to get this to pass as the first test file.
-- investigating options to make this better.  Maybe a dedicated test harness
-- but we dont' want these functions to always exist on the database.
BEGIN;
    select plan(7);
    select function_returns('tests', 'create_supabase_user', Array['text', 'text', 'text', 'jsonb'], 'uuid');
    select function_returns('tests', 'get_supabase_uid', Array['text'], 'uuid');
    select function_returns('tests', 'get_supabase_user', Array['text'], 'json');
    select function_returns('tests', 'authenticate_as', Array['text'], 'void');
    select function_returns('tests', 'clear_authentication', Array[null], 'void');
    select function_returns('tests', 'rls_enabled', Array['text', 'text'], 'text');
    select function_returns('tests', 'rls_enabled', Array['text'], 'text');
    select * from finish();
ROLLBACK;
