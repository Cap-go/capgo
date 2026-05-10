import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reserveNativeBuildSlot } from '../supabase/functions/_backend/public/build/concurrency.ts'

const { mockCloseClient, mockGetPgClient, mockLogPgError } = vi.hoisted(() => ({
  mockCloseClient: vi.fn(),
  mockGetPgClient: vi.fn(),
  mockLogPgError: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/pg.ts', () => ({
  closeClient: mockCloseClient,
  getPgClient: mockGetPgClient,
  logPgError: mockLogPgError,
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
    mockGetPgClient.mockReset()
    mockLogPgError.mockReset()
  })

  it('reserves a slot when the org is below its plan limit', async () => {
    const { client, pool } = mockPgClient({
      activeCount: 2,
      planLimit: 3,
      planName: 'Maker',
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
    const { client } = mockPgClient({
      activeCount: 2,
      planLimit: 2,
      planName: 'Solo',
    })

    await expect(reserveNativeBuildSlot(context as any, input)).rejects.toMatchObject({
      status: 429,
    })

    expect(client.query).toHaveBeenCalledWith('ROLLBACK')
    expect(client.query).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE public.build_requests'), expect.anything())
    expect(client.release).toHaveBeenCalledTimes(1)
  })

  it('uses the native build concurrency limit returned from the plans table', async () => {
    const { client } = mockPgClient({
      activeCount: 4,
      planLimit: 6,
      planName: 'Enterprise',
      reservationStatus: 'starting',
    })

    const result = await reserveNativeBuildSlot(context as any, input)

    expect(result.limit).toBe(6)
    expect(result.planName).toBe('Enterprise')
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('current_plan.native_build_concurrency'), [input.orgId])
  })
})

function mockPgClient(options: {
  activeCount: number
  planLimit: number
  planName: string
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

      if (query.includes('current_plan.native_build_concurrency')) {
        expect(params).toEqual(['91f8cce5-76bc-48f7-8c0e-f4ca64fa2f57'])
        return {
          rowCount: 1,
          rows: [{
            native_build_concurrency: options.planLimit,
            plan_name: options.planName,
          }],
        }
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
