import ky from 'ky'
import type { Context } from '@hono/hono'
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
function getConfigHeaders(c: Context) {
  return {
    'Content-Type': 'application/json',
    'Authorization': getAuth(c),
  }
}

function convertToString(obj: any): any {
  if (typeof obj !== 'object' || obj === null)
    return obj

  if (Array.isArray(obj))
    return obj.map(convertToString)

  const convertedObj: { [key: string]: string } = {}

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key))
      convertedObj[key] = String(obj[key])
  }

  return convertedObj
}

export async function trackEvent(c: Context, email: string, data: any, event: string) {
  if (!hasPlunk(c))
    return
  const url = `${baseUrl()}/v1/track`
  try {
    const res = await ky.post(url, {
      json: {
        email,
        event,
        data: convertToString(shallowCleanObject(data)),
      },
      headers: getConfigHeaders(c),
    })
      .then(res => res.json())
    console.log({ requestId: c.get('requestId'), context: 'trackEvent', email, event, res })
    return res
  }
  catch (e) {
    console.log({ requestId: c.get('requestId'), context: 'trackEvent error', error: e })
    if (e.name === 'HTTPError') {
      const errorJson = await e.response.json()
      console.log({ requestId: c.get('requestId'), context: 'errorJson', errorJson })
    }
    return false
  }
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
  console.log({ requestId: c.get('requestId'), context: 'addContact', email })
  try {
    const res = await ky.post(url, {
      json: payload,
      headers: getConfigHeaders(c),
    })
      .then(res => res.json())
    console.log({ requestId: c.get('requestId'), context: 'addContact', email, res })
    return res
  }
  catch (e) {
    console.log({ requestId: c.get('requestId'), context: 'addContact error', error: e })
    if (e.name === 'HTTPError') {
      const errorJson = await e.response.json()
      console.log({ requestId: c.get('requestId'), context: 'errorJson', errorJson })
    }
    return false
  }
}

export function addDataContact(c: Context, email: string, data: Person, segments?: Segments) {
  console.log({ requestId: c.get('requestId'), context: 'addDataContact', email, data, segments })
  return trackEvent(c, email, shallowCleanObject({ ...data, ...segments }), 'user:addData')
}

export async function sendEmail(c: Context, to: string, subject: string, body: string) {
  if (!hasPlunk(c))
    return
  const url = `${baseUrl()}/v1/send`
  try {
    const res = await ky.post(url, {
      json: {
        to,
        subject,
        body,
      },
      headers: getConfigHeaders(c),
    })
      .then(res => res.json())
    console.log({ requestId: c.get('requestId'), context: 'sendEmail', to, subject, res })
    return res
  }
  catch (e) {
    console.log({ requestId: c.get('requestId'), context: 'sendEmail error', error: e })
    if (e.name === 'HTTPError') {
      const errorJson = await e.response.json()
      console.log({ requestId: c.get('requestId'), context: 'errorJson', errorJson })
    }
    return false
  }
}
