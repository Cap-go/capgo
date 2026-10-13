# Deleted-version manifest cleanup

`on_version_update` removes the deleted version's `public.manifest` rows without
checking other versions or touching delta objects in R2. Both shared objects and
objects with no remaining manifest references stay physically intact. Orphaned
delta storage therefore accumulates until a separately implemented collector is
enabled. Row deletions continue to replicate normally. Inventory, notifications,
upload protocols and queue configuration are unchanged.

One write pool runs sequential Drizzle transactions of at most 1,000 rows,
starting from `idx_manifest_app_version_id_file_hash`. A pass stops after 20
batches or ten seconds between batches; statements have a five-second timeout
and lock waits a two-second timeout. Incomplete passes raise the existing cleanup
error; committed batches survive retries and the existing 15-minute sweeper
requeues remaining work. Queue reads remain capped at five. A 5,000-file bundle
needs five deletion transactions, with no per-file connections or network calls.

The last row deletion and version/app counter finalization commit together.
Retries cannot double-decrement `manifest_bundle_count`, including legacy rows
whose version count was zero. JSON manifests are cleared during finalization.
Cleanup and manifest persistence take the existing per-version advisory lock and
lock the version row. Persistence rechecks deletion while locked, so an upload
that passed its earlier route check cannot insert into a deleted version.

Recovery rows already in `manifest_trash_restore_pending` are retained. Before
removing references, the handler restores at most 100 recorded paths per pass,
in waves of ten, committing successful restores and retaining failures. Failed
paths receive `last_attempted_at` and rotate behind unattempted paths using the
version/retry index, so persistent failures cannot starve later recovery. Recovery
runs even for versions with zero manifest rows/count. The sweeper rotates versions by their last requeue time and also revisits
pending-only versions and leaves counter finalization to the handler. Normal
cleanup never creates a pending restore. Keep the table and recovery helper
through cutover: old workers can still record recovery entries. Removal requires
a separate approved cleanup after cutover and recovery verification.

Deploy the migration before or with the handler. Complete the worker cutover and
allow old in-flight handlers to drain before relying on zero new delta trash
operations. Do not deploy a replacement physical collector with this change.
Channel unlinking, bundle cache purge, metadata/storage-statistics updates and
canonical version-owned ZIP trash/retry remain part of version deletion.

The sweeper remains a service-role-only cron RPC, called once per sweep. Its
candidate search starts from deleted versions ordered by `updated_at, id`
(`idx_app_versions_deleted_manifest_retry`); each manifest/pending probe uses the
`app_version_id` index or `(app_version_id, s3_path)` primary key. It updates at
most the requested batch. No new RLS function, public RPC, cron, or extension is
introduced. Cleanup queries target one version; they do not scan all manifests.
