select vault.create_secret('CXhkUxGCUS7UqmMy3vPgvNwzkojya8meHrng9RSoCQqcGBTAD3zyiqJKvMEsLx8tj2PiGc8TyTZ5GA29gbgTrqVyFrJbJRpvKKxcFjpCBcxCtEDZUX789xFADgw4C3ig', 'user_id_password', 'user id password');

CREATE OR REPLACE FUNCTION public.share_user_id()
RETURNS character varying
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    RETURN (select encode((select pgp_sym_encrypt((select auth.uid())::text, (select decrypted_secret from vault.decrypted_secrets where name = 'user_id_password'))), 'hex'));
END;  
$$;

CREATE OR REPLACE FUNCTION public.decrypt_user_id("user_id" "text")                                                                                                                                                                    
RETURNS character varying
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN

  IF NOT (is_admin(auth.uid())) THEN
    raise exception 'NO_RIGHTS';
  END IF;

  RETURN (select pgp_sym_decrypt((select decode(user_id, 'hex')),  (select decrypted_secret from vault.decrypted_secrets where name = 'user_id_password')));
END;  
$$;