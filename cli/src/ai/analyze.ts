import { readFile, stat, writeFile } from 'node:fs/promises'
import { cleanupCapturedJobFiles, getAiPromptPath, getLogCapturePath } from './log-capture'
import { SYSTEM_PROMPT } from './prompt'

export type AnalyzeBehavior = 'show_menu' | 'ask_then_menu' | 'auto_upload' | 'skip'

export interface DecideInput {
  isTTY: boolean
  aiAnalyticsFlag: boolean
}

export function decideAnalyzeBehavior(input: DecideInput): AnalyzeBehavior {
  if (input.isTTY && input.aiAnalyticsFlag)
    return 'show_menu'
  if (input.isTTY && !input.aiAnalyticsFlag)
    return 'ask_then_menu'
  if (!input.isTTY && input.aiAnalyticsFlag)
    return 'auto_upload'
  return 'skip'
}

export async function writeLocalAiFile(jobId: string): Promise<string> {
  const logsPath = getLogCapturePath(jobId)
  const logs = await readFile(logsPath, 'utf8')
  const promptPath = getAiPromptPath(jobId)
  // Wrap the log in the same <BUILD_LOG>...</BUILD_LOG> boundary the worker
  // uses, so SYSTEM_PROMPT's anti-prompt-injection instructions apply when
  // a user runs this file against any LLM.
  const content = `${SYSTEM_PROMPT}\n\n<BUILD_LOG>\n${logs}\n</BUILD_LOG>\n`
  await writeFile(promptPath, content)
  return promptPath
}

export interface PostAnalyzeInput {
  apiHost: string
  apikey: string
  jobId: string
  appId: string
  logs: string
}

export type PostAnalyzeResult
  = | { kind: 'ok', analysis: string }
    | { kind: 'already_analyzed' }
    | { kind: 'too_big' }
    | { kind: 'error', status?: number, message?: string }

export async function postAnalyzeRequest(input: PostAnalyzeInput): Promise<PostAnalyzeResult> {
  // apiHost is the Capgo CF Workers API gateway (e.g. https://api.capgo.app),
  // NOT a Supabase Edge Functions URL — so no '/functions/v1/' prefix. All other
  // /build/* endpoints (start, cancel, status, logs) live directly under the host.
  const url = `${input.apiHost}/build/ai_analyze`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'capgkey': input.apikey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ jobId: input.jobId, appId: input.appId, logs: input.logs }),
      signal: AbortSignal.timeout(60_000),
    })
    if (res.status === 200) {
      const body = await res.json() as { analysis?: string }
      if (typeof body.analysis !== 'string')
        return { kind: 'error', status: 200, message: 'malformed_response' }
      return { kind: 'ok', analysis: body.analysis }
    }
    if (res.status === 409) {
      return { kind: 'already_analyzed' }
    }
    if (res.status === 413) {
      // Backend rejected the payload as too large (>10 MB). Surface this as
      // the dedicated variant so callers can fall back to local AI cleanly.
      return { kind: 'too_big' }
    }
    let message: string | undefined
    try {
      const body = await res.json() as { error?: string, message?: string }
      message = body.error || body.message
    }
    catch {
      // ignore
    }
    return { kind: 'error', status: res.status, message }
  }
  catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : String(err) }
  }
}

export const HARD_LOG_SIZE_LIMIT = 10 * 1024 * 1024

export async function isLogTooBig(jobId: string): Promise<boolean> {
  try {
    const s = await stat(getLogCapturePath(jobId))
    return s.size > HARD_LOG_SIZE_LIMIT
  }
  catch {
    return false
  }
}

export interface RunCapgoAiAnalysisInput {
  apiHost: string
  apikey: string
  jobId: string
  appId: string
}

// Reads the captured log file for a failed job, then sends it to the Capgo AI
// edge function. Used by callers (e.g. the Ink onboarding TUI) that can't show
// the interactive clack menu in `requestBuildInternal`.
export async function runCapgoAiAnalysis(input: RunCapgoAiAnalysisInput): Promise<PostAnalyzeResult> {
  // Check the byte limit before the read so a multi-MB log file doesn't get
  // pulled into memory just to be rejected.
  if (await isLogTooBig(input.jobId))
    return { kind: 'too_big' }

  let logs: string
  try {
    logs = await readFile(getLogCapturePath(input.jobId), 'utf8')
  }
  catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : 'log_unavailable' }
  }

  return postAnalyzeRequest({
    apiHost: input.apiHost,
    apikey: input.apikey,
    jobId: input.jobId,
    appId: input.appId,
    logs,
  })
}

// Best-effort cleanup of captured artifacts for a job. Callers in caller-handled
// mode use this once the user has either viewed the analysis or chosen to skip,
// since `requestBuildInternal` leaves the log file in place for them.
export async function releaseCapturedLogs(jobId: string): Promise<void> {
  await cleanupCapturedJobFiles(jobId, { keepAiPromptFile: false })
}
