import type { CompatibilitySummary, NativePackage } from '../utils/bundle_compatibility.ts'
import type { Database } from '../utils/supabase.types.ts'
import { compareNativePackages, summarizeBundleCompatibility } from '../utils/bundle_compatibility.ts'

/**
 * Pure decision logic for the `compatibility_events` feature.
 *
 * These functions are intentionally side-effect free: they take fully-resolved
 * inputs (channel rows, bundle metadata) and return plain data describing the
 * rows the handler should upsert / resolve. All I/O (loading `native_packages`,
 * upserting, auto-resolving) stays in `on_channel_update.ts` so this module is
 * trivially unit-testable.
 *
 * Source of truth: docs/superpowers/specs/2026-06-03-compatibility-events-design.md
 */

type ChannelRow = Database['public']['Tables']['channels']['Row']

export type CompatibilityPlatform = 'ios' | 'android' | 'electron'

export const COMPATIBILITY_PLATFORMS: readonly CompatibilityPlatform[] = ['ios', 'android', 'electron']

export type CompatibilityEventSource = 'default_channel_version_changed' | 'default_channel_changed'

/** Metadata snapshot for one bundle, resolved by the handler from `app_versions`. */
export interface CompatibilityBundle {
  id: number
  name: string
  /** Raw `native_packages` (may be null/empty); decision logic applies exclusions. */
  nativePackages: NativePackage[] | null
}

/**
 * One previous-default candidate for a platform on which the new channel is the
 * current default. `bundle` is the previous default bundle that users currently
 * have installed; `source` distinguishes Case A (switch) from Case B (version
 * change).
 */
export interface PreviousDefault {
  platform: CompatibilityPlatform
  source: CompatibilityEventSource
  bundle: CompatibilityBundle | null
}

export interface DecideCompatibilityEventsInput {
  /** The new/current default channel row (`c.get('webhookBody')`). */
  newChannel: Pick<ChannelRow, 'id' | 'app_id' | 'owner_org' | 'name' | 'version' | 'public' | 'ios' | 'android' | 'electron' | 'disable_auto_update' | 'disable_auto_update_under_native'>
  /** The bundle the new default channel now points at (`app_versions` of `newChannel.version`). */
  currentBundle: CompatibilityBundle | null
  /** Per-platform previous-default candidates the handler resolved. */
  previousDefaults: readonly PreviousDefault[]
  /**
   * The channel row's `updated_at` at this change — the occurrence identity.
   * Part of the dedup key: a queue REDELIVERY of the same webhook carries the
   * same value (still idempotent), while a genuine re-occurrence of the same
   * transition carries a new one and inserts a fresh, unresolved row.
   */
  changeOccurredAt: string
  /**
   * Unresolved events already on file for this channel, used to recognize a
   * REVERT: when the new default bundle is the `previous_version` of an
   * unresolved event, users are being returned to the baseline they are
   * already on, so no new (mirror) event should be raised — otherwise the
   * recommended remediation (roll the channel back) would itself raise a fresh
   * unresolved event, forever.
   */
  unresolvedEvents?: readonly UnresolvedCompatibilityEvent[]
}

/**
 * Row shape inserted into `public.compatibility_events`. Defined locally because
 * the generated Supabase types lag the migration; the handler casts the typed
 * client at the single upsert call-site.
 */
export interface CompatibilityEventInsert {
  org_id: string
  app_id: string
  source: CompatibilityEventSource
  platform: CompatibilityPlatform
  channel_id: number | null
  channel_name: string
  current_version_id: number | null
  current_version_name: string
  previous_version_id: number | null
  previous_version_name: string
  offenders: string[]
  change_occurred_at: string
}

/**
 * Metadata strategy: when the default channel forces an exact version match the
 * native-compatibility verdict does not gate delivery, mirroring the Bento email
 * gating. Skip these entirely.
 */
function usesMetadataStrategy(channel: Pick<ChannelRow, 'disable_auto_update'>): boolean {
  return channel.disable_auto_update === 'version_number'
}

/**
 * A bundle contributes to the verdict only if it carries `native_packages`. A
 * missing/empty array means we cannot compute a meaningful diff, so we exclude
 * the comparison (matching the existing email behavior).
 */
function hasNativePackages(bundle: CompatibilityBundle | null | undefined): bundle is CompatibilityBundle & { nativePackages: NativePackage[] } {
  return Boolean(bundle && Array.isArray(bundle.nativePackages) && bundle.nativePackages.length > 0)
}

/**
 * Compute the incompatible events to upsert for one channel change.
 *
 * For each platform the new channel is currently default on, compare the current
 * default bundle (candidate, shipped OTA) against the previous default bundle
 * (baseline, already installed). Emit one event per platform that is
 * **incompatible**, snapshotting offenders + version names so the row survives
 * the 90-day bundle purge.
 *
 * Exclusions (return no events for the platform):
 * - new channel is not public (not a default);
 * - the channel platform flag is false;
 * - `disable_auto_update = 'version_number'` (metadata strategy);
 * - either bundle is missing `native_packages`;
 * - current and previous bundle are the same bundle id (no real change).
 *
 * Soft-deleted baselines are NOT dropped: a previous bundle that is flagged
 * `deleted` but still carries `native_packages` is a valid baseline (users still
 * run it). The handler only excludes when the metadata is genuinely unavailable.
 */
