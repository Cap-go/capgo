import type Stripe from 'stripe'
import { describe, expect, it } from 'vitest'
import { aggregateRevenueMovementEvents, buildRevenueMovementEvents, fetchStripeEvents, findMissingResetSnapshotEventIds, getDatabaseUrl, getRequiredDatabaseUrl, mergeMetricRows, shouldAllowSelfSignedPgCertificate, summarizeDailyRevenueMetrics } from '../scripts/backfill_retention_metrics.ts'

const plans = [
  {
    stripe_id: 'prod_solo',
    price_m: 12,
    price_m_id: 'price_solo_monthly',
    price_y: 120,
    price_y_id: 'price_solo_yearly',
  },
  {
    stripe_id: 'prod_team',
    price_m: 49,
    price_m_id: 'price_team_monthly',
    price_y: 468,
    price_y_id: 'price_team_yearly',
  },
] as const

function subscriptionItem(priceId: string, productId: string, currentPeriodEnd?: number, usageType = 'licensed') {
  return {
    current_period_end: currentPeriodEnd,
    plan: {
      id: priceId,
      product: productId,
      usage_type: usageType,
    },
  } as Stripe.SubscriptionItem
}

function subscriptionEvent(
  id: string,
  type: 'customer.subscription.created' | 'customer.subscription.deleted' | 'customer.subscription.updated',
  created: number,
  customerId: string,
  subscriptionId: string,
  priceId: string,
  productId: string,
  previous?: { priceId?: string, productId?: string, status?: string },
  currentPeriodEnd?: number,
) {
  const previousAttributes: Partial<Stripe.Subscription> = {}
  if (previous?.priceId && previous.productId) {
    previousAttributes.items = {
      data: [subscriptionItem(previous.priceId, previous.productId)],
    } as any
  }
  if (previous && 'status' in previous)
    previousAttributes.status = previous.status as any

  return {
    id,
    type,
    created,
    data: {
      object: {
        id: subscriptionId,
        object: 'subscription',
        customer: customerId,
        items: {
          data: [subscriptionItem(priceId, productId, currentPeriodEnd)],
        },
      },
      previous_attributes: previous
        ? previousAttributes
        : undefined,
    },
  } as Stripe.Event
}

