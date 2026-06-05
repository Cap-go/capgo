// Read-only frontend helpers for the `compatibility_events` history surface.
//
// The backend (`on_channel_update`) is the single site that computes and writes
// these rows (see docs/superpowers/specs/2026-06-03-compatibility-events-design.md).
// The frontend never computes a compatibility verdict and never writes here — it
// only renders the snapshotted rows and offers the manual-accept RPC elsewhere.

import type { Database } from '~/types/supabase.types'

type GeneratedCompatibilityEventRow = Database['public']['Tables']['compatibility_events']['Row']

/**
 * Generated row with `offenders` narrowed from `Json` to `string[]`: the backend
 * handler (`on_channel_update`) is the sole writer and always persists the
 * offending package names as a string array.
 */
export type CompatibilityEventRow = Omit<GeneratedCompatibilityEventRow, 'offenders'> & {
  offenders: string[]
}

const PLATFORM_LABELS: Record<string, string> = {
  ios: 'iOS',
  android: 'Android',
  electron: 'Electron',
}

/**
 * Human-friendly platform name. Falls back to the raw value for any future
 * platform the table may carry that this map does not yet know about.
 */
export function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform
}

/**
 * True once the event has been resolved (auto-compatible revert or a manual
 * accept). The banner counts only unresolved events.
 */
export function isResolved(row: Pick<CompatibilityEventRow, 'resolved_at'>): boolean {
  return row.resolved_at != null
}

/**
 * Describe how (and why) an event was resolved, for the history row.
 *
 * - `auto_compatible`: the default became compatible again on its own. The
 *   generated note already reads as a full sentence, so it is surfaced verbatim.
 * - `accepted`: a human acknowledged an intended native release. Rendered as
 *   `Accepted by <user> — <note>` (the user label is resolved by the caller from
 *   `resolved_by`; pass it in, or omit for a generic "a team member").
 *
 * Returns `null` for an unresolved event (nothing to describe yet).
 */
export function reasonLabel(
  row: Pick<CompatibilityEventRow, 'resolved_at' | 'resolution_kind' | 'resolution_note'>,
  acceptedByLabel?: string | null,
): string | null {
  if (!isResolved(row))
    return null

  const note = row.resolution_note?.trim() ?? ''

  if (row.resolution_kind === 'auto_compatible')
    return note.length > 0 ? note : 'Resolved automatically — the default became compatible again.'

  if (row.resolution_kind === 'accepted') {
    const who = acceptedByLabel?.trim() ? acceptedByLabel.trim() : 'a team member'
    return note.length > 0 ? `Accepted by ${who} — ${note}` : `Accepted by ${who}`
  }

  // Resolved with an unexpected kind: surface the note if present.
  return note.length > 0 ? note : null
}

/**
 * Link to the existing bundle dependency-diff view for this event, comparing the
 * current default bundle against the previous one:
 * `/app/:app/bundle/:current/dependencies?compare=:previous`.
 *
 * Returns `null` when either bundle id has been purged (the diff page needs both
 * concrete ids to render a comparison).
 */
export function dependencyDiffPath(
  appId: string,
  row: Pick<CompatibilityEventRow, 'current_version_id' | 'previous_version_id'>,
): string | null {
  if (row.current_version_id == null || row.previous_version_id == null)
    return null

  return `/app/${appId}/bundle/${row.current_version_id}/dependencies?compare=${row.previous_version_id}`
}
