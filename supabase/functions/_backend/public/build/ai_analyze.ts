// supabase/functions/_backend/public/build/ai_analyze.ts
//
// DEPRECATED ENDPOINT — permanent 426 responder.
//
// The buffered AI-analyze proxy that lived here was replaced by the streaming
// route in ./ai_analyze_stream.ts (spec: docs/superpowers/specs/
// 2026-06-05-ai-analyze-streaming-design.md). Old CLIs that still POST here
// must be told to upgrade; they print `body.error || body.message`, so the
// human-readable instruction MUST be in `error`.
import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { emitAiAnalysisResult } from './ai_analyze_telemetry.ts'

export const UPGRADE_MESSAGE = 'AI build analysis requires a newer CLI. Please upgrade: npx @capgo/cli@latest'

export async function aiAnalyzeDeprecated(
  c: Context,
  apikey: Database['public']['Tables']['apikeys']['Row'],
): Promise<Response> {
  // Best-effort tags so the dashboard can watch the old-CLI population drain.
  let jobId = ''
  let appId = ''
  try {
    const body = await c.req.raw.clone().json() as { jobId?: string, appId?: string }
    jobId = typeof body?.jobId === 'string' ? body.jobId : ''
    appId = typeof body?.appId === 'string' ? body.appId : ''
  }
  catch {
    // Unparsable body — still answer 426; tags stay empty.
  }
  await emitAiAnalysisResult(c, { appId, jobId, result: 'upgrade_required', userId: apikey.user_id, logsBytes: 0 })
  return c.json({ error: UPGRADE_MESSAGE, code: 'upgrade_required' }, 426)
}