describe('retention metric backfill helpers', () => {
  it.concurrent('builds new business metrics from created subscription events', () => {
    const result = buildRevenueMovementEvents([
      subscriptionEvent('evt_create', 'customer.subscription.created', 1774353600, 'cus_new', 'sub_new', 'price_solo_monthly', 'prod_solo'),
    ], plans as any, {
      fromDateId: '2026-03-24',
      toDateId: '2026-03-24',
    })

    expect(result.movements).toHaveLength(1)
    expect(result.movements[0]).toMatchObject({
      event_id: 'evt_create',
      customer_id: 'cus_new',
      date_id: '2026-03-24',
      opening_mrr: 0,
      new_business_mrr: 12,
      expansion_mrr: 0,
      contraction_mrr: 0,
      churn_mrr: 0,
    })
  })

  it.concurrent('builds expansion metrics from subscription update previous attributes', () => {
    const result = buildRevenueMovementEvents([
      subscriptionEvent('evt_update', 'customer.subscription.updated', 1774353600, 'cus_existing', 'sub_existing', 'price_team_monthly', 'prod_team', {
        priceId: 'price_solo_monthly',
        productId: 'prod_solo',
      }),
    ], plans as any, {
      fromDateId: '2026-03-24',
      toDateId: '2026-03-24',
    })

    expect(result.movements).toHaveLength(1)
    expect(result.movements[0]).toMatchObject({
      current_mrr: 12,
      next_mrr: 49,
      expansion_mrr: 37,
    })
  })

  it.concurrent('builds new business metrics from status-only subscription update activations with previous status', () => {
    const result = buildRevenueMovementEvents([
      subscriptionEvent('evt_status_update', 'customer.subscription.updated', 1774353600, 'cus_activated', 'sub_activated', 'price_solo_monthly', 'prod_solo', {
        status: 'incomplete',
      }),
    ], plans as any, {
      fromDateId: '2026-03-24',
      toDateId: '2026-03-24',
    })

    expect(result.movements).toHaveLength(1)
    expect(result.movements[0]).toMatchObject({
      event_id: 'evt_status_update',
      customer_id: 'cus_activated',
      current_mrr: 0,
      next_mrr: 12,
      new_business_mrr: 12,
    })
  })

  it.concurrent('skips first subscription update when previous revenue state is unknown', () => {
    const result = buildRevenueMovementEvents([
      subscriptionEvent('evt_metadata_update', 'customer.subscription.updated', 1774353600, 'cus_existing_unknown', 'sub_existing_unknown', 'price_solo_monthly', 'prod_solo'),
    ], plans as any, {
      fromDateId: '2026-03-24',
      toDateId: '2026-03-24',
    })

    expect(result.movements).toHaveLength(0)
    expect(result.skipped.noMovement).toBe(1)
  })

  it.concurrent('does not invent movement for first past due subscription updates', () => {
    const result = buildRevenueMovementEvents([
      subscriptionEvent('evt_past_due_update', 'customer.subscription.updated', 1774353600, 'cus_past_due', 'sub_past_due', 'price_solo_monthly', 'prod_solo', {
        status: 'past_due',
      }),
    ], plans as any, {
      fromDateId: '2026-03-24',
      toDateId: '2026-03-24',
    })

    expect(result.movements).toHaveLength(0)
    expect(result.skipped.noMovement).toBe(1)
  })

  it.concurrent('falls back to the first subscription item when no licensed item is present', () => {
    const result = buildRevenueMovementEvents([
      {
        id: 'evt_metered_fallback',
        type: 'customer.subscription.created',
        created: 1774353600,
        data: {
          object: {
            id: 'sub_metered',
            object: 'subscription',
            customer: 'cus_metered',
            items: {
              data: [subscriptionItem('price_solo_monthly', 'prod_solo', undefined, 'metered')],
            },
          },
        },
      } as Stripe.Event,
    ], plans as any, {
      fromDateId: '2026-03-24',
      toDateId: '2026-03-24',
    })

    expect(result.movements).toHaveLength(1)
    expect(result.movements[0]).toMatchObject({
      event_id: 'evt_metered_fallback',
      new_business_mrr: 12,
    })
    expect(result.skipped.missingPlan).toBe(0)
  })

  it.concurrent('builds churn metrics from deleted subscription events', () => {
    const result = buildRevenueMovementEvents([
      subscriptionEvent('evt_deleted', 'customer.subscription.deleted', 1774353600, 'cus_churned', 'sub_churned', 'price_team_yearly', 'prod_team'),
    ], plans as any, {
      fromDateId: '2026-03-24',
      toDateId: '2026-03-24',
    })

    expect(result.movements).toHaveLength(1)
    expect(result.movements[0]).toMatchObject({
      current_mrr: 39,
      next_mrr: 0,
      churn_mrr: 39,
    })
  })

  it.concurrent('does not churn deleted subscriptions that are active until period end', () => {
    const result = buildRevenueMovementEvents([
      subscriptionEvent('evt_deleted_period_end', 'customer.subscription.deleted', 1774353600, 'cus_canceling', 'sub_canceling', 'price_team_monthly', 'prod_team', undefined, 1774440000),
    ], plans as any, {
      fromDateId: '2026-03-24',
      toDateId: '2026-03-24',
    })

    expect(result.movements).toHaveLength(0)
    expect(result.skipped.noMovement).toBe(1)
  })

  it.concurrent('aggregates multiple movements for one customer-day with the first opening MRR', () => {
    const result = buildRevenueMovementEvents([
      subscriptionEvent('evt_create', 'customer.subscription.created', 1774353600, 'cus_sequence', 'sub_sequence', 'price_solo_monthly', 'prod_solo'),
      subscriptionEvent('evt_update', 'customer.subscription.updated', 1774357200, 'cus_sequence', 'sub_sequence', 'price_team_monthly', 'prod_team'),
      subscriptionEvent('evt_delete', 'customer.subscription.deleted', 1774360800, 'cus_sequence', 'sub_sequence', 'price_team_monthly', 'prod_team'),
    ], plans as any, {
      fromDateId: '2026-03-24',
      toDateId: '2026-03-24',
    })

    const rows = aggregateRevenueMovementEvents(result.movements)
    expect(rows).toEqual([
      {
        date_id: '2026-03-24',
        customer_id: 'cus_sequence',
        opening_mrr: 0,
        new_business_mrr: 12,
        expansion_mrr: 37,
        contraction_mrr: 0,
        churn_mrr: 49,
      },
    ])
    expect(summarizeDailyRevenueMetrics(rows)).toMatchObject({
      rows: 1,
      new_business_mrr: 12,
      expansion_mrr: 37,
      churn_mrr: 49,
    })
  })

  it.concurrent('preserves input order for same-timestamp events', () => {
    const result = buildRevenueMovementEvents([
      subscriptionEvent('evt_z_create', 'customer.subscription.created', 1774353600, 'cus_same_second', 'sub_same_second', 'price_solo_monthly', 'prod_solo'),
      subscriptionEvent('evt_a_delete', 'customer.subscription.deleted', 1774353600, 'cus_same_second', 'sub_same_second', 'price_solo_monthly', 'prod_solo'),
    ], plans as any, {
      fromDateId: '2026-03-24',
      toDateId: '2026-03-24',
    })

    expect(result.movements).toHaveLength(2)
    expect(result.movements.map(movement => movement.event_id)).toEqual([
      'evt_z_create',
      'evt_a_delete',
    ])
    expect(result.movements[0]).toMatchObject({
      new_business_mrr: 12,
      expansion_mrr: 0,
      churn_mrr: 0,
    })
    expect(result.movements[1]).toMatchObject({
      new_business_mrr: 0,
      expansion_mrr: 0,
      churn_mrr: 12,
    })
  })

  it.concurrent('keeps an existing zero opening MRR when incrementally merging same-day rows', () => {
    const merged = mergeMetricRows([
      {
        date_id: '2026-03-24',
        customer_id: 'cus_sequence',
        opening_mrr: 0,
        new_business_mrr: 12,
        expansion_mrr: 0,
        contraction_mrr: 0,
        churn_mrr: 0,
      } as any,
    ], [
      {
        date_id: '2026-03-24',
        customer_id: 'cus_sequence',
        opening_mrr: 49,
        new_business_mrr: 0,
        expansion_mrr: 0,
        contraction_mrr: 0,
        churn_mrr: 49,
      },
    ])

    expect(merged[0]).toMatchObject({
      opening_mrr: 0,
      new_business_mrr: 12,
      churn_mrr: 49,
    })
  })

  it.concurrent('detects reset snapshots that miss already processed event ids', () => {
    const missing = findMissingResetSnapshotEventIds([
      {
        event_id: 'evt_known',
        event_type: 'customer.subscription.created',
        date_id: '2026-03-24',
        customer_id: 'cus_reset',
        opening_mrr: 0,
        current_mrr: 0,
        next_mrr: 12,
        new_business_mrr: 12,
        expansion_mrr: 0,
        contraction_mrr: 0,
        churn_mrr: 0,
      },
    ], ['evt_known', 'evt_missing'])

    expect(missing).toEqual(['evt_missing'])
  })

  it.concurrent('keeps Stripe API source order for same-second events across event types', async () => {
    const seenParams: Stripe.EventListParams[] = []
    const stripe = {
      events: {
        list(params: Stripe.EventListParams) {
          seenParams.push(params)
          return (async function* () {
            yield subscriptionEvent('evt_deleted_same_second', 'customer.subscription.deleted', 1774353600, 'cus_api', 'sub_api', 'price_solo_monthly', 'prod_solo')
            yield subscriptionEvent('evt_created_same_second', 'customer.subscription.created', 1774353600, 'cus_api', 'sub_api', 'price_solo_monthly', 'prod_solo')
          })()
        },
      },
    } as any

    const result = await fetchStripeEvents(stripe, '2026-03-24', '2026-03-24', null)

    expect(seenParams).toHaveLength(1)
    expect(seenParams[0]?.types).toEqual([
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
    ])
    expect(result.reachedLimit).toBe(false)
    expect(result.events.map(event => event.id)).toEqual([
      'evt_deleted_same_second',
      'evt_created_same_second',
    ])
  })

  it.concurrent('flags truncated Stripe event fetches when the limit is reached', async () => {
    const stripe = {
      events: {
        list() {
          return (async function* () {
            yield subscriptionEvent('evt_first', 'customer.subscription.created', 1774353600, 'cus_limit', 'sub_limit', 'price_solo_monthly', 'prod_solo')
            yield subscriptionEvent('evt_second', 'customer.subscription.updated', 1774357200, 'cus_limit', 'sub_limit', 'price_team_monthly', 'prod_team', {
              priceId: 'price_solo_monthly',
              productId: 'prod_solo',
            })
          })()
        },
      },
    } as any

    const result = await fetchStripeEvents(stripe, '2026-03-24', '2026-03-24', 1)

    expect(result.reachedLimit).toBe(true)
    expect(result.events).toHaveLength(1)
    expect(result.events[0]?.id).toBe('evt_first')
  })

  it.concurrent('prefers MAIN_SUPABASE_DB_URL for apply writes', () => {
    expect(getDatabaseUrl({
      MAIN_SUPABASE_DB_URL: 'postgres://main-writer',
      SUPABASE_DB_URL: 'postgres://fallback-direct',
    })).toBe('postgres://main-writer')
  })

  it.concurrent('accepts MAIN_SUPABASE_DB_URL as the required apply database url', () => {
    expect(getRequiredDatabaseUrl({
      MAIN_SUPABASE_DB_URL: 'postgres://main-writer',
    })).toBe('postgres://main-writer')
  })

  it.concurrent('rejects malformed database urls early', () => {
    expect(() => getRequiredDatabaseUrl({
      DATABASE_URL: 'not-a-valid-postgres-url',
    })).toThrow('--apply requires a valid Postgres URL from MAIN_SUPABASE_DB_URL, DATABASE_URL, POSTGRES_URL, SUPABASE_DB_URL, SUPABASE_DB_DIRECT_URL, DIRECT_URL')
  })

  it.concurrent('falls back to DATABASE_URL before direct-url env names', () => {
    expect(getDatabaseUrl({
      DATABASE_URL: 'postgres://database-url',
      SUPABASE_DB_DIRECT_URL: 'postgres://direct',
      DIRECT_URL: 'postgres://direct-legacy',
    })).toBe('postgres://database-url')

    expect(getRequiredDatabaseUrl({
      DATABASE_URL: 'postgres://database-url',
      SUPABASE_DB_DIRECT_URL: 'postgres://direct',
      DIRECT_URL: 'postgres://direct-legacy',
    })).toBe('postgres://database-url')
  })

  it.concurrent('allows the Supabase writer pooler TLS chain by default', () => {
    expect(shouldAllowSelfSignedPgCertificate(
      {},
      'postgresql://postgres:secret@db.project-ref.supabase.co:6543/postgres',
    )).toBe(true)
  })

  it.concurrent('keeps strict verification when PG_SSL_REJECT_UNAUTHORIZED forces it', () => {
    expect(shouldAllowSelfSignedPgCertificate(
      { PG_SSL_REJECT_UNAUTHORIZED: '1' },
      'postgresql://postgres:secret@db.project-ref.supabase.co:6543/postgres',
    )).toBe(false)
  })

  it.concurrent('honors PG_ALLOW_SELF_SIGNED_CERT=1 as the highest-priority override', () => {
    expect(shouldAllowSelfSignedPgCertificate(
      { PG_ALLOW_SELF_SIGNED_CERT: '1', PG_SSL_REJECT_UNAUTHORIZED: '1' },
      'postgresql://postgres:secret@db.project-ref.supabase.co:6543/postgres',
    )).toBe(true)
  })

  it.concurrent('honors PG_ALLOW_SELF_SIGNED_CERT=0 as the highest-priority override', () => {
    expect(shouldAllowSelfSignedPgCertificate(
      { PG_ALLOW_SELF_SIGNED_CERT: '0', PG_SSL_REJECT_UNAUTHORIZED: '0' },
      'postgresql://postgres:secret@db.project-ref.supabase.co:6543/postgres',
    )).toBe(false)
  })

  it.concurrent('skips deleted events when pre-range state tracks a different subscription id', () => {
    const result = buildRevenueMovementEvents([
      subscriptionEvent('evt_pre_range_create', 'customer.subscription.created', 1774267200, 'cus_active', 'sub_new', 'price_team_monthly', 'prod_team'),
      subscriptionEvent('evt_old_deleted', 'customer.subscription.deleted', 1774353600, 'cus_active', 'sub_old', 'price_team_monthly', 'prod_team'),
    ], plans as any, {
      fromDateId: '2026-03-24',
      toDateId: '2026-03-24',
    })

    expect(result.movements).toHaveLength(0)
    expect(result.skipped.subscriptionMismatch).toBe(1)
  })

  it.concurrent('does not use current subscription id as a historical deletion baseline', () => {
    const result = buildRevenueMovementEvents([
      subscriptionEvent('evt_deleted', 'customer.subscription.deleted', 1774353600, 'cus_historical_churn', 'sub_old', 'price_team_monthly', 'prod_team'),
    ], plans as any, {
      fromDateId: '2026-03-24',
      toDateId: '2026-03-24',
    })

    expect(result.movements).toHaveLength(1)
    expect(result.movements[0]).toMatchObject({
      event_id: 'evt_deleted',
      churn_mrr: 49,
    })
  })
})
