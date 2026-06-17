export const REQUIRED_GLOBAL_STATS_SHARDS = [
  'core',
  'usage',
  'revenue',
  'plugins',
  'builds',
  'retention',
  'paid_products',
  'ltv',
] as const

export const GLOBAL_STATS_SHARDS = [
  ...REQUIRED_GLOBAL_STATS_SHARDS,
  'notifications',
] as const
