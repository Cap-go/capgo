import axios from 'axios'
import type { Context } from 'hono'
import { getEnv, shallowCleanObject } from './utils.ts'

export interface Segments {
  capgo: boolean
  onboarded: boolean
  trial: boolean
  trial7: boolean
  trial1: boolean
  trial0: boolean
  paying: boolean
  plan: string
  payingMonthly: boolean
  overuse: boolean
  canceled: boolean
  issueSegment: boolean
}
// herit from Segments person
export interface Person {
  nickname?: string
  avatar?: string
  status?: string
  country?: string
  id?: string
  customer_id?: string
  product_id?: string
  price_id?: string
}

function hasPlunk(c: Context) {
  return getEnv(c, 'PLUNK_API_KEY').length > 0
}

// https://api.useplunk.com/v1
function getAuth(c: Context) {
  // get plunk token
  const PLUNK_API_KEY = getEnv(c, 'PLUNK_API_KEY')
  return `Bearer ${PLUNK_API_KEY}`
}
const baseUrl = () => 'https://api.useplunk.com'
function getConfig(c: Context) {
  return {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': getAuth(c),
    },
  }
}

export async function trackEvent(c: Context, email: string, data: any, event: string) {
  if (!hasPlunk(c))
    return
  const url = `${baseUrl()}/v1/track`
  const response = await axios.post(url, {
    email,
    event,
    data: shallowCleanObject(data),
  }, getConfig(c)).catch((e) => {
    console.log('trackEvent error', e)
    return { data: { error: e } }
  })
  return response.data
}

export async function addContact(c: Context, email: string, data: any) {
  if (!hasPlunk(c))
    return
  const url = `${baseUrl()}/v1/contacts`
  const payload = {
    email,
    subscribed: true,
    data: shallowCleanObject(data),
  }
  console.log('addContact', email)
  const response = await axios.post(url, payload, getConfig(c)).catch((e) => {
    console.log('addContact error', e)
    return { data: { error: e } }
  })
  return response.data
}

export function addDataContact(c: Context, email: string, data: Person, segments?: Segments) {
  console.log('addDataContact', email, data, segments)
  return trackEvent(c, email, shallowCleanObject({ ...data, ...segments }), 'user:addData')
}

export async function sendEmail(c: Context, to: string, subject: string, body: string) {
  if (!hasPlunk(c))
    return
  const url = `${baseUrl()}/v1/send`
  const response = await axios.post(url, {
    to,
    subject,
    body,
  }, getConfig(c)).catch((e) => {
    console.log('trackEvent error', e)
    return { data: { error: e } }
  })
  return response.data
}
