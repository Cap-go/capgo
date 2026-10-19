import type { OnboardingCheckOptions } from './onboarding/background'
import type { LocalOnboardingStep } from './onboarding/setup-notices'
import { randomUUID } from 'node:crypto'
import { exit } from 'node:process'
import { parentPort, Worker, workerData } from 'node:worker_threads'
import { setCurrentCliCommand } from './analytics/cli-headers'
import { prepareOnboardingCheck } from './onboarding/background-preparation'
import { readSetupProgress } from './onboarding/setup-notice-evaluation'
import { shouldRefreshSetupProgress } from './onboarding/setup-notice-policy'
import { getSetupNotice, reconcileSetupProgress } from './onboarding/setup-notices'

function runScanWorker(workerUrl: URL, data: object): Promise<LocalOnboardingStep | undefined> {
  return new Promise((resolve) => {
    try {
      const worker = new Worker(workerUrl, { workerData: data, stdout: true, stderr: true })
      worker.stdout?.destroy()
      worker.stderr?.destroy()
      let reported: LocalOnboardingStep | undefined
      worker.on('message', (message) => {
        if (message?.type === 'onboarding-step' && (message.step === 'add_code' || message.step === 'add_updater'))
          reported = message.step
      })
      worker.on('error', () => {})
      worker.once('exit', () => resolve(reported))
    }
    catch {
      resolve(undefined)
    }
  })
}

async function runOnboardingChecks(options: OnboardingCheckOptions): Promise<void> {
  setCurrentCliCommand(options.command)
  // Register before discovery: a fast command may finish while config is loading.
  const refresh = options.setupNotice && shouldRefreshSetupProgress(options.command)
  const foregroundFinished = refresh
    ? new Promise<void>((resolve) => {
        parentPort?.on('message', (message) => {
          if (message?.type === 'command-succeeded')
            resolve()
        })
      })
    : Promise.resolve()
  const prepared = await prepareOnboardingCheck(options)
  if (!prepared)
    return

  const attemptIds = options.attemptIds ?? [options.attemptId ?? randomUUID(), randomUUID()]
  const earlyController = new AbortController()
  const earlyProgress = options.setupNotice ? readSetupProgress(prepared, earlyController.signal) : Promise.resolve(undefined)
  // Start the fresh read immediately after a mutation succeeds, even if the
  // startup request or local scans are slow. Never queue two request budgets.
  const progressRead = refresh
    ? foregroundFinished.then(() => {
        earlyController.abort()
        return readSetupProgress(prepared)
      })
    : earlyProgress
  const [progress, ...reports] = await Promise.all([
    progressRead,
    runScanWorker(new URL('./notify-app-ready-worker.js', import.meta.url), { ...prepared, attemptId: attemptIds[0] }),
    runScanWorker(new URL('./updater-installed-worker.js', import.meta.url), { ...prepared, attemptId: attemptIds[1] }),
  ])
  if (progress) {
    const updated = reports.filter((step): step is LocalOnboardingStep => step !== undefined)
    const notice = getSetupNotice(prepared.project.appId, reconcileSetupProgress(progress, updated), prepared.webHost)
    if (notice)
      parentPort?.postMessage({ type: 'setup-notice', notice })
  }
}

void runOnboardingChecks(workerData as OnboardingCheckOptions).catch(() => {
  // Optional onboarding checks must never affect the requested command.
}).finally(() => exit(0))
