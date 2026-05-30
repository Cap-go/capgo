import type { BentoTrackingPayload } from './tracking.ts'

/**
 * The CLI emits a `Bundle Incompatible` tracking event whenever a bundle's
 * native dependencies don't match the version currently live on the target
 * channel. It fires from two flows:
 * - `bundle upload` (after the new version is created), and
 * - the standalone `capgo bundle compatibility` command.
 *
 * We turn that into a Bento signal event so a lifecycle automation can react
 * (e.g. nudge the org toward a native rebuild / Capgo Builder). Delivery and
 * email gating are handled by `sendNotifToOrgMembers` via the dedicated
 * `bundle_incompatible` preference key. Mirrors `buildBuilderOnboardingBentoEvent`.
 */
export const BUNDLE_INCOMPATIBLE_EVENT = 'Bundle Incompatible'

export interface BundleCompatibilityBentoInput {
  /** The incoming tracking event name (must be 'Bundle Incompatible'). */
  event: string
  orgId: string | undefined
  appId: string | undefined
  /** Channel the bundle was checked against. */
  channel: string | undefined
  /** Which flow detected the incompatibility: 'upload' | 'command'. */
  source: string | undefined
  /**
   * New bundle being uploaded. Empty for the standalone command, which uploads
   * nothing — only the upload flow has a freshly created version.
   */
  versionNewId: string | undefined
  versionNewName: string | undefined
  /** Version currently live on the channel that the bundle was compared against. */
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

  const source = input.source ?? 'unknown'
  const channel = input.channel ?? ''
  const versionNewName = input.versionNewName ?? ''
  const versionOldName = input.versionOldName ?? ''

  return {
    event: 'bundle_incompatible',
    // Dedicated key — independent from other bundle/OTA email preferences.
    preferenceKey: 'bundle_incompatible',
    // Permanent per app+channel+version claim (no reopening cron window): repeated
    // incompatible uploads / `bundle compatibility` checks of the SAME version must
    // not re-email org admins. A genuinely new version has a different uniqId and
    // notifies on its own; the old version is the fallback for the command flow
    // (which uploads no new bundle).
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
