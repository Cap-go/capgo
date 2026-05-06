import type Stripe from 'stripe'
import { describe, expect, it } from 'vitest'
import { buildRevenueTrendBackfillRows } from '../scripts/backfill_revenue_trend_metrics.ts'

const DAY_1 = 1775001600 // 2026-04-01T00:00:00.000Z
const DAY_2 = 1775088000 // 2026-04-02T00:00:00.000Z
const DAY_3_NOON = 1775217600 // 2026-04-03T12:00:00.000Z

const plans = [
  { name: 'Solo', price_m: 12, price_y: 120, price_m_id: 'price_solo_monthly', price_y_id: 'price_solo_yearly' },
  { name: 'Maker', price_m: 29, price_y: 290, price_m_id: 'price_maker_monthly', price_y_id: 'price_maker_yearly' },
  { name: 'Team', price_m: 49, price_y: 588, price_m_id: 'price_team_monthly', price_y_id: 'price_team_yearly' },
  { name: 'Enterprise', price_m: 199, price_y: 2388, price_m_id: 'price_enterprise_monthly', price_y_id: 'price_enterprise_yearly' },
]

function globalStatsRow(dateId: string) {
  return {
    canceled_orgs: 0,
    churn_revenue: 0,
    date_id: dateId,
    mrr: 0,
    new_paying_orgs: 0,
    paying: 0,
    paying_monthly: 0,
    paying_yearly: 0,
    plan_enterprise: 0,
    plan_enterprise_monthly: 0,
    plan_enterprise_yearly: 0,
    plan_maker: 0,
    plan_maker_monthly: 0,
    plan_maker_yearly: 0,
    plan_solo: 0,
    plan_solo_monthly: 0,
    plan_solo_yearly: 0,
    plan_team: 0,
    plan_team_monthly: 0,
    plan_team_yearly: 0,
    revenue_enterprise: 0,
    revenue_maker: 0,
    revenue_solo: 0,
    revenue_team: 0,
    total_revenue: 0,
    upgraded_orgs: 0,
  }
}

function subscriptionItem(priceId: string, currentPeriodEnd?: number, usageType = 'licensed') {
  return {
    id: `si_${priceId}`,
    object: 'subscription_item',
    current_period_end: currentPeriodEnd,
    plan: {
      id: priceId,
      usage_type: usageType,
    },
    price: {
      id: priceId,
    },
  } as unknown as Stripe.SubscriptionItem
}

function subscription(
  customerId: string,
  subscriptionId: string,
  priceId: string,
  created = DAY_1,
  status: Stripe.Subscription.Status = 'active',
  currentPeriodEnd?: number,
) {
  return {
    id: subscriptionId,
    object: 'subscription',
    cancel_at_period_end: false,
    canceled_at: status === 'canceled' ? created : null,
    created,
    customer: customerId,
    ended_at: status === 'canceled' ? created : null,
    items: {
      data: [subscriptionItem(priceId, currentPeriodEnd)],
    },
    status,
  } as unknown as Stripe.Subscription
}

function subscriptionEvent(
  id: string,
  type: 'customer.subscription.created' | 'customer.subscription.deleted' | 'customer.subscription.updated',
  created: number,
  customerId: string,
  subscriptionId: string,
  priceId: string,
  options: {
    currentPeriodEnd?: number
    previousPriceId?: string
    previousStatus?: Stripe.Subscription.Status
    status?: Stripe.Subscription.Status
    subscriptionCreated?: number
  } = {},
) {
  const eventSubscription = subscription(
    customerId,
    subscriptionId,
    priceId,
    options.subscriptionCreated ?? created,
    options.status ?? (type === 'customer.subscription.deleted' ? 'canceled' : 'active'),
    options.currentPeriodEnd,
  )

  const previousAttributes: Partial<Stripe.Subscription> = {}
  if (options.previousPriceId) {
    previousAttributes.items = {
      data: [subscriptionItem(options.previousPriceId)],
    } as unknown as Stripe.ApiList<Stripe.SubscriptionItem>
  }
  if (options.previousStatus)
    previousAttributes.status = options.previousStatus

  return {
    id,
    object: 'event',
    created,
    data: {
      object: eventSubscription,
      previous_attributes: Object.keys(previousAttributes).length > 0 ? previousAttributes : undefined,
    },
    type,
  } as Stripe.Event
}

