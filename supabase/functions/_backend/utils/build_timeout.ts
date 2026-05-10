export const DEFAULT_BUILD_TIMEOUT_SECONDS = 15 * 60
export const MIN_BUILD_TIMEOUT_SECONDS = 5 * 60
export const MAX_BUILD_TIMEOUT_SECONDS = 6 * 60 * 60

export const BUILD_TIMEOUT_STATUS = 'failed'
export const TERMINAL_BUILD_STATUSES = new Set(['succeeded', 'failed', 'expired', 'released', 'cancelled'])

export function normalizeBuildTimeoutSeconds(value: unknown): number {
  if (value === null || value === undefined || value === '')
    return DEFAULT_BUILD_TIMEOUT_SECONDS

  const numericValue = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numericValue))
    return DEFAULT_BUILD_TIMEOUT_SECONDS

  return Math.min(
    MAX_BUILD_TIMEOUT_SECONDS,
    Math.max(MIN_BUILD_TIMEOUT_SECONDS, Math.trunc(numericValue)),
  )
}

export function isTerminalBuildStatus(status: string | null | undefined): boolean {
  return !!status && TERMINAL_BUILD_STATUSES.has(status)
}

export function calculateBuildRuntimeSeconds(
  startedAt: number | null | undefined,
  completedAt: number | null | undefined,
  nowMs = Date.now(),
): number | null {
  if (typeof startedAt !== 'number' || !Number.isFinite(startedAt))
    return null

  const endMs = typeof completedAt === 'number' && Number.isFinite(completedAt)
    ? completedAt
    : nowMs

  return Math.max(0, Math.floor((endMs - startedAt) / 1000))
}

export function calculateRunnerWaitSeconds(runnerWaitMs: number | null | undefined): number {
  if (typeof runnerWaitMs !== 'number' || !Number.isFinite(runnerWaitMs))
    return 0

  return Math.max(0, Math.floor(runnerWaitMs / 1000))
}

export function calculateTimeoutCompletedAt(startedAt: number, timeoutSeconds: number): number {
  return startedAt + normalizeBuildTimeoutSeconds(timeoutSeconds) * 1000
}

export function capBuildRuntimeSeconds(runtimeSeconds: number, timeoutSeconds: number): number {
  return Math.min(
    Math.max(0, Math.floor(runtimeSeconds)),
    normalizeBuildTimeoutSeconds(timeoutSeconds),
  )
}

export function hasBuildTimedOut(
  startedAt: number | null | undefined,
  completedAt: number | null | undefined,
  timeoutSeconds: number,
  nowMs = Date.now(),
): boolean {
  const runtimeSeconds = calculateBuildRuntimeSeconds(startedAt, completedAt, nowMs)
  return runtimeSeconds !== null && runtimeSeconds >= normalizeBuildTimeoutSeconds(timeoutSeconds)
}

export function shouldApplyBuildTimeout(
  startedAt: number | null | undefined,
  completedAt: number | null | undefined,
  status: string | null | undefined,
  timeoutSeconds: number,
  timeoutUpdatedAt: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!hasBuildTimedOut(startedAt, completedAt, timeoutSeconds, nowMs))
    return false

  if (!isTerminalBuildStatus(status))
    return true

  if (typeof completedAt !== 'number' || !Number.isFinite(completedAt))
    return false

  if (!timeoutUpdatedAt)
    return true

  const timeoutUpdatedAtMs = Date.parse(timeoutUpdatedAt)
  if (!Number.isFinite(timeoutUpdatedAtMs))
    return true

  return timeoutUpdatedAtMs <= completedAt
}

export function formatBuildTimeoutError(timeoutSeconds: number): string {
  return `Build exceeded configured timeout of ${Math.round(normalizeBuildTimeoutSeconds(timeoutSeconds) / 60)} minutes`
}
