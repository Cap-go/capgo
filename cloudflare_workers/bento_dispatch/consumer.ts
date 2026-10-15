import type { DispatchJob } from './operations.ts'
import type { DispatchRecord, DispatchStore, InvitationDetails } from './store.ts'
import { INVITATION_OPERATIONS, PARTITIONS } from './operations.ts'

export type DispatchRepository = Pick<DispatchStore, 'claim' | 'eligible' | 'complete' | 'fail' | 'cancel'>
export type ReminderSender = (record: DispatchRecord, invitation: InvitationDetails) => Promise<boolean>
export interface DispatchCounts { accepted: number, cancelled: number, failed: number }

export async function publishDispatchJobs(queue: Pick<Queue<DispatchJob>, 'send'>, runId: string) {
  // Publication errors are isolated: all independent operation/portion messages
  // are attempted, and the cron invocation still reports partial failure.
  const results = await Promise.allSettled(INVITATION_OPERATIONS.flatMap(operation =>
    Array.from({ length: PARTITIONS }, (_, partition) => queue.send({ version: 1, operation, partition, runId })),
  ))
  if (results.some(result => result.status === 'rejected'))
    throw new Error('Queue publication failed')
}

export async function processDispatchJob(job: DispatchJob, store: DispatchRepository, send: ReminderSender, now = Date.now): Promise<DispatchCounts> {
  const counts: DispatchCounts = { accepted: 0, cancelled: 0, failed: 0 }
  const deadline = now() + 40_000
  // At most 15 events per message. Each group has five parallel 10-second
  // provider calls, comfortably inside the 120-second claim lease. New groups
  // only start with 20 seconds of the soft job budget remaining.
  for (let group = 0; group < 3 && now() < deadline - 20_000; group++) {
    const records = await store.claim(job.operation, job.partition, 5)
    if (!records.length)
      break
    const outcomes = await Promise.allSettled(records.map(async (record) => {
      let providerAccepted = false
      try {
        const invitation = await store.eligible(record)
        if (!invitation) {
          if (!await store.cancel(record))
            throw new Error('Dispatch claim lost')
          counts.cancelled++
          return
        }
        providerAccepted = await send(record, invitation)
        if (!providerAccepted) {
          await store.fail(record, 'provider_rejected')
          counts.failed++
          return
        }
        if (!await store.complete(record))
          throw new Error('Dispatch claim lost')
        counts.accepted++
      }
      catch {
        // Keep an uncertain acknowledgement claimed until its lease expires;
        // immediately releasing it would increase duplicates during DB faults.
        if (!providerAccepted)
          await store.fail(record, 'dispatch_failed')
        throw new Error('Dispatch processing failed')
      }
    }))
    counts.failed += outcomes.filter(result => result.status === 'rejected').length
    if (counts.failed)
      break
  }
  // Progress is persisted per event; remaining due rows are picked up by the
  // next cron rather than spending queue retries as a pagination mechanism.
  return counts
}
