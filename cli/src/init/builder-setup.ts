import type { OnboardingBuilderOptions } from '../build/onboarding/command'
import { getBuilderOnlyChecklist } from '../app/builder-checklist'
import { formatCapgoCliInvokeError, getCapgoCliHttpStatus, invokeCapgoCliApi } from '../utils'

type SetupOptions = { apikey: string } & Pick<OnboardingBuilderOptions, 'supaHost' | 'supaAnon' | 'analytics'>

export async function readBuilderOnlyAssignment(appId: string, options: SetupOptions, request = invokeCapgoCliApi) {
  const { data, error } = await request<{ app_id: string, onboarding?: unknown }>(`app/${encodeURIComponent(appId)}`, {
    ...options,
    method: 'GET',
    body: undefined,
    signal: AbortSignal.timeout(10_000),
  })
  if (error) {
    if (getCapgoCliHttpStatus(error) === 404)
      return null
    throw new Error(`Cannot check the app's onboarding assignment: ${await formatCapgoCliInvokeError(error)}`, { cause: error })
  }
  return data?.app_id === appId ? getBuilderOnlyChecklist(data.onboarding) : null
}

export async function tryBuilderOnlyInit(
  appId: string | undefined,
  options: SetupOptions,
  dependencies: {
    request?: typeof invokeCapgoCliApi
    beforeLaunch?: () => Promise<void>
    launch?: (options: OnboardingBuilderOptions) => Promise<void>
  } = {},
): Promise<boolean> {
  if (!appId)
    return false
  const checklist = await readBuilderOnlyAssignment(appId, options, dependencies.request)
  if (!checklist)
    return false
  await dependencies.beforeLaunch?.()
  const launch = dependencies.launch ?? (await import('../build/onboarding/command')).onboardingBuilderCommand
  await launch({ ...options, appId })
  return true
}

export async function resolveBuilderChecklistPlatform(
  appId: string,
  options: SetupOptions,
  explicitPlatform: string | undefined,
  inferredPlatform: OnboardingBuilderOptions['platform'],
  request = invokeCapgoCliApi,
) {
  try {
    const checklist = await readBuilderOnlyAssignment(appId, options, request)
    return { platform: explicitPlatform || checklist?.selectedPlatform || inferredPlatform, checklist }
  }
  catch {
    // A checklist lookup must not block the existing standalone Builder flow.
    return { platform: explicitPlatform || inferredPlatform, checklist: null }
  }
}
