import { readFile, stat, writeFile } from 'node:fs/promises'
import { getAiPromptPath, getLogCapturePath } from './log-capture'
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
  const content = `${SYSTEM_PROMPT}\n\n---LOGS---\n${logs}`
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
  const url = `${input.apiHost}/functions/v1/build/ai_analyze`
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
