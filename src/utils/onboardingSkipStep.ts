import { invokeCapgoApi } from '~/services/capgoApi'

// The backend only accepts steps that were passed over (a later step is done).
export async function skipOnboardingStep(appId: string, step: `ota.${string}` | `builder.${'ios' | 'android'}.${string}`, reason: string) {
  const { data, error } = await invokeCapgoApi<{ onboarding: unknown }>('private/onboarding_progress/skip_step', {
    body: { appId, step, reason },
    retries: 0,
  })
  if (error)
    throw error
  return data?.onboarding
}
