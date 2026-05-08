/*
 * Backfill admin revenue dashboard metrics from Stripe into public.global_stats.
 *
 * Implementation is shared with backfill_revenue_trend_metrics.ts so legacy
 * and dashboard-specific package scripts stay behaviorally identical.
 */
import { main } from './backfill_revenue_trend_metrics.ts'

await main()
