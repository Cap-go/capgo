/**
 * Demo app prefix used to identify demo apps.
 * Demo apps are created for non-technical users during onboarding and are auto-deleted after 14 days.
 */
export const DEMO_APP_PREFIX = 'com.capdemo.'

/**
 * Check if an app is a demo app by checking if the app_id starts with the demo prefix.
 * No database query needed - just a simple string check.
 *
 * @param appId - The app_id to check
 * @returns true if the app is a demo app
 */
export function isAppDemo(appId: string): boolean {
  return appId.startsWith(DEMO_APP_PREFIX)
}
