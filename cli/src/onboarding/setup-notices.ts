import type { AppTodoProgress } from '../app/todo'
import { getBuilderChecklist, onboardingRecord } from '../app/builder-checklist'
import { getAppTodoNextStep, getAppTodoSteps, getAvailableAppTodoLists } from '../app/todo'
import { DIRECT_OFFER_PLAN_MESSAGE, isZeroLengthTrial } from '../shared/direct-offer'
import { defaultHostWeb } from '../utils'
import { setupDebug } from './setup-diagnostics'

function suppressNotice(reason: string): undefined {
  setupDebug('notice suppressed', { reason })
  return undefined
}

export type LocalOnboardingStep = 'add_code' | 'add_updater'
interface Billing {
  orgId: string
  trialEndsAt: string | null
  /** Org created without a free trial (direct offer): never mention a trial. */
  trialSkipped?: boolean
  plansUrl: string
}
export type SetupNotice = { appId: string, secondary: string[] } & (
  { kind: 'setup', product: string, title?: string, instruction?: string, action: string }
  | { kind: 'plan', completed: string[], billing: Billing }
)

const builderInstructions: Record<string, string> = {
  start_setup: 'Run the setup wizard to choose how to build your app.',
  choose_destination: 'Choose where your iOS build will be installed.',
  connect_app_store: 'Connect App Store Connect to continue setting up cloud builds.',
  prepare_certificate: 'Add an iOS distribution certificate to continue setting up cloud builds.',
  prepare_profile: 'Add an iOS provisioning profile to continue setting up cloud builds.',
  prepare_keystore: 'Add a signing keystore to continue setting up cloud builds.',
  connect_google_play: 'Connect Google Play to continue setting up cloud builds.',
  successful_cloud_build: 'Run a successful cloud build to finish setup.',
}

function readBilling(value: unknown, webHost: string): Billing | undefined {
  const data = onboardingRecord(value)
  if (data.status !== 'available' || data.isPaying !== false || data.hasCredits !== false
    || typeof data.orgId !== 'string' || !data.orgId
    || !(data.trialEndsAt === null || (typeof data.trialEndsAt === 'string' && Number.isFinite(Date.parse(data.trialEndsAt))))) {
    return
  }
  try {
    const plansUrl = new URL(webHost)
    plansUrl.pathname = `${plansUrl.pathname.replace(/\/+$/, '')}/settings/organization/plans`
    plansUrl.search = ''
    plansUrl.hash = ''
    if (!['https:', 'http:'].includes(plansUrl.protocol) || plansUrl.username || plansUrl.password)
      return
    plansUrl.searchParams.set('oid', data.orgId)
    const trialEndsAt = data.trialEndsAt as string | null
    // `orgCreatedAt` is optional: older servers omit it and keep the trial copy.
    const trialSkipped = typeof data.orgCreatedAt === 'string' && isZeroLengthTrial(data.orgCreatedAt, trialEndsAt)
    return { orgId: data.orgId, trialEndsAt, ...(trialSkipped ? { trialSkipped } : {}), plansUrl: plansUrl.href }
  }
  catch {
    return undefined
  }
}

