-- Track whether a user account was created via the invitation flow.
-- This is used for internal onboarding metrics ("User Joined") so we can exclude invited members.
ALTER TABLE "public"."users"
ADD COLUMN IF NOT EXISTS "created_via_invite" boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN "public"."users"."created_via_invite" IS
'True when the account was created through /private/accept_invitation (invited members), false for normal self-signups.';
