import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  closeClient: vi.fn(async () => undefined),
  getPgClient: vi.fn(),
  query: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/pg.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../supabase/functions/_backend/utils/pg.ts')>()
  return {
    ...actual,
    closeClient: mocks.closeClient,
    getPgClient: mocks.getPgClient,
    getDrizzleClient: vi.fn((client: { id: number }) => ({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => mocks.query(client.id),
          }),
        }),
      }),
    })),
    logPgError: vi.fn(),
  }
})

vi.mock('../supabase/functions/_backend/utils/pg_auth_retry.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../supabase/functions/_backend/utils/pg_auth_retry.ts')>()
  return { ...actual, waitAuthPgRetryJitter: vi.fn(async () => undefined) }
})

const { getAppPlanStatePg } = await import('../supabase/functions/_backend/utils/pg_files.ts')

const c = {} as any
const callerClient = (await import('../supabase/functions/_backend/utils/pg.ts')).getDrizzleClient({ id: 0 } as any)
const transientError = Object.assign(new Error('Connection terminated unexpectedly'), { code: 'ECONNRESET' })

describe('getAppPlanStatePg', () => {
  let nextClientId = 0

  beforeEach(() => {
    vi.clearAllMocks()
    nextClientId = 0
    mocks.getPgClient.mockImplementation(async () => ({ id: ++nextClientId }))
  })

  it('uses the caller client when the first attempt succeeds', async () => {
    mocks.query.mockResolvedValueOnce([{ owner_org: 'org-1', plan_valid: false }])

    const result = await getAppPlanStatePg(c, 'com.demo.app', callerClient, ['mau'])

    expect(result).toEqual({ kind: 'ok', value: { owner_org: 'org-1', plan_valid: false } })
    expect(mocks.getPgClient).not.toHaveBeenCalled()
    expect(mocks.closeClient).not.toHaveBeenCalled()
  })

  it('retries a transient failure on a fresh client', async () => {
    mocks.query
      .mockRejectedValueOnce(transientError)
      .mockResolvedValueOnce([{ owner_org: 'org-1', plan_valid: true }])

    const result = await getAppPlanStatePg(c, 'com.demo.app', callerClient, ['mau'])

    expect(result).toEqual({ kind: 'ok', value: { owner_org: 'org-1', plan_valid: true } })
    expect(mocks.query.mock.calls.map(call => call[0])).toEqual([0, 1])
    expect(mocks.getPgClient).toHaveBeenCalledWith(c, false)
    expect(mocks.closeClient).toHaveBeenCalledTimes(1)
  })

  it('returns db_error after the retry is exhausted', async () => {
    mocks.query.mockRejectedValue(transientError)

    const result = await getAppPlanStatePg(c, 'com.demo.app', callerClient, ['mau'])

    expect(result).toEqual({ kind: 'db_error', error: transientError })
    expect(mocks.query).toHaveBeenCalledTimes(2)
  })

  it('does not retry permanent errors', async () => {
    const permanentError = Object.assign(new Error('column "foo" does not exist'), { code: '42703' })
    mocks.query.mockRejectedValue(permanentError)

    const result = await getAppPlanStatePg(c, 'com.demo.app', callerClient, ['mau'])

    expect(result).toEqual({ kind: 'db_error', error: permanentError })
    expect(mocks.query).toHaveBeenCalledTimes(1)
    expect(mocks.getPgClient).not.toHaveBeenCalled()
  })

  it('returns not_found when the app row is missing', async () => {
    mocks.query.mockResolvedValue([])

    await expect(getAppPlanStatePg(c, 'com.demo.app', callerClient, ['mau'])).resolves.toEqual({ kind: 'not_found' })
  })

  it('fails closed without plan actions', async () => {
    await expect(getAppPlanStatePg(c, 'com.demo.app', callerClient, [])).rejects.toThrow('at least one plan action')
    expect(mocks.getPgClient).not.toHaveBeenCalled()
  })
})
