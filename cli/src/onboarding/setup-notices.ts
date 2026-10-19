import type { AppTodoProgress } from '../app/todo'
import { getBuilderChecklist, onboardingRecord } from '../app/builder-checklist'
import { getAppTodoNextStep, getAppTodoSteps, getAvailableAppTodoLists } from '../app/todo'
import { defaultHostWeb } from '../utils'

export type LocalOnboardingStep = 'add_code' | 'add_updater'
interface Billing {
  orgId: string
  trialEndsAt: string | null
  plansUrl: string
}
export type SetupNotice = { appId: string, secondary: string[] } & (
  { kind: 'setup', product: string, title?: string, action: string }
  | { kind: 'plan', completed: string[], billing: Billing }
)

function readBilling(value: unknown, webHost: string): Billing | undefined {
  const data = onboardingRecord(value)
  if (data.status !== 'available' || data.isPaying !== false || data.hasCredits !== false
    || typeof data.orgId !== 'string' || !data.orgId
    || !(data.trialEndsAt === null || (typeof data.trialEndsAt === 'string' && Number.isFinite(Date.parse(data.trialEndsAt))))) {
    return
  }
  try {
    const plansUrl = new URL('/settings/organization/plans', webHost)
    if (!['https:', 'http:'].includes(plansUrl.protocol) || plansUrl.username || plansUrl.password)
      return
    plansUrl.searchParams.set('oid', data.orgId)
    return { orgId: data.orgId, trialEndsAt: data.trialEndsAt as string | null, plansUrl: plansUrl.href }
  }
  catch {
    return undefined
  }
}

export function getSetupNotice(appId: string, progress: AppTodoProgress, webHost = defaultHostWeb): SetupNotice | undefined {
  const raw = onboardingRecord(progress.onboarding)
  const setup = Object.hasOwn(raw, 'setup') ? onboardingRecord(raw.setup) : raw
  if (setup.todo_list_version !== 4 || setup.outcome === 'skipped')
    return
  const lists = getAvailableAppTodoLists(progress)
  const ota = lists.includes('ota') && setup.ota_todo_list_version === '1' && !progress.checkErrors?.length
    ? getAppTodoSteps(progress, 'ota')
    : undefined
  const builder = lists.includes('builder') ? getBuilderChecklist(progress.onboarding) : null
  if (!ota && !builder)
    return
  const complete = (steps: { status: string }[]) => steps.length > 0 && steps.every(step => step.status === 'done' || step.status === 'skipped')
  const started = (steps: { status: string }[]) => steps.some(step => step.status !== 'pending')
  const platforms = (['ios', 'android'] as const).map((platform) => {
    const steps = builder?.steps.filter(step => step.platform === platform) ?? []
    return { platform, steps, started: started(steps), complete: complete(steps) && steps.some(step => step.stepId === 'successful_cloud_build' && step.status === 'done') }
  })
  const platformLabel = (platform: string) => platform === 'ios' ? 'iOS' : 'Android'
  const otaComplete = !!ota && complete(ota.steps)
  // A successful, finished platform is sufficient; the other platform is exploration.
  const finishedBuilder = platforms.filter(platform => platform.complete)
  const completed = [...(otaComplete ? ['OTA'] : []), ...finishedBuilder.map(entry => `Builder for ${platformLabel(entry.platform)}`)]
  const todo = (list: string) => `npx @capgo/cli@latest app todo ${appId} --list ${list}`
  const build = (platform?: string) => `npx @capgo/cli@latest build init${platform ? ` --platform ${platform}` : ''}`
  if (completed.length) {
    const billing = readBilling(progress.billing, webHost)
    if (!billing)
      return
    const secondary = [
      ...(builder && finishedBuilder.length ? platforms.filter(entry => !entry.complete).map(entry => `set up ${platformLabel(entry.platform)}`) : []),
      ...(builder && !finishedBuilder.length ? ['explore Capgo Builder'] : []),
      ...(!otaComplete && lists.includes('ota') ? ['explore OTA live updates'] : []),
    ]
    return { kind: 'plan', appId, completed, billing, secondary }
  }
  const otaStarted = !!ota && started(ota.steps)
  const builderStarted = platforms.some(entry => entry.started)
  // Normal API-key polling records OTA's first step. Do not invent copy for an
  // all-pending dual snapshot from an older or incomplete backend response.
  if (ota && builder && !otaStarted && !builderStarted)
    return
  const useBuilder = !!builder && (!ota || (builderStarted && (!otaStarted || setup.selected_path === 'builder')))
  if (useBuilder) {
    const platform = platforms.find(entry => entry.platform === builder.selectedPlatform)
      ?? platforms.find(entry => entry.started)
    const next = platform?.steps.find(step => step.status === 'pending' || step.status === 'warning')
    return {
      kind: 'setup',
      appId,
      product: 'Capgo Builder',
      title: next?.title,
      action: build(platform?.platform),
      secondary: ota ? [`${otaStarted ? 'continue' : 'explore'} OTA live updates with ${todo('ota')}`] : [],
    }
  }
  const next = getAppTodoNextStep(progress, 'ota')
  return {
    kind: 'setup',
    appId,
    product: 'OTA live updates',
    title: next?.title,
    action: `${next?.action ? `${next.action}\n` : ''}Continue your checklist: ${todo('ota')}`,
    secondary: builder ? [`${builderStarted ? 'continue' : 'explore'} Capgo Builder with ${build(builder.selectedPlatform)}`] : [],
  }
}

