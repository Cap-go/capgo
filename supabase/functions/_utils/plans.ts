import { supabaseAdmin } from './supabase.ts'
import type { definitions } from './types_supabase.ts'
import dayjs from 'https://cdn.skypack.dev/dayjs'

export interface PlanData {
  plan: string,
  planSuggest: string,
  payment?: definitions['stripe_info'] | null,
  canUseMore: boolean
}
export interface PlanRes extends PlanData {
  trialDaysLeft: number,
  stats: definitions['app_stats'][],
  AllPlans: Record<string, Plan>,
}

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

export const plans: Record<string, Plan> = {
  free: {
    id: 'free',
    name: 'Free',
    description: 'plan.free.desc',
    price: {
      monthly: 0,
      yearly: 0,
    },
    apps: 1,
    channels: 1,
    updates: 500,
    versions: 10,
    sharedChannels: 0,
    abtest: false,
    progressiveDeploy: false,
  },
  solo: {
    id: Deno.env.get('PLAN_SOLO') || 'solo',
    name: 'Solo',
    description: 'plan.solo.desc',
    price: {
      monthly: 14,
      yearly: 146,
    },
    apps: 1,
    channels: 2,
    updates: 2500,
    versions: 10,
    sharedChannels: 0,
    abtest: false,
    progressiveDeploy: false,
  },
  maker: {
    id: Deno.env.get('PLAN_MAKER') || 'maker',
    name: 'Maker',
    description: 'plan.maker.desc',
    price: {
      monthly: 39,
      yearly: 389,
    },
    apps: 3,
    channels: 10,
    updates: 25000,
    versions: 100,
    sharedChannels: 10,
    abtest: false,
    progressiveDeploy: false,
  },
  team: {
    id: Deno.env.get('PLAN_TEAM') || 'team',
    name: 'Team',
    description: 'plan.team.desc',
    price: {
      monthly: 99,
      yearly: 998,
    },
    apps: 10,
    channels: 50,
    updates: 250000,
    versions: 1000,
    sharedChannels: 1000,
    abtest: true,
    progressiveDeploy: true,
  },
}

export const isAllowInMyPlan = (myPlan: Plan, app_stats: definitions['app_stats'][]): boolean => {
  if (app_stats && app_stats.length) {
       // find biggest number of versions
      const biggestChannels = app_stats.reduce((acc, app) => Math.max(acc, app.channels), 0)
      const biggestVersions = app_stats.reduce((acc, app) => Math.max(acc, app.versions), 0)
      const biggestUpdates = app_stats.reduce((acc, cur) => Math.max(acc, Math.max(cur.mlu, cur.mlu_real)), 0)
      return app_stats.length < myPlan.apps && biggestChannels < myPlan.channels && biggestVersions < myPlan.versions && biggestUpdates < myPlan.updates
  }
  return false
}

export const getMystats = async(user_id: string): Promise<definitions['app_stats'][]> => {
  const { data: app_stats } = await supabaseAdmin
    .from<definitions['app_stats']>('app_stats')
    .select()
    .eq('user_id', user_id)
  return app_stats || []
}

export const getMyPlan = async(user: definitions['users'], stats: definitions['app_stats'][]): Promise<PlanData> => {
  let payment: definitions['stripe_info'] | null = null
  const { data } = await supabaseAdmin
    .from<definitions['stripe_info']>('stripe_info')
    .select()
    .eq('customer_id', user.customer_id)
  if (data && data.length) {
    payment = data[0]
  }
  const product_id = payment?.product_id || 'free'
  const current = Object.values(plans)
    .find((plan) => {
      if (plan.id === product_id)
        return plan
      return false
    })
  if (current) {
    let planSuggest = Deno.env.get('PLAN_TEAM') || 'team'
    const found = Object.values(plans).find(plan => stats.length < plan.apps
      && stats.reduce((acc, cur) => Math.max(acc, cur.channels), 0) < plan.channels
      && stats.reduce((acc, cur) => Math.max(acc, cur.versions), 0) < plan.versions
      && stats.reduce((acc, cur) => Math.max(acc, cur.shared), 0) < plan.sharedChannels
      && stats.reduce((acc, cur) => Math.max(acc, Math.max(cur.mlu, cur.mlu_real)), 0) < plan.updates)
    if (found)
      planSuggest = found.id
    const canUseMore = await isAllowInMyPlan(current, stats)
    return { plan: current.id, payment, canUseMore, planSuggest }
  }
  return Promise.reject(Error('no data'))
}

export const currentPaymentstatus = async(user: definitions['users']): Promise<PlanRes> => {
  try {
    const stats = await getMystats(user.id)
    const myPlan = await getMyPlan(user, stats)
    const res: PlanRes = {
      stats,
      payment: myPlan.payment,
      plan: myPlan.plan,
      planSuggest: myPlan.planSuggest,
      canUseMore: myPlan.canUseMore,
      trialDaysLeft: 30,
      AllPlans: plans,
    }
    const today = dayjs()
    const trial_at = dayjs(myPlan.payment?.trial_at)
    const trial_at_one_month = trial_at.add(1, 'month')
    console.log('trial_at', trial_at, trial_at_one_month)
    if (trial_at_one_month.isAfter(today)) {
      res.trialDaysLeft = trial_at_one_month.diff(today, 'day')
      res.canUseMore = true
    }
    else {
      res.trialDaysLeft = 0
    }
    return res
  }
  catch (error) {
    console.log('currentPaymentstatus error', error)
    return {
      stats: [],
      canUseMore: false,
      trialDaysLeft: 0,
      AllPlans: plans,
      plan: 'free',
      planSuggest: 'solo',
    }
  }
}
