import type { Context } from 'hono'
import { cloudlog, cloudlogErr, serializeError } from './logging.ts'
import { sendNotifToOrgMembers } from './org_email_notifications.ts'
import { closeClient, getDrizzleClient, getPgClient } from './pg.ts'
import { sendEventToTracking } from './tracking.ts'

/** Bento event: the email template that explains the CocoaPods end of support lives in Bento. */
export const COCOAPODS_DEPRECATION_EVENT = 'org:ios_cocoapods_deprecation'
/** Capgo Cloud Build stops building CocoaPods iOS projects on this date. */
export const COCOAPODS_END_OF_SUPPORT = '2026-12-01'
const MIGRATION_GUIDE_URL = 'https://capacitorjs.com/docs/ios/spm'
/** At most one reminder per app and per week while the app keeps building with CocoaPods. */
const REMINDER_CRON = '0 0 * * 1'

/**
 * Emails the org admins (Bento event COCOAPODS_DEPRECATION_EVENT) when an iOS build still uses
 * CocoaPods: Capgo Cloud Build only builds Swift Package Manager projects from December 2026.
 * Best effort: never fails the build request.
 */
export async function notifyCocoaPodsDeprecation(c: Context, input: {
  orgId: string
  appId: string
  iosDependencyManager: 'cocoapods'
}) {
  const pgClient = await getPgClient(c, true)
  try {
    const sent = await sendNotifToOrgMembers(c, COCOAPODS_DEPRECATION_EVENT, 'builder_onboarding', {
      app_id: input.appId,
      ios_dependency_manager: input.iosDependencyManager,
      end_of_support: COCOAPODS_END_OF_SUPPORT,
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
    await closeClient(c, pgClient)
  }
}
