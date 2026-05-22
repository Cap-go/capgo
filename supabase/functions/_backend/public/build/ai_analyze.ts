import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { quickError, simpleError } from '../../utils/hono.ts'
import { cloudlog, cloudlogErr, serializeError } from '../../utils/logging.ts'
import { checkPermission } from '../../utils/rbac.ts'
import { supabaseApikey } from '../../utils/supabase.ts'
import { sendEventToTracking } from '../../utils/tracking.ts'
import { getEnv } from '../../utils/utils.ts'

interface BuilderAnalysisResponse {
  analysis?: string
  error?: string
}

type AiAnalysisResult
  = | 'success'
    | 'already_analyzed'
    | 'invalid_state'
    | 'unauthorized'
    | 'builder_error'
    | 'config_error'

interface EmitAiAnalysisResultInput {
  appId: string
  jobId: string
  result: AiAnalysisResult
  ownerOrg?: string
  userId: string
  logsBytes: number
  durationMs?: number
}

/**
 * Emit the `AI Build Analysis Result` event for an exit branch.
 *
 * Privacy boundary: the AI diagnosis text from the builder MUST NOT cross into any
 * tag here. Only the closed-enum `result`, size/duration metadata, and stable
 * identifiers are sent. Callers fire this before throwing (or before returning a
 * successful response) so every exit branch produces exactly one Result event.
 */
async function emitAiAnalysisResult(c: Context, input: EmitAiAnalysisResultInput): Promise<void> {
  const tags: Record<string, string> = {
    app_id: input.appId,
    job_id: input.jobId,
    result: input.result,
    logs_bytes: String(input.logsBytes),
  }
  if (input.ownerOrg)
    tags.org_id = input.ownerOrg
  if (input.durationMs !== undefined && Number.isFinite(input.durationMs))
    tags.duration_ms = String(Math.round(input.durationMs))

  // Telemetry MUST NOT break the AI analyze flow. sendEventToTracking swallows
  // per-provider errors internally, but defend against an unexpected throw at
  // the orchestration layer (e.g. backgroundTask unavailable in tests).
  try {
    await sendEventToTracking(c, {
      event: 'AI Build Analysis Result',
      channel: 'build-lifecycle',
      icon: '🤖',
      notify: false,
      user_id: input.userId,
      groups: input.ownerOrg ? { organization: input.ownerOrg } : undefined,
      tags,
    })
  }
  catch (error) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'AI Build Analysis Result telemetry failed',
      result: input.result,
      error: serializeError(error),
    })
  }
}

