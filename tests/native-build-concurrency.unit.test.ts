import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getNativeBuildConcurrencyLimit, reserveNativeBuildSlot } from '../supabase/functions/_backend/public/build/concurrency.ts'

const { mockCloseClient, mockGetCurrentPlanNameOrg, mockGetPgClient, mockLogPgError } = vi.hoisted(() => ({
  mockCloseClient: vi.fn(),
  mockGetCurrentPlanNameOrg: vi.fn(),
  mockGetPgClient: vi.fn(),
  mockLogPgError: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/pg.ts', () => ({
  closeClient: mockCloseClient,
  getPgClient: mockGetPgClient,
  logPgError: mockLogPgError,
}))

vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  getCurrentPlanNameOrg: mockGetCurrentPlanNameOrg,
}))

describe('native build concurrency limits', () => {
  const context = {
    get: vi.fn((key: string) => key === 'requestId' ? 'req-native-build-concurrency' : undefined),
  }

  const input = {
    buildRequestId: 'db70bda5-99a9-49e2-a671-e62327e9737f',
    orgId: '91f8cce5-76bc-48f7-8c0e-f4ca64fa2f57',
    appId: 'com.test.native.concurrency',
    jobId: 'job-native-build-concurrency',
  }

  beforeEach(() => {
    mockCloseClient.mockReset()
    mockGetCurrentPlanNameOrg.mockReset()
    mockGetPgClient.mockReset()
    mockLogPgError.mockReset()
  })

  it.concurrent('maps each plan to the configured native build concurrency limit', () => {
    expect(getNativeBuildConcurrencyLimit('Solo')).toBe(2)
    expect(getNativeBuildConcurrencyLimit('Maker')).toBe(3)
    expect(getNativeBuildConcurrencyLimit('Team')).toBe(4)
    expect(getNativeBuildConcurrencyLimit('Enterprise')).toBe(6)
    expect(getNativeBuildConcurrencyLimit('Unknown')).toBe(2)
    expect(getNativeBuildConcurrencyLimit(null)).toBe(2)
  })

  it('reserves a slot when the org is below its plan limit', async () => {
    mockGetCurrentPlanNameOrg.mockResolvedValue('Maker')
    const { client, pool } = mockPgClient({
      activeCount: 2,
      reservationStatus: 'starting',
    })

    const result = await reserveNativeBuildSlot(context as any, input)

    expect(result).toEqual({
      activeBuilds: 2,
      limit: 3,
      planName: 'Maker',
      status: 'starting',
    })
    expect(client.query).toHaveBeenCalledWith('BEGIN')
    expect(client.query).toHaveBeenCalledWith('COMMIT')
    expect(client.query).not.toHaveBeenCalledWith('ROLLBACK')
    expect(client.release).toHaveBeenCalledTimes(1)
    expect(mockCloseClient).toHaveBeenCalledWith(context, pool)
  })

  it('rejects starts when active builds already reached the plan limit', async () => {
    mockGetCurrentPlanNameOrg.mockResolvedValue('Solo')
    const { client } = mockPgClient({ activeCount: 2 })

    await expect(reserveNativeBuildSlot(context as any, input)).rejects.toMatchObject({
      status: 429,
    })

    expect(client.query).toHaveBeenCalledWith('ROLLBACK')
    expect(client.query).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE public.build_requests'), expect.anything())
    expect(client.release).toHaveBeenCalledTimes(1)
  })
})

function mockPgClient(options: {
  activeCount: number
  reservationStatus?: string
}) {
  const client = {
    query: vi.fn(async (query: string, params?: unknown[]) => {
      if (query === 'BEGIN' || query === 'COMMIT' || query === 'ROLLBACK')
        return { rowCount: null, rows: [] }

      if (query.includes('SELECT id FROM public.orgs')) {
        expect(params).toEqual(['91f8cce5-76bc-48f7-8c0e-f4ca64fa2f57'])
        return { rowCount: 1, rows: [{ id: '91f8cce5-76bc-48f7-8c0e-f4ca64fa2f57' }] }
      }

      if (query.includes('COUNT(*)::text AS active_count')) {
        expect(params).toEqual([
          '91f8cce5-76bc-48f7-8c0e-f4ca64fa2f57',
          'db70bda5-99a9-49e2-a671-e62327e9737f',
          ['pending', 'succeeded', 'failed', 'expired', 'released', 'cancelled', 'canceled'],
        ])
        return { rowCount: 1, rows: [{ active_count: String(options.activeCount) }] }
      }

      if (query.includes('UPDATE public.build_requests')) {
        expect(params).toEqual([
          'db70bda5-99a9-49e2-a671-e62327e9737f',
          '91f8cce5-76bc-48f7-8c0e-f4ca64fa2f57',
          'com.test.native.concurrency',
          'job-native-build-concurrency',
          ['succeeded', 'failed', 'expired', 'released', 'cancelled', 'canceled'],
        ])
        return { rowCount: 1, rows: [{ status: options.reservationStatus ?? 'starting' }] }
      }

      throw new Error(`Unexpected query: ${query}`)
    }),
    release: vi.fn(),
  }
  const pool = {
    connect: vi.fn().mockResolvedValue(client),
  }
  mockGetPgClient.mockReturnValue(pool)
  return { client, pool }
}
