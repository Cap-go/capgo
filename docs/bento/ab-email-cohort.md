# Email experiment enrollment

The generic allocator supports `treatment_percentage_by_intent`, common
`required_assignments`, intent-specific `required_assignments_by_intent`,
`allocation: "deterministic"`, `assign_control: false`, and
`enroll_new_users_after`. Dependencies are validated (known experiment and branch,
no cycles) and resolved in canonical topological order in the same locked user
transaction. Intent-specific requirements extend common requirements.

- `new_emails`: new allocations are 100% treatment for self-signup accounts with
  exact `exploring` or `both` intent. Eligible existing A/B branches are retained;
  OTA, Builder and unknown intents lose stale assignments and provider tags.
- `new_emails_v2`: prospective signup enrollment only, including invited accounts.
  OTA selects 50% by a stable hash of experiment name and user ID. Other OTA users
  have **no assignment and neither v2 tag**, rather than a control assignment.
  Builder selects 100% of enrolled accounts whose resolved
  `builder_todo_list_v4` assignment is treatment A. Existing Builder controls stay
  controls. Prerequisite experiments keep their existing allocation behavior.
- Enrollment requires both an account creation time at or after the configured
  cutoff and a server-written `onboarding.abtests_enrolled` entry. Only the user
  creation handler writes that entry. An on-demand request cannot enroll a prior
  account, including accounts created after the cutoff whose creation handler
  did not run this version. Delayed pre-cutoff creation events cannot enroll.
- Unknown, missing or ineligible intent defers assignment but retains enrollment.
  Changing intent removes stale assignments without replenishing enrollment or
  changing the deterministic bucket. A Builder treatment user returning to OTA
  must qualify for the same OTA bucket as before. Existing eligible legacy
  branches and unrelated/retired experiment data are preserved. Malformed eligible
  entries are repaired as missing assignments; read-only tag rendering omits them.
- Nonselected OTA decisions need no control branch: the protected enrollment and
  immutable user ID determine the same result on every retry. Missing IDs,
  invalid creation times, missing enrollment and unmet prerequisites fail closed.

## Protected state and consumer contract

Apply `20261017143015_protect_user_ab_test_enrollment.sql` before treating these
fields as trusted. It prevents authenticated/anonymous INSERT/UPDATE from
creating, changing or deleting `onboarding.abtests`, `abtests_enrolled` or
`abtests_bento_sync`, and preserves `users.created_at` on client updates. Intent
and normal onboarding progress remain editable. JWT and SET ROLE context are
checked even when a user-facing SECURITY DEFINER wrapper owns the write.
Backend database/service-role writes remain authorized.

The persisted assignment representation remains:

```json
{ "new_emails_v2": { "branch": "A", "assigned_at": "2026-10-18T00:00:00.000Z" } }
```

Lifecycle evaluation must **read** the original organization's creator and that
person's current protected enrollment and assignment. Require v2 branch A, a
valid assignment timestamp, the prospective creation cutoff and exact matching
intent; Builder also requires current checklist treatment A. Fail closed when
creator or assignment cannot be resolved. Do not call the enrollment API from a
scheduler, interpret a Bento tag as authority, or use the current caller/app
creator/billing owner in place of the original creator. Recipient consent and
current organization access are separate lifecycle gates.

## Activation order

Merge and apply this PR's protection migration and deploy the A/B engine before
the lifecycle consumer trusts enrollment. Then merge the lifecycle producer and
matching managed JSON senders. Verify sender readiness before explicitly enabling
the lifecycle contract and global dispatch controls. This PR emits no lifecycle
sender events, enables no dispatch controls, and performs no backfill or live
Bento deployment. Cohort tags alone do not authorize lifecycle sends. Legacy
suppression must remain inactive until the lifecycle sender readiness gate passes.
The sender event contract is owned by the lifecycle PR.

## Database execution model

The new invoker trigger runs once per inserted/updated user row, only when an
INSERT or an UPDATE naming `onboarding`/`created_at` occurs. Reachable roles are
anon, authenticated, service_role and the backend connection role. It reads only
NEW/OLD row values and connection settings; it scans no tables, calls no RBAC or
identity RPC, and performs three bounded JSON-key operations. Existing user
onboarding is capped at 65,536 bytes. Its work does not depend on organization,
app, manifest or user-table cardinality, and adds zero function calls to SELECT,
RLS policies, RPCs, plugin endpoints or unfiltered PostgREST reads.

Assignment persistence uses the existing `users` primary-key lookup and
`FOR UPDATE` lock by user UUID. Signup enrollment, current intent, prerequisites,
assignment changes and pending tag synchronization are reconciled together;
provider calls happen after the transaction. Revocation deletes both tags, even
for a test whose default percentage is zero and whose intent override is active.
On-demand delivery is bounded to three provider calls and five seconds, with a
persisted pending state; signup rejection fails the creation queue for retry.

Local PostgreSQL 17 evidence with 100,000 synthetic user rows: each protected
UPDATE used `users_pkey` with `rows=1`, no table scan. Trigger time was 0.116 ms
for authenticated, 0.009 ms for anon and 0.011 ms for service_role (one call each);
statement execution was 2.029 / 0.029 / 0.034 ms respectively. These measurements
cover the new trigger, not production RLS performance. Public/invalid-key/broad
API-key/many-org/unfiltered SELECT cases execute no new function because this PR
adds no read-policy function call; their existing permission/query paths remain
unchanged. The accompanying PostgreSQL regression covers both database roles and
JWT contexts, including a SECURITY DEFINER write, and PostgREST coverage exercises
an authenticated own-profile update plus a service-role update.
