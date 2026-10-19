import type { Worker } from 'node:worker_threads'
import type { SetupNotice } from './setup-notices'

interface PendingOnboardingCheck {
  completion: Promise<void>
  attemptId: string
  attemptIds: string[]
}

const pendingChecks = new Map<Worker, PendingOnboardingCheck>()
const completedNotices: SetupNotice[] = []

export function registerOnboardingCheck(worker: Worker, attemptIds: string[]): void {
  worker.on('message', (message) => {
    if (message?.type === 'setup-notice' && message.notice)
      completedNotices.push(message.notice)
  })
  const completion = new Promise<void>((resolve) => {
    worker.once('exit', () => {
      pendingChecks.delete(worker)
      resolve()
    })
  })
  pendingChecks.set(worker, { completion, attemptId: attemptIds[0], attemptIds })
}

export function takeSetupNotices(): SetupNotice[] {
  return completedNotices.splice(0)
}

export function finishOnboardingCommand(): void {
  for (const worker of pendingChecks.keys()) {
    try {
      worker.postMessage({ type: 'command-succeeded' })
    }
    catch {
      // A worker exiting concurrently cannot affect the foreground command.
    }
  }
}

export function getPendingOnboardingChecks(): ReadonlyMap<Worker, PendingOnboardingCheck> {
  return pendingChecks
}
