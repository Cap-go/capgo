import type Stripe from 'stripe'
import { describe, expect, it } from 'vitest'
import { aggregateRevenueMovementEvents, buildRevenueMovementEvents, mergeMetricRows, summarizeDailyRevenueMetrics } from '../scripts/backfill_retention_metrics.ts'

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

function subscriptionItem(priceId: string, productId: string) {
  return {
    plan: {
      id: priceId,
      product: productId,
      usage_type: 'licensed',
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
          data: [subscriptionItem(priceId, productId)],
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