export function getSetupNotice(appId: string, progress: AppTodoProgress, webHost = defaultHostWeb): SetupNotice | undefined {
  const raw = onboardingRecord(progress.onboarding)
  const setup = Object.hasOwn(raw, 'setup') ? onboardingRecord(raw.setup) : raw
  if (setup.todo_list_version !== 4 || setup.outcome === 'skipped')
    return suppressNotice('unsupported_version_or_skipped')
  const lists = getAvailableAppTodoLists(progress)
  const ota = lists.includes('ota') && setup.ota_todo_list_version === '1' && !progress.checkErrors?.length
    ? getAppTodoSteps(progress, 'ota')
    : undefined
  const builder = lists.includes('builder') ? getBuilderChecklist(progress.onboarding) : null
  if (!ota && !builder)
    return suppressNotice('no_supported_checklist')
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
  const completed = [...(otaComplete ? ['Live updates'] : []), ...finishedBuilder.map(entry => `${platformLabel(entry.platform)} cloud builds`)]
  const otaStarted = !!ota && started(ota.steps)
  const builderStarted = platforms.some(entry => entry.started)
  const todo = (list: string) => `npx @capgo/cli@latest app todo --list ${list}`
  const build = (platform?: string) => `npx @capgo/cli@latest build init${platform ? ` --platform ${platform}` : ''}`
  setupDebug('checklists evaluated', { ota_available: !!ota, builder_available: !!builder, ota_complete: otaComplete, builder_complete: finishedBuilder.length > 0 })
  if (completed.length) {
    const billing = readBilling(progress.billing, webHost)
    if (!billing) {
      const data = onboardingRecord(progress.billing)
      setupDebug('billing evaluated', { available: data.status === 'available', is_paying: data.isPaying === true, has_credits: data.hasCredits === true })
      return suppressNotice(data.status !== 'available' ? 'billing_unavailable' : data.isPaying === true ? 'already_paying' : data.hasCredits === true ? 'has_credits' : 'invalid_billing')
    }
    const secondary = [
      ...(builder && finishedBuilder.length ? platforms.filter(entry => !entry.complete).map(entry => `set up ${platformLabel(entry.platform)} builds`) : []),
      ...(builder && !finishedBuilder.length ? [builderStarted ? 'continue setting up cloud builds' : 'explore cloud builds with Capgo Builder'] : []),
      ...(!otaComplete && lists.includes('ota') ? [otaStarted ? 'finish live update setup' : 'explore live updates'] : []),
    ]
    return { kind: 'plan', appId, completed, billing, secondary }
  }
  if (lists.includes('ota') && !ota)
    return suppressNotice('ota_check_errors')
  // Normal API-key polling records OTA's first step. Do not invent copy for an
  // all-pending dual snapshot from an older or incomplete backend response.
  if (ota && builder && !otaStarted && !builderStarted)
    return suppressNotice('both_checklists_not_started')
  const useBuilder = !!builder && (!ota || (builderStarted && (!otaStarted || setup.selected_path === 'builder')))
  if (useBuilder) {
    const platform = platforms.find(entry => entry.platform === builder.selectedPlatform)
      ?? platforms.find(entry => entry.started)
    const next = platform?.steps.find(step => step.status === 'pending' || step.status === 'warning')
    return {
      kind: 'setup',
      appId,
      product: platform ? `${platformLabel(platform.platform)} builds` : 'cloud builds',
      title: next?.title,
      instruction: next ? builderInstructions[next.stepId] : 'Run the setup wizard to choose iOS or Android and prepare your build.',
      action: build(platform?.platform),
      secondary: ota ? [otaStarted ? 'continue setting up live updates' : 'explore live updates'] : [],
    }
  }
  const next = getAppTodoNextStep(progress, 'ota')
  return {
    kind: 'setup',
    appId,
    product: 'live updates',
    title: next?.title,
    instruction: next ? `Next: ${next.action}` : undefined,
    action: todo('ota'),
    secondary: builder ? [builderStarted ? 'continue setting up cloud builds' : 'explore cloud builds with Capgo Builder'] : [],
  }
}

function remainingTrial(trialEndsAt: string, now: number): string {
  const minutes = Math.floor((Date.parse(trialEndsAt) - now) / 60_000)
  if (Date.parse(trialEndsAt) <= now)
    return 'Your trial has ended.'
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const unit = (count: number, name: string) => `${count} ${name}${count === 1 ? '' : 's'}`
  const remaining = days > 0
    ? [unit(days, 'day'), ...(hours % 24 ? [unit(hours % 24, 'hour')] : [])].join(', ')
    : hours > 0
      ? [unit(hours, 'hour'), ...(minutes % 60 ? [unit(minutes % 60, 'minute')] : [])].join(', ')
      : minutes > 0 ? unit(minutes, 'minute') : 'less than a minute'
  return `Your trial ends in ${remaining}.`
}

export function formatSetupNotice(notice: SetupNotice | undefined, now = Date.now()): string | undefined {
  if (!notice)
    return
  const trialSkipped = notice.kind === 'plan' && !!notice.billing.trialSkipped
  const planAction = trialSkipped
    ? DIRECT_OFFER_PLAN_MESSAGE
    : notice.kind === 'plan' && notice.billing.trialEndsAt
      ? `Choose a Capgo plan to continue ${Date.parse(notice.billing.trialEndsAt) > now ? 'after your trial' : 'using Capgo'}.`
      : 'Choose a Capgo plan.'
  const primary = notice.kind === 'setup'
    ? [
        `Finish setting up ${notice.product}`,
        '',
        notice.instruction ?? (notice.title ? `Next: ${notice.title}.` : 'Run the setup wizard to continue.'),
        '',
        ...(notice.product === 'live updates' ? ['Open your checklist to continue:'] : []),
        notice.action,
      ]
    : [
        notice.secondary.length ? `${notice.completed.join(' and ')} are set up` : 'Your Capgo setup is complete',
        '',
        ...(notice.billing.trialEndsAt && !trialSkipped ? [remainingTrial(notice.billing.trialEndsAt, now)] : []),
        planAction,
        '',
        `View plans: ${notice.billing.plansUrl}`,
      ]
  return [...primary, ...(notice.secondary.length ? ['', `You can also ${notice.secondary.join(' or ')}.`] : [])].join('\n')
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
