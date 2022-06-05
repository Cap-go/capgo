import type { definitions } from '~/types/supabase'

export interface Stats {
  max_app: number
  max_channel: number
  max_version: number
  max_shared: number
  max_update: number
  max_device: number
}

export interface PlanData {
  plan: string
  planSuggest: string
  stats: Stats
  payment: definitions['stripe_info'] | null
  canUseMore: boolean
}
export interface PlanRes extends PlanData {
  trialDaysLeft: 0
  AllPlans: definitions['plans'][]
}
