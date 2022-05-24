import { supabaseAdmin } from './supabase.ts'
import type { definitions } from './types_supabase.ts'

interface Stats {
  apps: number
  channels: number
  versions: number
  sharedChannels: number
  updates: number
}
interface Plan extends Stats {
  id: string
  name: string
  price: {
    monthly: number
    yearly: number
  }
  abtest: boolean
  progressiveDeploy: boolean
}

const plans: Record<string, Plan> = {
  free: {
    id: 'free',
    name: 'Free',
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
    id: 'prod_LQIzwwVu6oMmAz',
    name: 'Solo',
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
    id: 'prod_LQIzozukEwDZDM',
    name: 'Maker',
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
    id: 'prod_LQIzm2NGzayzXi',
    name: 'Team',
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

export const getMyPlan = async(user_id: string): Promise<Plan> => {
  console.log('user', user_id)
  let user: definitions['users']
  const { data: users } = await supabaseAdmin
    .from<definitions['users']>('users')
    .select()
    .eq('id', user_id)
  if (users && users.length)
    user = users[0]
  else
    return Promise.reject(Error('no user found'))
  if (!user?.customer_id)
    return Promise.reject(Error('no customer_id'))
  const { data } = await supabaseAdmin
    .from<definitions['stripe_info']>('stripe_info')
    .select()
    .eq('customer_id', user.customer_id)
  const product_id = data?.length && data[0].product_id ? data[0].product_id : 'free'
  const current = Object.values(plans)
    .find((plan) => {
      if (plan.id === product_id)
        return plan
      return false
    })
  if (current)
    return current
  return Promise.reject(Error('no data'))
}

export const isAllowToAddApp = async(user_id: string): Promise<boolean> => {
  const myPlan = await getMyPlan(user_id)
  // get all my apps
  const { data: apps } = await supabaseAdmin
    .from<definitions['apps']>('apps')
    .select()
    .eq('user_id', user_id)
  if (apps && apps.length)
    return apps.length < myPlan.apps
  return false
}

export const isAllowToUploadApp = async(user_id: string): Promise<boolean> => {
  const myPlan = await getMyPlan(user_id)
  // get all my apps
  const { data: app_stats } = await supabaseAdmin
    .from<definitions['app_stats']>('app_stats')
    .select()
    .eq('user_id', user_id)
  if (app_stats && app_stats.length) {
  // find biggest number of versions
    const biggest = app_stats.reduce((acc, app) => Math.max(acc, app.versions), 0)
    return biggest < myPlan.versions
  }
  return false
}

export const isAllowToCreateChannelApp = async(user_id: string): Promise<boolean> => {
  const myPlan = await getMyPlan(user_id)
  // get all my apps
  const { data: app_stats } = await supabaseAdmin
    .from<definitions['app_stats']>('app_stats')
    .select()
    .eq('user_id', user_id)
  if (app_stats && app_stats.length) {
    // find biggest number of versions
    const biggest = app_stats.reduce((acc, app) => Math.max(acc, app.channels), 0)
    return biggest < myPlan.channels
  }
  return false
}

export const isAllowToUpdateApp = async(user_id: string): Promise<boolean> => {
  const myPlan = await getMyPlan(user_id)
  // get all my apps
  const { data: app_stats } = await supabaseAdmin
    .from<definitions['app_stats']>('app_stats')
    .select()
    .eq('user_id', user_id)
  if (app_stats && app_stats.length) {
    // find biggest number of versions
    const biggest = app_stats.reduce((acc, cur) => Math.max(acc, Math.max(cur.mlu, cur.mlu_real)), 0)
    return biggest < myPlan.versions
  }
  return false
}

export const isAllowInMyPlan = async(user_id: string): Promise<boolean> => {
  const myPlan = await getMyPlan(user_id)
  // get all my apps
  const { data: app_stats } = await supabaseAdmin
    .from<definitions['app_stats']>('app_stats')
    .select()
    .eq('user_id', user_id)
  if (app_stats && app_stats.length) {
    // find biggest number of versions
    const biggestChannels = app_stats.reduce((acc, app) => Math.max(acc, app.channels), 0)
    const biggestVersions = app_stats.reduce((acc, app) => Math.max(acc, app.versions), 0)
    const biggestUpdates = app_stats.reduce((acc, cur) => Math.max(acc, Math.max(cur.mlu, cur.mlu_real)), 0)
    return app_stats.length < myPlan.apps && biggestChannels < myPlan.channels && biggestVersions < myPlan.versions && biggestUpdates < myPlan.updates
  }
  return false
}
