-- Fix search path for all functions
DO $$ 
DECLARE 
    func record;
BEGIN
    FOR func IN 
        SELECT n.nspname as schema_name,
               p.proname as function_name,
               pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.prokind = 'f'  -- only regular functions
    LOOP
        EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = ''$user'', ''pg_catalog'', ''public'', ''extensions'', ''vault'', ''pgmq'', ''pgsodium'';',
            func.schema_name,
            func.function_name,
            func.args
        );
    END LOOP;
END $$;