export async function aiAnalyzeBuild(
  c: Context,
  jobId: string,
  appId: string,
  apikey: Database['public']['Tables']['apikeys']['Row'],
  logs: string,
): Promise<Response> {
  const logsBytes = logs?.length ?? 0

  // 1. Permission check (reuse app.build_native — see design rationale)
  if (!(await checkPermission(c, 'app.build_native', { appId }))) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Unauthorized AI analyze',
      job_id: jobId,
      app_id: appId,
      user_id: apikey.user_id,
    })
    // No row yet — `ownerOrg` is unknown for this branch.
    await emitAiAnalysisResult(c, { appId, jobId, result: 'unauthorized', userId: apikey.user_id, logsBytes })
    throw simpleError('unauthorized', 'You do not have permission to analyze this build')
  }

  // 2. Ownership + status + idempotency check
  const supabase = supabaseApikey(c, apikey.key)
  const { data: row, error: selectErr } = await supabase
    .from('build_requests')
    .select('app_id, status, ai_analyzed, owner_org')
    .eq('builder_job_id', jobId)
    .eq('app_id', appId)
    .maybeSingle()

  if (selectErr) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Failed to fetch build_request for AI analyze',
      job_id: jobId,
      error: selectErr.message,
    })
    await emitAiAnalysisResult(c, { appId, jobId, result: 'builder_error', userId: apikey.user_id, logsBytes })
    throw simpleError('internal_error', 'Failed to fetch build request')
  }

  if (!row) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Unauthorized AI analyze (job/app mismatch or missing)',
      job_id: jobId,
      app_id: appId,
      user_id: apikey.user_id,
    })
    // Row is null — `ownerOrg` cannot be resolved for this branch.
    await emitAiAnalysisResult(c, { appId, jobId, result: 'unauthorized', userId: apikey.user_id, logsBytes })
    throw simpleError('unauthorized', 'You do not have permission to analyze this build')
  }

  const ownerOrg = row.owner_org

  if (row.status !== 'failed') {
    await emitAiAnalysisResult(c, { appId, jobId, result: 'invalid_state', ownerOrg, userId: apikey.user_id, logsBytes })
    throw simpleError('invalid_state', 'AI analysis only available for failed builds')
  }

  if (row.ai_analyzed === true) {
    await emitAiAnalysisResult(c, { appId, jobId, result: 'already_analyzed', ownerOrg, userId: apikey.user_id, logsBytes })
    // 409 (not the simpleError default of 400) — CLI branches on res.status === 409 for this case
    throw quickError(409, 'already_analyzed', 'AI analysis already requested for this job')
  }

  // Fire the Requested event only after structural guards pass. "Requested" means
  // a structurally valid analysis attempt for a failed, not-yet-analyzed build
  // was about to be made. Result events still fire at every exit branch.
  // Telemetry MUST NOT break the AI analyze flow.
  try {
    await sendEventToTracking(c, {
      event: 'AI Build Analysis Requested',
      channel: 'build-lifecycle',
      icon: '🤖',
      notify: false,
      user_id: apikey.user_id,
      groups: { organization: ownerOrg },
      tags: {
        app_id: appId,
        org_id: ownerOrg,
        job_id: jobId,
        logs_bytes: String(logsBytes),
      },
    })
  }
  catch (error) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'AI Build Analysis Requested telemetry failed',
      error: serializeError(error),
    })
  }

  // 3. Proxy to capgo_builder
  const builderUrl = getEnv(c, 'BUILDER_URL')
  const builderApiKey = getEnv(c, 'BUILDER_API_KEY')
  if (!builderUrl || !builderApiKey) {
    await emitAiAnalysisResult(c, { appId, jobId, result: 'config_error', ownerOrg, userId: apikey.user_id, logsBytes })
    throw simpleError('config_error', 'Builder service not configured')
  }

  // 60s timeout — matches the CLI's own request timeout. Without this, a hung
  // Workers AI call would hold the edge fn open until the platform's own
  // 150s wall-clock timeout, wasting compute and producing a vaguer error.
  const builderStartedAt = Date.now()
  let builderResp: Response
  try {
    builderResp = await fetch(`${builderUrl}/jobs/${jobId}/ai-analyze`, {
      method: 'POST',
      headers: {
        'x-api-key': builderApiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ logs }),
      signal: AbortSignal.timeout(60_000),
    })
  }
  catch (err) {
    const durationMs = Date.now() - builderStartedAt
    const isTimeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
    cloudlogErr({
      requestId: c.get('requestId'),
      message: isTimeout ? 'Builder AI analyze timed out' : 'Builder AI analyze fetch errored',
      job_id: jobId,
      error: err instanceof Error ? err.message : String(err),
    })
    await emitAiAnalysisResult(c, { appId, jobId, result: 'builder_error', ownerOrg, userId: apikey.user_id, logsBytes, durationMs })
    throw simpleError('builder_error', isTimeout ? 'AI analysis timed out' : 'AI analysis request failed')
  }

  if (!builderResp.ok) {
    const durationMs = Date.now() - builderStartedAt
    const errText = await builderResp.text().catch(() => '<no body>')
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Builder AI analyze failed',
      job_id: jobId,
      status: builderResp.status,
      error: errText,
    })
    await emitAiAnalysisResult(c, { appId, jobId, result: 'builder_error', ownerOrg, userId: apikey.user_id, logsBytes, durationMs })
    throw simpleError('builder_error', `AI analysis failed: ${errText}`)
  }

  const result = await builderResp.json() as BuilderAnalysisResponse
  if (!result || typeof result.analysis !== 'string') {
    const durationMs = Date.now() - builderStartedAt
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Builder AI analyze returned malformed body',
      job_id: jobId,
    })
    await emitAiAnalysisResult(c, { appId, jobId, result: 'builder_error', ownerOrg, userId: apikey.user_id, logsBytes, durationMs })
    throw simpleError('builder_error', 'AI analysis returned malformed response')
  }

  const durationMs = Date.now() - builderStartedAt

  // 4. Flip the flag after the builder succeeds (idempotency)
  const { error: updateErr } = await supabase
    .from('build_requests')
    .update({ ai_analyzed: true, updated_at: new Date().toISOString() })
    .eq('builder_job_id', jobId)
    .eq('app_id', appId)

  if (updateErr) {
    // Log but don't throw — the analysis already happened; the user got their result.
    // Worst case: they could retry and get one more Kimi call.
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Failed to flip ai_analyzed flag after success',
      job_id: jobId,
      error: updateErr.message,
    })
  }

  cloudlog({
    requestId: c.get('requestId'),
    message: 'AI analyze succeeded',
    job_id: jobId,
    app_id: appId,
    user_id: apikey.user_id,
  })

  await emitAiAnalysisResult(c, { appId, jobId, result: 'success', ownerOrg, userId: apikey.user_id, logsBytes, durationMs })

  return c.json({ analysis: result.analysis }, 200)
}
