import type { Context } from 'hono'
import { cloudlog } from './logging.ts'
import { supabaseAdmin } from './supabase.ts'

/**
 * Check if an app is a demo app.
 * Demo apps are created for non-technical users during onboarding and are auto-deleted after 14 days.
 *
 * @param c - Hono context
 * @param appId - The app_id to check
 * @returns true if the app is a demo app, false otherwise (including on error)
 */
export async function isAppDemo(c: Context, appId: string): Promise<boolean> {
  const { data: appData, error } = await supabaseAdmin(c)
    .from('apps')
    .select('is_demo')
    .eq('app_id', appId)
    .single()

  if (error) {
    cloudlog({ requestId: c.get('requestId'), message: 'Error checking demo app status', appId, error })
    return false
  }

  return appData?.is_demo === true
}
