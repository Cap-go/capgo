import type { DispatchEnv } from '../cloudflare_workers/bento_dispatch/index.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { consumeDispatch, scheduleDispatch } from '../cloudflare_workers/bento_dispatch/index.ts'

const { db, store, accepted } = vi.hoisted(() => ({
  db: { connect: vi.fn(), end: vi.fn(), query: vi.fn(), on: vi.fn() },
  store: { claim: vi.fn(), eligible: vi.fn(), complete: vi.fn(), fail: vi.fn(), cancel: vi.fn() },
  accepted: vi.fn(),
}))

vi.mock('pg', () => ({
  Client: class {
    constructor() { return db }
  },
}))
vi.mock('../cloudflare_workers/bento_dispatch/store.ts', () => ({
  DispatchStore: class {
    constructor() { return store }
  },
}))
vi.mock('../supabase/functions/_backend/utils/bento.ts', () => ({ isBentoConfigured: () => true, trackBentoEvent: accepted }))

const job = { version: 1, operation: 'org:invite_existing_user_reminder_1', partition: 0, runId: '11111111-1111-4111-8111-111111111111' }
const record = { id: '22222222-2222-4222-8222-222222222222', tag: job.operation, claim_token: '33333333-3333-4333-8333-333333333333' }
const invitation = { is_new_user: false, email: 'recipient@example.com', org_id: '44444444-4444-4444-8444-444444444444', org_name: 'Example', org_admin_name: 'Inviter', first_name: 'Invitee', last_name: '', invite_magic_string: null }

function environment(): DispatchEnv {
  return {
    HYPERDRIVE_CAPGO_DIRECT_EU: { connectionString: 'postgres://local' } as Hyperdrive,
    DISPATCH_QUEUE: { send: vi.fn().mockResolvedValue(undefined) } as unknown as DispatchEnv['DISPATCH_QUEUE'],
    BENTO_EVENT_DISPATCH_ENABLED: 'true',
    BENTO_PUBLISHABLE_KEY: 'configured',
    BENTO_SECRET_KEY: 'configured',
    BENTO_SITE_UUID: 'configured',
    WEBAPP_URL: 'https://console.example.com',
  }
}

function message(body: unknown = job, attempts = 1) {
  return { body, attempts, ack: vi.fn(), retry: vi.fn() } as unknown as Message<unknown>
}

const batch = (messages: Message<unknown>[]) => ({ messages } as unknown as MessageBatch<unknown>)

beforeEach(() => {
  vi.clearAllMocks()
  db.connect.mockResolvedValue(undefined)
  db.end.mockResolvedValue(undefined)
  db.query.mockResolvedValue({ rows: [] })
  store.claim.mockReset().mockResolvedValueOnce([record]).mockResolvedValue([])
  store.eligible.mockResolvedValue(invitation)
  store.complete.mockResolvedValue(true)
  store.fail.mockResolvedValue(true)
  accepted.mockResolvedValue(true)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('dedicated dispatcher Worker entrypoints', () => {
  it('awaits all twenty cron publications and closes the database connection', async () => {
    const env = environment()
    await scheduleDispatch({} as ScheduledController, env)
    expect(env.DISPATCH_QUEUE.send).toHaveBeenCalledTimes(20)
    expect(db.end).toHaveBeenCalledOnce()
  })

  it('defaults to disabled when Vault has no activation setting', async () => {
    const env = environment()
    delete env.BENTO_EVENT_DISPATCH_ENABLED
    await scheduleDispatch({} as ScheduledController, env)
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('vault.decrypted_secrets'), ['BENTO_EVENT_DISPATCH_ENABLED'])
    expect(env.DISPATCH_QUEUE.send).not.toHaveBeenCalled()
  })

  it('honors an explicit off override while acknowledging stale queued jobs', async () => {
    const env = environment()
    env.BENTO_EVENT_DISPATCH_ENABLED = 'false'
    const msg = message()
    await consumeDispatch(batch([msg]), env)
    expect(msg.ack).toHaveBeenCalledOnce()
    expect(store.claim).not.toHaveBeenCalled()
    expect(accepted).not.toHaveBeenCalled()
  })

  it('acknowledges only after Bento acceptance is saved', async () => {
    const msg = message()
    await consumeDispatch(batch([msg]), environment())
    expect(accepted).toHaveBeenCalledWith(expect.anything(), invitation.email, expect.objectContaining({ dispatch_id: record.id }), job.operation, expect.any(AbortSignal))
    expect(store.complete.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(msg.ack).mock.invocationCallOrder[0])
    expect(msg.retry).not.toHaveBeenCalled()
  })

  it('retries provider rejection and persists the failure independently', async () => {
    accepted.mockResolvedValue(false)
    const msg = message()
    await consumeDispatch(batch([msg]), environment())
    expect(store.fail).toHaveBeenCalledWith(record, 'provider_rejected')
    expect(msg.retry).toHaveBeenCalledWith({ delaySeconds: 60 })
    expect(msg.ack).not.toHaveBeenCalled()
  })

  it('acknowledges the fifth failed delivery rather than exceeding the queue budget', async () => {
    accepted.mockResolvedValue(false)
    const msg = message(job, 5)
    await consumeDispatch(batch([msg]), environment())
    expect(msg.ack).toHaveBeenCalledOnce()
    expect(msg.retry).not.toHaveBeenCalled()
  })

  it('rejects malformed messages without touching the database or logging their contents', async () => {
    const msg = message({ secret: 'private-message' })
    await consumeDispatch(batch([msg]), environment())
    expect(msg.ack).toHaveBeenCalledOnce()
    expect(db.connect).not.toHaveBeenCalled()
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('private-message')
  })

  it('refuses multi-message invocations rather than processing them as a batch', async () => {
    const messages = [message(), message()]
    await consumeDispatch(batch(messages), environment())
    expect(db.connect).not.toHaveBeenCalled()
    expect(messages.every(msg => vi.mocked(msg.retry).mock.calls.length === 1)).toBe(true)
  })

  it('does not consume an attempt when configuration is missing or unsafe', async () => {
    const env = environment()
    env.WEBAPP_URL = 'https://user:secret@console.example.com'
    const msg = message()
    await consumeDispatch(batch([msg]), env)
    expect(store.claim).not.toHaveBeenCalled()
    expect(msg.retry).toHaveBeenCalled()
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('secret')
  })
})
