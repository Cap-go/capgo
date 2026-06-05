import type { BentoTrackingPayload } from './tracking.ts'

/**
 * The CLI emits a `Bundle Incompatible` tracking event when a `bundle upload`'s
 * native dependencies don't match the version currently live on the channel.
 * PostHog records every such upload; this helper builds the Bento payload only
 * when the incompatible bundle actually went live — i.e. the upload overwrote
 * the channel's version (`channelOverwritten`) — so org admins are emailed only
 * when it can affect users. Delivery + email gating run through
 * `sendNotifToOrgMembers` via the dedicated `bundle_incompatible` preference key.
 * Mirrors `buildBuilderOnboardingBentoEvent`.
 */
export const BUNDLE_INCOMPATIBLE_EVENT = 'Bundle Incompatible'

export interface BundleCompatibilityBentoInput {
  /** The incoming tracking event name (must be 'Bundle Incompatible'). */
  event: string
  orgId: string | undefined
  appId: string | undefined
  /**
   * True only when the upload overwrote the channel's live version. The Bento
   * email is built only in that case; PostHog still records every incompatible
   * upload upstream.
   */
  channelOverwritten: boolean | undefined
  /** Channel the bundle was checked against. */
  channel: string | undefined
  /** Which flow emitted the event (currently always 'upload'). */
  source: string | undefined
  /** The freshly uploaded bundle (its id is resolved server-side). */
  versionNewId: string | undefined
  versionNewName: string | undefined
  /** Version that was live on the channel before this upload. */
  versionOldId: string | undefined
  versionOldName: string | undefined
  orgName: string | undefined
  appName: string | undefined
}

/**
 * Pure: decide whether this event should emit a Bento signal and build its
 * payload. Returns undefined when nothing should be emitted (wrong event name,
 * or missing org/app context).
 */
export function buildBundleCompatibilityBentoEvent(input: BundleCompatibilityBentoInput): BentoTrackingPayload | undefined {
  if (input.event !== BUNDLE_INCOMPATIBLE_EVENT)
    return undefined
  if (!input.orgId || !input.appId)
    return undefined
  // Email gate: only build a payload when the incompatible bundle actually went
  // live (the upload overwrote the channel's version). PostHog still records the
  // event upstream regardless of this.
  if (!input.channelOverwritten)
    return undefined

  const source = input.source ?? 'unknown'
  const channel = input.channel ?? ''
  const versionNewName = input.versionNewName ?? ''
  const versionOldName = input.versionOldName ?? ''

  return {
    event: 'bundle_incompatible',
    // Dedicated key — independent from other bundle/OTA email preferences.
    preferenceKey: 'bundle_incompatible',
    // Permanent per app+channel+version claim (no reopening cron window): repeated
    // incompatible uploads of the SAME version must not re-email org admins. A
    // genuinely new version has a different uniqId and notifies on its own.
    once: true,
    uniqId: `bundle_incompatible:${input.appId}:${channel}:${versionNewName || versionOldName}`,
    data: {
      org_id: input.orgId,
      org_name: input.orgName ?? '',
      app_id: input.appId,
      app_name: input.appName ?? '',
      channel,
      source,
      version_new_id: input.versionNewId ?? '',
      version_new_name: versionNewName,
      version_old_id: input.versionOldId ?? '',
      version_old_name: versionOldName,
    },
  }
}
