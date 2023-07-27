import axios from 'https://deno.land/x/axiod@0.26.2/mod.ts'

export interface Person {
  nickname?: string
  avatar?: string
  status?: string
  country?: string
  id?: string
  customer_id?: string
  product_id?: string
  price_id?: string
  [key: string]: string | boolean | undefined
}

// https://api.useplunk.com/v1
function getAuth() {
  // get plunk token
  const PLUNK_API_KEY = 'sk_d5a623505cd289440332329cbdb7725531b693e449f01697'
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
    data,
  }, getConfig())
  return response.data
}

export async function addContact(email: string, data: any) {
  const url = `${baseUrl()}/v1/contacts`
  const payload = {
    email,
    subscribed: true,
    data,
  }
  console.log('addContact', email)
  const response = await axios.post(url, payload, getConfig())
  return response.data
}

export function addDataContact(email: string, data: Person) {
  console.log('addDataContact', email, data)
  return trackEvent(email, data, 'user:addData')
}

export async function sendEmail(to: string, subject: string, body: string) {
  const url = `${baseUrl()}/v1/send`
  const response = await axios.post(url, {
    to,
    subject,
    body,
  }, getConfig())
  return response.data
}
