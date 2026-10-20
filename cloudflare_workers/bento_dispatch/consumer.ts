import type { PostHogQueueEnv } from '../../supabase/functions/_backend/utils/posthog_queue.ts'
import type { DispatchJob, Json, MutationContext, QueuedEvaluation, RunRecord, TaskContext } from './contracts.ts'
import type { DispatchStore } from './store.ts'
import { buildEligibilityAudit } from './audit.ts'

export async function processDispatchJob(job: DispatchJob, store: DispatchStore, helpers: MutationContext | ((run: RunRecord) => MutationContext), evaluation: QueuedEvaluation, queue?: PostHogQueueEnv['POSTHOG_QUEUE'], tasks?: (run: RunRecord) => TaskContext) {
  const run = await store.claimRun(job)
  if (!run)
    return { duplicate: true }
  let phase = 'finder'
  try {
    let result: Record<string, Json>
    if ('execute' in evaluation) {
      phase = 'task_audit'
      await store.flushRunAudit(run.id, queue)
      phase = 'task'
      if (!tasks)
        throw new Error('Missing queued task context')
      result = await evaluation.execute(tasks(run))
    }
    else {
      let users = run.eligible_users
      if (!run.evaluated_at) {
        users = await store.readOnly(evaluation.findEligibleUsers)
        phase = 'selection_persist'
        await store.saveSelection(run, users, buildEligibilityAudit(run.id, evaluation.key, users))
      }
      // Every selection part must be handed off before business mutations. The
      // saved snapshot and event UUIDs survive consumer/publication crashes.
      phase = 'eligibility_queue'
      await store.flushRunAudit(run.id, queue)
      phase = 'handler'
      result = await evaluation.handleEligibleUsers(typeof helpers === 'function' ? helpers(run) : helpers, users ?? [])
    }
    phase = 'completion'
    await store.completeRun(run, result)
    // Completion is durable before this best-effort handoff. An analytics
    // outage must never turn completed business work back into a retry.
    try {
      await store.flushRunAudit(run.id, queue)
    }
    catch { /* A separate queued recovery delivery drains pending intents. */ }
    return result
  }
  catch {
    await store.failRun(run, phase)
    throw new Error('Evaluation processing failed')
  }
}
