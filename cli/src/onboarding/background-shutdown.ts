import type { Command } from 'commander'
import process from 'node:process'
import { log } from '@clack/prompts'
import { isCI } from 'ci-info'
import { flushAnalytics, trackEvent } from '../analytics/track'
import { getPendingOnboardingChecks, takeSetupNotices } from './background-workers'
import { ONBOARDING_CHECK_GRACE_MS as gracePeriodMs, shouldEvaluateSetupNotice } from './setup-notice-policy'
import { formatSetupNotice } from './setup-notices'
import { markTrialNoticeShown, wasTrialNoticeShown } from './trial-notice-state'

// Only commands with human-facing output opt into the shutdown message and wait.
const interactiveCommands = new Set([
  'doctor',
  'login',
  'get-qr',
  'app add',
  'app delete',
  'app list',
  'app debug',
  'app setting',
  'app set',
  'bundle upload',
  'bundle compatibility',
  'bundle delete',
  'bundle list',
  'bundle cleanup',
  'bundle encrypt',
  'bundle decrypt',
  'bundle zip',
  'channel add',
  'channel delete',
  'channel list',
  'channel currentBundle',
  'channel set',
  'key save',
  'key create',
  'key delete_old',
  'organization list',
  'organization add',
  'organization members',
  'organization set',
  'organization delete',
  'organisation list',
  'organisation add',
  'organisation set',
  'organisation delete',
  'build request',
])

function shouldWaitForOnboardingChecks(commandPath: string, options: Record<string, unknown>): boolean {
  return !!process.stdin.isTTY && !!process.stdout.isTTY && !isCI
    && interactiveCommands.has(commandPath)
    && !options.json && !options.outputText && !options.quiet && !options.silent && !options.format
}

function renderSetupNotices(command: Pick<Command, 'optsWithGlobals'>, commandPath: string): void {
  const notices = takeSetupNotices()
  if (!shouldEvaluateSetupNotice(commandPath, command.optsWithGlobals(), isCI))
    return
  const shownApps = new Set<string>()
  for (const notice of notices) {
    if (shownApps.has(notice.appId) || (notice.kind === 'plan' && wasTrialNoticeShown(notice.billing.orgId)))
      continue
    const text = formatSetupNotice(notice)
    if (text) {
      log.info(text)
      shownApps.add(notice.appId)
      if (notice.kind === 'plan')
        markTrialNoticeShown(notice.billing.orgId)
    }
  }
}

export async function waitForOnboardingChecks(command: Pick<Command, 'optsWithGlobals'>, commandPath: string): Promise<void> {
  const pendingChecks = getPendingOnboardingChecks()
  if (!shouldWaitForOnboardingChecks(commandPath, command.optsWithGlobals()) || pendingChecks.size === 0) {
    // Human-readable non-TTY commands only consume already available results.
    renderSetupNotices(command, commandPath)
    return
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const onInterrupt = () => process.exit(130)
  // Take precedence over any command-specific cancellation handler still attached.
  process.prependOnceListener('SIGINT', onInterrupt)
  try {
    log.info('Waiting for background checks to finish (up to 5 seconds). Press Ctrl-C to exit immediately.')
    const checks = [...pendingChecks.values()]
    const options = command.optsWithGlobals()
    void trackEvent({
      channel: 'cli-usage',
      event: 'background_checks_wait_started',
      apikey: typeof options.apikey === 'string' ? options.apikey : undefined,
      appId: typeof options.appId === 'string' ? options.appId : undefined,
      timestamp: new Date(),
      nonPersonTags: {
        command_path: commandPath,
        pending_checks: checks.reduce((total, check) => total + check.attemptIds.length, 0),
        grace_period_ms: gracePeriodMs,
        scan_attempt_ids: checks.flatMap(check => check.attemptIds),
      },
    })
    await Promise.race([
      Promise.allSettled([...checks.map(check => check.completion), flushAnalytics(gracePeriodMs)]),
      new Promise<void>((resolve) => {
        // This timer keeps the process alive while the workers remain unreferenced.
        timer = setTimeout(resolve, gracePeriodMs)
      }),
    ])
  }
  finally {
    if (timer)
      clearTimeout(timer)
    process.removeListener('SIGINT', onInterrupt)
    // A hanging request must not outlive the shared shutdown budget.
    for (const worker of pendingChecks.keys())
      void worker.terminate().catch(() => {})
    // Delivery shares the worker budget; offline telemetry cannot extend shutdown.
    await flushAnalytics(0)
  }
  renderSetupNotices(command, commandPath)
}
