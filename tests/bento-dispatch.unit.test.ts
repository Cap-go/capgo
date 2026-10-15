import { describe, expect, it, vi } from 'vitest'
import { processDispatchJob, publishDispatchJobs } from '../cloudflare_workers/bento_dispatch/consumer.ts'
import { buildInvitationEvent, parseDispatchJob } from '../cloudflare_workers/bento_dispatch/operations.ts'

const operation = 'org:invite_new_user_reminder_1'
const job = { version: 1 as const, operation: operation as typeof operation, partition: 0, runId: '11111111-1111-4111-8111-111111111111' }
const record = { id: '22222222-2222-4222-8222-222222222222', tag: operation, recipient_key: 'email:invitee@example.com', context_key: '33333333-3333-4333-8333-333333333333', email: 'invitee@example.com', claim_token: '44444444-4444-4444-8444-444444444444', attempt_count: 1 }
const invitation = { email: 'invitee@example.com', org_id: '55555555-5555-4555-8555-555555555555', org_name: '<img src=x>', org_admin_name: 'Someone & Team', first_name: '<b>Invitee</b>', last_name: '', invite_magic_string: 'secret+token', is_new_user: true }

function repository() {
  return {
    claim: vi.fn().mockResolvedValueOnce([record]).mockResolvedValue([]),
    eligible: vi.fn().mockResolvedValue(invitation),
    complete: vi.fn().mockResolvedValue(true),
    fail: vi.fn().mockResolvedValue(true),
    cancel: vi.fn().mockResolvedValue(true),
  }
}

describe('typed Bento dispatch jobs', () => {
  it('publishes one independent message for each of four operations and five portions', async () => {
    const queue = { send: vi.fn().mockResolvedValue(undefined) }
    await publishDispatchJobs(queue, job.runId)
    expect(queue.send).toHaveBeenCalledTimes(20)
    const jobs = queue.send.mock.calls.map(([body]) => parseDispatchJob(body))
    expect(new Set(jobs.map(item => `${item.operation}:${item.partition}`)).size).toBe(20)
    expect(jobs.every(item => item.runId === job.runId)).toBe(true)
  })

  it('attempts the other jobs if one queue publication fails, then reports the failure', async () => {
    const queue = { send: vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue(undefined) }
    await expect(publishDispatchJobs(queue, job.runId)).rejects.toThrow('Queue publication failed')
    expect(queue.send).toHaveBeenCalledTimes(20)
  })

  it.each([null, {}, { ...job, operation: 'org:invite_new_capgo_user_to_org' }, { ...job, partition: 5 }, { ...job, partition: 0.5 }, { ...job, version: 2 }, { ...job, runId: 'invalid' }, [job]])('rejects invalid or legacy jobs: %j', (input) => {
    expect(() => parseDispatchJob(input)).toThrow('Invalid dispatch job')
  })
})

describe('invitation reminder event details', () => {
  it('escapes user-controlled template values and builds an encoded invitation URL on the configured host', () => {
    const event = buildInvitationEvent(record, invitation, 'https://console.example.com/')
    expect(event.event).toBe(operation)
    expect(event.email).toBe('invitee@example.com')
    expect(event.data).toMatchObject({ org_name: '&lt;img src=x&gt;', org_admin_name: 'Someone &amp; Team', invited_first_name: '&lt;b&gt;Invitee&lt;/b&gt;', invited_last_name: '', invite_link: 'https://console.example.com/invitation?invite_magic_string=secret%2Btoken', unique: { key: record.id } })
  })

  it('builds the existing-user link without a magic token', () => {
    const event = buildInvitationEvent({ ...record, tag: 'org:invite_existing_user_reminder_2' }, { ...invitation, is_new_user: false, invite_magic_string: null }, 'https://console.example.com')
    expect(event.data.invite_link).toBe(`https://console.example.com/dashboard?invite_org=${invitation.org_id}`)
  })

  it.each(['http://console.example.com', 'javascript:alert(1)', 'https://user:password@console.example.com', 'https://console.example.com/?secret=1'])('rejects unsafe webapp configuration %s', (url) => {
    expect(() => buildInvitationEvent(record, invitation, url)).toThrow('Invalid webapp URL')
  })
})

describe('bento dispatch consumer processing', () => {
  it('persists provider acceptance before considering the job complete', async () => {
    const store = repository()
    const send = vi.fn().mockResolvedValue(true)
    expect(await processDispatchJob(job, store, send)).toEqual({ accepted: 1, cancelled: 0, failed: 0 })
    expect(store.complete).toHaveBeenCalledWith(record)
    expect(store.fail).not.toHaveBeenCalled()
  })

  it('does not send accepted records absent from the claim results', async () => {
    const store = repository()
    store.claim.mockReset().mockResolvedValue([])
    const send = vi.fn()
    await processDispatchJob(job, store, send)
    expect(send).not.toHaveBeenCalled()
  })

  it('cancels obsolete invitations without sending', async () => {
    const store = repository()
    store.eligible.mockResolvedValue(null)
    const send = vi.fn()
    expect(await processDispatchJob(job, store, send)).toMatchObject({ cancelled: 1 })
    expect(store.cancel).toHaveBeenCalledWith(record)
    expect(send).not.toHaveBeenCalled()
  })

  it('records rejected sends and allows other records in the portion to finish', async () => {
    const store = repository()
    const second = { ...record, id: '66666666-6666-4666-8666-666666666666' }
    store.claim.mockReset().mockResolvedValueOnce([record, second]).mockResolvedValue([])
    const send = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    expect(await processDispatchJob(job, store, send)).toEqual({ accepted: 1, cancelled: 0, failed: 1 })
    expect(store.fail).toHaveBeenCalledWith(record, 'provider_rejected')
    expect(store.complete).toHaveBeenCalledWith(second)
  })

  it('does not silently accept a failed marker write or a lost claim', async () => {
    const store = repository()
    store.complete.mockResolvedValue(false)
    expect(await processDispatchJob(job, store, vi.fn().mockResolvedValue(true))).toMatchObject({ failed: 1, accepted: 0 })
  })

  it('leaves provider-accepted records claimed when their marker write throws', async () => {
    const store = repository()
    store.complete.mockRejectedValue(new Error('private database failure'))
    expect(await processDispatchJob(job, store, vi.fn().mockResolvedValue(true))).toMatchObject({ failed: 1 })
    expect(store.fail).not.toHaveBeenCalled()
  })

  it('bounds a job and leaves remaining due work for the next cron', async () => {
    const store = repository()
    store.claim.mockReset().mockResolvedValue([record])
    await processDispatchJob(job, store, vi.fn().mockResolvedValue(true))
    expect(store.claim.mock.calls.length).toBeLessThanOrEqual(3)
  })
})