export function decideCompatibilityEvents(input: DecideCompatibilityEventsInput): CompatibilityEventInsert[] {
  const { newChannel, currentBundle, previousDefaults, changeOccurredAt, unresolvedEvents = [] } = input

  // The new channel must be a default (public) for any platform to matter.
  if (!newChannel.public)
    return []

  // Metadata strategy disables the OTA-compatibility gate entirely.
  if (usesMetadataStrategy(newChannel))
    return []

  // No current bundle metadata -> cannot compute a verdict.
  if (!hasNativePackages(currentBundle))
    return []

  const events: CompatibilityEventInsert[] = []

  for (const previous of previousDefaults) {
    // The channel must currently be default for this platform.
    if (!newChannel[previous.platform])
      continue

    // Missing baseline metadata -> skip (exclusion), but never because the row
    // was merely soft-deleted.
    if (!hasNativePackages(previous.bundle))
      continue

    // Same bundle on both sides -> nothing changed for this platform.
    if (previous.bundle.id === currentBundle.id)
      continue

    // REVERT: this change is the exact inverse of an unresolved event for this
    // channel+platform (current/previous swapped) — i.e., the channel returns to
    // the baseline the event says users are on, which is the remediation the
    // event recommends, not a new incompatibility. Raising a mirror event here
    // would loop forever (each rollback raising the next event). The matching
    // unresolved event is auto-resolved by decideAutoResolves on this same pass.
    // Requiring BOTH ids to match keeps any non-inverse transition (e.g. an
    // 800 -> 600 change while a 600 -> 700 event is open) raising its own event.
    //
    // Only safe to suppress while the channel's downgrade guard is on:
    // `disable_auto_update_under_native` makes the update endpoint refuse to
    // serve a bundle below a device's native version, so devices that already
    // installed the newer native build cannot receive the rolled-back bundle.
    // With the guard off that delivery is possible and the event must be raised.
    if (newChannel.disable_auto_update_under_native) {
      // hasNativePackages' narrowing does not carry into the closure below.
      const previousBundleId = previous.bundle.id
      const isDirectRollback = unresolvedEvents.some(event =>
        event.channel_id === newChannel.id
        && event.platform === previous.platform
        && event.previous_version_id === currentBundle.id
        && event.current_version_id === previousBundleId,
      )
      if (isDirectRollback)
        continue
    }

    const summary: CompatibilitySummary = summarizeBundleCompatibility(
      compareNativePackages(currentBundle.nativePackages, previous.bundle.nativePackages),
    )

    if (summary.compatible)
      continue

    events.push({
      org_id: newChannel.owner_org,
      app_id: newChannel.app_id,
      source: previous.source,
      platform: previous.platform,
      channel_id: newChannel.id,
      channel_name: newChannel.name,
      current_version_id: currentBundle.id,
      current_version_name: currentBundle.name,
      previous_version_id: previous.bundle.id,
      previous_version_name: previous.bundle.name,
      offenders: summary.offenders,
      change_occurred_at: changeOccurredAt,
    })
  }

  return events
}

/** Minimal shape of an unresolved event the auto-resolver reasons about. */
export interface UnresolvedCompatibilityEvent {
  id: number
  platform: CompatibilityPlatform
  channel_id: number | null
  previous_version_id: number | null
  previous_version_name: string
  current_version_id: number | null
}

/** The current default (post-change) bundle for a platform, resolved by the handler. */
export interface CurrentDefaultForPlatform {
  platform: CompatibilityPlatform
  bundle: CompatibilityBundle | null
}

export interface CompatibilityAutoResolve {
  id: number
  note: string
}

/**
 * Decide which unresolved events should auto-resolve.
 *
 * An event auto-resolves when the **current** default bundle for its platform is
 * now OTA-compatible with the event's `previous_version` (the baseline users had
 * when the event was raised) — e.g. a revert to a compatible bundle, or a fixed
 * bundle. This is descriptive only: we attach a generated note explaining the
 * state cleared; we never prompt anyone to revert.
 *
 * Critically it must NOT fire on a native-identical *successor*: if the current
 * default is the very same bundle that raised the event (`current_version_id`),
 * the stranded users are still stranded — only a different, compatible default
 * clears it. We therefore skip when the current default bundle id equals the
 * event's `current_version_id`.
 */
export function decideAutoResolves(
  unresolvedEvents: readonly UnresolvedCompatibilityEvent[],
  currentDefaultByPlatform: readonly CurrentDefaultForPlatform[],
  bundlesById: ReadonlyMap<number, CompatibilityBundle>,
): CompatibilityAutoResolve[] {
  const currentByPlatform = new Map(currentDefaultByPlatform.map(entry => [entry.platform, entry.bundle]))
  const resolves: CompatibilityAutoResolve[] = []

  for (const event of unresolvedEvents) {
    const currentBundle = currentByPlatform.get(event.platform)
    if (!hasNativePackages(currentBundle))
      continue

    // The successor that raised the event is not a resolution: an OTA-identical
    // re-upload leaves users stranded. Only a *different* compatible default
    // clears it.
    if (event.current_version_id != null && currentBundle.id === event.current_version_id)
      continue

    if (event.previous_version_id == null)
      continue

    const baseline = bundlesById.get(event.previous_version_id)
    if (!hasNativePackages(baseline))
      continue

    const summary = summarizeBundleCompatibility(compareNativePackages(currentBundle.nativePackages, baseline.nativePackages))
    if (!summary.compatible)
      continue

    resolves.push({
      id: event.id,
      note: `Default channel returned to ${currentBundle.name}, which is compatible with ${event.previous_version_name}.`,
    })
  }

  return resolves
}
