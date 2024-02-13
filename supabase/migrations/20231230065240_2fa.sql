CREATE OR REPLACE FUNCTION "public"."verify_mfa"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Begin
  RETURN (
    array[auth.jwt()->>'aal'] <@ (
      select
          case
            when count(id) > 0 then array['aal2']
            else array['aal1', 'aal2']
          end as aal
        from auth.mfa_factors
        where auth.uid() = user_id and status = 'verified'
    )
  ) OR (
    select array(select (jsonb_path_query(auth.jwt(), '$.amr.method'))) @> ARRAY['"otp"'::jsonb]
  );
End;  
$$;

CREATE OR REPLACE FUNCTION "public"."is_admin"("userid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  admin_ids_jsonb JSONB;
  is_admin_flag BOOLEAN;
BEGIN
  -- Fetch the JSONB string of admin user IDs from the vault
  SELECT decrypted_secret INTO admin_ids_jsonb FROM vault.decrypted_secrets WHERE name = 'admin_users';
  
  -- Check if the provided userid is within the JSONB array of admin user IDs
  is_admin_flag := (admin_ids_jsonb ? userid::text);
  
  -- An admin with no logged 2FA should not have his admin perms granted
  RETURN is_admin_flag AND verify_mfa();
END;  
$$;


create policy "Prevent non 2FA access"
  on apps
  as restrictive
  to authenticated
  using ("public"."verify_mfa"());
  
create policy "Prevent non 2FA access"
  on apikeys
  as restrictive
  to authenticated
  using ("public"."verify_mfa"());

create policy "Prevent non 2FA access"
  on app_versions
  as restrictive
  to authenticated
  using ("public"."verify_mfa"());

create policy "Prevent non 2FA access"
  on channel_devices
  as restrictive
  to authenticated
  using ("public"."verify_mfa"());

create policy "Prevent non 2FA access"
  on channels
  as restrictive
  to authenticated
  using ("public"."verify_mfa"());

create policy "Prevent non 2FA access"
  on orgs
  as restrictive
  to authenticated
  using ("public"."verify_mfa"());
  
create policy "Prevent non 2FA access"
  on org_users
  as restrictive
  to authenticated
  using ("public"."verify_mfa"());

create policy "Prevent non 2FA access"
  on devices_override
  as restrictive
  to authenticated
  using ("public"."verify_mfa"());