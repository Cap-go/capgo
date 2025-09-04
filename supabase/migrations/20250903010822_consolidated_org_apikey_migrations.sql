-- Adjust RLS to allow anon + capgkey-based access for apikeys management
-- and allow app creation with 'write' rights (instead of 'admin')
-- 1) Relax apps insert policy from 'admin' to 'write' for apikey-based access
ALTER POLICY "Allow insert for apikey (write,all) (admin+)" ON "public"."apps" TO "anon",
"authenticated"
WITH
  CHECK (
    "public"."check_min_rights" (
      'write'::"public"."user_min_right",
      "public"."get_identity_org_appid" (
        '{write,all}'::"public"."key_mode" [],
        owner_org,
        app_id
      ),
      owner_org,
      app_id,
      NULL::bigint
    )
  );

-- 2) Policies on public.apikeys for anon using capgkey header
DROP POLICY "Enable all for user based on user_id" ON "public"."apikeys";

-- Allow owner to SELECT own keys
CREATE POLICY "Allow owner to select own apikeys" ON "public"."apikeys" FOR
SELECT
  TO "anon",
  "authenticated" USING (
    user_id = "public"."get_identity" ('{read,upload,write,all}')
  );

-- Allow owner to INSERT own keys (subkeys)
CREATE POLICY "Allow owner to insert own apikeys" ON "public"."apikeys" FOR INSERT TO "anon",
"authenticated"
WITH
  CHECK (user_id = "public"."get_identity" ('{write,all}'));

-- Allow owner to UPDATE own keys
CREATE POLICY "Allow owner to update own apikeys" ON "public"."apikeys"
FOR UPDATE
  TO "anon",
  "authenticated" USING (
    user_id = "public"."get_identity" ('{read,upload,write,all}')
  )
WITH
  CHECK (user_id = "public"."get_identity" ('{write,all}'));

-- Allow owner to DELETE own keys
CREATE POLICY "Allow owner to delete own apikeys" ON "public"."apikeys" FOR DELETE TO "anon",
"authenticated" USING (user_id = "public"."get_identity" ('{write,all}'));

DROP POLICY "Allow webapp to insert" ON "public"."orgs";

-- Allow creating orgs using apikey (anon role) where created_by matches apikey's user
CREATE POLICY "Allow insert org for apikey or user" ON "public"."orgs" FOR INSERT TO "anon",
"authenticated"
WITH
  CHECK (
    created_by = "public"."get_identity" ('{write,all}')
  );

DROP POLICY "Allow org delete for super_admin" ON "public"."orgs";

-- Allow deleting orgs with apikey when caller has super_admin rights
CREATE POLICY "Allow org delete for super_admin" ON "public"."orgs" FOR DELETE TO "anon",
"authenticated" USING (
  "public"."check_min_rights" (
    'super_admin'::"public"."user_min_right",
    "public"."get_identity_org_allowed" (
      '{read,upload,write,all}'::"public"."key_mode" [],
      "id"
    ),
    "id",
    NULL::character varying,
    NULL::bigint
  )
);

DROP POLICY "Allow self to modify self" ON "public"."users";

-- Allow owner to SELECT own user
CREATE POLICY "Allow owner to select own user" ON "public"."users" FOR
SELECT
  TO "anon",
  "authenticated" USING (
    (
      id = "public"."get_identity" ('{read,upload,write,all}')
    )
    AND ("public"."is_not_deleted" (email))
  );

-- Allow owner to INSERT own user
CREATE POLICY "Allow owner to insert own users" ON "public"."users" FOR INSERT TO "anon",
"authenticated"
WITH
  CHECK (
    (id = "public"."get_identity" ('{write,all}'))
    AND ("public"."is_not_deleted" (email))
  );

-- Allow owner to UPDATE own user
CREATE POLICY "Allow owner to update own users" ON "public"."users"
FOR UPDATE
  TO "anon",
  "authenticated" USING (
    (
      id = "public"."get_identity" ('{read,upload,write,all}')
    )
    AND ("public"."is_not_deleted" (email))
  )
WITH
  CHECK (
    (id = "public"."get_identity" ('{write,all}'))
    AND ("public"."is_not_deleted" (email))
  );

-- Allow owner to DELETE own user
CREATE POLICY "Disallow owner to delete own users" ON "public"."users" FOR DELETE TO "anon",
"authenticated" USING (false);

-- Replace legacy self-get policy with org membership-based access for stripe_info
DROP POLICY IF EXISTS "Allow user to self get" ON "public"."stripe_info";

-- Allow users (JWT or capgkey) who are members of the organization
-- linked via orgs.customer_id -> stripe_info.customer_id to read Stripe info
CREATE POLICY "Allow org member to select stripe_info" ON "public"."stripe_info" FOR
SELECT
  TO "anon",
  "authenticated" USING (
    EXISTS (
      SELECT
        1
      FROM
        public.orgs o
      WHERE
        o.customer_id = stripe_info.customer_id
        AND public.check_min_rights (
          'read'::public.user_min_right,
          public.get_identity_org_allowed (
            '{read,upload,write,all}'::public.key_mode[],
            o.id
          ),
          o.id,
          NULL::character varying,
          NULL::bigint
        )
    )
  );

DROP POLICY "Allow owner to update" ON "public"."devices";

-- Allow org members with write+ to update device rows of apps in their orgs
CREATE POLICY "Allow org member to update devices" ON "public"."devices"
FOR UPDATE
  TO "anon",
  "authenticated" USING (
    public.check_min_rights (
      'write'::public.user_min_right,
      public.get_identity_org_appid (
        '{write,all}'::public.key_mode[],
        public.get_user_main_org_id_by_app_id (app_id),
        app_id
      ),
      public.get_user_main_org_id_by_app_id (app_id),
      app_id,
      NULL::bigint
    )
  )
WITH
  CHECK (
    public.check_min_rights (
      'write'::public.user_min_right,
      public.get_identity_org_appid (
        '{write,all}'::public.key_mode[],
        public.get_user_main_org_id_by_app_id (app_id),
        app_id
      ),
      public.get_user_main_org_id_by_app_id (app_id),
      app_id,
      NULL::bigint
    )
  );

DROP POLICY "Allow devices select" ON "public"."devices";

-- Allow org members with read+ to query device rows of apps in their orgs
CREATE POLICY "Allow org member to select devices" ON "public"."devices" FOR
SELECT
  TO "anon",
  "authenticated" USING (
    public.check_min_rights (
      'read'::public.user_min_right,
      public.get_identity_org_appid (
        '{read,upload,write,all}'::public.key_mode[],
        public.get_user_main_org_id_by_app_id (app_id),
        app_id
      ),
      public.get_user_main_org_id_by_app_id (app_id),
      app_id,
      NULL::bigint
    )
  );

-- Allow org members with write+ to insert device rows for apps in their orgs
CREATE POLICY "Allow org member to insert devices" ON "public"."devices" FOR INSERT TO "anon",
"authenticated"
WITH
  CHECK (
    public.check_min_rights (
      'write'::public.user_min_right,
      public.get_identity_org_appid (
        '{write,all}'::public.key_mode[],
        public.get_user_main_org_id_by_app_id (app_id),
        app_id
      ),
      public.get_user_main_org_id_by_app_id (app_id),
      app_id,
      NULL::bigint
    )
  );