function remainingTrial(trialEndsAt: string, now: number): string {
  const minutes = Math.floor((Date.parse(trialEndsAt) - now) / 60_000)
  if (minutes < 0)
    return `Your organization's trial has ended (${trialEndsAt}).`
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const unit = (count: number, name: string) => `${count} ${name}${count === 1 ? '' : 's'}`
  const remaining = days > 0
    ? [unit(days, 'day'), ...(hours % 24 ? [unit(hours % 24, 'hour')] : [])].join(', ')
    : hours > 0
      ? [unit(hours, 'hour'), ...(minutes % 60 ? [unit(minutes % 60, 'minute')] : [])].join(', ')
      : minutes > 0 ? unit(minutes, 'minute') : 'less than a minute'
  return `Your organization's trial ends in ${remaining} (${trialEndsAt}).`
}

export function formatSetupNotice(notice: SetupNotice | undefined, now = Date.now()): string | undefined {
  if (!notice)
    return
  const primary = notice.kind === 'setup'
    ? [`Continue ${notice.product} setup for ${notice.appId}.${notice.title ? ` Next: ${notice.title}.` : ''}`, notice.action]
    : [`${notice.completed.join(' and ')} setup is complete for ${notice.appId}.`, ...(notice.billing.trialEndsAt ? [remainingTrial(notice.billing.trialEndsAt, now)] : []), `Choose a Capgo plan: ${notice.billing.plansUrl}`]
  return [...primary, ...(notice.secondary.length ? [`Also ${notice.secondary.join('; or ')}.`] : [])].join('\n')
}

export function reconcileSetupProgress(progress: AppTodoProgress, reported: readonly LocalOnboardingStep[]): AppTodoProgress {
  const result = structuredClone(progress)
  const raw = onboardingRecord(result.onboarding)
  const setup = Object.hasOwn(raw, 'setup') ? onboardingRecord(raw.setup) : raw
  if (setup.todo_list_version === 4 && setup.ota_todo_list_version === '1' && setup.outcome !== 'skipped') {
    const steps = onboardingRecord(onboardingRecord(setup.steps).ota)
    for (const step of reported)
      steps[step] = { ...onboardingRecord(steps[step]), status: 'done' }
  }
  return result
}