describe('revenue trend backfill metrics', () => {
  it.concurrent('builds new and canceled subscription flow with MRR and ARR snapshots', () => {
    const rows = buildRevenueTrendBackfillRows([
      globalStatsRow('2026-04-01'),
      globalStatsRow('2026-04-02'),
    ], {
      events: [
        subscriptionEvent('evt_create', 'customer.subscription.created', DAY_1 + 3600, 'cus_new', 'sub_new', 'price_solo_monthly'),
        subscriptionEvent('evt_delete', 'customer.subscription.deleted', DAY_2 + 3600, 'cus_new', 'sub_new', 'price_solo_monthly'),
      ],
      fromDateId: '2026-04-01',
      plans,
      toDateId: '2026-04-02',
    })

    expect(rows[0]).toMatchObject({
      canceled_orgs: 0,
      churn_revenue: 0,
      mrr: 12,
      new_paying_orgs: 1,
      paying: 1,
      paying_monthly: 1,
      paying_yearly: 0,
      plan_solo: 1,
      plan_solo_monthly: 1,
      revenue_solo: 144,
      total_revenue: 144,
    })
    expect(rows[1]).toMatchObject({
      canceled_orgs: 1,
      churn_revenue: 12,
      mrr: 0,
      new_paying_orgs: 0,
      paying: 0,
      paying_monthly: 0,
      plan_solo: 0,
      total_revenue: 0,
    })
  })

  it.concurrent('does not count reactivated customers as new paying orgs again', () => {
    const rows = buildRevenueTrendBackfillRows([
      globalStatsRow('2026-04-01'),
      globalStatsRow('2026-04-02'),
      globalStatsRow('2026-04-03'),
    ], {
      events: [
        subscriptionEvent('evt_create_first', 'customer.subscription.created', DAY_1 + 3600, 'cus_reactivated', 'sub_reactivated_first', 'price_solo_monthly'),
        subscriptionEvent('evt_delete_first', 'customer.subscription.deleted', DAY_2 + 3600, 'cus_reactivated', 'sub_reactivated_first', 'price_solo_monthly'),
        subscriptionEvent('evt_create_again', 'customer.subscription.created', DAY_3_NOON, 'cus_reactivated', 'sub_reactivated_second', 'price_solo_monthly'),
      ],
      fromDateId: '2026-04-01',
      plans,
      toDateId: '2026-04-03',
    })

    expect(rows[0]).toMatchObject({
      mrr: 12,
      new_paying_orgs: 1,
      plan_solo: 1,
    })
    expect(rows[1]).toMatchObject({
      canceled_orgs: 1,
      churn_revenue: 12,
      mrr: 0,
      new_paying_orgs: 0,
      plan_solo: 0,
    })
    expect(rows[2]).toMatchObject({
      mrr: 12,
      new_paying_orgs: 0,
      plan_solo: 1,
    })
  })

  it.concurrent('counts yearly and monthly baseline subscriptions by plan', () => {
    const rows = buildRevenueTrendBackfillRows([
      globalStatsRow('2026-04-01'),
    ], {
      baselineSubscriptions: [
        subscription('cus_team', 'sub_team', 'price_team_yearly', DAY_1 - 86400),
        subscription('cus_maker', 'sub_maker', 'price_maker_monthly', DAY_1 - 86400),
      ],
      events: [],
      fromDateId: '2026-04-01',
      plans,
      toDateId: '2026-04-01',
    })

    expect(rows[0]).toMatchObject({
      mrr: 78,
      paying: 2,
      paying_monthly: 1,
      paying_yearly: 1,
      plan_maker: 1,
      plan_maker_monthly: 1,
      plan_team: 1,
      plan_team_yearly: 1,
      revenue_maker: 348,
      revenue_team: 588,
      total_revenue: 936,
    })
  })

  it.concurrent('uses previous Stripe attributes for the opening plan before a first in-range update', () => {
    const rows = buildRevenueTrendBackfillRows([
      globalStatsRow('2026-04-01'),
      globalStatsRow('2026-04-02'),
    ], {
      baselineSubscriptions: [
        subscription('cus_upgrade', 'sub_upgrade', 'price_team_monthly', DAY_1 - 86400),
      ],
      events: [
        subscriptionEvent('evt_update', 'customer.subscription.updated', DAY_2 + 3600, 'cus_upgrade', 'sub_upgrade', 'price_team_monthly', {
          previousPriceId: 'price_solo_monthly',
          subscriptionCreated: DAY_1 - 86400,
        }),
      ],
      fromDateId: '2026-04-01',
      plans,
      toDateId: '2026-04-02',
    })

    expect(rows[0]).toMatchObject({
      mrr: 12,
      plan_solo: 1,
      plan_team: 0,
      revenue_solo: 144,
    })
    expect(rows[1]).toMatchObject({
      churn_revenue: 0,
      mrr: 49,
      plan_solo: 0,
      upgraded_orgs: 1,
      plan_team: 1,
      revenue_team: 588,
    })
  })

  it.concurrent('records downgrades as lost MRR without counting a cancellation', () => {
    const rows = buildRevenueTrendBackfillRows([
      globalStatsRow('2026-04-01'),
    ], {
      baselineSubscriptions: [
        subscription('cus_downgrade', 'sub_downgrade', 'price_team_monthly', DAY_1 - 86400),
      ],
      events: [
        subscriptionEvent('evt_downgrade', 'customer.subscription.updated', DAY_1 + 3600, 'cus_downgrade', 'sub_downgrade', 'price_solo_monthly', {
          previousPriceId: 'price_team_monthly',
          subscriptionCreated: DAY_1 - 86400,
        }),
      ],
      fromDateId: '2026-04-01',
      plans,
      toDateId: '2026-04-01',
    })

    expect(rows[0]).toMatchObject({
      canceled_orgs: 0,
      churn_revenue: 37,
      mrr: 12,
      plan_solo: 1,
      plan_team: 0,
    })
  })

  it.concurrent('counts status-only activations as new paying subscriptions', () => {
    const rows = buildRevenueTrendBackfillRows([
      globalStatsRow('2026-04-01'),
    ], {
      events: [
        subscriptionEvent('evt_activation', 'customer.subscription.updated', DAY_1 + 3600, 'cus_activation', 'sub_activation', 'price_solo_monthly', {
          previousStatus: 'incomplete',
        }),
      ],
      fromDateId: '2026-04-01',
      plans,
      toDateId: '2026-04-01',
    })

    expect(rows[0]).toMatchObject({
      mrr: 12,
      new_paying_orgs: 1,
      paying: 1,
      paying_monthly: 1,
      plan_solo: 1,
    })
  })

  it.concurrent('counts monthly-to-yearly changes as upgraded orgs', () => {
    const rows = buildRevenueTrendBackfillRows([
      globalStatsRow('2026-04-01'),
    ], {
      events: [
        subscriptionEvent('evt_yearly_upgrade', 'customer.subscription.updated', DAY_1 + 3600, 'cus_yearly_upgrade', 'sub_yearly_upgrade', 'price_solo_yearly', {
          previousPriceId: 'price_solo_monthly',
          subscriptionCreated: DAY_1 - 86400,
        }),
      ],
      fromDateId: '2026-04-01',
      plans,
      toDateId: '2026-04-01',
    })

    expect(rows[0]).toMatchObject({
      mrr: 10,
      paying: 1,
      paying_monthly: 0,
      paying_yearly: 1,
      plan_solo: 1,
      plan_solo_monthly: 0,
      plan_solo_yearly: 1,
      revenue_solo: 120,
      total_revenue: 120,
      upgraded_orgs: 1,
    })
  })

  it.concurrent('keeps cancel-at-period-end subscriptions active until the period expires', () => {
    const rows = buildRevenueTrendBackfillRows([
      globalStatsRow('2026-04-01'),
      globalStatsRow('2026-04-02'),
      globalStatsRow('2026-04-03'),
    ], {
      events: [
        subscriptionEvent('evt_create', 'customer.subscription.created', DAY_1 + 3600, 'cus_cancel_later', 'sub_cancel_later', 'price_team_monthly', {
          currentPeriodEnd: DAY_3_NOON,
        }),
        subscriptionEvent('evt_delete', 'customer.subscription.deleted', DAY_2 + 3600, 'cus_cancel_later', 'sub_cancel_later', 'price_team_monthly', {
          currentPeriodEnd: DAY_3_NOON,
        }),
      ],
      fromDateId: '2026-04-01',
      plans,
      toDateId: '2026-04-03',
    })

    expect(rows[1]).toMatchObject({
      canceled_orgs: 0,
      churn_revenue: 0,
      mrr: 49,
      plan_team: 1,
    })
    expect(rows[2]).toMatchObject({
      canceled_orgs: 1,
      churn_revenue: 49,
      mrr: 0,
      plan_team: 0,
    })
  })
})
