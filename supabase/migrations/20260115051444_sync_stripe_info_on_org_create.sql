-- Fix race condition: create stripe_info synchronously on org creation
-- Pending customer_id (pending_{org_id}) is replaced with real Stripe customer_id by async handler

CREATE OR REPLACE FUNCTION "public"."generate_org_user_stripe_info_on_org_create"() 
    RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
AS $$
DECLARE
    solo_plan_stripe_id VARCHAR;
    pending_customer_id VARCHAR;
    trial_at_date TIMESTAMPTZ;
BEGIN
    INSERT INTO public.org_users (user_id, org_id, user_right) 
    VALUES (NEW.created_by, NEW.id, 'super_admin'::"public"."user_min_right");
    
    IF NEW.customer_id IS NOT NULL THEN
        RETURN NEW;
    END IF;
    
    SELECT stripe_id INTO solo_plan_stripe_id 
    FROM public.plans 
    WHERE name = 'Solo' 
    LIMIT 1;
    
    IF solo_plan_stripe_id IS NULL THEN
        RAISE WARNING 'Solo plan not found, skipping sync stripe_info creation for org %', NEW.id;
        RETURN NEW;
    END IF;
    
    pending_customer_id := 'pending_' || NEW.id::text;
    trial_at_date := NOW() + INTERVAL '15 days';
    
    INSERT INTO public.stripe_info (
        customer_id,
        product_id,
        trial_at,
        status,
        is_good_plan
    ) VALUES (
        pending_customer_id,
        solo_plan_stripe_id,
        trial_at_date,
        NULL,
        true
    );
    
    UPDATE public.orgs 
    SET customer_id = pending_customer_id 
    WHERE id = NEW.id;
    
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS "generate_org_user_on_org_create" ON "public"."orgs";

CREATE TRIGGER "generate_org_user_stripe_info_on_org_create"
    AFTER INSERT ON "public"."orgs"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."generate_org_user_stripe_info_on_org_create"();

DROP FUNCTION IF EXISTS "public"."generate_org_user_on_org_create"();
