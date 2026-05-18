import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { quickError, simpleError } from '../../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../../utils/logging.ts'
import { checkPermission } from '../../utils/rbac.ts'
import { supabaseApikey } from '../../utils/supabase.ts'
import { getEnv } from '../../utils/utils.ts'

interface BuilderAnalysisResponse {
  analysis?: string
  error?: string
}

export async function aiAnalyzeBuild(
  c: Context,
  jobId: string,
  appId: string,
  apikey: Database['public']['Tables']['apikeys']['Row'],
  logs: string,
): Promise<Response> {
  // 1. Permission check (reuse app.build_native — see design rationale)
  if (!(await checkPermission(c, 'app.build_native', { appId }))) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Unauthorized AI analyze',
      job_id: jobId,
      app_id: appId,
      user_id: apikey.user_id,
    })
    throw simpleError('unauthorized', 'You do not have permission to analyze this build')
  }

  // 2. Ownership + status + idempotency check
  const supabase = supabaseApikey(c, apikey.key)
  const { data: row, error: selectErr } = await supabase
    .from('build_requests')
    .select('app_id, status, ai_analyzed')
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
    throw simpleError('unauthorized', 'You do not have permission to analyze this build')
  }

  if (row.status !== 'failed') {
    throw simpleError('invalid_state', 'AI analysis only available for failed builds')
  }

  if (row.ai_analyzed === true) {
    // 409 (not the simpleError default of 400) — CLI branches on res.status === 409 for this case
    throw quickError(409, 'already_analyzed', 'AI analysis already requested for this job')
  }

  // 3. Proxy to capgo_builder
  const builderUrl = getEnv(c, 'BUILDER_URL')
  const builderApiKey = getEnv(c, 'BUILDER_API_KEY')
  if (!builderUrl || !builderApiKey) {
    throw simpleError('config_error', 'Builder service not configured')
  }

  const builderResp = await fetch(`${builderUrl}/jobs/${jobId}/ai-analyze`, {
    method: 'POST',
    headers: {
      'x-api-key': builderApiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ logs }),
  })

  if (!builderResp.ok) {
    const errText = await builderResp.text().catch(() => '<no body>')
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Builder AI analyze failed',
      job_id: jobId,
      status: builderResp.status,
      error: errText,
    })
    throw simpleError('builder_error', `AI analysis failed: ${errText}`)
  }

  const result = await builderResp.json() as BuilderAnalysisResponse
  if (!result || typeof result.analysis !== 'string') {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Builder AI analyze returned malformed body',
      job_id: jobId,
    })
    throw simpleError('builder_error', 'AI analysis returned malformed response')
  }

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

  return c.json({ analysis: result.analysis }, 200)
}
