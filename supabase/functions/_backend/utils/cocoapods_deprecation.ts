import type { Context } from 'hono'
import { cloudlog, cloudlogErr, serializeError } from './logging.ts'
import { sendNotifToOrgMembers } from './org_email_notifications.ts'
import { closeClient, getDrizzleClient, getPgClient } from './pg.ts'
import { sendEventToTracking } from './tracking.ts'

/** Bento event: the email template that explains why to leave CocoaPods lives in Bento. */
export const COCOAPODS_DEPRECATION_EVENT = 'org:ios_cocoapods_deprecation'
/** The CocoaPods trunk becomes read-only on this date: no new or updated pods after it. */
export const COCOAPODS_TRUNK_READ_ONLY = '2026-12-02'
/** iOS 27 SDK builds (Swift Package Manager only) become the default on this date. */
export const IOS_27_SDK_DEFAULT = '2027-01-01'
const MIGRATION_GUIDE_URL = 'https://capacitorjs.com/docs/ios/spm'
/** At most one reminder per app and per week while the app keeps building with CocoaPods. */
const REMINDER_CRON = '0 0 * * 1'

/**
 * Emails the org admins (Bento event COCOAPODS_DEPRECATION_EVENT) when an iOS build still uses
 * CocoaPods: the CocoaPods trunk freezes in December 2026, so pods stop getting updates and security fixes.
 * Best effort: never fails the build request.
 */
export async function notifyCocoaPodsDeprecation(c: Context, input: {
  orgId: string
  appId: string
  iosDependencyManager: 'cocoapods'
}) {
  let pgClient: Awaited<ReturnType<typeof getPgClient>> | undefined
  try {
    pgClient = await getPgClient(c, true)
    const sent = await sendNotifToOrgMembers(c, COCOAPODS_DEPRECATION_EVENT, 'builder_onboarding', {
      app_id: input.appId,
      ios_dependency_manager: input.iosDependencyManager,
      trunk_read_only: COCOAPODS_TRUNK_READ_ONLY,
      ios_27_sdk_default: IOS_27_SDK_DEFAULT,
      migration_guide_url: MIGRATION_GUIDE_URL,
    }, input.orgId, input.appId, REMINDER_CRON, getDrizzleClient(pgClient))
    if (sent === true) {
      cloudlog({ requestId: c.get('requestId'), message: 'CocoaPods deprecation email sent', org_id: input.orgId, app_id: input.appId })
      await sendEventToTracking(c, {
        channel: 'build-lifecycle',
        event: 'iOS CocoaPods deprecation email',
        user_id: input.orgId,
        groups: { organization: input.orgId },
        tags: { app_id: input.appId, ios_dependency_manager: input.iosDependencyManager },
      }).catch(() => {})
    }
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'CocoaPods deprecation email failed', org_id: input.orgId, app_id: input.appId, error: serializeError(error) })
  }
  finally {
    if (pgClient)
      await closeClient(c, pgClient)
  }
}
