# Invitation reminders through the Bento dispatcher

The initial invitation email is sent by the existing Cloudflare email sender.
After that provider acceptance is saved, a database trigger schedules two
reminders in `public.bento_event_dispatches`. This is the only new table.

The dedicated `capgo-bento-dispatch-prod` Worker has a minutely cron producer and
a queue consumer. The cron publishes one message for each reminder operation and
each of five portions. The single queue delivers one message per invocation
(`max_batch_size = 1`), with at most five concurrent invocations.

## Reminder schedule and replacement flows

There are four independent event → email → exit flows. Their definitions and
unchanged source HTML are in
[`cloudflare_workers/bento_dispatch/bento/`](../cloudflare_workers/bento_dispatch/bento/flows.json).
The JSON is a recreation specification, not a native Bento import format.

| Event | Due time | Email subject |
| --- | --- | --- |
| `org:invite_new_user_reminder_1` | Initial email accepted + 2 days | Reminder: accept your … Capgo invite |
| `org:invite_new_user_reminder_2` | Earlier of initial acceptance + 7 days or token expiry − 1 hour | Reminder: join … on Capgo |
| `org:invite_existing_user_reminder_1` | Initial email accepted + 2 days | Last nudge: join … on Capgo |
| `org:invite_existing_user_reminder_2` | Initial email accepted + 7 days | Last nudge: … is waiting on Capgo |

These subjects and bodies reflect the inspected existing flow, including its
existing first-reminder naming. New-user tokens expire seven days after their
current creation/update time, so the final reminder intentionally precedes expiry.
The initial email is never duplicated in these flows.

For each replacement flow:

1. Match its event type exactly.
2. Send its specified email immediately, with `transactional = true` and the
   existing `5_minutes` throttle.
3. Exit the flow. Scheduling and invitation eligibility are handled by the Worker.

Use `event.details.org_name_subject` in the subject. The body fields `org_name`,
`org_admin_name`, `invited_first_name`, and `invited_last_name` are already HTML
escaped; the subject field is plain text with line breaks removed. The HTML files
retain the existing Liquid body fields. `invite_link` is constructed from the
configured HTTPS console origin and the current encoded invitation identity.
`dispatch_id` and `unique.key` contain the stable dispatch UUID for inspection;
correctness does not depend on Bento deduplicating it.

All four source emails were inspected using Bento Unofficial. Remote Bento edits
and publication are deferred to the manual cutover; this PR does not alter the
live invitation flow. In a local Bento editor, each Send Email node must retain
or receive its own unique template ID. Copy source content, not another node's
template assignment.

## Dispatch state and concurrency

Each table row represents one logical event, uniquely identified by
`(tag, recipient_key, context_key)`. The context is the existing initial-email
request generation UUID. A resend replaces that generation, making previously
scheduled reminders obsolete. Existing users use their user UUID as recipient
identity; new users use normalized email.

The table stores `due_at`, portion, attempts, the most recent attempt time, a
claim token/expiry, `accepted_at`, cancellation time, and a fixed error code.
An indexed due lookup atomically claims at most five rows. Claims expire after
120 seconds, and acknowledgement/failure writes require the same claim token.
The table is private to internal service-role operations with explicit RLS denial
for user-facing roles.

Before each Bento call, the consumer reloads the current request generation,
recipient, organization and invitation from primary keys. Accepted, deleted,
cancelled, expired or superseded invitations are skipped. New invitation tokens
and names are rebuilt from current data; tokens are not copied into queue jobs
or the dispatch table.

At most five provider requests run concurrently within a job. Each has a
10-second timeout; the Worker starts at most three groups and starts another
group only while its 40-second soft budget has at least 20 seconds remaining.
Database statements and connection attempts have five-second limits. The current
group is awaited to completion before acknowledgement, and no provider request
runs inside a database transaction. The claim lease covers the bounded group;
the queue runtime permits substantially longer execution.

A short database transaction also caps all dispatcher claims at 60 per rolling
minute. The indexed `last_attempt_at` window and a transaction advisory lock
coordinate this budget across invocations without another table. Failed attempts
wait at least one minute before another claim. This leaves room below Bento's
documented default of 100 requests/minute, although other Bento producers still
share that account limit and may cause transient rejection.

Application attempts are capped at five across every cron and queue delivery.
Queue retries are four after the first delivery, also five total. A partial job
retry skips already accepted rows. Remaining work after a bounded successful job
stays due for the next cron rather than spending retries on pagination.

`accepted_at` means Bento acknowledged the event, not that an email reached the
inbox. A crash after remote acceptance but before saving the marker can still
repeat an event. This is an accepted limitation; the four short reminder flows
must tolerate occasional duplicate entry. Bento may also delay the email until
after the invitation state changes.

## Deployment and cutover

The production release workflow provisions the one queue and deploys this Worker
after database migrations succeed. The Worker has no public HTTP entrypoint.
The default is inactive: a missing activation setting is treated as false.

1. Deploy the migration and Worker through the normal release process. Existing
   already-sent invitations are not backfilled. Newly acknowledged initial emails
   begin accumulating scheduled records.
2. Prepare and manually publish the four replacement Bento flows. Verify the
   exact new event names, unique email-node assignments, subject field, current
   link, transactional setting and throttle. Keep the old flow's existing sessions
   separate from the new event roots during cutover.
3. Supply `BENTO_PUBLISHABLE_KEY`, `BENTO_SECRET_KEY`, `BENTO_SITE_UUID` and
   `WEBAPP_URL` in Vault-backed settings using those exact names. Existing Worker
   environment secrets can instead provide explicit deployment-time overrides.
   `WEBAPP_URL` must be an HTTPS origin without credentials, a path, query or hash.
   Keep the credentials and site in the same Bento environment as the four flows.
4. Set Vault-backed `BENTO_EVENT_DISPATCH_ENABLED` to `true` after the flows are
   published. An explicit Worker environment value overrides that setting.
5. Verify `bento_dispatch_job` logs and `accepted_at` on a controlled invitation
   before broad activation. Monitor queue backlog, failed/exhausted table records,
   cancellation counts, and the database/provider error events.

To pause or roll back, set activation to `false`; initial invitations continue
through their existing sender. Queued scan jobs are harmlessly acknowledged while
disabled; dispatch rows retain their state. Reactivation scans due rows again,
including overdue reminders whose invitations remain eligible. Review backlog
before resuming after an extended pause. Do not clear accepted markers or reset
attempt counts to retry an exhausted dispatch.

## Extending the system

Add an operation to the registry, a producer for its scheduled dispatch rows,
and an eligibility/payload builder. All operations reuse the same queue, claims,
provider budget and acceptance markers. Use a new tag for a new email purpose,
and a context key for a repeat occurrence; never use an email subject as identity.
