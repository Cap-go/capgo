import { definitions } from "~/types/supabase"

export interface Stats {
    apps: number
    channels: number
    versions: number
    sharedChannels: number
    updates: number
}
export interface Plan extends Stats {
    id: string
    name: string
    description: string
    price: {
      monthly: number
      yearly: number
    }
    abtest: boolean
    progressiveDeploy: boolean
}

export interface PlanData {
    plan: Plan,
    payment: definitions['stripe_info'] | null,
    canUseMore: boolean
}

export interface PlanRes extends PlanData {
    trialDaysLeft: 0,
    AllPlans: Record<string, Plan>,
}