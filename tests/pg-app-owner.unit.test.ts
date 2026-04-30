import { describe, expect, it, vi } from 'vitest'

function createContext() {
  return {
    get: (key: string) => key === 'requestId' ? 'request-id' : undefined,
  } as any
}

function createQueryChain(result: any[] | Error) {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    then: vi.fn((resolve: (rows: any[]) => unknown) => {
      if (result instanceof Error)
        return Promise.reject(result)
      return Promise.resolve(resolve(result))
    }),
  }

  return chain
}

function createDrizzleClient(results: Array<any[] | Error>) {
  const chains = results.map(createQueryChain)
  let index = 0
  const drizzleClient = {
    select: vi.fn(() => chains[index++]),
  }

  return { drizzleClient, chains }
}

describe('getAppOwnerPostgres', () => {
  it.concurrent('keeps cloud app ownership when org metadata is missing from the replica', async () => {
    const { drizzleClient, chains } = createDrizzleClient([
      [
        {
          owner_org: '623c5839-8c68-4ace-803e-c695d9d28a2b',
          plan_valid: true,
          channel_device_count: 0,
          manifest_bundle_count: 0,
          expose_metadata: false,
          allow_device_custom_id: true,
          orgs: null,
        },
      ],
    ])

    const { getAppOwnerPostgres } = await import('../supabase/functions/_backend/utils/pg.ts')

    const appOwner = await getAppOwnerPostgres(
      createContext(),
      'com.test.replica-gap',
      drizzleClient as any,
      ['mau', 'bandwidth'],
    )

    expect(chains[0].leftJoin).toHaveBeenCalledTimes(1)
    expect(chains[0].innerJoin).not.toHaveBeenCalled()
    expect(appOwner).toMatchObject({
      owner_org: '623c5839-8c68-4ace-803e-c695d9d28a2b',
      plan_valid: true,
      orgs: {
        created_by: null,
        id: '623c5839-8c68-4ace-803e-c695d9d28a2b',
        management_email: null,
      },
    })
  })

  it.concurrent('falls back to the app row when replica metadata lookup errors', async () => {
    const replicaMetadataError = Object.assign(new Error('missing replicated org metadata'), {
      code: '42P01',
    })
    const { drizzleClient, chains } = createDrizzleClient([
      replicaMetadataError,
      [
        {
          owner_org: '623c5839-8c68-4ace-803e-c695d9d28a2b',
          channel_device_count: 2,
          manifest_bundle_count: 3,
          expose_metadata: true,
          allow_device_custom_id: false,
        },
      ],
    ])

    const { getAppOwnerPostgres } = await import('../supabase/functions/_backend/utils/pg.ts')

    const appOwner = await getAppOwnerPostgres(
      createContext(),
      'com.test.replica-metadata-error',
      drizzleClient as any,
      ['mau', 'bandwidth'],
    )

    expect(drizzleClient.select).toHaveBeenCalledTimes(2)
    expect(chains[0].leftJoin).toHaveBeenCalledTimes(1)
    expect(chains[1].leftJoin).not.toHaveBeenCalled()
    expect(appOwner).toMatchObject({
      owner_org: '623c5839-8c68-4ace-803e-c695d9d28a2b',
      plan_valid: true,
      channel_device_count: 2,
      manifest_bundle_count: 3,
      expose_metadata: true,
      allow_device_custom_id: false,
      orgs: {
        id: '623c5839-8c68-4ace-803e-c695d9d28a2b',
        management_email: null,
      },
    })
  })

  it.concurrent('does not use the app row fallback for generic query errors', async () => {
    const { drizzleClient } = createDrizzleClient([
      new Error('connection timeout'),
      [
        {
          owner_org: '623c5839-8c68-4ace-803e-c695d9d28a2b',
          channel_device_count: 2,
          manifest_bundle_count: 3,
          expose_metadata: true,
          allow_device_custom_id: false,
        },
      ],
    ])

    const { getAppOwnerPostgres } = await import('../supabase/functions/_backend/utils/pg.ts')

    const appOwner = await getAppOwnerPostgres(
      createContext(),
      'com.test.generic-error',
      drizzleClient as any,
      ['mau', 'bandwidth'],
    )

    expect(drizzleClient.select).toHaveBeenCalledTimes(1)
    expect(appOwner).toBeNull()
  })
})
