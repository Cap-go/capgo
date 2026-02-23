import type { Context } from 'hono'
import { quickError } from './hono.ts'
import { cloudlog, cloudlogErr } from './logging.ts'
import { getCurrentPlanNameOrg } from './supabase.ts'

/**
 * Validates that an organization has an Enterprise plan.
 * Throws a 403 error if the org is not on Enterprise plan.
 *
 * @param c - Hono context
 * @param orgId - Organization ID to validate
 * @throws {HTTPException} 403 if org is not on Enterprise plan
 */
export async function requireEnterprisePlan(c: Context, orgId: string): Promise<void> {
  try {
    const planName = await getCurrentPlanNameOrg(c, orgId)

    if (planName !== 'Enterprise') {
      cloudlog({
        requestId: c.get('requestId'),
        message: 'Enterprise plan required',
        orgId,
        currentPlan: planName,
      })
      return quickError(403, 'enterprise_plan_required', 'SSO requires Enterprise plan', {
        currentPlan: planName,
      })
    }

    cloudlog({
      requestId: c.get('requestId'),
      message: 'Enterprise plan verified',
      orgId,
    })
  }
  catch (error) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Error checking Enterprise plan',
      orgId,
      error,
    })
    throw error
  }
}

/**
 * Checks if an organization has a specific feature enabled.
 * Currently only supports 'sso' feature for Enterprise plan.
 * Extensible for future feature flags.
 *
 * @param c - Hono context
 * @param orgId - Organization ID
 * @param feature - Feature name to check (e.g., 'sso')
 * @returns true if org has the feature, false otherwise
 */
export async function hasFeature(c: Context, orgId: string, feature: string): Promise<boolean> {
  try {
    const planName = await getCurrentPlanNameOrg(c, orgId)

    // Map features to required plans
    const featureRequirements: Record<string, string[]> = {
      sso: ['Enterprise'],
    }

    const requiredPlans = featureRequirements[feature]
    if (!requiredPlans) {
      cloudlog({
        requestId: c.get('requestId'),
        message: 'Unknown feature',
        orgId,
        feature,
      })
      return false
    }

    const hasFeature = requiredPlans.includes(planName)

    cloudlog({
      requestId: c.get('requestId'),
      message: 'Feature check',
      orgId,
      feature,
      currentPlan: planName,
      hasFeature,
    })

    return hasFeature
  }
  catch (error) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Error checking feature',
      orgId,
      feature,
      error,
    })
    return false
  }
}
