import type { AppTodoProgress } from '../app/todo'
import type { PreparedOnboardingCheck } from './background-check'
import { buildCliRequestHeaders } from '../analytics/cli-headers'
import { trimTrailingSlashes } from '../utils'

export const SETUP_PROGRESS_TIMEOUT_MS = 15_000
export async function readSetupProgress(prepared: Omit<PreparedOnboardingCheck, 'attemptId'>, cancellation?: AbortSignal): Promise<AppTodoProgress | undefined> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let onCancel: (() => void) | undefined
  try {
    if (cancellation?.aborted)
      return
    return await Promise.race([
      (async () => {
        const response = await fetch(`${trimTrailingSlashes(prepared.apiHost)}/private/onboarding_progress`, {
          method: 'POST',
          redirect: 'error',
          signal: controller.signal,
          headers: buildCliRequestHeaders({
            'Content-Type': 'application/json',
            'Authorization': prepared.apiHost.includes('/functions/v1') && prepared.anonKey ? `Bearer ${prepared.anonKey}` : prepared.apikey,
            'capgkey': prepared.apikey,
          }),
          body: JSON.stringify({ appId: prepared.project.appId, N: 0, initial: true, includeBilling: true }),
        })
        if (!response.ok)
          return
        const data = await response.json() as AppTodoProgress
        return data && Object.hasOwn(data, 'onboarding') ? data : undefined
      })(),
      new Promise<undefined>((resolve) => {
        onCancel = () => {
          controller.abort()
          resolve(undefined)
        }
        cancellation?.addEventListener('abort', onCancel, { once: true })
        if (cancellation?.aborted)
          onCancel()
        timer = setTimeout(resolve, SETUP_PROGRESS_TIMEOUT_MS, undefined)
      }),
    ])
  }
  catch {
    // Optional progress/billing cannot fail the requested command.
    return undefined
  }
  finally {
    if (onCancel)
      cancellation?.removeEventListener('abort', onCancel)
    clearTimeout(timer)
    controller.abort()
  }
}
