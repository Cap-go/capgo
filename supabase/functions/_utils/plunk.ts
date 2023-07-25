import axios from 'https://deno.land/x/axiod@0.26.2/mod.ts'
import { getEnv } from './utils.ts'

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

export async function addEventPerson(email: string, data: any, event: string) {
  const url = `${baseUrl()}/v1/track`
  const response = await axios.post(url, {
    email,
    event,
    data,
  }, getConfig())
  return response.data
}

export async function postPerson(email: string, data: any) {
  const url = `${baseUrl()}/v1/contacts`
  const response = await axios.post(url, {
    email,
    subscribed: true,
    data,
  }, getConfig())
  return response.data
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
