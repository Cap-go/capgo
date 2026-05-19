-- Revert the `complete_onboarding_after_first_upload` trigger and function
-- introduced by 20260518131054 (PR #2291).
--
-- That trigger fires `apps.need_onboarding = FALSE` on the first real bundle
-- upload, which in turn fires `cleanup_onboarding_app_data_on_complete` and
-- cascades into `clear_onboarding_app_data()` -- destroying all channels,
-- bundles, devices, deploy history, and daily metrics for the app. Any app
-- where `need_onboarding` was still TRUE (i.e. provisioned via the dashboard
-- or CI without ever running `capgo init`) was silently armed for data loss
-- on its next upload after the migration deployed. See issue #2295.
--
-- We restore the pre-PR-#2291 behavior, where `need_onboarding` is only
-- cleared by an explicit user-initiated `capgo init`. The
-- `cleanup_onboarding_app_data_on_complete` trigger on `apps` stays in place
-- (it was already present before #2291) -- it only fires on a deliberate
-- flag transition, which is safe.
--
-- We intentionally do not restore the original single-argument
-- `clear_onboarding_app_data(uuid)` body that #2291 overwrote: the two-arg
-- overload it added is dormant without the trigger that calls it, and
-- forward-only migrations should avoid unnecessary churn on production.

DROP TRIGGER IF EXISTS "complete_onboarding_after_first_upload" ON "public"."app_versions";

DROP FUNCTION IF EXISTS "public"."complete_onboarding_after_first_upload"();
