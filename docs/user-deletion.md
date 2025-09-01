User Deletion Flow (Soft Delete + Purge)

- Immediate disable: When a user chooses Delete Account, the app calls `public.delete_user()`.
- Email tombstone: The function sets the email to `deleted+<uid>+<original>` in both `auth.users` and `public.users`.
- Access blocked: Sets `auth.users.banned_until` and `public.users.ban_time` far in the future; client logs the user out.
- Stop emails: `public.users.email` is changed and notifications/newsletters are disabled; `billing_email` is cleared.
- Audit: Original email hash is stored in `public.deleted_account`.
- Subscription: A background trigger (`/triggers/on_user_soft_delete`) cancels subscriptions for orgs where the user is the sole super admin.
- Purge: A daily cron runs `public.purge_deleted_users()` and permanently deletes accounts requested >30 days ago; this cascades and triggers existing `on_user_delete` handlers.

Notes

- Frontend no longer calls `auth.admin.deleteUser()`; it only calls the RPC and logs out.
- The original email becomes reusable for new registrations immediately.
