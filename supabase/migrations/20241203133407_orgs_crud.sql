CREATE OR REPLACE FUNCTION "public"."invite_user_to_org"("email" character varying, "org_id" "uuid", "invite_type" "public"."user_min_right") RETURNS character varying
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
Declare  
  org record;
  invited_user record;
  current_record record;
Begin
  SELECT * FROM ORGS
  INTO org
  WHERE orgs.id=invite_user_to_org.org_id;

  IF org IS NULL THEN
    return 'NO_ORG';
  END IF;

  if NOT (check_min_rights('admin'::user_min_right, (select get_identity('{read,upload,write,all}'::"public"."key_mode"[])), invite_user_to_org.org_id, NULL::character varying, NULL::bigint)) THEN
    return 'NO_RIGHTS';
  END IF;


  if NOT (check_min_rights('super_admin'::user_min_right, (select get_identity('{read,upload,write,all}'::"public"."key_mode"[])), invite_user_to_org.org_id, NULL::character varying, NULL::bigint) AND (invite_type is distinct from 'super_admin'::"public"."user_min_right" or invite_type is distinct from 'invite_super_admin'::"public"."user_min_right")) THEN
    return 'NO_RIGHTS';
  END IF;

  SELECT users.id FROM USERS
  INTO invited_user
  WHERE users.email=invite_user_to_org.email;

  IF invited_user IS NOT NULL THEN
    -- INSERT INTO org_users (user_id, org_id, user_right)
    -- VALUES (invited_user.id, invite_user_to_org.org_id, invite_type);

    IF (org.created_by=invited_user.id) THEN
      RETURN 'CAN_NOT_INVITE_OWNER';
    END IF;

    SELECT org_users.id from org_users 
    INTO current_record
    WHERE org_users.user_id=invited_user.id
    AND org_users.org_id=invite_user_to_org.org_id;

    IF current_record IS NOT NULL THEN
      RETURN 'ALREADY_INVITED';
    ELSE
      INSERT INTO org_users (user_id, org_id, user_right)
      VALUES (invited_user.id, invite_user_to_org.org_id, invite_type);

      RETURN 'OK';
    END IF;
  ELSE
    return 'NO_EMAIL';
  END IF;
End;
$$;

DROP POLICY "Allow to self delete" ON "public"."org_users";
CREATE POLICY "Allow to self delete" ON "public"."org_users" FOR DELETE TO "authenticated", "anon" USING (("user_id" = (select get_identity('{read,upload,write,all}'::"public"."key_mode"[]))));

DROP POLICY "Allow memeber and owner to select" ON "public"."org_users";
CREATE POLICY "Allow memeber and owner to select" ON "public"."org_users" FOR SELECT TO "authenticated", "anon"  USING (("public"."is_member_of_org"((select get_identity('{read,upload,write,all}'::"public"."key_mode"[])), "org_id") OR "public"."is_owner_of_org"((select get_identity('{read,upload,write,all}'::"public"."key_mode"[])), "org_id")));

DROP POLICY "Allow org admin to all" ON "public"."org_users";
CREATE POLICY "Allow org admin to all" ON "public"."org_users" TO "authenticated", "anon"  USING ("public"."check_min_rights"('admin'::"public"."user_min_right", (select get_identity('{all}'::"public"."key_mode"[])), "org_id", NULL::character varying, NULL::bigint)) WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", (select get_identity('{all}'::"public"."key_mode"[])), "org_id", NULL::character varying, NULL::bigint));

DROP POLICY "Allow update for auth (admin+)" ON "public"."orgs";
CREATE POLICY"Allow update for auth (admin+)" ON "public"."orgs" FOR UPDATE TO "authenticated", "anon" USING ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity"('{all,write}'::"public"."key_mode"[]), "id", NULL::character varying, NULL::bigint)) WITH CHECK ("public"."check_min_rights"('admin'::"public"."user_min_right", "public"."get_identity"('{all,write}'::"public"."key_mode"[]), "id", NULL::character varying, NULL::bigint));
