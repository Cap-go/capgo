import axios from 'https://deno.land/x/axiod@0.26.2/mod.ts'
import { shallowCleanObject } from './utils.ts'
import { getEnv } from './utils.ts'

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

// https://api.useplunk.com/v1
function getAuth() {
  // get plunk token
  const PLUNK_API_KEY = getEnv('PLUNK_API_KEY')
  return `Bearer ${PLUNK_API_KEY}`
}
const baseUrl = () => 'https://api.useplunk.com'
function getConfig() {
  return {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': getAuth(),
    },
  }
}

export async function trackEvent(email: string, data: any, event: string) {
  const url = `${baseUrl()}/v1/track`
  const response = await axios.post(url, {
    email,
    event,
    data: shallowCleanObject(data),
  }, getConfig()).catch((e) => {
    console.log('trackEvent error', e)
    return { data: { error: e } }
  })
  return response.data
}

export async function addContact(email: string, data: any) {
  const url = `${baseUrl()}/v1/contacts`
  const payload = {
    email,
    subscribed: true,
    data: shallowCleanObject(data),
  }
  console.log('addContact', email)
  const response = await axios.post(url, payload, getConfig()).catch((e) => {
    console.log('addContact error', e)
    return { data: { error: e } }
  })
  return response.data
}

export function addDataContact(email: string, data: Person, segments?: Segments) {
  console.log('addDataContact', email, data, segments)
  return trackEvent(email, shallowCleanObject({ ...data, ...segments }), 'user:addData')
}

export async function sendEmail(to: string, subject: string, body: string) {
  const url = `${baseUrl()}/v1/send`
  const response = await axios.post(url, {
    to,
    subject,
    body,
  }, getConfig()).catch((e) => {
    console.log('trackEvent error', e)
    return { data: { error: e } }
  })
  return response.data
}
