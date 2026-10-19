import type { RouteLocationNormalized, RouteLocationRaw } from 'vue-router'
import { useSupabase } from '~/services/supabase'
import { useOrganizationStore } from '~/stores/organization'
import { shouldSkipOnboardingResume } from '~/utils/appOnboardingProgress'
import { lifecycleOrganizationTarget } from '~/utils/lifecycleOrganizationLink'

// Only email setup visits use this resolver. A static URL carries app identity,
// never a send-time completion snapshot or permission to access another org.
export async function lifecycleSetupNavigation(to: RouteLocationNormalized): Promise<RouteLocationRaw | undefined> {
  const store = useOrganizationStore()
  const selection = (orgId?: string) => ({ path: '/apps', query: orgId ? { oid: orgId, source: 'capgo_lifecycle' } : { source: 'capgo_lifecycle', lifecycleSelect: '1' } })
  let authorizedOrg: string | undefined
  try {
    await store.awaitInitialLoad()
    const orgId = lifecycleOrganizationTarget(to.query, store.organizations)
    const appId = 'app' in to.params ? to.params.app : null
    if (!orgId || typeof appId !== 'string' || !appId)
      return selection()
    authorizedOrg = orgId

    const supabase = useSupabase()
    const { data: app, error } = await supabase.from('apps')
      .select('app_id,owner_org')
      .eq('app_id', appId)
      .eq('owner_org', orgId)
      .maybeSingle()
    if (error || !app || app.app_id !== appId || app.owner_org !== orgId)
      return selection(orgId)

    // A failed verification keeps normal setup, whose own verification can
    // recover. Never make an unfinished visit read-only on stale evidence.
    let completedView = false
    try {
      const verified = await supabase.rpc('verify_getting_started', { p_app_id: appId })
      completedView = !verified.error && verified.data != null && shouldSkipOnboardingResume(verified.data)
    }
    catch {
      // The normal setup page can retry its own verification.
    }
    const query = { ...to.query }
    if (completedView)
      query.showChecklist = '1'
    else
      delete query.showChecklist
    if (to.query.showChecklist === query.showChecklist)
      return
    // PR #3741 supplies the completed-checklist view. It must be deployed
    // before lifecycle activation; normal unfinished behavior stays intact.
    return { path: to.path, query, hash: to.hash, replace: true }
  }
  catch {
    return selection(authorizedOrg)
  }
}
