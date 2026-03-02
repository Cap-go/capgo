-- Add is_assignable check to role_bindings INSERT RLS policy
-- Without this, a direct PostgREST INSERT could bypass the endpoint's is_assignable check

DROP POLICY IF EXISTS "role_bindings_insert" ON "public"."role_bindings";

CREATE POLICY "role_bindings_insert" ON "public"."role_bindings" FOR INSERT TO "authenticated" WITH CHECK (
  -- The role must be assignable
  (EXISTS (
    SELECT 1 FROM "public"."roles" r
    WHERE r.id = "role_bindings"."role_id" AND r.is_assignable = true
  ))
  AND
  (EXISTS ( SELECT 1
   FROM ( SELECT "auth"."uid"() AS "uid") "auth_user"
  WHERE ("public"."is_admin"("auth_user"."uid") OR (("role_bindings"."scope_type" = "public"."rbac_scope_org"()) AND "public"."check_min_rights"("public"."rbac_right_admin"(), "auth_user"."uid", "role_bindings"."org_id", NULL::character varying, NULL::bigint)) OR (("role_bindings"."scope_type" = "public"."rbac_scope_app"()) AND (EXISTS ( SELECT 1
           FROM "public"."apps"
          WHERE (("apps"."id" = "role_bindings"."app_id") AND ("public"."check_min_rights"("public"."rbac_right_admin"(), "public"."get_identity_org_appid"('{all}'::"public"."key_mode"[], "apps"."owner_org", "apps"."app_id"), "apps"."owner_org", "apps"."app_id", NULL::bigint) OR "public"."user_has_app_update_user_roles"("public"."get_identity_org_appid"('{all}'::"public"."key_mode"[], "apps"."owner_org", "apps"."app_id"), "apps"."id")))))) OR (("role_bindings"."scope_type" = "public"."rbac_scope_channel"()) AND (EXISTS ( SELECT 1
           FROM ("public"."channels"
             JOIN "public"."apps" ON ((("apps"."app_id")::"text" = ("channels"."app_id")::"text")))
          WHERE (("channels"."rbac_id" = "role_bindings"."channel_id") AND "public"."check_min_rights"("public"."rbac_right_admin"(), "public"."get_identity_org_appid"('{all}'::"public"."key_mode"[], "apps"."owner_org", "apps"."app_id"), "apps"."owner_org", "channels"."app_id", "channels"."id"))))))))
);

COMMENT ON POLICY "role_bindings_insert" ON "public"."role_bindings" IS 'Scope admins and users with app.update_user_roles can insert role_bindings within their scope. Role must be assignable.';
