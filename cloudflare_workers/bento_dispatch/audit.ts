import type { PostHogQueueMessage } from '../../supabase/functions/_backend/utils/posthog_queue.ts'
import type { EligibleUser } from './contracts.ts'
import { flowAudit, safeFlowMetadata } from '../../supabase/functions/_backend/utils/bento_flow_audit.ts'
import { messageBytes, parsePostHogMessage, POSTHOG_MESSAGE_MAX_BYTES } from '../../supabase/functions/_backend/utils/posthog_queue.ts'

export function buildEligibilityAudit(runId: string, evaluationKey: string, users: EligibleUser[]): PostHogQueueMessage[] {
  const safe = safeFlowMetadata(users) as EligibleUser[]
  const make = (properties: Record<string, unknown>) => flowAudit('bento:evaluation_eligible', runId, { evaluation_key: evaluationKey, eligible_count: users.length, part: 999999999, parts: 999999999, ...properties })
  const events: PostHogQueueMessage[] = []
  let group: EligibleUser[] = []
  const fits = (candidate: EligibleUser[]) => {
    // Probe without the validator so an oversized list can be divided.
    const probe = make({ eligible_users: [] })
    probe.payload.nonPersonTags!.eligible_users = candidate
    return messageBytes(probe) <= POSTHOG_MESSAGE_MAX_BYTES && !!parsePostHogMessage(probe)
  }
  for (const user of safe) {
    if (fits([...group, user])) {
      group.push(user)
      continue
    }
    if (group.length) {
      events.push(make({ eligible_users: group }))
      group = []
    }
    if (fits([user])) {
      group.push(user)
      continue
    }
    // An individual oversized recipient still survives in numbered JSON
    // fragments. Typical reports use native arrays for direct inspection.
    const serialized = JSON.stringify(user)
    const fragmentId = crypto.randomUUID()
    let offset = 0
    while (offset < serialized.length) {
      let lo = 1
      let hi = serialized.length - offset
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2)
        const probe = make({ encoding: 'json-fragment', fragment_id: fragmentId, fragment_offset: offset, eligible_user_json: '' })
        probe.payload.nonPersonTags!.eligible_user_json = serialized.slice(offset, offset + mid)
        if (messageBytes(probe) <= POSTHOG_MESSAGE_MAX_BYTES)
          lo = mid
        else
          hi = mid - 1
      }
      if (lo > 1 && /[\uD800-\uDBFF]/.test(serialized[offset + lo - 1]) && /[\uDC00-\uDFFF]/.test(serialized[offset + lo]))
        lo--
      events.push(make({ encoding: 'json-fragment', fragment_id: fragmentId, fragment_offset: offset, eligible_user_json: serialized.slice(offset, offset + lo) }))
      offset += lo
    }
  }
  if (group.length || events.length === 0)
    events.push(make({ eligible_users: group }))
  for (const [index, event] of events.entries()) {
    event.payload.nonPersonTags!.part = index + 1
    event.payload.nonPersonTags!.parts = events.length
  }
  return events
}
